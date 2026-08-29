import type { DatabaseId } from '../core/database';
import type { FrameworkId } from '../core/feature';
import { GameEngine } from '../core/game-engine';
import { SeededRandomSource } from '../core/random';

export type BalanceStrategyId =
  | 'ORACLE'
  | 'APM_AWARE'
  | 'METRICS_AWARE'
  | 'REACTIVE_BASIC'
  | 'YOLO_SCALE'
  | 'CHEAPSKATE';

export interface BalanceScenario {
  readonly frameworkId: FrameworkId;
  readonly databaseId: DatabaseId;
  readonly seed: number;
  readonly strategyId: BalanceStrategyId;
}

export interface BalanceScenarioFilters {
  readonly frameworkId?: FrameworkId;
  readonly databaseId?: DatabaseId;
  readonly seed?: number;
  readonly strategyId?: BalanceStrategyId;
}

export const BALANCE_FRAMEWORK_IDS: readonly FrameworkId[] = Object.freeze([
  'SPRING_BOOT',
  'NESTJS',
  'GIN',
  'FASTAPI',
  'ASPNET_CORE',
]);

export const BALANCE_DATABASE_IDS: readonly DatabaseId[] = Object.freeze([
  'POSTGRESQL',
  'MYSQL',
  'MONGODB',
]);

export const FULL_BALANCE_SEEDS: readonly number[] = Object.freeze(
  Array.from({ length: 30 }, (_, index) => index + 1),
);

export const BALANCE_STRATEGY_IDS: readonly BalanceStrategyId[] = Object.freeze([
  'ORACLE',
  'APM_AWARE',
  'METRICS_AWARE',
  'REACTIVE_BASIC',
  'YOLO_SCALE',
  'CHEAPSKATE',
]);

export const GROWTH_STREAM_XOR = 0x51f15e5d;
export const INCIDENT_STREAM_XOR = 0x2c9277b5;

export function buildBalanceScenarios(filters: BalanceScenarioFilters = {}): BalanceScenario[] {
  const scenarios: BalanceScenario[] = [];

  for (const frameworkId of BALANCE_FRAMEWORK_IDS) {
    if (filters.frameworkId && filters.frameworkId !== frameworkId) continue;
    for (const databaseId of BALANCE_DATABASE_IDS) {
      if (filters.databaseId && filters.databaseId !== databaseId) continue;
      for (const seed of FULL_BALANCE_SEEDS) {
        if (filters.seed !== undefined && filters.seed !== seed) continue;
        for (const strategyId of BALANCE_STRATEGY_IDS) {
          if (filters.strategyId && filters.strategyId !== strategyId) continue;
          scenarios.push({ frameworkId, databaseId, seed, strategyId });
        }
      }
    }
  }

  return scenarios;
}

export function createBalanceEngine(scenario: BalanceScenario): GameEngine {
  return new GameEngine({
    frameworkId: scenario.frameworkId,
    databaseId: scenario.databaseId,
    seed: scenario.seed,
    random: new SeededRandomSource(scenario.seed ^ GROWTH_STREAM_XOR),
    incidentRandom: new SeededRandomSource(scenario.seed ^ INCIDENT_STREAM_XOR),
  });
}
