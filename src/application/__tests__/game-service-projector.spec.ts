import { describe, expect, it } from 'vitest';
import { createNodeLoadSnapshot, createNodeResourceLoad, GameEngine, nodeLoad, V1_NODE_IDS } from '../../core';
import { GameServiceProjector } from '../game-service-projector';

describe('GameServiceProjector', () => {
  it('projects BASIC operational metrics from player-owned topology nodes', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const result = new GameServiceProjector(engine).project(engine.snapshot, {
      monthlyRevenue: 0,
      monthlyCost: 0,
      monthlyProfit: 0,
    });

    expect(result.service.visibleLoads.map(({ nodeId }) => nodeId)).toEqual([
      V1_NODE_IDS.app('SPRING_BOOT'),
      V1_NODE_IDS.database('POSTGRESQL'),
      V1_NODE_IDS.storage,
    ]);
  });

  it('scopes operational projection to topology membership instead of load order', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const appNodeId = V1_NODE_IDS.app('SPRING_BOOT');
    const state = {
      ...engine.snapshot,
      load: {
        ...engine.snapshot.load,
        nodeLoads: [
          createNodeLoadSnapshot('decoy:app', 'SERVER_GROUP', [
            createNodeResourceLoad('CPU', 99, 100), createNodeResourceLoad('IO', 99, 100),
          ]),
          ...engine.snapshot.load.nodeLoads.map((node) => node.nodeId === appNodeId
            ? createNodeLoadSnapshot(appNodeId, 'SERVER_GROUP', [
              createNodeResourceLoad('CPU', 40, 100), createNodeResourceLoad('IO', 20, 100),
            ])
            : node),
        ],
      },
    };

    const result = new GameServiceProjector(engine).project(state, {
      monthlyRevenue: 0, monthlyCost: 0, monthlyProfit: 0,
    });

    expect(result.service.visibleLoads[0]).toMatchObject({
      id: `${appNodeId}:load`, nodeId: appNodeId, percent: 40,
    });
  });

  it('projects canonical topology, operations, alerts, and node-local scaling', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const result = new GameServiceProjector(engine).project(engine.snapshot, {
      monthlyRevenue: 0,
      monthlyCost: 225_000,
      monthlyProfit: -225_000,
    });

    expect(result.topology.nodes).toContainEqual(expect.objectContaining({
      id: 'v1:storage:OBJECT_STORAGE', name: 'Local Storage', kind: 'object-storage',
    }));
    expect(result.service.observability.level).toBe('BASIC');
    expect(result.alerts.some(({ id }) => id === 'bootstrap')).toBe(true);
    expect(result.topology.nodes.find(({ id }) => id === V1_NODE_IDS.database('POSTGRESQL'))?.scaling?.scaleOut?.monthlyCostDelta).toBe(120_000);
  });

  it('preserves the launched canonical request trace', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 10 });
    for (let day = 0; day < 30 && !engine.launched; day += 1) engine.advanceDay();
    const result = new GameServiceProjector(engine).project(engine.snapshot, {
      monthlyRevenue: 0, monthlyCost: 0, monthlyProfit: 0,
    });

    expect(result.topology.traces[0]).toMatchObject({
      id: 'COMMUNITY_MVP', successPercent: 100, failureNodeId: null,
    });
  });

  it('targets exact overloaded and failed nodes in alerts', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 10 });
    for (let day = 0; day < 30 && !engine.launched; day += 1) engine.advanceDay();
    const snapshot = engine.snapshot;
    const databaseNodeId = 'v1:database:POSTGRESQL';
    const database = nodeLoad(snapshot.load, databaseNodeId)!;
    const overloadedDatabase = createNodeLoadSnapshot(database.nodeId, database.nodeKind, [
      createNodeResourceLoad('CPU', 120, 100),
      createNodeResourceLoad('IO', 80, 100),
    ]);
    const failedTrace = Object.freeze({
      ...snapshot.load.requestTraces[0],
      nodes: Object.freeze(snapshot.load.requestTraces[0].nodes.map((node) => node.nodeId === databaseNodeId
        ? Object.freeze({ ...node, passThroughRatio: 0, status: 'FAILED' as const })
        : node)),
      successRatio: 0,
      failureNodeId: databaseNodeId,
    });
    const failedSnapshot = {
      ...snapshot,
      load: {
        ...snapshot.load,
        failureRate: 1,
        nodeLoads: snapshot.load.nodeLoads.map((load) => load.nodeId === databaseNodeId ? overloadedDatabase : load),
        requestTraces: [failedTrace],
      },
    };
    const result = new GameServiceProjector(engine).project(failedSnapshot, {
      monthlyRevenue: 0, monthlyCost: 0, monthlyProfit: 0,
    });

    expect(result.alerts.find(({ id }) => id === `load-${databaseNodeId}`)?.nodeId).toBe(databaseNodeId);
    expect(result.alerts.find(({ id }) => id === 'request-failure')).toMatchObject({
      title: expect.stringMatching(/^Request Failure \d+%$/),
      nodeId: result.topology.traces.find(({ successPercent }) => successPercent < 100)?.failureNodeId,
    });
  });

  it('returns an exact topology node for feature impact', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 10 });
    for (let day = 0; day < 30 && !engine.launched; day += 1) engine.advanceDay();
    const projector = new GameServiceProjector(engine);
    const impact = projector.featureImpact('COMMENT');
    const current = projector.project(engine.snapshot, { monthlyRevenue: 0, monthlyCost: 0, monthlyProfit: 0 });
    if (impact?.nodeId) {
      expect(current.topology.nodes.some(({ id }) => id === impact.nodeId)).toBe(true);
      expect(['application', 'database', 'queue', 'storage']).not.toContain(impact.nodeId);
    }
  });
});
