import { simulationActionId, withReleaseReadinessIntent, type SimulationAction } from './balance-action';
import type { BalanceObservation, OracleBalanceObservation } from './balance-observation';
import type { BalanceStrategyId } from './balance-scenario';
import type { StrategyDecisionContext } from './balance-strategy';
import {
  affordable,
  cheapestAffordable,
  firstAffordable,
  hottestResource,
  immediateCost,
  maxEffectiveRatioFromPreview,
  nodeFor,
  projectedMonthlyCost,
  resourceRemedyCandidates,
  technologyAction,
} from './strategy-helpers';

const RELEASE_READINESS_PERCENT = 85;
const RELEASE_READINESS_RATIO = RELEASE_READINESS_PERCENT / 100;
const RELEASE_FORECAST_DAILY_GROWTH = 1.02;
const RELEASE_FORECAST_MAX_DAYS = 3;

function imminentReleaseGrowthMultiplier(observation: BalanceObservation): number {
  const remainingDays = observation.pendingFeature?.estimatedRemainingDays;
  if (remainingDays === undefined || remainingDays <= 0 || remainingDays > RELEASE_FORECAST_MAX_DAYS) {
    return 1;
  }
  return RELEASE_FORECAST_DAILY_GROWTH ** remainingDays;
}

function forecastedReleasePercent(observation: BalanceObservation, effectivePercent: number): number {
  return effectivePercent * imminentReleaseGrowthMultiplier(observation);
}

function forecastedReleaseRatio(observation: BalanceObservation, effectiveRatio: number): number {
  return effectiveRatio * imminentReleaseGrowthMultiplier(observation);
}

function cheapestRequiredDependency(
  observation: BalanceObservation,
  context: StrategyDecisionContext,
  candidates: readonly (SimulationAction | null)[],
): SimulationAction | null {
  return candidates
    .filter((candidate): candidate is SimulationAction => candidate !== null)
    .filter((candidate) => (
      observation.cash - immediateCost(observation, candidate) >= context.protectedLearningReserve
    ))
    .sort((left, right) => {
      const leftCost = immediateCost(observation, left) + projectedMonthlyCost(observation, left);
      const rightCost = immediateCost(observation, right) + projectedMonthlyCost(observation, right);
      return leftCost - rightCost || simulationActionId(left).localeCompare(simulationActionId(right));
    })[0] ?? null;
}

export function preventativeDependencyAction(
  observation: BalanceObservation,
  context: StrategyDecisionContext,
  strategyId: BalanceStrategyId,
): SimulationAction | null {
  const gap = observation.upcomingRequiredDependencyGaps[0];
  if (!gap) return null;

  // A required dependency is not a discretionary optimization. The simulation
  // cannot hold a completed feature release, so applying a strategy-specific
  // runway floor here would make conservative strategies knowingly ship a
  // broken request path. Keep the shared learning reserve protected, while
  // leaving normal capacity/technology investments on their existing runway policy.
  void strategyId;
  const reason = `prepare ${gap.role} before ${gap.workloadIds.join(', ')} release`;
  const action = cheapestRequiredDependency(
    observation,
    context,
    gap.candidateTechnologyIds.map((technologyId) => (
      technologyAction(observation, technologyId, reason)
    )),
  );
  return action
    ? withReleaseReadinessIntent(action, 'RELEASE_READINESS_DEPENDENCY')
    : null;
}

export function decideMetricsPostReleaseStability(
  observation: BalanceObservation,
  context: StrategyDecisionContext,
  strategyId: 'METRICS_AWARE' | 'APM_AWARE',
): SimulationAction | null {
  if (!context.postReleaseStabilityWindowActive) return null;

  const resource = hottestResource(observation);
  if (!resource || resource.effectivePercent <= 70) return null;

  const node = nodeFor(observation, resource.nodeId);
  if (!node) return null;
  const reason = `stabilize live ${resource.nodeKind} ${resource.resourceKind} after release at ${resource.effectivePercent}%`;
  const remedies = resourceRemedyCandidates(observation, node, resource.resourceKind, reason);
  const immediateRemedies = remedies.filter((candidate) => (
    candidate?.type === 'RESIZE_NODE' || candidate?.type === 'SCALE_OUT_NODE'
  ));
  const action = firstAffordable(
    observation,
    context,
    strategyId,
    immediateRemedies,
  ) ?? firstAffordable(
    observation,
    context,
    strategyId,
    remedies,
  );
  return action
    ? withReleaseReadinessIntent(action, 'POST_RELEASE_STABILITY_CAPACITY')
    : null;
}

