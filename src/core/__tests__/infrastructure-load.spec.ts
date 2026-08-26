import { describe, expect, it } from 'vitest';
import {
  AppCluster,
  DatabaseCluster,
  InfrastructureState,
  LoadCalculator,
  ServerSize,
} from '../infrastructure';
import { FeatureDefinition } from '../feature';

describe('infrastructure and load', () => {
  it('requires ALB before application scale-out', () => {
    const infra = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');

    expect(() => infra.app.addServer()).toThrow(/ALB/i);

    infra.deployTechnology('ALB');
    infra.app.addServer();
    expect(infra.app.count).toBe(2);
  });

  it('applies framework capacity and cost traits', () => {
    const spring = new AppCluster('SPRING_BOOT', ServerSize.SMALL, 1, true);
    const gin = new AppCluster('GIN', ServerSize.SMALL, 1, true);

    expect(spring.capacity).toBeCloseTo(110);
    expect(spring.monthlyCost).toBeCloseTo(105_000);
    expect(gin.monthlyCost).toBeCloseTo(90_000);
  });

  it('uses replicas as +60% base DB capacity each', () => {
    const db = new DatabaseCluster('POSTGRESQL', ServerSize.MEDIUM, 0);
    expect(db.capacity).toBeCloseTo(150);

    db.addReplica();
    expect(db.capacity).toBeCloseTo(240);
  });

  it('redis reduces DB demand and a queue removes async demand from the app', () => {
    const feature = new FeatureDefinition({
      id: 'NOTIFICATION',
      name: 'Notification',
      baseWork: 14,
      complexity: 'NORMAL',
      load: { app: 1, db: 2, async: 3, storage: 0 },
      tags: ['READ_HEAVY'],
    });

    const plain = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    const optimized = InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL');
    optimized.deployTechnology('REDIS');
    optimized.deployTechnology('SQS');

    const without = LoadCalculator.calculate(100_000, [feature], plain);
    const withInfra = LoadCalculator.calculate(100_000, [feature], optimized);

    expect(withInfra.dbDemand).toBeLessThan(without.dbDemand);
    expect(withInfra.appDemand).toBeLessThan(without.appDemand);
    expect(withInfra.asyncCapacity).toBe(300);
  });

  it('keeps maximum prepared infrastructure viable around 25M DAU', () => {
    const infra = new InfrastructureState(
      new AppCluster('SPRING_BOOT', ServerSize.XLARGE, 10, true),
      new DatabaseCluster('POSTGRESQL', ServerSize.XLARGE, 3),
    );
    infra.deployTechnology('ALB');
    infra.deployTechnology('REDIS');
    infra.deployTechnology('KAFKA');
    infra.deployTechnology('OBJECT_STORAGE');

    const features = [
      new FeatureDefinition({ id: 'FULL', name: 'Full', baseWork: 1, complexity: 'NORMAL', load: { app: 14, db: 20, async: 9, storage: 3 }, tags: ['READ_HEAVY', 'EVENT_HEAVY'] }),
    ];

    const load = LoadCalculator.calculate(25_000_000, features, infra);

    expect(load.appRatio).toBeLessThanOrEqual(0.9);
    expect(load.dbRatio).toBeLessThanOrEqual(0.9);
    expect(load.asyncRatio).toBeLessThanOrEqual(0.9);
    expect(load.storageRatio).toBeLessThanOrEqual(0.9);
  });
});
