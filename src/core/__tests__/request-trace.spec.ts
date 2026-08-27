import { describe, expect, it } from 'vitest';
import { RequestTraceSimulator } from '../request-trace';
import type { ResolvedRoute } from '../service-topology';

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
});