export function decideMetricsReleaseReadiness(
  observation: BalanceObservation,
  context: StrategyDecisionContext,
  strategyId: 'METRICS_AWARE' | 'APM_AWARE',
): SimulationAction | null {
  const dependency = preventativeDependencyAction(observation, context, strategyId);
  if (dependency) return dependency;

  if (!('releasePreview' in observation) || !observation.releasePreview) return null;
  if (forecastedReleasePercent(observation, observation.releasePreview.maxEffectivePercent) < RELEASE_READINESS_PERCENT) return null;

  const resource = [...observation.releasePreview.resourceLoads].sort((left, right) => (
    right.effectivePercent - left.effectivePercent
    || left.nodeId.localeCompare(right.nodeId)
    || left.resourceKind.localeCompare(right.resourceKind)
  ))[0];
  if (!resource) return null;

  const node = nodeFor(observation, resource.nodeId);
  if (!node) return null;
  const reason = `prepare ${resource.nodeKind} ${resource.resourceKind} for release at ${resource.effectivePercent}%`;
  const action = firstAffordable(
    observation,
    context,
    strategyId,
    resourceRemedyCandidates(observation, node, resource.resourceKind, reason),
  );
  return action
    ? withReleaseReadinessIntent(action, 'RELEASE_READINESS_CAPACITY')
    : null;
}

export function decideApmPostReleaseStability(
  observation: BalanceObservation,
  context: StrategyDecisionContext,
): SimulationAction | null {
  if (!context.postReleaseStabilityWindowActive) return null;

  if (observation.level !== 'APM' && observation.level !== 'ORACLE') {
    return decideMetricsPostReleaseStability(observation, context, 'APM_AWARE');
  }

  const bottleneck = observation.diagnosis.topBottleneck;
  if (!bottleneck) {
    return decideMetricsPostReleaseStability(observation, context, 'APM_AWARE');
  }
  if (observation.serviceHealth === 'HEALTHY' || bottleneck.effectiveRatio < 0.70) return null;

  const node = nodeFor(observation, bottleneck.nodeId);
  if (!node) return null;
  const reason = `stabilize live APM diagnosis ${bottleneck.label} after release at ${bottleneck.effectivePercent}%`;
  const action = cheapestAffordable(
    observation,
    context,
    'APM_AWARE',
    resourceRemedyCandidates(observation, node, bottleneck.resourceKind, reason),
  );
  return action
    ? withReleaseReadinessIntent(action, 'POST_RELEASE_STABILITY_CAPACITY')
    : null;
}

export function decideApmReleaseReadiness(
  observation: BalanceObservation,
  context: StrategyDecisionContext,
): SimulationAction | null {
  const dependency = preventativeDependencyAction(observation, context, 'APM_AWARE');
  if (dependency) return dependency;

  if (observation.level !== 'APM' && observation.level !== 'ORACLE') {
    return decideMetricsReleaseReadiness(observation, context, 'APM_AWARE');
  }

  const preview = observation.releasePreview;
  if (!preview || forecastedReleasePercent(observation, preview.maxEffectivePercent) < RELEASE_READINESS_PERCENT) return null;
  const bottleneck = preview.diagnosis.topBottleneck;
  if (!bottleneck || forecastedReleasePercent(observation, bottleneck.effectivePercent) < RELEASE_READINESS_PERCENT) return null;

  const node = nodeFor(observation, bottleneck.nodeId);
  if (!node) return null;
  const reason = `prepare APM diagnosis ${bottleneck.label} for release at ${bottleneck.effectivePercent}%`;
  const action = cheapestAffordable(
    observation,
    context,
    'APM_AWARE',
    resourceRemedyCandidates(observation, node, bottleneck.resourceKind, reason),
  );
  return action
    ? withReleaseReadinessIntent(action, 'RELEASE_READINESS_CAPACITY')
    : null;
}

