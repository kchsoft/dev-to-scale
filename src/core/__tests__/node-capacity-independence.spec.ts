import { describe, expect, it } from 'vitest';
import { FeatureDefinition } from '../feature';
import { InfrastructureState, LoadCalculator, ServerSize } from '../infrastructure';
import { nodeLoad, resourceLoad } from '../node-load';
import { V1_NODE_IDS } from '../v1-topology';

function resource(
  load: ReturnType<typeof LoadCalculator.calculate>,
  nodeId: string,
  kind: 'CPU' | 'IO' | 'THROUGHPUT' | 'STORAGE',
) {
  const node = nodeLoad(load, nodeId);
  if (!node) throw new Error(`Missing node load: ${nodeId}`);
  const value = resourceLoad(node, kind);
  if (!value) throw new Error(`Missing ${kind} load: ${nodeId}`);
  return value;
}

const webFeature = new FeatureDefinition({
  id: 'WEB', name: 'Web', baseWork: 1, complexity: 'NORMAL',
  load: { app: 3, db: 2, async: 0, storage: 0 },
  requestRoute: [{ node: 'APP' }, { node: 'DB' }],
});

const readHeavyFeature = new FeatureDefinition({
  id: 'FEED', name: 'Feed', baseWork: 1, complexity: 'NORMAL',
  load: { app: 1, db: 3, async: 0, storage: 0 },
  resourceLoad: { db: { cpu: 1.4, io: 4 } },
  requestRoute: [{ node: 'APP' }, { node: 'DB' }],
  tags: ['READ_HEAVY'],
});

