import type { GameEngine } from '../core/game-engine';
import { operationalPressures, primaryOperationalPressureForNode } from '../core/operational-pressure';
import { simulationActionId, type SimulationAction } from './balance-action';
import { observeForStrategy, type BalanceObservation } from './balance-observation';
import { createBalanceEngine, type BalanceScenario } from './balance-scenario';
import { BaselineLearningController } from './baseline-learning-controller';
import { SimulationExecutor } from './simulation-executor';
import { SimulationMetricsCollector, type BalanceRunResult, type BalanceTerminalStatus } from './simulation-metrics';
import { BALANCE_STRATEGIES } from './strategy-registry';

export const BALANCE_DAY_LIMIT = 1_080;

export interface BalanceTraceEntry {
  readonly day: number;
  readonly observabilityLevel: BalanceObservation['level'];
  readonly actionId: string;
  readonly actionReason: string;
  readonly cash: number;
  readonly dau: number;
  readonly hottestVisibleSignal: string;
  readonly incidentControl: string | null;
  readonly viralControl: 'RIDE' | 'THROTTLE' | 'BURST' | null;
}

export interface BalanceTraceRun {
  readonly result: BalanceRunResult;
  readonly trace: readonly BalanceTraceEntry[];
}

export interface BalanceRunOptions {
  readonly trace?: boolean;
}

function terminalStatus(engine: GameEngine): BalanceTerminalStatus {
  if (engine.status === 'WON') return 'WON';
  if (engine.status === 'BANKRUPT') return 'BANKRUPT';
  return 'TIMEOUT';
}

function visibleSignal(observation: BalanceObservation): string {
  if ('resourceLoads' in observation && observation.resourceLoads.length > 0) {
    const resource = [...observation.resourceLoads].sort((left, right) => (
      right.effectivePercent - left.effectivePercent
      || left.nodeId.localeCompare(right.nodeId)
      || left.resourceKind.localeCompare(right.resourceKind)
    ))[0];
    return `${resource.nodeId}:${resource.resourceKind}:${resource.effectivePercent}%`;
  }
  const node = [...observation.nodes].sort((left, right) => (
    right.aggregatePercent - left.aggregatePercent || left.nodeId.localeCompare(right.nodeId)
  ))[0];
  return node ? `${node.nodeId}:LOAD:${node.aggregatePercent}%` : 'NONE';
}

function observeDailyOperationalMetrics(engine: GameEngine, metrics: SimulationMetricsCollector): void {
  const snapshot = engine.snapshot;
  metrics.recordCash(snapshot.cash);
  metrics.recordIncidentIds(snapshot.incidents.map(({ id }) => id));
  metrics.recordInfrastructureExposure(engine.infrastructure.monthlyCost);
  metrics.recordOperationalDay({
    failureRate: snapshot.load.failureRate,
    effectiveRatios: operationalPressures(snapshot.load).map(({ effectiveRatio }) => effectiveRatio),
  });
}

function hasMissingRequiredDependency(engine: GameEngine): boolean {
  return engine.snapshot.load.requestTraces.some((trace) => (
    trace.nodes.some((node) => node.requirement === 'REQUIRED' && node.status === 'MISSING')
  ));
}

function recordProgression(engine: GameEngine, metrics: SimulationMetricsCollector): void {
  const snapshot = engine.snapshot;
  metrics.recordProgressionDay({
    dau: snapshot.dau,
    completedFeatureCount: snapshot.completedFeatures.length,
    missingRequiredDependency: hasMissingRequiredDependency(engine),
  });
}

function recordSettlement(engine: GameEngine, metrics: SimulationMetricsCollector): void {
  const settlement = engine.snapshot.lastSettlement;
  if (!settlement) return;
  metrics.recordMonthlyRevenue(settlement.revenue);
  metrics.recordSettlement(settlement.month, settlement.infrastructureCost);
}

function targetEffectiveRatio(engine: GameEngine, action: SimulationAction): number | null {
  if (action.type !== 'RESIZE_NODE' && action.type !== 'SCALE_OUT_NODE') return null;
  return primaryOperationalPressureForNode(engine.snapshot.load, action.nodeId, 'EFFECTIVE')?.effectiveRatio ?? 0;
}

function recordSuccessfulInvestment(
  engineBeforeAction: GameEngine,
  observation: BalanceObservation,
  action: SimulationAction,
  metrics: SimulationMetricsCollector,
  expandedNodeIds: Set<string>,
  cashBefore: number,
  cashAfter: number,
): void {
  if (action.type === 'NO_OP' || action.type === 'RESPOND_TRAFFIC_SPIKE') return;

  if (action.type === 'START_TECHNOLOGY_BUILD') {
    metrics.recordTechnologyBuildSpend(cashBefore - cashAfter);
    return;
  }

  const ratio = targetEffectiveRatio(engineBeforeAction, action) ?? 0;
  metrics.recordCapacityAction({
    targetEffectiveRatio: ratio,
    viralActive: observation.growthEvent?.type === 'VIRAL',
  });
  expandedNodeIds.add(action.nodeId);
  if (action.type === 'RESIZE_NODE') {
    metrics.recordResize();
    return;
  }
  const targetNode = observation.nodes.find(({ nodeId }) => nodeId === action.nodeId);
  if (targetNode?.kind === 'SERVER_GROUP') metrics.recordAppScaleOut();
  if (targetNode?.kind === 'DATABASE') metrics.recordDbReplicaAction();
}