function oracleCurrentPreviewMax(observation: OracleBalanceObservation, action: SimulationAction): number {
  switch (action.type) {
    case 'RESIZE_NODE':
      return maxEffectiveRatioFromPreview(observation.previewPort.previewResize(action.nodeId, action.size));
    case 'SCALE_OUT_NODE':
      return maxEffectiveRatioFromPreview(observation.previewPort.previewScaleOut(action.nodeId));
    case 'START_TECHNOLOGY_BUILD':
      return maxEffectiveRatioFromPreview(observation.previewPort.previewTechnology(action.technologyId));
    case 'NO_OP':
    case 'RESPOND_TRAFFIC_SPIKE':
      return Math.max(0, ...observation.exactPressures.map(({ effectiveRatio }) => effectiveRatio));
  }
}

function oracleCurrentCandidates(observation: OracleBalanceObservation): readonly SimulationAction[] {
  const pressure = [...observation.exactPressures].sort((left, right) => (
    right.effectiveRatio - left.effectiveRatio
    || left.nodeId.localeCompare(right.nodeId)
    || left.resourceKind.localeCompare(right.resourceKind)
  ))[0];
  if (!pressure) return [];

  const node = nodeFor(observation, pressure.nodeId);
  if (!node) return [];
  const tags = new Set(observation.workloadTags);
  return resourceRemedyCandidates(
    observation,
    node,
    pressure.resourceKind,
    `stabilize live ORACLE ${pressure.nodeKind} ${pressure.resourceKind} ${pressure.effectiveRatio.toFixed(2)}x after release`,
  ).filter((candidate): candidate is SimulationAction => {
    if (!candidate) return false;
    if (candidate.type !== 'START_TECHNOLOGY_BUILD') return true;
    if (candidate.technologyId === 'REDIS') {
      return tags.has('READ_HEAVY') || tags.has('CONTENT') || tags.has('SEARCH');
    }
    if (candidate.technologyId === 'SQS') {
      return tags.has('ASYNC') || tags.has('EVENT_HEAVY');
    }
    return true;
  });
}

export function decideOraclePostReleaseStability(
  observation: OracleBalanceObservation,
  context: StrategyDecisionContext,
): SimulationAction | null {
  if (!context.postReleaseStabilityWindowActive) return null;

  const currentMax = Math.max(0, ...observation.exactPressures.map(({ effectiveRatio }) => effectiveRatio));
  if (currentMax < 0.70) return null;

  const ranked = oracleCurrentCandidates(observation).map((action, order) => {
    if (!affordable(observation, context, 'ORACLE', action)) return null;
    const nextMax = oracleCurrentPreviewMax(observation, action);
    const relief = Math.max(0, currentMax - nextMax);
    const oneMonthCost = immediateCost(observation, action)
      + Math.max(0, projectedMonthlyCost(observation, action) - observation.monthlyInfrastructureCost);
    const requiredAlbEnablement = action.type === 'START_TECHNOLOGY_BUILD' && action.technologyId === 'ALB';
    if (relief < 0.02 && !requiredAlbEnablement) return null;
    return { action, order, nextMax, relief, oneMonthCost };
  }).filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  const target = ranked.filter(({ nextMax }) => nextMax <= 0.85);
  if (target.length > 0) {
    target.sort((left, right) => (
      left.oneMonthCost - right.oneMonthCost
      || left.order - right.order
      || simulationActionId(left.action).localeCompare(simulationActionId(right.action))
    ));
    return withReleaseReadinessIntent(target[0].action, 'POST_RELEASE_STABILITY_CAPACITY');
  }

  ranked.sort((left, right) => {
    const leftScore = left.relief / Math.max(1, left.oneMonthCost);
    const rightScore = right.relief / Math.max(1, right.oneMonthCost);
    return rightScore - leftScore
      || left.order - right.order
      || simulationActionId(left.action).localeCompare(simulationActionId(right.action));
  });
  return ranked[0]
    ? withReleaseReadinessIntent(ranked[0].action, 'POST_RELEASE_STABILITY_CAPACITY')
    : null;
}

