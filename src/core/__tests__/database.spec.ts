import { describe, expect, it } from 'vitest';
import { COMMUNITY_FEATURES } from '../community';
import { DatabaseDefinition } from '../database';
import { FeatureDevelopmentTask, FrameworkDefinition } from '../feature';
import { DatabaseCluster, ServerSize } from '../infrastructure';

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
});
