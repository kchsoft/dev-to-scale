import { describe, expect, it } from 'vitest';
import type { NodeLoadSnapshot, RequestTrace } from '../../core';
import { TopologyGraph } from '../../core';
import { TopologyViewProjector } from '../topology-view-projector';

describe('TopologyViewProjector', () => {
  const graph = new TopologyGraph(
    [
      { id: 'app', kind: 'SERVER_GROUP', productId: 'SPRING_BOOT', capacity: { cpu: 100 }, monthlyCost: 100 },
      { id: 'db', kind: 'DATABASE', productId: 'POSTGRESQL', capacity: { io: 80 }, monthlyCost: 120 },
      { id: 'external-ai', kind: 'EXTERNAL_SERVICE', productId: 'EXTERNAL_AI', capacity: {}, monthlyCost: 0 },
    ],
    [
      { id: 'edge-app-db', from: 'app', to: 'db', mode: 'SYNC' },
      { id: 'edge-db-ai', from: 'db', to: 'external-ai', mode: 'SYNC' },
    ],
  );
  const nodeLoads: readonly NodeLoadSnapshot[] = [
    { nodeId: 'app', cpuDemand: 92, capacity: 100, loadRatio: 0.92 },
    { nodeId: 'db', ioDemand: 24, capacity: 80, loadRatio: 0.30 },
    { nodeId: 'external-ai', throughputDemand: 0, capacity: 0, loadRatio: 0 },
  ];

  it('preserves exact topology IDs and trace edge order while hiding an unused external node', () => {
    const traces: readonly RequestTrace[] = [
      {
        workloadId: 'COMMENT',
        nodes: [
          { stepId: 'comment-app', role: 'ENTRY_APP', nodeId: 'app', arrivalRatio: 1, passThroughRatio: 1, status: 'HEALTHY' },
          { stepId: 'comment-db', role: 'PRIMARY_DATABASE', nodeId: 'db', arrivalRatio: 1, passThroughRatio: 1, status: 'HEALTHY' },
        ],
        edges: [{ edgeId: 'edge-app-db', trafficRatio: 1 }],
        successRatio: 1,
        failureNodeId: null,
      },
    ];

    const view = TopologyViewProjector.project({
      graph,
      nodeLoads,
      traces,
      incidents: [],
      dau: 50_000_000,
    });

    expect(view.nodes.map((node) => node.id)).toEqual(['app', 'db']);
    expect(view.nodes.map((node) => [node.id, node.kind, node.loadPercent, node.tone])).toEqual([
      ['app', 'server-group', 92, 'critical'],
      ['db', 'database', 30, 'stable'],
    ]);
    expect(view.edges).toEqual([
      { id: 'edge-app-db', fromNodeId: 'app', toNodeId: 'db', mode: 'sync' },
    ]);
    expect(view.traces).toEqual([
      {
        id: 'COMMENT',
        name: '댓글',
        nodes: [
          { nodeId: 'app', arrivalPercent: 100, status: 'healthy' },
          { nodeId: 'db', arrivalPercent: 100, status: 'healthy' },
        ],
        edges: [{ edgeId: 'edge-app-db', trafficPercent: 100 }],
        successPercent: 100,
        failureNodeId: null,
        particleCount: 4,
        trafficUnit: 5_000_000,
      },
    ]);
  });

  it('retains a traversed external node and projects an exact-node incident and failure', () => {
    const traces: readonly RequestTrace[] = [
      {
        workloadId: 'AI_RECOMMENDATION',
        nodes: [
          { stepId: 'ai-app', role: 'ENTRY_APP', nodeId: 'app', arrivalRatio: 1, passThroughRatio: 1, status: 'HEALTHY' },
          { stepId: 'ai-db', role: 'PRIMARY_DATABASE', nodeId: 'db', arrivalRatio: 1, passThroughRatio: 0, status: 'FAILED' },
          { stepId: 'ai-external', role: 'EXTERNAL_SERVICE', nodeId: 'external-ai', arrivalRatio: 0, passThroughRatio: 0, status: 'HEALTHY' },
        ],
        edges: [
          { edgeId: 'edge-app-db', trafficRatio: 1 },
          { edgeId: 'edge-db-ai', trafficRatio: 0 },
        ],
        successRatio: 0,
        failureNodeId: 'db',
      },
    ];

    const view = TopologyViewProjector.project({
      graph,
      nodeLoads,
      traces,
      incidents: [{ id: 'incident-db', nodeId: 'db', severity: 'MAJOR' }],
      dau: 80,
    });

    expect(view.nodes.map((node) => node.id)).toEqual(['app', 'db', 'external-ai']);
    expect(view.nodes.find((node) => node.id === 'db')).toMatchObject({
      incidentId: 'incident-db',
      incidentSeverity: 'MAJOR',
      tone: 'incident',
    });
    expect(view.edges.map((edge) => edge.id)).toEqual(['edge-app-db', 'edge-db-ai']);
    expect(view.traces[0]).toMatchObject({
      failureNodeId: 'db',
      successPercent: 0,
      particleCount: 1,
    });
  });
});
