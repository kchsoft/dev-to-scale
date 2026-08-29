import type { DatabaseId } from '../core/database';
import type { FrameworkId } from '../core/feature';
import type { BalanceStrategyId } from './balance-scenario';
import type { BalanceRunResult, BalanceTerminalStatus } from './simulation-metrics';

export interface NumericSummary {
  readonly mean: number;
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
}

function nearestRank(values: readonly number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentile * sorted.length) - 1),
  );
  return sorted[index];
}

export function summarizeNumbers(values: readonly number[]): NumericSummary {
  if (values.length === 0) return { mean: 0, median: 0, p25: 0, p75: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return {
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    median,
    p25: nearestRank(sorted, 0.25),
    p75: nearestRank(sorted, 0.75),
  };
}

export interface BalanceGroupSummary {
  readonly key: string;
  readonly dimensions: Readonly<Record<string, string>>;
  readonly runs: number;
  readonly won: number;
  readonly bankrupt: number;
  readonly timeout: number;
  readonly winRate: number;
  readonly bankruptcyRate: number;
  readonly timeoutRate: number;
  readonly winnerDays: NumericSummary;
  readonly infrastructureCostExposure: NumericSummary;
  readonly failureBurden: NumericSummary;
  readonly prematureCapacityActions: NumericSummary;
  readonly lowUtilizationExpandedNodeDays: NumericSummary;
}

export interface PairedComparison {
  readonly leftStrategyId: BalanceStrategyId;
  readonly rightStrategyId: BalanceStrategyId;
  readonly frameworkId: FrameworkId;
  readonly databaseId: DatabaseId;
  readonly seed: number;
  readonly terminalOutcome: 'LEFT_BETTER' | 'RIGHT_BETTER' | 'TIE';
  readonly winDaysDelta: number | null;
  readonly infrastructureCostExposureDelta: number;
  readonly failureBurdenDelta: number;
  readonly prematureCapacityActionsDelta: number;
  readonly lowUtilizationExpandedNodeDaysDelta: number;
}

export const PRIMARY_STRATEGY_PAIRS = Object.freeze([
  ['APM_AWARE', 'YOLO_SCALE'],
  ['APM_AWARE', 'METRICS_AWARE'],
  ['METRICS_AWARE', 'REACTIVE_BASIC'],
  ['ORACLE', 'APM_AWARE'],
  ['CHEAPSKATE', 'APM_AWARE'],
] as const satisfies readonly (readonly [BalanceStrategyId, BalanceStrategyId])[]);

function terminalScore(status: BalanceTerminalStatus): number {
  if (status === 'WON') return 2;
  if (status === 'TIMEOUT') return 1;
  return 0;
}

function comparisonOutcome(left: BalanceRunResult, right: BalanceRunResult): PairedComparison['terminalOutcome'] {
  const delta = terminalScore(left.terminalStatus) - terminalScore(right.terminalStatus);
  return delta > 0 ? 'LEFT_BETTER' : delta < 0 ? 'RIGHT_BETTER' : 'TIE';
}

function scenarioKey(run: Pick<BalanceRunResult, 'frameworkId' | 'databaseId' | 'seed'>): string {
  return `${run.frameworkId}|${run.databaseId}|${run.seed}`;
}

export function buildPairedComparisons(results: readonly BalanceRunResult[]): PairedComparison[] {
  const byScenario = new Map<string, Map<BalanceStrategyId, BalanceRunResult>>();
  for (const result of results) {
    const key = scenarioKey(result);
    let strategies = byScenario.get(key);
    if (!strategies) {
      strategies = new Map();
      byScenario.set(key, strategies);
    }
    strategies.set(result.strategyId, result);
  }

  const pairs: PairedComparison[] = [];
  const scenarios = [...byScenario.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [, strategies] of scenarios) {
    for (const [leftStrategyId, rightStrategyId] of PRIMARY_STRATEGY_PAIRS) {
      const left = strategies.get(leftStrategyId);
      const right = strategies.get(rightStrategyId);
      if (!left || !right) continue;
      pairs.push({
        leftStrategyId,
        rightStrategyId,
        frameworkId: left.frameworkId,
        databaseId: left.databaseId,
        seed: left.seed,
        terminalOutcome: comparisonOutcome(left, right),
        winDaysDelta: left.terminalStatus === 'WON' && right.terminalStatus === 'WON'
          ? left.daysPlayed - right.daysPlayed
          : null,
        infrastructureCostExposureDelta: left.infrastructureCostExposure - right.infrastructureCostExposure,
        failureBurdenDelta: left.cumulativeFailureBurden - right.cumulativeFailureBurden,
        prematureCapacityActionsDelta: left.prematureCapacityActions - right.prematureCapacityActions,
        lowUtilizationExpandedNodeDaysDelta: left.lowUtilizationExpandedNodeDays - right.lowUtilizationExpandedNodeDays,
      });
    }
  }
  return pairs;
}

function groupSummary(
  key: string,
  dimensions: Readonly<Record<string, string>>,
  runs: readonly BalanceRunResult[],
): BalanceGroupSummary {
  const won = runs.filter(({ terminalStatus }) => terminalStatus === 'WON');
  const bankrupt = runs.filter(({ terminalStatus }) => terminalStatus === 'BANKRUPT').length;
  const timeout = runs.filter(({ terminalStatus }) => terminalStatus === 'TIMEOUT').length;
  const count = runs.length;
  return {
    key,
    dimensions: { ...dimensions },
    runs: count,
    won: won.length,
    bankrupt,
    timeout,
    winRate: count === 0 ? 0 : won.length / count,
    bankruptcyRate: count === 0 ? 0 : bankrupt / count,
    timeoutRate: count === 0 ? 0 : timeout / count,
    winnerDays: summarizeNumbers(won.map(({ daysPlayed }) => daysPlayed)),
    infrastructureCostExposure: summarizeNumbers(runs.map(({ infrastructureCostExposure }) => infrastructureCostExposure)),
    failureBurden: summarizeNumbers(runs.map(({ cumulativeFailureBurden }) => cumulativeFailureBurden)),
    prematureCapacityActions: summarizeNumbers(runs.map(({ prematureCapacityActions }) => prematureCapacityActions)),
    lowUtilizationExpandedNodeDays: summarizeNumbers(runs.map(({ lowUtilizationExpandedNodeDays }) => lowUtilizationExpandedNodeDays)),
  };
}

function grouped(
  results: readonly BalanceRunResult[],
  dimensionsFor: (run: BalanceRunResult) => Readonly<Record<string, string>>,
): BalanceGroupSummary[] {
  const groups = new Map<string, { dimensions: Readonly<Record<string, string>>; runs: BalanceRunResult[] }>();
  for (const result of results) {
    const dimensions = dimensionsFor(result);
    const key = Object.entries(dimensions).map(([name, value]) => `${name}=${value}`).join('|') || 'all';
    const existing = groups.get(key);
    if (existing) existing.runs.push(result);
    else groups.set(key, { dimensions, runs: [result] });
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => groupSummary(key, group.dimensions, group.runs));
}

export interface BalanceReportSummary {
  readonly runCount: number;
  readonly groups: {
    readonly all: readonly BalanceGroupSummary[];
    readonly strategy: readonly BalanceGroupSummary[];
    readonly framework: readonly BalanceGroupSummary[];
    readonly database: readonly BalanceGroupSummary[];
    readonly frameworkDatabase: readonly BalanceGroupSummary[];
    readonly strategyFrameworkDatabase: readonly BalanceGroupSummary[];
  };
  readonly pairedComparisons: readonly PairedComparison[];
}

export function summarizeBalanceRuns(results: readonly BalanceRunResult[]): BalanceReportSummary {
  return {
    runCount: results.length,
    groups: {
      all: results.length === 0 ? [] : [groupSummary('all', {}, results)],
      strategy: grouped(results, ({ strategyId }) => ({ strategyId })),
      framework: grouped(results, ({ frameworkId }) => ({ frameworkId })),
      database: grouped(results, ({ databaseId }) => ({ databaseId })),
      frameworkDatabase: grouped(results, ({ frameworkId, databaseId }) => ({ frameworkId, databaseId })),
      strategyFrameworkDatabase: grouped(results, ({ strategyId, frameworkId, databaseId }) => ({
        strategyId, frameworkId, databaseId,
      })),
    },
    pairedComparisons: buildPairedComparisons(results),
  };
}

const CSV_COLUMNS: readonly (keyof BalanceRunResult)[] = Object.freeze([
  'frameworkId',
  'databaseId',
  'seed',
  'strategyId',
  'terminalStatus',
  'daysPlayed',
  'finalDau',
  'endingCash',
  'minimumCash',
  'failureDays',
  'severeFailureDays',
  'cumulativeFailureBurden',
  'overloadDays',
  'incidentCount',
  'technologyBuildSpend',
  'learningSpend',
  'burstSpend',
  'settledInfrastructureSpend',
  'infrastructureCostExposure',
  'resizeCount',
  'appScaleOutCount',
  'dbReplicaActionCount',
  'prematureCapacityActions',
  'lowUtilizationExpandedNodeDays',
  'viralRideCount',
  'viralThrottleCount',
  'viralBurstCount',
]);

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeRunsCsv(results: readonly BalanceRunResult[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = results.map((result) => CSV_COLUMNS.map((column) => csvCell(result[column])).join(','));
  return `${[header, ...rows].join('\n')}\n`;
}
