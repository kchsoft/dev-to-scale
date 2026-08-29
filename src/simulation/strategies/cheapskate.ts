import type { BalanceStrategy } from '../balance-strategy';
import { cheapestAffordable, hottestEffectiveNode, hottestResource, noOp, nodeFor, rawCapacityCandidates, resourceRemedyCandidates } from '../strategy-helpers';

export const cheapskateStrategy: BalanceStrategy = {
  id: 'CHEAPSKATE',
  ceiling: 'APM',
  decide(observation, context) {
    const hottest = hottestEffectiveNode(observation);
    if (!hottest || hottest.effectivePercent <= 100) return noOp('Cheapskate waits until the hard limit is exceeded');

    const resource = hottestResource(observation);
    const candidates = resource && resource.nodeId === hottest.nodeId
      ? resourceRemedyCandidates(observation, hottest, resource.resourceKind, `Hard limit exceeded at ${resource.effectivePercent}%`)
      : rawCapacityCandidates(observation, hottest, `Hard limit exceeded at ${hottest.effectivePercent}%`);

    return cheapestAffordable(observation, context, this.id, candidates)
      ?? noOp('No correction satisfies the two-month runway');
  },
  decideViral(observation) {
    return (hottestEffectiveNode(observation)?.effectivePercent ?? 0) > 100 ? 'THROTTLE' : 'RIDE';
  },
};
