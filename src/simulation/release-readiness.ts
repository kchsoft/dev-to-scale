import { withReleaseReadinessIntent, type SimulationAction } from './balance-action';
import type { BalanceObservation } from './balance-observation';
import type { BalanceStrategyId } from './balance-scenario';
import type { StrategyDecisionContext } from './balance-strategy';
import {
  cheapestAffordable,
  firstAffordable,
  nodeFor,
  resourceRemedyCandidates,
  technologyAction,
} from './strategy-helpers';

export function preventativeDependencyAction(
  observation: BalanceObservation,
  context: StrategyDecisionContext,
  strategyId: BalanceStrategyId,
): SimulationAction | null {
  const gap = observation.upcomingRequiredDependencyGaps[0];
  if (!gap) return null;

  const reason = `prepare ${gap.role} before ${gap.workloadIds.join(', ')} release`;
  const action = cheapestAffordable(
    observation,
    context,
    strategyId,
    gap.candidateTechnologyIds.map((technologyId) => (
      technologyAction(observation, technologyId, reason)
    )),
  );
  return action
    ? withReleaseReadinessIntent(action, 'RELEASE_READINESS_DEPENDENCY')
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
  if (observation.releasePreview.maxEffectivePercent < 85) return null;

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
  if (!preview || preview.maxEffectivePercent < 85) return null;
  const bottleneck = preview.diagnosis.topBottleneck;
  if (!bottleneck || bottleneck.effectivePercent < 85) return null;

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
