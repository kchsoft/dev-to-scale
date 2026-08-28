import { describe, expect, it } from 'vitest';
import { RequestTraceSimulator, trafficHealthForSeverity } from '../request-trace';
import type { ResolvedRoute } from '../service-topology';
import { multiModuleTopology } from './fixtures/multi-module-topology';

function queueRoute(queueNodeId: string): ResolvedRoute {
  return {
    workloadId: 'notification',
    moduleId: 'community',
    steps: [
      { stepId: 'app', role: 'ENTRY_APP', requirement: 'REQUIRED', nodeId: 'app-a' },
      { stepId: 'queue', role: 'EVENT_BUS', requirement: 'REQUIRED', nodeId: queueNodeId },
    ],
    edges: [{
      blueprintEdgeId: 'app-queue',
      topologyEdgeId: `edge-app-${queueNodeId}`,
      fromNodeId: 'app-a',
      toNodeId: queueNodeId,
      mode: 'ASYNC',
    }],
  };
}

describe('RequestTraceSimulator', () => {
  it('applies health only to the exact node ID used by the route', () => {
    const route = queueRoute('queue-a');

    const unrelatedFailure = RequestTraceSimulator.simulate(route, { 'queue-b': 0 });
    const routeFailure = RequestTraceSimulator.simulate(route, { 'queue-a': 0 });

    expect(unrelatedFailure.successRatio).toBe(1);
    expect(routeFailure.successRatio).toBe(0);
    expect(routeFailure.failureNodeId).toBe('queue-a');
    expect(routeFailure.nodes.at(-1)).toEqual(expect.objectContaining({
      nodeId: 'queue-a',
      status: 'FAILED',
      arrivalRatio: 1,
      passThroughRatio: 0,
    }));
  });

  it('propagates a shared node incident to every route that uses that node', () => {
    const first = RequestTraceSimulator.simulate(queueRoute('shared-queue'), { 'shared-queue': 0.4 });
    const second = RequestTraceSimulator.simulate({
      ...queueRoute('shared-queue'),
      workloadId: 'feed',
    }, { 'shared-queue': 0.4 });

    expect(first.successRatio).toBeCloseTo(0.4);
    expect(second.successRatio).toBeCloseTo(0.4);
    expect(first.nodes.at(-1)?.status).toBe('SLOW');
    expect(second.nodes.at(-1)?.status).toBe('SLOW');
  });

  it('stops at a missing required step but skips a missing optional step', () => {
    const base = queueRoute('queue-a');
    const required: ResolvedRoute = {
      ...base,
      steps: [base.steps[0], { ...base.steps[1], nodeId: null }],
      edges: [],
    };
    const optional: ResolvedRoute = {
      ...required,
      workloadId: 'premium',
      steps: [required.steps[0], { ...required.steps[1], requirement: 'OPTIONAL' }],
    };

    const missingRequired = RequestTraceSimulator.simulate(required);
    const missingOptional = RequestTraceSimulator.simulate(optional);

    expect(missingRequired.successRatio).toBe(0);
    expect(missingRequired.nodes.at(-1)?.status).toBe('MISSING');
    expect(missingOptional.successRatio).toBe(1);
    expect(missingOptional.nodes.at(-1)?.status).toBe('MISSING');
  });

  it('reports traffic on the actual topology edge', () => {
    const trace = RequestTraceSimulator.simulate(queueRoute('queue-a'), { 'app-a': 0.6 });

    expect(trace.edges).toEqual([{ edgeId: 'edge-app-queue-a', trafficRatio: 0.6 }]);
  });

  it('keeps a missing optional step visible without reducing success', () => {
    const trace = RequestTraceSimulator.simulate({
      workloadId: 'premium',
      moduleId: 'community',
      steps: [
        { stepId: 'app', role: 'ENTRY_APP', requirement: 'REQUIRED', nodeId: 'app' },
        { stepId: 'queue', role: 'EVENT_BUS', requirement: 'OPTIONAL', nodeId: null },
        { stepId: 'db', role: 'PRIMARY_DATABASE', requirement: 'REQUIRED', nodeId: 'db' },
      ],
      edges: [{ blueprintEdgeId: 'app-queue+queue-db', topologyEdgeId: 'app-db', fromNodeId: 'app', toNodeId: 'db', mode: 'ASYNC' }],
    });

    expect(trace.successRatio).toBe(1);
    expect(trace.failureNodeId).toBeNull();
    expect(trace.nodes[1]).toMatchObject({ status: 'MISSING', nodeId: null });
    expect(trace.edges).toContainEqual({ edgeId: 'app-db', trafficRatio: 1 });
  });

  it('maps incident severity to canonical node health', () => {
    expect(trafficHealthForSeverity('MINOR')).toBe(0.8);
    expect(trafficHealthForSeverity('MAJOR')).toBe(0.4);
    expect(trafficHealthForSeverity('CRITICAL')).toBe(0);
  });

  it('isolates exact-node health across module-selected routes', () => {
    const communityRoute = multiModuleTopology('community').resolveForTrace('search');
    const searchRoute = multiModuleTopology('search').resolveForTrace('search');

    expect(RequestTraceSimulator.simulate(communityRoute, { 'app-community': 0 }).successRatio).toBe(0);
    expect(RequestTraceSimulator.simulate(searchRoute, { 'app-community': 0 }).successRatio).toBe(1);
  });
});
