import type { DatabaseId } from '../core/database';
import type { FrameworkId } from '../core/feature';
import {
  BALANCE_DATABASE_IDS,
  BALANCE_FRAMEWORK_IDS,
  BALANCE_STRATEGY_IDS,
  FULL_BALANCE_SEEDS,
  buildBalanceScenarios,
  type BalanceStrategyId,
} from './balance-scenario';

export interface BalanceCliOptions {
  readonly seed?: number;
  readonly frameworkId?: FrameworkId;
  readonly databaseId?: DatabaseId;
  readonly strategyId?: BalanceStrategyId;
  readonly trace: boolean;
}

function valueAfter(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function includesValue<T extends string>(values: readonly T[], value: string): value is T {
  return values.some((candidate) => candidate === value);
}

export function parseBalanceArgs(args: readonly string[]): BalanceCliOptions {
  const options: {
    seed?: number;
    frameworkId?: FrameworkId;
    databaseId?: DatabaseId;
    strategyId?: BalanceStrategyId;
    trace: boolean;
  } = { trace: false };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    switch (flag) {
      case '--seed': {
        const raw = valueAfter(args, index, flag);
        const seed = Number(raw);
        if (!Number.isInteger(seed) || !FULL_BALANCE_SEEDS.includes(seed)) {
          throw new Error(`Invalid seed '${raw}'. Expected an integer from 1 to 30.`);
        }
        options.seed = seed;
        index += 1;
        break;
      }
      case '--framework': {
        const raw = valueAfter(args, index, flag);
        if (!includesValue(BALANCE_FRAMEWORK_IDS, raw)) {
          throw new Error(`Invalid framework '${raw}'. Expected one of: ${BALANCE_FRAMEWORK_IDS.join(', ')}.`);
        }
        options.frameworkId = raw;
        index += 1;
        break;
      }
      case '--db': {
        const raw = valueAfter(args, index, flag);
        if (!includesValue(BALANCE_DATABASE_IDS, raw)) {
          throw new Error(`Invalid database '${raw}'. Expected one of: ${BALANCE_DATABASE_IDS.join(', ')}.`);
        }
        options.databaseId = raw;
        index += 1;
        break;
      }
      case '--strategy': {
        const raw = valueAfter(args, index, flag);
        if (!includesValue(BALANCE_STRATEGY_IDS, raw)) {
          throw new Error(`Invalid strategy '${raw}'. Expected one of: ${BALANCE_STRATEGY_IDS.join(', ')}.`);
        }
        options.strategyId = raw;
        index += 1;
        break;
      }
      case '--trace':
        options.trace = true;
        break;
      default:
        throw new Error(`Unknown balance flag '${flag}'.`);
    }
  }

  if (options.trace && buildBalanceScenarios(options).length !== 1) {
    throw new Error('--trace requires filters that resolve to exactly one balance scenario.');
  }

  return Object.freeze({ ...options });
}