function oracleReleaseCandidates(observation: OracleBalanceObservation): readonly SimulationAction[] {
  const pressure = [...(observation.releasePreview?.exactPressures ?? [])].sort((left, right) => (
    right.effectiveRatio - left.effectiveRatio
    || left.nodeId.localeCompare(right.nodeId)
    || left.resourceKind.localeCompare(right.resourceKind)
  ))[0];
  if (!pressure) return [];

  const node = nodeFor(observation, pressure.nodeId);
  if (!node) return [];
  return resourceRemedyCandidates(
    observation,
    node,
    pressure.resourceKind,
    `prepare ORACLE ${pressure.nodeKind} ${pressure.resourceKind} ${pressure.effectiveRatio.toFixed(2)}x for release`,
  ).filter((candidate): candidate is SimulationAction => {
    if (!candidate) return false;
    if (candidate.type !== 'START_TECHNOLOGY_BUILD') return true;
    return observation.previewPort.technologyReadyForRelease?.(candidate.technologyId) !== false;
  });
}

export function decideOracleReleaseReadiness(
  observation: OracleBalanceObservation,
  context: StrategyDecisionContext,
): SimulationAction | null {
  const dependency = preventativeDependencyAction(observation, context, 'ORACLE');
  if (dependency) return dependency;

  const preview = observation.releasePreview;
  if (!preview) return null;
  const currentMax = Math.max(0, ...preview.exactPressures.map(({ effectiveRatio }) => effectiveRatio));
  const currentForecastMax = forecastedReleaseRatio(observation, currentMax);
  if (currentForecastMax < RELEASE_READINESS_RATIO) return null;

  const growthMultiplier = imminentReleaseGrowthMultiplier(observation);
  const ranked = oracleReleaseCandidates(observation).map((action, order) => {
    if (!affordable(observation, context, 'ORACLE', action)) return null;
    const nextMax = maxEffectiveRatioFromPreview(observation.previewPort.previewReleaseAction(action));
    const nextForecastMax = nextMax * growthMultiplier;
    const relief = Math.max(0, currentForecastMax - nextForecastMax);
    const oneMonthCost = immediateCost(observation, action)
      + Math.max(0, projectedMonthlyCost(observation, action) - observation.monthlyInfrastructureCost);
    const requiredAlbEnablement = action.type === 'START_TECHNOLOGY_BUILD' && action.technologyId === 'ALB';
    if (relief < 0.02 && !requiredAlbEnablement) return null;
    return { action, order, nextForecastMax, relief, oneMonthCost };
  }).filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  const target = ranked.filter(({ nextForecastMax }) => nextForecastMax <= RELEASE_READINESS_RATIO);
  if (target.length > 0) {
    target.sort((left, right) => (
      left.oneMonthCost - right.oneMonthCost
      || left.order - right.order
      || simulationActionId(left.action).localeCompare(simulationActionId(right.action))
    ));
    return withReleaseReadinessIntent(target[0].action, 'RELEASE_READINESS_CAPACITY');
  }

  ranked.sort((left, right) => {
    const leftScore = left.relief / Math.max(1, left.oneMonthCost);
    const rightScore = right.relief / Math.max(1, right.oneMonthCost);
    return rightScore - leftScore
      || left.order - right.order
      || simulationActionId(left.action).localeCompare(simulationActionId(right.action));
  });
  return ranked[0]
    ? withReleaseReadinessIntent(ranked[0].action, 'RELEASE_READINESS_CAPACITY')
    : null;
}
