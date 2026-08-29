import type { BalanceStrategy } from '../balance-strategy';
import { cheapestAffordable, hottestResource, noOp, nodeFor, resourceRemedyCandidates } from '../strategy-helpers';
import { decideFromMetrics } from './metrics-aware';

export const apmAwareStrategy: BalanceStrategy = {
  id: 'APM_AWARE',
  ceiling: 'APM',
  decide(observation, context) {
    if (observation.level !== 'APM' && observation.level !== 'ORACLE') {
      return decideFromMetrics(observation, context, this.id);
    }
    const bottleneck = observation.diagnosis.topBottleneck;
    if (!bottleneck || bottleneck.effectivePercent < 85) return noOp('APM diagnosis shows no urgent bottleneck');
    const node = nodeFor(observation, bottleneck.nodeId);
    if (!node) return noOp('Diagnosed bottleneck is not player-owned');
    return cheapestAffordable(
      observation,
      context,
      this.id,
      resourceRemedyCandidates(
        observation,
        node,
        bottleneck.resourceKind,
        `APM diagnosis: ${bottleneck.label} ${bottleneck.effectivePercent}%`,
      ),
    ) ?? noOp('No affordable diagnosis-supported remedy');
  },
  decideViral(observation) {
    if (observation.level === 'APM' || observation.level === 'ORACLE') {
      return (observation.diagnosis.topBottleneck?.effectivePercent ?? 0) > 100 ? 'THROTTLE' : 'RIDE';
    }
    return (hottestResource(observation)?.effectivePercent ?? 0) > 100 ? 'THROTTLE' : 'RIDE';
  },
};