describe('independent infrastructure node capacity', () => {
  it('scales ALB throughput without changing APP capacity', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('ALB');

    const before = LoadCalculator.calculate(1_000_000, [webFeature], infrastructure);
    const beforeAlb = resource(before, V1_NODE_IDS.gateway, 'THROUGHPUT');
    const beforeApp = resource(before, V1_NODE_IDS.app('SPRING_BOOT'), 'CPU');

    infrastructure.resizeNode(V1_NODE_IDS.gateway, ServerSize.MEDIUM);
    const after = LoadCalculator.calculate(1_000_000, [webFeature], infrastructure);
    const afterAlb = resource(after, V1_NODE_IDS.gateway, 'THROUGHPUT');
    const afterApp = resource(after, V1_NODE_IDS.app('SPRING_BOOT'), 'CPU');

    expect(beforeAlb.demand).toBeGreaterThan(0);
    expect(afterAlb.demand).toBeCloseTo(beforeAlb.demand);
    expect(beforeAlb.capacity).toBe(180);
    expect(afterAlb.capacity).toBe(360);
    expect(afterAlb.ratio).toBeLessThan(beforeAlb.ratio);
    expect(afterApp.capacity).toBeCloseTo(beforeApp.capacity);
    expect(afterApp.demand).toBeCloseTo(beforeApp.demand);
  });

  it('reduces request failures when an overloaded ALB is resized above demand', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('ALB');
    infrastructure.resizeNode(V1_NODE_IDS.app('SPRING_BOOT'), ServerSize.XLARGE);
    infrastructure.resizeNode(V1_NODE_IDS.database('POSTGRESQL'), ServerSize.XLARGE);

    const overloaded = LoadCalculator.calculate(2_000_000, [webFeature], infrastructure);
    const overloadedAlb = resource(overloaded, V1_NODE_IDS.gateway, 'THROUGHPUT');

    infrastructure.resizeNode(V1_NODE_IDS.gateway, ServerSize.MEDIUM);
    const relieved = LoadCalculator.calculate(2_000_000, [webFeature], infrastructure);
    const relievedAlb = resource(relieved, V1_NODE_IDS.gateway, 'THROUGHPUT');

    expect(overloadedAlb.ratio).toBeGreaterThan(1);
    expect(overloaded.failureRate).toBeGreaterThan(0);
    expect(relievedAlb.ratio).toBeLessThan(1);
    expect(relieved.failureRate).toBe(0);
  });

  it('scales Redis throughput without changing DB capacity or its read-offload effect', () => {
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('REDIS');

    const before = LoadCalculator.calculate(1_000_000, [readHeavyFeature], infrastructure);
    const beforeCache = resource(before, V1_NODE_IDS.cache, 'THROUGHPUT');
    const beforeDbIo = resource(before, V1_NODE_IDS.database('POSTGRESQL'), 'IO');

    infrastructure.resizeNode(V1_NODE_IDS.cache, ServerSize.MEDIUM);
    const after = LoadCalculator.calculate(1_000_000, [readHeavyFeature], infrastructure);
    const afterCache = resource(after, V1_NODE_IDS.cache, 'THROUGHPUT');
    const afterDbIo = resource(after, V1_NODE_IDS.database('POSTGRESQL'), 'IO');

    expect(beforeCache.demand).toBeGreaterThan(0);
    expect(afterCache.demand).toBeCloseTo(beforeCache.demand);
    expect(beforeCache.capacity).toBe(160);
    expect(afterCache.capacity).toBe(320);
    expect(afterCache.ratio).toBeLessThan(beforeCache.ratio);
    expect(afterDbIo.capacity).toBeCloseTo(beforeDbIo.capacity);
    expect(afterDbIo.demand).toBeCloseTo(beforeDbIo.demand);
  });

  it('scales the active queue without changing APP, DB, or storage capacity', () => {
    const feature = new FeatureDefinition({
      id: 'ASYNC', name: 'Async', baseWork: 1, complexity: 'NORMAL',
      load: { app: 1, db: 1, async: 4, storage: 1 },
      requestRoute: [
        { node: 'APP' }, { node: 'DB' },
        { node: 'QUEUE', requirement: 'OPTIONAL' }, { node: 'STORAGE' },
      ],
    });
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    infrastructure.deployTechnology('SQS');
    const before = LoadCalculator.calculate(1_000_000, [feature], infrastructure);

    infrastructure.resizeNode(V1_NODE_IDS.queue('SQS'), ServerSize.LARGE);
    const after = LoadCalculator.calculate(1_000_000, [feature], infrastructure);

    expect(resource(after, V1_NODE_IDS.queue('SQS'), 'THROUGHPUT').capacity).toBe(950);
    expect(resource(after, V1_NODE_IDS.queue('SQS'), 'THROUGHPUT').demand)
      .toBeCloseTo(resource(before, V1_NODE_IDS.queue('SQS'), 'THROUGHPUT').demand);
    expect(resource(after, V1_NODE_IDS.app('SPRING_BOOT'), 'CPU').capacity)
      .toBeCloseTo(resource(before, V1_NODE_IDS.app('SPRING_BOOT'), 'CPU').capacity);
    expect(resource(after, V1_NODE_IDS.database('POSTGRESQL'), 'IO').capacity)
      .toBeCloseTo(resource(before, V1_NODE_IDS.database('POSTGRESQL'), 'IO').capacity);
    expect(resource(after, V1_NODE_IDS.storage, 'STORAGE').capacity)
      .toBeCloseTo(resource(before, V1_NODE_IDS.storage, 'STORAGE').capacity);
  });

  it('scales storage without changing APP or DB capacity', () => {
    const feature = new FeatureDefinition({
      id: 'MEDIA', name: 'Media', baseWork: 1, complexity: 'NORMAL',
      load: { app: 1, db: 1, async: 0, storage: 4 },
      requestRoute: [{ node: 'APP' }, { node: 'DB' }, { node: 'STORAGE' }],
    });
    const infrastructure = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const before = LoadCalculator.calculate(1_000_000, [feature], infrastructure);

    infrastructure.resizeNode(V1_NODE_IDS.storage, ServerSize.LARGE);
    const after = LoadCalculator.calculate(1_000_000, [feature], infrastructure);

    expect(resource(before, V1_NODE_IDS.storage, 'STORAGE').capacity).toBe(100);
    expect(resource(after, V1_NODE_IDS.storage, 'STORAGE').capacity).toBe(320);
    expect(resource(after, V1_NODE_IDS.storage, 'STORAGE').demand)
      .toBeCloseTo(resource(before, V1_NODE_IDS.storage, 'STORAGE').demand);
    expect(resource(after, V1_NODE_IDS.app('SPRING_BOOT'), 'CPU').capacity)
      .toBeCloseTo(resource(before, V1_NODE_IDS.app('SPRING_BOOT'), 'CPU').capacity);
    expect(resource(after, V1_NODE_IDS.database('POSTGRESQL'), 'IO').capacity)
      .toBeCloseTo(resource(before, V1_NODE_IDS.database('POSTGRESQL'), 'IO').capacity);
  });
});