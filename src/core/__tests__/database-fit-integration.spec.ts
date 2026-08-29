import { describe, expect, it } from 'vitest';
import { FeatureDefinition } from '../feature';
import { InfrastructureState, LoadCalculator, ServerSize } from '../infrastructure';
import { resourceLoad } from '../node-load';
import { V1_NODE_IDS } from '../v1-topology';

function workload(
  id: string,
  tags: ('READ_HEAVY' | 'CONTENT' | 'TRANSACTIONAL')[],
  app = { cpu: 1, io: 1 },
  db = { cpu: 1.4, io: 3.0 },
): FeatureDefinition {
  return new FeatureDefinition({
    id,
    name: id,
    baseWork: 1,
    complexity: 'NORMAL',
    load: { app: 1, db: 2, async: 0, storage: 0 },
    resourceLoad: { app, db },
    tags,
    requestRoute: [{ node: 'APP' }, { node: 'DB' }],
  });
}

function nodeResource(
  load: ReturnType<typeof LoadCalculator.calculate>,
  nodeId: string,
  resourceKind: 'CPU' | 'IO' | 'THROUGHPUT',
) {
  const node = load.nodeLoads.find(({ nodeId: candidate }) => candidate === nodeId);
  if (!node) throw new Error(`missing node ${nodeId}`);
  const resource = resourceLoad(node, resourceKind);
  if (!resource) throw new Error(`missing ${resourceKind} on ${nodeId}`);
  return resource;
}

describe('database workload-fit integration invariants', () => {
  it('keeps Redis throughput demand database-independent while residual DB demand differs', () => {
    const feature = workload('READ_CONTENT', ['READ_HEAVY', 'CONTENT']);
    const databaseIds = ['POSTGRESQL', 'MYSQL', 'MONGODB'] as const;

    const loads = databaseIds.map((databaseId) => {
      const infrastructure = InfrastructureState.initial('SPRING_BOOT', databaseId);
      infrastructure.deployTechnology('REDIS');
      return LoadCalculator.calculate(100_000, [feature], infrastructure);
    });

    const cacheDemands = loads.map((load) =>
      nodeResource(load, V1_NODE_IDS.cache, 'THROUGHPUT').demand,
    );

    expect(cacheDemands[1]).toBeCloseTo(cacheDemands[0]);
    expect(cacheDemands[2]).toBeCloseTo(cacheDemands[0]);

    const postgresIo = nodeResource(loads[0], V1_NODE_IDS.database('POSTGRESQL'), 'IO').demand;
    const mysqlIo = nodeResource(loads[1], V1_NODE_IDS.database('MYSQL'), 'IO').demand;
    const mongoIo = nodeResource(loads[2], V1_NODE_IDS.database('MONGODB'), 'IO').demand;

    expect(mysqlIo).not.toBeCloseTo(postgresIo);
    expect(mongoIo).not.toBeCloseTo(postgresIo);
  });

  it('changes DB work without leaking database choice into APP demand', () => {
    const feature = workload('TRANSACTIONAL', ['TRANSACTIONAL'], { cpu: 1.3, io: 1.8 }, { cpu: 1.2, io: 2.0 });
    const postgres = LoadCalculator.calculate(
      100_000,
      [feature],
      InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL'),
    );
    const mongo = LoadCalculator.calculate(
      100_000,
      [feature],
      InfrastructureState.initial('SPRING_BOOT', 'MONGODB'),
    );

    expect(nodeResource(mongo, V1_NODE_IDS.app('SPRING_BOOT'), 'CPU').demand)
      .toBeCloseTo(nodeResource(postgres, V1_NODE_IDS.app('SPRING_BOOT'), 'CPU').demand);
    expect(nodeResource(mongo, V1_NODE_IDS.app('SPRING_BOOT'), 'IO').demand)
      .toBeCloseTo(nodeResource(postgres, V1_NODE_IDS.app('SPRING_BOOT'), 'IO').demand);
    expect(nodeResource(mongo, V1_NODE_IDS.database('MONGODB'), 'IO').demand)
      .toBeGreaterThan(nodeResource(postgres, V1_NODE_IDS.database('POSTGRESQL'), 'IO').demand);
  });

  it('does not change nominal or effective DB capacity when only workload tags change', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const neutral = workload('NEUTRAL', [], { cpu: 0.2, io: 0.2 }, { cpu: 1, io: 1 });
    const transactional = workload('TX', ['TRANSACTIONAL'], { cpu: 0.2, io: 0.2 }, { cpu: 1, io: 1 });

    const neutralLoad = LoadCalculator.calculate(1_000, [neutral], infrastructure);
    const transactionalLoad = LoadCalculator.calculate(1_000, [transactional], infrastructure);
    const neutralCpu = nodeResource(neutralLoad, V1_NODE_IDS.database('POSTGRESQL'), 'CPU');
    const txCpu = nodeResource(transactionalLoad, V1_NODE_IDS.database('POSTGRESQL'), 'CPU');
    const neutralIo = nodeResource(neutralLoad, V1_NODE_IDS.database('POSTGRESQL'), 'IO');
    const txIo = nodeResource(transactionalLoad, V1_NODE_IDS.database('POSTGRESQL'), 'IO');

    expect(txCpu.nominalCapacity).toBe(neutralCpu.nominalCapacity);
    expect(txCpu.effectiveCapacity).toBe(neutralCpu.effectiveCapacity);
    expect(txIo.nominalCapacity).toBe(neutralIo.nominalCapacity);
    expect(txIo.effectiveCapacity).toBe(neutralIo.effectiveCapacity);
    expect(txCpu.demand).toBeLessThan(neutralCpu.demand);
    expect(txIo.demand).toBeLessThan(neutralIo.demand);
  });

  it('applies database fit only to traffic that survives an upstream bottleneck', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('ALB');
    infrastructure.resizeNode(V1_NODE_IDS.app('SPRING_BOOT'), ServerSize.MEDIUM);
    const feature = workload(
      'MASKED_TX',
      ['TRANSACTIONAL'],
      { cpu: 22, io: 0 },
      { cpu: 4, io: 6 },
    );

    const constrained = LoadCalculator.calculate(100_000, [feature], infrastructure);
    const constrainedDb = nodeResource(constrained, V1_NODE_IDS.database('POSTGRESQL'), 'IO');
    const constrainedArrival = constrained.requestTraces[0].nodes
      .find(({ nodeId }) => nodeId === V1_NODE_IDS.database('POSTGRESQL'))!.arrivalRatio;

    infrastructure.resizeNode(V1_NODE_IDS.gateway, ServerSize.MEDIUM);
    const relieved = LoadCalculator.calculate(100_000, [feature], infrastructure);
    const relievedDb = nodeResource(relieved, V1_NODE_IDS.database('POSTGRESQL'), 'IO');
    const relievedArrival = relieved.requestTraces[0].nodes
      .find(({ nodeId }) => nodeId === V1_NODE_IDS.database('POSTGRESQL'))!.arrivalRatio;

    expect(relievedArrival).toBeGreaterThan(constrainedArrival);
    expect(relievedDb.demand).toBeGreaterThan(constrainedDb.demand);
  });
});
