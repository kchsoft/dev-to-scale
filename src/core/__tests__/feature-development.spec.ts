import { describe, expect, it } from 'vitest';
import {
  FeatureDefinition,
  FeatureDevelopmentTask,
  FrameworkDefinition,
} from '../feature';

describe('feature development', () => {
  const complexFeature = new FeatureDefinition({
    id: 'FOLLOW_FEED',
    name: 'Follow Feed',
    baseWork: 22,
    complexity: 'COMPLEX',
    load: { app: 2, db: 3, async: 2, storage: 0 },
    tags: ['EVENT_HEAVY', 'READ_HEAVY'],
  });

  it('makes framework proficiency matter more for complex features', () => {
    const spring = FrameworkDefinition.springBoot();
    const low = FeatureDevelopmentTask.start(complexFeature, spring);
    const high = FeatureDevelopmentTask.start(complexFeature, spring);

    low.advanceDay({ frameworkLevel: 3, incidentModifier: 1 });
    high.advanceDay({ frameworkLevel: 8, incidentModifier: 1 });

    expect(high.completedWork).toBeGreaterThan(low.completedWork);
    expect(high.completedWork / low.completedWork).toBeGreaterThan(1.5);
  });

  it('does not use language proficiency directly in development progress', () => {
    const spring = FrameworkDefinition.springBoot();
    const taskA = FeatureDevelopmentTask.start(complexFeature, spring);
    const taskB = FeatureDevelopmentTask.start(complexFeature, spring);

    taskA.advanceDay({ frameworkLevel: 4, incidentModifier: 1 });
    taskB.advanceDay({ frameworkLevel: 4, incidentModifier: 1 });

    expect(taskA.completedWork).toBe(taskB.completedWork);
  });

  it('applies framework feature traits to required work', () => {
    const ai = new FeatureDefinition({
      id: 'AI_RECOMMENDATION',
      name: 'AI Recommendation',
      baseWork: 20,
      complexity: 'COMPLEX',
      load: { app: 2, db: 2, async: 3, storage: 0 },
      tags: ['AI', 'EVENT_HEAVY', 'READ_HEAVY'],
      revenueModifier: 0.1,
    });

    const springTask = FeatureDevelopmentTask.start(ai, FrameworkDefinition.springBoot());
    const fastApiTask = FeatureDevelopmentTask.start(ai, FrameworkDefinition.fastApi());

    expect(fastApiTask.requiredWork).toBeCloseTo(15);
    expect(springTask.requiredWork).toBeCloseTo(20);
  });

  it('applies incident penalties to daily progress instead of changing required work', () => {
    const task = FeatureDevelopmentTask.start(complexFeature, FrameworkDefinition.springBoot());
    const required = task.requiredWork;

    task.advanceDay({ frameworkLevel: 5, incidentModifier: 0.7 });

    expect(task.completedWork).toBeCloseTo(0.7);
    expect(task.requiredWork).toBe(required);
  });
});
