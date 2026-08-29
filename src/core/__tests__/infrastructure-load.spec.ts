import { describe, expect, it } from 'vitest';
import {
  AppCluster,
  capacityTuningMultiplier,
  DatabaseCluster,
  InfrastructureState,
  LoadCalculator,
  ServerSize,
} from '../infrastructure';
import { FeatureDefinition } from '../feature';
import { V1_NODE_IDS } from '../v1-topology';
import { maxNodeLoad, resourceLoad } from '../node-load';

function nodeResource(load: ReturnType<typeof LoadCalculator.calculate>, nodeKind: 'SERVER_GROUP' | 'DATABASE' | 'QUEUE' | 'OBJECT_STORAGE', resourceKind: 'CPU' | 'IO' | 'THROUGHPUT' | 'STORAGE') {
  const node = maxNodeLoad(load, { nodeKind });
  return node ? resourceLoad(node, resourceKind) : undefined;
}

describe('infrastructure and load', () => {
  it('requires ALB before application scale-out', () => {
    const infra = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');

    expect(() => infra.app.addServer()).toThrow(/ALB/i);

    infra.deployTechnology('ALB');
    infra.app.addServer();
    expect(infra.app.count).toBe(2);
  });

  it('gives frameworks distinct CPU and IO capacity signatures', () => {
    const spring = new AppCluster('SPRING_BOOT', ServerSize.SMALL, 1, true);
    const nest = new AppCluster('NESTJS', ServerSize.SMALL, 1, true);
    const gin = new AppCluster('GIN', ServerSize.SMALL, 1, true);

    expect(spring.capacity).toBeCloseTo(110);
    expect(spring.cpuCapacity).toBeGreaterThan(spring.ioCapacity);
    expect(nest.ioCapacity).toBeGreaterThan(nest.cpuCapacity);
    expect(gin.cpuCapacity).toBeGreaterThan(spring.cpuCapacity);
    expect(spring.monthlyCost).toBeCloseTo(105_000);
    expect(gin.monthlyCost).toBeCloseTo(90_000);
  });

  it('makes replicas stronger for DB IO capacity than CPU capacity', () => {
    const db = new DatabaseCluster('POSTGRESQL', ServerSize.MEDIUM, 0);
    expect(db.capacity).toBeCloseTo(150);
    expect(db.cpuCapacity).toBeCloseTo(150);
    expect(db.ioCapacity).toBeCloseTo(150);

    db.addReplica();
    expect(db.capacity).toBeCloseTo(240);
    expect(db.cpuCapacity).toBeCloseTo(232.5);
    expect(db.ioCapacity).toBeCloseTo(262.5);
  });

  it('turns proficiency into a modest effective capacity tuning bonus on both axes', () => {
    expect(capacityTuningMultiplier(1)).toBe(1);
    expect(capacityTuningMultiplier(5)).toBe(1.08);
    expect(capacityTuningMultiplier(10)).toBe(1.25);

    const infra = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const feature = new FeatureDefinition({
      id: 'POSTS', name: 'Posts', baseWork: 1, complexity: 'NORMAL',
      load: { app: 2, db: 2, async: 0, storage: 0 },
      requestRoute: [{ node: 'APP' }, { node: 'DB' }],
    });

    const novice = LoadCalculator.calculate(100_000, [feature], infra, {
      appProficiencyLevel: 1,
      databaseProficiencyLevel: 1,
    });
    const expert = LoadCalculator.calculate(100_000, [feature], infra, {
      appProficiencyLevel: 10,
      databaseProficiencyLevel: 10,
    });

    expect(nodeResource(expert, 'SERVER_GROUP', 'CPU')!.capacity).toBeCloseTo(nodeResource(novice, 'SERVER_GROUP', 'CPU')!.capacity * 1.25);
    expect(nodeResource(expert, 'SERVER_GROUP', 'IO')!.capacity).toBeCloseTo(nodeResource(novice, 'SERVER_GROUP', 'IO')!.capacity * 1.25);
    expect(nodeResource(expert, 'DATABASE', 'CPU')!.capacity).toBeCloseTo(nodeResource(novice, 'DATABASE', 'CPU')!.capacity * 1.25);
    expect(nodeResource(expert, 'DATABASE', 'IO')!.capacity).toBeCloseTo(nodeResource(novice, 'DATABASE', 'IO')!.capacity * 1.25);
    expect(nodeResource(expert, 'SERVER_GROUP', 'CPU')!.demand).toBeCloseTo(nodeResource(novice, 'SERVER_GROUP', 'CPU')!.demand);
    expect(nodeResource(expert, 'DATABASE', 'IO')!.demand).toBeCloseTo(nodeResource(novice, 'DATABASE', 'IO')!.demand);
  });

  it('lets a feature create a different CPU bottleneck from its IO bottleneck', () => {
    const feature = new FeatureDefinition({
      id: 'AI_IO', name: 'External AI', baseWork: 1, complexity: 'NORMAL',
      load: { app: 2, db: 1, async: 0, storage: 0 },
      resourceLoad: {
        app: { cpu: 0.4, io: 3.0 },
        db: { cpu: 0.2, io: 1.1 },
      },
      requestRoute: [{ node: 'APP' }, { node: 'DB' }],
    });
    const spring = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const nest = InfrastructureState.initial('NESTJS', 'POSTGRESQL');

    const springLoad = LoadCalculator.calculate(100_000, [feature], spring);
    const nestLoad = LoadCalculator.calculate(100_000, [feature], nest);

    expect(nodeResource(springLoad, 'SERVER_GROUP', 'IO')!.demand).toBeGreaterThan(nodeResource(springLoad, 'SERVER_GROUP', 'CPU')!.demand);
    expect(maxNodeLoad(springLoad, { nodeKind: 'SERVER_GROUP' })!.loadRatio).toBeCloseTo(Math.max(nodeResource(springLoad, 'SERVER_GROUP', 'CPU')!.ratio, nodeResource(springLoad, 'SERVER_GROUP', 'IO')!.ratio));
    expect(nodeResource(nestLoad, 'SERVER_GROUP', 'IO')!.ratio).toBeLessThan(nodeResource(springLoad, 'SERVER_GROUP', 'IO')!.ratio);
  });

  it('redis targets read-heavy DB IO much more strongly than DB CPU', () => {
    const feature = new FeatureDefinition({
      id: 'FEED',
      name: 'Feed',
      baseWork: 14,
      complexity: 'NORMAL',
      load: { app: 1, db: 2, async: 0, storage: 0 },
      resourceLoad: { db: { cpu: 1.4, io: 3.0 } },
      tags: ['READ_HEAVY'],
    });

    const plain = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const optimized = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    optimized.deployTechnology('REDIS');

    const without = LoadCalculator.calculate(100_000, [feature], plain);
    const withRedis = LoadCalculator.calculate(100_000, [feature], optimized);

    const cpuReduction = 1 - nodeResource(withRedis, 'DATABASE', 'CPU')!.demand / nodeResource(without, 'DATABASE', 'CPU')!.demand;
    const ioReduction = 1 - nodeResource(withRedis, 'DATABASE', 'IO')!.demand / nodeResource(without, 'DATABASE', 'IO')!.demand;
    expect(cpuReduction).toBeCloseTo(0.12);
    expect(ioReduction).toBeCloseTo(0.40);
    expect(ioReduction).toBeGreaterThan(cpuReduction);

    const cache = withRedis.nodeLoads.find(({ nodeKind }) => nodeKind === 'CACHE');
    expect(cache?.resources).toHaveLength(1);
    expect(cache?.resources[0]).toMatchObject({ resourceKind: 'THROUGHPUT', capacity: 160 });
    expect(cache?.resources[0].demand).toBeGreaterThan(0);
  });

  it('applies transactional database fit to residual DB demand', () => {
    const feature = new FeatureDefinition({
      id: 'CHECKOUT', name: 'Checkout', baseWork: 1, complexity: 'NORMAL',
      load: { app: 1, db: 2, async: 0, storage: 0 },
      resourceLoad: { db: { cpu: 1.2, io: 2.0 } },
      tags: ['TRANSACTIONAL'],
      requestRoute: [{ node: 'APP' }, { node: 'DB' }],
    });

    const pg = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL'));
    const mysql = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'MYSQL'));
    const mongo = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'MONGODB'));

    expect(nodeResource(pg, 'DATABASE', 'CPU')!.demand).toBeLessThan(nodeResource(mysql, 'DATABASE', 'CPU')!.demand);
    expect(nodeResource(mysql, 'DATABASE', 'CPU')!.demand).toBeLessThan(nodeResource(mongo, 'DATABASE', 'CPU')!.demand);
    expect(nodeResource(pg, 'DATABASE', 'IO')!.demand).toBeLessThan(nodeResource(mysql, 'DATABASE', 'IO')!.demand);
    expect(nodeResource(mysql, 'DATABASE', 'IO')!.demand).toBeLessThan(nodeResource(mongo, 'DATABASE', 'IO')!.demand);
  });

  it('lets read-content workloads favor MySQL or MongoDB over PostgreSQL demand', () => {
    const feature = new FeatureDefinition({
      id: 'CONTENT_FEED', name: 'Content feed', baseWork: 1, complexity: 'NORMAL',
      load: { app: 1, db: 2, async: 0, storage: 0 },
      resourceLoad: { db: { cpu: 1.0, io: 2.5 } },
      tags: ['READ_HEAVY', 'CONTENT'],
      requestRoute: [{ node: 'APP' }, { node: 'DB' }],
    });

    const pg = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL'));
    const mysql = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'MYSQL'));
    const mongo = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'MONGODB'));

    expect(nodeResource(mysql, 'DATABASE', 'IO')!.demand).toBeLessThan(nodeResource(pg, 'DATABASE', 'IO')!.demand);
    expect(nodeResource(mongo, 'DATABASE', 'IO')!.demand).toBeLessThan(nodeResource(pg, 'DATABASE', 'IO')!.demand);
  });

  it('a queue removes optional async fallback pressure from APP IO', () => {
    const feature = new FeatureDefinition({
      id: 'PREMIUM_ASYNC',
      name: 'Premium async work',
      baseWork: 14,
      complexity: 'NORMAL',
      load: { app: 1, db: 1, async: 3, storage: 0 },
      requestRoute: [
        { node: 'APP' },
        { node: 'DB' },
        { node: 'QUEUE', requirement: 'OPTIONAL' },
      ],
    });

    const plain = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const optimized = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    optimized.deployTechnology('SQS');

    const without = LoadCalculator.calculate(100_000, [feature], plain);
    const withQueue = LoadCalculator.calculate(100_000, [feature], optimized);

    expect(nodeResource(withQueue, 'SERVER_GROUP', 'IO')!.demand).toBeLessThan(nodeResource(without, 'SERVER_GROUP', 'IO')!.demand);
    expect(nodeResource(withQueue, 'SERVER_GROUP', 'CPU')!.demand).toBeLessThan(nodeResource(without, 'SERVER_GROUP', 'CPU')!.demand);
    expect(nodeResource(withQueue, 'QUEUE', 'THROUGHPUT')!.capacity).toBe(300);
  });

  it('removes downstream DB load when an APP incident blocks request flow', () => {
    const feature = new FeatureDefinition({
      id: 'POSTS', name: 'Posts', baseWork: 1, complexity: 'NORMAL',
      load: { app: 2, db: 3, async: 0, storage: 0 },
      requestRoute: [{ node: 'APP' }, { node: 'DB' }],
    });
    const infra = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');

    const healthy = LoadCalculator.calculate(100_000, [feature], infra);
    const appDown = LoadCalculator.calculate(100_000, [feature], infra, {
      nodeHealth: { [V1_NODE_IDS.app('SPRING_BOOT')]: 0 },
    });

    expect(maxNodeLoad(appDown, { nodeKind: 'SERVER_GROUP' })!.loadRatio).toBeCloseTo(maxNodeLoad(healthy, { nodeKind: 'SERVER_GROUP' })!.loadRatio);
    expect(nodeResource(appDown, 'DATABASE', 'CPU')!.demand).toBe(0);
    expect(nodeResource(appDown, 'DATABASE', 'IO')!.demand).toBe(0);
    expect(appDown.failureRate).toBe(1);
  });

  it('reports failed requests when a required queue is missing', () => {
    const feature = new FeatureDefinition({
      id: 'RECOMMENDATION', name: 'Recommendation', baseWork: 1, complexity: 'NORMAL',
      load: { app: 2, db: 2, async: 3, storage: 0 },
      requestRoute: [
        { node: 'APP' },
        { node: 'DB' },
        { node: 'AI' },
        { node: 'QUEUE', requirement: 'REQUIRED' },
      ],
    });
    const infra = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');

    const missing = LoadCalculator.calculate(100_000, [feature], infra);
    infra.deployTechnology('SQS');
    const restored = LoadCalculator.calculate(100_000, [feature], infra);

    expect(missing.failureRate).toBe(1);
    expect(nodeResource(missing, 'SERVER_GROUP', 'IO')!.demand).toBeGreaterThan(0);
    expect(restored.failureRate).toBe(0);
    expect(nodeResource(restored, 'QUEUE', 'THROUGHPUT')!.demand).toBeGreaterThan(0);
  });

  it('keeps only one active queue in V1 and retires the previous queue on replacement', () => {
    const infra = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');

    infra.deployTechnology('SQS');
    expect(infra.queueTechnologies).toEqual(['SQS']);
    expect(infra.monthlyCost).toBeCloseTo(105_000 + 120_000 + 80_000);

    const retired = infra.deployTechnology('KAFKA');

    expect(retired).toEqual(['SQS']);
    expect(infra.queueTechnologies).toEqual(['KAFKA']);
    expect(infra.queueTechnology).toBe('KAFKA');
    expect(infra.hasTechnology('SQS')).toBe(false);
    expect(infra.hasTechnology('KAFKA')).toBe(true);
    expect(infra.asyncCapacity).toBe(1_000);
    expect(infra.monthlyCost).toBeCloseTo(105_000 + 120_000 + 350_000);
  });

  it('multiplies CPU, IO and storage demand during a temporary traffic spike', () => {
    const infra = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const feature = new FeatureDefinition({
      id: 'SPIKE', name: 'Spike traffic', baseWork: 1, complexity: 'NORMAL',
      load: { app: 2, db: 2, async: 0, storage: 1 },
      resourceLoad: {
        app: { cpu: 1.2, io: 1.6 },
        db: { cpu: 0.8, io: 1.4 },
      },
      requestRoute: [{ node: 'APP' }, { node: 'DB' }, { node: 'STORAGE' }],
    });

    const normal = LoadCalculator.calculate(100_000, [feature], infra);
    const spike = LoadCalculator.calculate(100_000, [feature], infra, { trafficMultiplier: 1.8 });

    expect(nodeResource(spike, 'SERVER_GROUP', 'CPU')!.demand).toBeCloseTo(nodeResource(normal, 'SERVER_GROUP', 'CPU')!.demand * 1.8);
    expect(nodeResource(spike, 'SERVER_GROUP', 'IO')!.demand).toBeCloseTo(nodeResource(normal, 'SERVER_GROUP', 'IO')!.demand * 1.8);
    expect(nodeResource(spike, 'DATABASE', 'IO')!.demand).toBeCloseTo(nodeResource(normal, 'DATABASE', 'IO')!.demand * 1.8);
    expect(nodeResource(spike, 'OBJECT_STORAGE', 'STORAGE')!.demand).toBeCloseTo(nodeResource(normal, 'OBJECT_STORAGE', 'STORAGE')!.demand * 1.8);
  });

  it('keeps maximum prepared infrastructure just within capacity around 25M DAU', () => {
    const infra = new InfrastructureState(
      new AppCluster('SPRING_BOOT', ServerSize.XLARGE, 10, true),
      new DatabaseCluster('POSTGRESQL', ServerSize.XLARGE, 3),
    );
    infra.deployTechnology('ALB');
    infra.deployTechnology('REDIS');
    infra.deployTechnology('KAFKA');
    infra.deployTechnology('OBJECT_STORAGE');
    infra.resizeNode(V1_NODE_IDS.gateway, ServerSize.XLARGE);
    infra.resizeNode(V1_NODE_IDS.cache, ServerSize.XLARGE);
    infra.resizeNode(V1_NODE_IDS.queue('KAFKA'), ServerSize.XLARGE);
    infra.resizeNode(V1_NODE_IDS.storage, ServerSize.XLARGE);

    const features = [
      new FeatureDefinition({ id: 'FULL', name: 'Full', baseWork: 1, complexity: 'NORMAL', load: { app: 14, db: 20, async: 9, storage: 3 }, tags: ['READ_HEAVY', 'EVENT_HEAVY'] }),
    ];

    const load = LoadCalculator.calculate(25_000_000, features, infra);

    expect(maxNodeLoad(load, { nodeKind: 'SERVER_GROUP' })!.loadRatio).toBeLessThanOrEqual(0.95);
    expect(maxNodeLoad(load, { nodeKind: 'DATABASE' })!.loadRatio).toBeLessThanOrEqual(1.0);
    expect(maxNodeLoad(load, { nodeKind: 'QUEUE' })!.loadRatio).toBeLessThanOrEqual(0.9);
    expect(maxNodeLoad(load, { nodeKind: 'OBJECT_STORAGE' })!.loadRatio).toBeLessThanOrEqual(0.9);
  });
});
