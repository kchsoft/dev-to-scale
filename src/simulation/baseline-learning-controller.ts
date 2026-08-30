import type { GameEngine } from '../core/game-engine';
import { LearningRules, skillRef, type SkillRef } from '../core/learning';
import type { BalanceStrategyId } from './balance-scenario';

export interface BaselineLearningStep {
  readonly skill: SkillRef;
  readonly targetLevel: number;
}

export const BASELINE_LEARNING_STEPS: readonly BaselineLearningStep[] = Object.freeze([
  { skill: skillRef.fundamental('OS_RUNTIME'), targetLevel: 2 },
  { skill: skillRef.fundamental('NETWORK'), targetLevel: 2 },
  { skill: skillRef.fundamental('SOFTWARE_DESIGN'), targetLevel: 2 },
  { skill: skillRef.fundamental('OS_RUNTIME'), targetLevel: 3 },
  { skill: skillRef.fundamental('DATABASE'), targetLevel: 2 },
  { skill: skillRef.fundamental('NETWORK'), targetLevel: 3 },
  { skill: skillRef.fundamental('SOFTWARE_DESIGN'), targetLevel: 3 },
  { skill: skillRef.fundamental('NETWORK'), targetLevel: 4 },
  { skill: skillRef.fundamental('OS_RUNTIME'), targetLevel: 4 },
]);

function nextUnfinishedStep(engine: GameEngine): BaselineLearningStep | null {
  return BASELINE_LEARNING_STEPS.find(({ skill, targetLevel }) => (
    engine.developer.get(skill).level < targetLevel
  )) ?? null;
}

function eligibleForStep(engine: GameEngine, step: BaselineLearningStep): boolean {
  const proficiency = engine.developer.get(step.skill);
  const requirement = LearningRules.requirement(step.skill, proficiency.level);
  if (requirement.targetLevel !== step.targetLevel) return false;
  if (proficiency.experienceDays < requirement.experienceDays) return false;
  if (engine.snapshot.cash < requirement.cost) return false;
  return requirement.prerequisites.every(({ ref, level }) => engine.developer.get(ref).level >= level);
}

export class BaselineLearningController {
  static protectedReserve(engine: GameEngine): number {
    const step = nextUnfinishedStep(engine);
    if (!step) return 0;
    const proficiency = engine.developer.get(step.skill);
    return LearningRules.requirement(step.skill, proficiency.level).cost;
  }

  static maybeStart(engine: GameEngine): boolean {
    if (engine.snapshot.currentLearning) return false;
    const step = nextUnfinishedStep(engine);
    if (!step || !eligibleForStep(engine, step)) return false;
    engine.startLearning(step.skill);
    return true;
  }

  protectedReserve(engine: GameEngine): number {
    return BaselineLearningController.protectedReserve(engine);
  }

  maybeStart(engine: GameEngine): boolean {
    return BaselineLearningController.maybeStart(engine);
  }
}

export const RUNWAY_MULTIPLIER: Readonly<Record<BalanceStrategyId, number>> = Object.freeze({
  ORACLE: 1,
  APM_AWARE: 1,
  METRICS_AWARE: 0.5,
  REACTIVE_BASIC: 0.25,
  YOLO_SCALE: 0,
  CHEAPSKATE: 2,
});

export function isAffordableCandidate(input: {
  cash: number;
  immediateCost: number;
  protectedLearningReserve: number;
  projectedMonthlyInfrastructureCost: number;
  strategyId: BalanceStrategyId;
}): boolean {
  const cashAfterImmediateCost = input.cash - input.immediateCost;
  const requiredCashFloor = input.protectedLearningReserve
    + RUNWAY_MULTIPLIER[input.strategyId] * input.projectedMonthlyInfrastructureCost;
  return cashAfterImmediateCost >= requiredCashFloor;
}
