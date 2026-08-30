import type { BalanceStrategy, StrategyDecisionContext } from '../balance-strategy';
import type { BalanceObservation } from '../balance-observation';
import { decideMetricsPostReleaseStability, decideMetricsReleaseReadiness } from '../release-readiness';
import { firstAffordable, hottestAggregateNode, hottestResource, noOp, nodeFor, rawCapacityCandidates, resourceRemedyCandidates } from '../strategy-helpers';

export function decideFromMetrics(observation: BalanceObservation, context: StrategyDecisionContext, strategyId: 'METRICS_AWARE' | 'APM_AWARE' | 'CHEAPSKATE') {
  const resource = hottestResource(observation);
  if (!resource) {
    const hottest = hottestAggregateNode(observation);
    if (!hottest || hottest.aggregatePercent < 100) return noOp('Metrics are not unlocked and BASIC is healthy');
    return firstAffordable(observation, context, strategyId, rawCapacityCandidates(observation, hottest, 'Fallback BASIC correction'))
      ?? noOp('No affordable fallback correction');
  }
  if (resource.effectivePercent < 85) return noOp('No visible resource is near the hard limit');
  const node = nodeFor(observation, resource.nodeId);
  if (!node) return noOp('Visible resource has no owned node');
  return firstAffordable(
    observation,
    context,
    strategyId,
    resourceRemedyCandidates(observation, node, resource.resourceKind, `${resource.nodeKind} ${resource.resourceKind} ${resource.effectivePercent}%`),
  ) ?? noOp('No affordable visible resource remedy');
}

export const metricsAwareStrategy: BalanceStrategy = {
  id: 'METRICS_AWARE',
  ceiling: 'METRICS',
  decide(observation, context) {
    return decideMetricsPostReleaseStability(observation, context, 'METRICS_AWARE')
      ?? decideMetricsReleaseReadiness(observation, context, 'METRICS_AWARE')
      ?? decideFromMetrics(observation, context, 'METRICS_AWARE');
  },
  decideViral(observation) {
    return (hottestResource(observation)?.effectivePercent ?? hottestAggregateNode(observation)?.aggregatePercent ?? 0) > 100
      ? 'THROTTLE'
      : 'RIDE';
  },
};
