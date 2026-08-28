import { describe, expect, it } from 'vitest';
import { FeatureDefinition } from '../feature';
import { InfrastructureState, LoadCalculator } from '../infrastructure';
import { maxNodeLoad } from '../node-load';
import { V1_NODE_IDS } from '../v1-topology';

const posts = new FeatureDefinition({
  id: 'POSTS',
  name: 'Posts',
  baseWork: 1,
  complexity: 'NORMAL',
  load: { app: 2, db: 3, async: 0, storage: 0 },
  resourceLoad: {
    app: { cpu: 1.2, io: 1.8 },
    db: { cpu: 1.4, io: 2.2 },
  },
  requestRoute: [{ node: 'APP' }, { node: 'DB' }],
});

function expectResourceParity(
  node: { readonly resources: readonly { readonly resourceKind: string; readonly demand: number; readonly capacity: number; readonly ratio: number }[] },
  resourceKind: string,
  demand: number,
  capacity: number,
  ratio: number,
): void {
  const resource = node.resources.find((candidate) => candidate.resourceKind === resourceKind);
  expect(resource).toMatchObject({ demand, capacity });
  expect(resource?.ratio).toBeCloseTo(ratio);
}

describe('node-specific load calculation', () => {
  it('uses exact Node ID trace arrival to remove downstream demand', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const appNodeId = V1_NODE_IDS.app('SPRING_BOOT');
    const dbNodeId = V1_NODE_IDS.database('POSTGRESQL');

    const load = LoadCalculator.calculate(100_000, [posts], infrastructure, {
      nodeHealth: { [appNodeId]: 0 },
    });
    const app = load.nodeLoads.find(({ nodeId }) => nodeId === appNodeId)!;
    const db = load.nodeLoads.find(({ nodeId }) => nodeId === dbNodeId)!;
    const appCpu = app.resources.find(({ resourceKind }) => resourceKind === 'CPU');
    const appIo = app.resources.find(({ resourceKind }) => resourceKind === 'IO');
    const dbCpu = db.resources.find(({ resourceKind }) => resourceKind === 'CPU');
    const dbIo = db.resources.find(({ resourceKind }) => resourceKind === 'IO');

    expect(app.nodeKind).toBe('SERVER_GROUP');
    expect(appCpu).toMatchObject({ demand: load.appCpuDemand, capacity: load.appCpuCapacity });
    expect(appCpu?.ratio).toBeCloseTo(load.appCpuRatio);
    expect(appIo).toMatchObject({ demand: load.appIoDemand, capacity: load.appIoCapacity });
    expect(appIo?.ratio).toBeCloseTo(load.appIoRatio);
    expect(app.loadRatio).toBeCloseTo(load.appRatio);
    expect(dbCpu?.ratio).toBeCloseTo(load.dbCpuRatio);
    expect(dbIo?.ratio).toBeCloseTo(load.dbIoRatio);
    expect(db.loadRatio).toBeCloseTo(load.dbRatio);
    expect(maxNodeLoad(load)?.loadRatio).toBeCloseTo(Math.max(
      load.appRatio,
      load.dbRatio,
      load.asyncRatio,
      load.storageRatio,
    ));
    expect(load.requestTraces[0].failureNodeId).toBe(appNodeId);
    expect(load.failureRate).toBe(1);
  });

  it('ignores a health entry for a different server node ID', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');

    const healthy = LoadCalculator.calculate(100_000, [posts], infrastructure);
    const unrelated = LoadCalculator.calculate(100_000, [posts], infrastructure, {
      nodeHealth: { 'v1:app:NESTJS': 0 },
    });

    expect(unrelated.failureRate).toBe(0);
    expect(unrelated.dbCpuDemand).toBeCloseTo(healthy.dbCpuDemand);
    expect(unrelated.requestTraces[0].successRatio).toBe(1);
  });

  it('projects missing required resources into both trace and legacy request flow', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const notification = new FeatureDefinition({
      id: 'NOTIFICATION',
      name: 'Notification',
      baseWork: 1,
      complexity: 'NORMAL',
      load: { app: 1, db: 1, async: 2, storage: 0 },
      requestRoute: [
        { node: 'APP' },
        { node: 'DB' },
        { node: 'QUEUE', requirement: 'REQUIRED' },
      ],
    });

    const load = LoadCalculator.calculate(100_000, [notification], infrastructure);

    expect(load.requestTraces[0].nodes.at(-1)).toEqual(expect.objectContaining({
      role: 'EVENT_BUS',
      nodeId: null,
      status: 'MISSING',
    }));
    expect(load.requestFlows[0].failureNode).toBe('QUEUE');
    expect(load.requestFlows[0].successRatio).toBe(0);
  });

  it('does not project a missing optional resource as a legacy failure node', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const optional = new FeatureDefinition({
      id: 'PREMIUM',
      name: 'Premium',
      baseWork: 1,
      complexity: 'NORMAL',
      load: { app: 1, db: 1, async: 1, storage: 0 },
      requestRoute: [
        { node: 'APP' },
        { node: 'DB' },
        { node: 'QUEUE', requirement: 'OPTIONAL' },
      ],
    });

    const load = LoadCalculator.calculate(100_000, [optional], infrastructure);

    expect(load.requestTraces[0].nodes.at(-1)?.status).toBe('MISSING');
    expect(load.requestFlows[0].failureNode).toBeNull();
    expect(load.requestFlows[0].successRatio).toBe(1);
  });

  it('publishes one node load for every current topology node', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('ALB');
    infrastructure.deployTechnology('SQS');

    const load = LoadCalculator.calculate(100_000, [posts], infrastructure);

    expect(load.nodeLoads.map(({ nodeId }) => nodeId)).toEqual([
      V1_NODE_IDS.app('SPRING_BOOT'),
      V1_NODE_IDS.database('POSTGRESQL'),
      V1_NODE_IDS.storage,
      V1_NODE_IDS.externalAi,
      V1_NODE_IDS.gateway,
      V1_NODE_IDS.queue('SQS'),
    ]);
    const gateway = load.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.gateway)!;
    const queue = load.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.queue('SQS'))!;
    const storage = load.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.storage)!;
    const external = load.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.externalAi)!;

    expect(gateway.resources.map(({ resourceKind }) => resourceKind)).toEqual(['THROUGHPUT']);
    expect(queue.resources.map(({ resourceKind }) => resourceKind)).toEqual(['THROUGHPUT']);
    expect(storage.resources.map(({ resourceKind }) => resourceKind)).toEqual(['STORAGE']);
    expect(external.resources).toEqual([]);
  });

  it('keeps nonzero resource demand, capacity, and ratio in parity with every optional infrastructure node', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('ALB');
    infrastructure.deployTechnology('REDIS');
    infrastructure.deployTechnology('SQS');
    infrastructure.deployTechnology('OBJECT_STORAGE');
    const feature = new FeatureDefinition({
      id: 'PARITY',
      name: 'Parity',
      baseWork: 1,
      complexity: 'NORMAL',
      load: { app: 2, db: 3, async: 4, storage: 5 },
      resourceLoad: {
        app: { cpu: 1.2, io: 1.8 },
        db: { cpu: 1.4, io: 2.2 },
      },
      tags: ['READ_HEAVY'],
      requestRoute: [
        { node: 'APP' },
        { node: 'DB' },
        { node: 'QUEUE', requirement: 'OPTIONAL' },
        { node: 'STORAGE' },
      ],
    });

    const load = LoadCalculator.calculate(100_000, [feature], infrastructure);
    const app = load.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.app('SPRING_BOOT'))!;
    const database = load.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.database('POSTGRESQL'))!;
    const queue = load.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.queue('SQS'))!;
    const storage = load.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.storage)!;
    const gateway = load.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.gateway)!;
    const cache = load.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.cache)!;

    expectResourceParity(app, 'CPU', load.appCpuDemand, load.appCpuCapacity, load.appCpuRatio);
    expectResourceParity(app, 'IO', load.appIoDemand, load.appIoCapacity, load.appIoRatio);
    expectResourceParity(database, 'CPU', load.dbCpuDemand, load.dbCpuCapacity, load.dbCpuRatio);
    expectResourceParity(database, 'IO', load.dbIoDemand, load.dbIoCapacity, load.dbIoRatio);
    expectResourceParity(queue, 'THROUGHPUT', load.asyncDemand, load.asyncCapacity, load.asyncRatio);
    expectResourceParity(storage, 'STORAGE', load.storageDemand, load.storageCapacity, load.storageRatio);
    expectResourceParity(
      gateway,
      'THROUGHPUT',
      Math.max(load.appCpuDemand, load.appIoDemand),
      load.rawAppCapacity,
      Math.max(load.appCpuDemand, load.appIoDemand) / load.rawAppCapacity,
    );
    expectResourceParity(cache, 'THROUGHPUT', load.dbDemand, load.dbDemand / load.dbRatio, load.dbRatio);
  });

  it('keeps ingress demand on a failed ALB while removing downstream APP demand', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('ALB');

    const load = LoadCalculator.calculate(100_000, [posts], infrastructure, {
      nodeHealth: { [V1_NODE_IDS.gateway]: 0 },
    });
    const gateway = load.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.gateway)!;
    const app = load.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.app('SPRING_BOOT'))!;

    expect(gateway.resources[0].demand).toBeGreaterThan(0);
    expect(app.resources.find(({ resourceKind }) => resourceKind === 'CPU')?.demand).toBe(0);
    expect(app.resources.find(({ resourceKind }) => resourceKind === 'IO')?.demand).toBe(0);
    expect(load.requestTraces[0].failureNodeId).toBe(V1_NODE_IDS.gateway);
  });
});