function recordExpandedNodeUtilization(
  engine: GameEngine,
  metrics: SimulationMetricsCollector,
  expandedNodeIds: ReadonlySet<string>,
): void {
  for (const nodeId of expandedNodeIds) {
    const pressure = primaryOperationalPressureForNode(engine.snapshot.load, nodeId, 'EFFECTIVE');
    if (pressure) metrics.recordExpandedNodeDay(pressure.effectiveRatio);
  }
}

function runInternal(scenario: BalanceScenario, collectTrace: boolean): BalanceTraceRun {
  const engine = createBalanceEngine(scenario);
  const strategy = BALANCE_STRATEGIES[scenario.strategyId];
  const executor = new SimulationExecutor();
  const metrics = new SimulationMetricsCollector(engine.snapshot.cash);
  const expandedNodeIds = new Set<string>();
  const trace: BalanceTraceEntry[] = [];
  let daysPlayed = 0;

  while (engine.status === 'RUNNING' && daysPlayed < BALANCE_DAY_LIMIT) {
    try {
      observeDailyOperationalMetrics(engine, metrics);

      const incidentControl = executor.maybeStartIncidentResponse(engine);
      metrics.recordCash(engine.snapshot.cash);

      const learningCashBefore = engine.snapshot.cash;
      BaselineLearningController.maybeStart(engine);
      metrics.recordLearningSpend(learningCashBefore - engine.snapshot.cash);
      metrics.recordCash(engine.snapshot.cash);

      const protectedLearningReserve = BaselineLearningController.protectedReserve(engine);
      const decisionContext = { protectedLearningReserve } as const;
      const observation = observeForStrategy(engine, strategy.ceiling);

      const viralCashBefore = engine.snapshot.cash;
      const viralControl = executor.maybeRespondToViral(engine, strategy, observation, decisionContext);
      if (viralControl) {
        metrics.recordViralResponse(viralControl);
        if (viralControl === 'BURST') metrics.recordBurstSpend(viralCashBefore - engine.snapshot.cash);
      }
      metrics.recordCash(engine.snapshot.cash);

      const refreshed = observeForStrategy(engine, strategy.ceiling);
      const action = strategy.decide(refreshed, decisionContext);
      const preActionRatio = targetEffectiveRatio(engine, action);
      const actionCashBefore = engine.snapshot.cash;
      executor.executeNormalInvestment(engine, action);
      const actionCashAfter = engine.snapshot.cash;

      if (action.type === 'START_TECHNOLOGY_BUILD') {
        metrics.recordTechnologyBuildSpend(actionCashBefore - actionCashAfter);
      } else if (action.type === 'RESIZE_NODE' || action.type === 'SCALE_OUT_NODE') {
        metrics.recordCapacityAction({
          targetEffectiveRatio: preActionRatio ?? 0,
          viralActive: refreshed.growthEvent?.type === 'VIRAL',
        });
        expandedNodeIds.add(action.nodeId);
        if (action.type === 'RESIZE_NODE') metrics.recordResize();
        const node = refreshed.nodes.find(({ nodeId }) => nodeId === action.nodeId);
        if (action.type === 'SCALE_OUT_NODE' && node?.kind === 'SERVER_GROUP') metrics.recordAppScaleOut();
        if (action.type === 'SCALE_OUT_NODE' && node?.kind === 'DATABASE') metrics.recordDbReplicaAction();
      }
      metrics.recordCash(actionCashAfter);

      if (collectTrace) {
        trace.push(Object.freeze({
          day: engine.day,
          observabilityLevel: refreshed.level,
          actionId: simulationActionId(action),
          actionReason: action.reason,
          cash: engine.snapshot.cash,
          dau: engine.dau,
          hottestVisibleSignal: visibleSignal(refreshed),
          incidentControl,
          viralControl,
        }));
      }

      engine.advanceDay();
      daysPlayed += 1;
      metrics.recordCash(engine.snapshot.cash);
      metrics.recordIncidentIds(engine.snapshot.incidents.map(({ id }) => id));
      recordProgression(engine, metrics);
      recordSettlement(engine, metrics);
      recordExpandedNodeUtilization(engine, metrics, expandedNodeIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `[balance] ${scenario.frameworkId}/${scenario.databaseId}/seed=${scenario.seed}/strategy=${scenario.strategyId}/day=${engine.day}: ${message}`,
        { cause: error },
      );
    }
  }

  const result = metrics.result({
    frameworkId: scenario.frameworkId,
    databaseId: scenario.databaseId,
    seed: scenario.seed,
    strategyId: scenario.strategyId,
    terminalStatus: terminalStatus(engine),
    daysPlayed,
    finalDau: engine.dau,
    endingCash: engine.snapshot.cash,
  });
  return { result, trace: Object.freeze(trace) };
}

export function runBalanceScenario(scenario: BalanceScenario): BalanceRunResult;
export function runBalanceScenario(scenario: BalanceScenario, options: { readonly trace: true }): BalanceTraceRun;
export function runBalanceScenario(scenario: BalanceScenario, options: BalanceRunOptions): BalanceRunResult | BalanceTraceRun;
export function runBalanceScenario(
  scenario: BalanceScenario,
  options: BalanceRunOptions = {},
): BalanceRunResult | BalanceTraceRun {
  const run = runInternal(scenario, options.trace === true);
  return options.trace ? run : run.result;
}
