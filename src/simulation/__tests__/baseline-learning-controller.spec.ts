import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../core/game-engine';
import { LearningRules, skillRef } from '../../core/learning';
import {
  BASELINE_LEARNING_STEPS,
  BaselineLearningController,
  RUNWAY_MULTIPLIER,
  isAffordableCandidate,
} from '../baseline-learning-controller';

function engine(startingCash = 3_000_000): GameEngine {
  return new GameEngine({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 17,
    startingCash,
  });
}

describe('baseline learning controller', () => {
  it('locks the exact nine-step observability learning order', () => {
    expect(BASELINE_LEARNING_STEPS.map(({ skill, targetLevel }) => `${skill.id}:${targetLevel}`)).toEqual([
      'OS_RUNTIME:2',
      'NETWORK:2',
      'SOFTWARE_DESIGN:2',
      'OS_RUNTIME:3',
      'DATABASE:2',
      'NETWORK:3',
      'SOFTWARE_DESIGN:3',
      'NETWORK:4',
      'OS_RUNTIME:4',
    ]);
  });

  it('protects the real learning cost for the next unfinished step', () => {
    const game = engine();
    const expected = LearningRules.requirement(skillRef.fundamental('OS_RUNTIME'), 1).cost;

    expect(BaselineLearningController.protectedReserve(game)).toBe(expected);
  });

  it('returns zero reserve after all nine steps are already satisfied', () => {
    const game = engine();
    game.developer.get(skillRef.fundamental('OS_RUNTIME')).setLevel(4);
    game.developer.get(skillRef.fundamental('NETWORK')).setLevel(4);
    game.developer.get(skillRef.fundamental('SOFTWARE_DESIGN')).setLevel(3);
    game.developer.get(skillRef.fundamental('DATABASE')).setLevel(2);

    expect(BaselineLearningController.protectedReserve(game)).toBe(0);
  });

  it('waits for real experience and then starts through the engine command', () => {
    const game = engine();
    const requirement = LearningRules.requirement(skillRef.fundamental('OS_RUNTIME'), 1);
    const beforeCash = game.snapshot.cash;

    expect(BaselineLearningController.maybeStart(game)).toBe(false);
    expect(game.snapshot.currentLearning).toBeNull();
    expect(game.snapshot.cash).toBe(beforeCash);

    game.developer.gainExperience(skillRef.fundamental('OS_RUNTIME'), requirement.experienceDays);

    expect(BaselineLearningController.maybeStart(game)).toBe(true);
    expect(game.snapshot.currentLearning).toEqual({
      id: 'OS_RUNTIME',
      targetLevel: 2,
      studyDays: requirement.studyDays,
    });
    expect(game.snapshot.cash).toBe(beforeCash - requirement.cost);
  });

  it('does not start learning when cash cannot cover the real learning cost', () => {
    const requirement = LearningRules.requirement(skillRef.fundamental('OS_RUNTIME'), 1);
    const game = engine(requirement.cost - 1);
    game.developer.gainExperience(skillRef.fundamental('OS_RUNTIME'), requirement.experienceDays);

    expect(BaselineLearningController.maybeStart(game)).toBe(false);
    expect(game.snapshot.currentLearning).toBeNull();
  });

  it('locks the exact strategy runway multipliers', () => {
    expect(RUNWAY_MULTIPLIER).toEqual({
      ORACLE: 1,
      APM_AWARE: 1,
      METRICS_AWARE: 0.5,
      REACTIVE_BASIC: 0.25,
      YOLO_SCALE: 0,
      CHEAPSKATE: 2,
    });
  });

  it('uses learning reserve plus strategy runway as the affordability floor', () => {
    const common = {
      cash: 1_000_000,
      immediateCost: 200_000,
      protectedLearningReserve: 100_000,
      projectedMonthlyInfrastructureCost: 700_000,
    };

    expect(isAffordableCandidate({ ...common, strategyId: 'APM_AWARE' })).toBe(true);
    expect(isAffordableCandidate({ ...common, strategyId: 'CHEAPSKATE' })).toBe(false);
    expect(isAffordableCandidate({ ...common, strategyId: 'YOLO_SCALE' })).toBe(true);
  });
});
