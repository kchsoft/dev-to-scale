import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import {
  buildBalanceScenarios,
  parseBalanceArgs,
  runBalanceScenario,
  serializeRunsCsv,
  summarizeBalanceRuns,
  type BalanceRunResult,
  type BalanceTraceEntry,
} from '../src/simulation';

const OUTPUT_DIRECTORY = 'artifacts/balance';
const RUNS_PATH = `${OUTPUT_DIRECTORY}/runs.csv`;
const SUMMARY_PATH = `${OUTPUT_DIRECTORY}/summary.json`;
const RUNS_TMP_PATH = `${RUNS_PATH}.tmp`;
const SUMMARY_TMP_PATH = `${SUMMARY_PATH}.tmp`;

function rate(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function printSummary(results: readonly BalanceRunResult[]): void {
  const summary = summarizeBalanceRuns(results);
  const overall = summary.groups.all[0];
  if (!overall) {
    console.log('[balance] runs=0');
    return;
  }

  console.log(`[balance] runs=${summary.runCount}`);
  console.log(
    `[balance] terminal WON=${rate(overall.winRate)} BANKRUPT=${rate(overall.bankruptcyRate)} TIMEOUT=${rate(overall.timeoutRate)}`,
  );
  console.log(`[balance] median-winner-days=${overall.winnerDays.median}`);

  const apmVsYolo = summary.pairedComparisons.filter(({ leftStrategyId, rightStrategyId }) => (
    leftStrategyId === 'APM_AWARE' && rightStrategyId === 'YOLO_SCALE'
  ));
  const comparableWinDays = apmVsYolo.flatMap(({ winDaysDelta }) => winDaysDelta === null ? [] : [winDaysDelta]);
  console.log(
    '[balance] APM_AWARE-YOLO_SCALE mean-delta(left-right) '
      + `winDays=${signed(mean(comparableWinDays))} `
      + `infra=${signed(mean(apmVsYolo.map(({ infrastructureCostExposureDelta }) => infrastructureCostExposureDelta)))} `
      + `failure=${signed(mean(apmVsYolo.map(({ failureBurdenDelta }) => failureBurdenDelta)))} `
      + `premature=${signed(mean(apmVsYolo.map(({ prematureCapacityActionsDelta }) => prematureCapacityActionsDelta)))} `
      + `lowUtil=${signed(mean(apmVsYolo.map(({ lowUtilizationExpandedNodeDaysDelta }) => lowUtilizationExpandedNodeDaysDelta)))}`,
  );
}

function printTrace(trace: readonly BalanceTraceEntry[]): void {
  for (const entry of trace) {
    console.log(`[trace] ${JSON.stringify(entry)}`);
  }
}

async function writeReports(results: readonly BalanceRunResult[]): Promise<void> {
  const summary = summarizeBalanceRuns(results);
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });

  try {
    await writeFile(RUNS_TMP_PATH, serializeRunsCsv(results), 'utf8');
    await writeFile(SUMMARY_TMP_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await rename(RUNS_TMP_PATH, RUNS_PATH);
    await rename(SUMMARY_TMP_PATH, SUMMARY_PATH);
  } catch (error) {
    await Promise.allSettled([
      rm(RUNS_TMP_PATH, { force: true }),
      rm(SUMMARY_TMP_PATH, { force: true }),
    ]);
    throw error;
  }
}

async function main(): Promise<void> {
  const options = parseBalanceArgs(process.argv.slice(2));
  const scenarios = buildBalanceScenarios({
    seed: options.seed,
    frameworkId: options.frameworkId,
    databaseId: options.databaseId,
    strategyId: options.strategyId,
  });

  const results: BalanceRunResult[] = [];
  let trace: readonly BalanceTraceEntry[] = [];

  if (options.trace) {
    const traced = runBalanceScenario(scenarios[0], { trace: true });
    results.push(traced.result);
    trace = traced.trace;
  } else {
    for (const scenario of scenarios) {
      results.push(runBalanceScenario(scenario));
    }
  }

  await writeReports(results);
  printSummary(results);
  if (options.trace) printTrace(trace);
  console.log(`[balance] wrote ${RUNS_PATH} and ${SUMMARY_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
