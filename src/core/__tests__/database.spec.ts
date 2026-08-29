import { describe, expect, it } from 'vitest';
import { COMMUNITY_FEATURES } from '../community';
import { DatabaseDefinition } from '../database';
import { FeatureDefinition, FeatureDevelopmentTask, type FeatureTag, FrameworkDefinition } from '../feature';
import { DatabaseCluster, ServerSize } from '../infrastructure';

function taggedFeature(id: string, tags: FeatureTag[]): FeatureDefinition {
  return new FeatureDefinition({
    id,
    name: id,
    baseWork: 1,
    complexity: 'NORMAL',
    load: { app: 0, db: 1, async: 0, storage: 0 },
    tags,
  });
}

describe('database traits', () => {
  it('makes PostgreSQL faster for transactional features', () => {
    const premium = COMMUNITY_FEATURES.PREMIUM;
    const database = DatabaseDefinition.postgresql();
    const task = FeatureDevelopmentTask.start(
      premium,
      FrameworkDefinition.springBoot(),
      database.workModifierFor(premium),
    );

    expect(task.requiredWork).toBeCloseTo(18 * 0.9);
  });

  it('makes MongoDB slower for transactional features', () => {
    const premium = COMMUNITY_FEATURES.PREMIUM;
    const database = DatabaseDefinition.mongodb();
    const task = FeatureDevelopmentTask.start(
      premium,
      FrameworkDefinition.springBoot(),
      database.workModifierFor(premium),
    );

    expect(task.requiredWork).toBeCloseTo(18 * 1.2);
  });

  it('keeps MySQL cheaper while MongoDB has slightly more base capacity', () => {
    const postgres = new DatabaseCluster('POSTGRESQL', ServerSize.SMALL, 0);
    const mysql = new DatabaseCluster('MYSQL', ServerSize.SMALL, 0);
    const mongo = new DatabaseCluster('MONGODB', ServerSize.SMALL, 0);

    expect(mysql.monthlyCost).toBeLessThan(postgres.monthlyCost);
    expect(mongo.capacity).toBeGreaterThan(postgres.capacity);
  });

  it('returns neutral runtime modifiers for unmatched workload tags', () => {
    const feature = taggedFeature('NEUTRAL', ['AI']);

    expect(DatabaseDefinition.postgresql().resourceDemandModifierFor(feature)).toEqual({ cpu: 1, io: 1 });
    expect(DatabaseDefinition.mysql().resourceDemandModifierFor(feature)).toEqual({ cpu: 1, io: 1 });
    expect(DatabaseDefinition.mongodb().resourceDemandModifierFor(feature)).toEqual({ cpu: 1, io: 1 });
  });

  it('gives each database its intended workload signature', () => {
    const tx = taggedFeature('TX', ['TRANSACTIONAL']);
    const readContent = taggedFeature('READ_CONTENT', ['READ_HEAVY', 'CONTENT']);

    expect(DatabaseDefinition.postgresql().resourceDemandModifierFor(tx)).toEqual({ cpu: 0.90, io: 0.88 });
    expect(DatabaseDefinition.mysql().resourceDemandModifierFor(readContent)).toEqual({
      cpu: 0.94 * 0.97,
      io: 0.90 * 0.95,
    });
    expect(DatabaseDefinition.mongodb().resourceDemandModifierFor(tx)).toEqual({ cpu: 1.15, io: 1.20 });
  });

  it('multiplies matching tags and clamps the result per axis', () => {
    const postgresDense = taggedFeature('PG_DENSE', ['TRANSACTIONAL', 'WRITE_HEAVY', 'SEARCH']);
    const mongoHostile = taggedFeature('MONGO_HOSTILE', ['TRANSACTIONAL', 'SEARCH']);

    expect(DatabaseDefinition.postgresql().resourceDemandModifierFor(postgresDense)).toEqual({
      cpu: 0.90 * 0.95 * 0.95,
      io: 0.80,
    });
    expect(DatabaseDefinition.mongodb().resourceDemandModifierFor(mongoHostile)).toEqual({
      cpu: 1.15 * 1.05,
      io: 1.25,
    });
  });
});
