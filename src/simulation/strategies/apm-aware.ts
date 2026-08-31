import type { BalanceStrategy } from '../balance-strategy';
import { decideApmPostReleaseStability, decideApmReleaseReadiness } from '../release-readiness';
import { cheapestAffordable, firstAffordable, hottestResource, noOp, nodeFor, resourceRemedyCandidates } from '../strategy-helpers';
import { decideFromMetrics } from './metrics-aware';

export const apmAwareStrategy: BalanceStrategy = {
  id: 'APM_AWARE',
  ceiling: 'APM',
  decide(observation, context) {
    const stability = decideApmPostReleaseStability(observation, context);
    if (stability) return stability;

    const readiness = decideApmReleaseReadiness(observation, context);
    if (readiness) return readiness;

    if (observation.level !== 'APM' && observation.level !== 'ORACLE') {
      return decideFromMetrics(observation, context, 'APM_AWARE');
    }
    const bottleneck = observation.diagnosis.topBottleneck;
    if (!bottleneck || bottleneck.effectivePercent < 85) return noOp('APM diagnosis shows no urgent bottleneck');
    const node = nodeFor(observation, bottleneck.nodeId);
    if (!node) return noOp('Diagnosed bottleneck is not player-owned');
    const candidates = resourceRemedyCandidates(
      observation,
      node,
      bottleneck.resourceKind,
      `APM diagnosis: ${bottleneck.label} ${bottleneck.effectivePercent}%`,
    );
    // Local storage scaling is deliberately a stopgap. Once Object Storage is
    // available, preserve the domain-specific candidate order instead of
    // re-sorting by one-step cost and repeatedly resizing local disk.
    const remedy = node.kind === 'OBJECT_STORAGE' && bottleneck.resourceKind === 'STORAGE'
      ? firstAffordable(observation, context, 'APM_AWARE', candidates)
      : cheapestAffordable(observation, context, 'APM_AWARE', candidates);
    return remedy ?? noOp('No affordable diagnosis-supported remedy');
  },
  decideViral(observation) {
    if (observation.level === 'APM' || observation.level === 'ORACLE') {
      return (observation.diagnosis.topBottleneck?.effectivePercent ?? 0) > 100 ? 'THROTTLE' : 'RIDE';
    }
    return (hottestResource(observation)?.effectivePercent ?? 0) > 100 ? 'THROTTLE' : 'RIDE';
  },
};
