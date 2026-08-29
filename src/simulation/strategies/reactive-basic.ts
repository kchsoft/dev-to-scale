import type { BalanceStrategy } from '../balance-strategy';
import { firstAffordable, hottestAggregateNode, noOp, rawCapacityCandidates } from '../strategy-helpers';

export const reactiveBasicStrategy: BalanceStrategy = {
  id: 'REACTIVE_BASIC',
  ceiling: 'BASIC',
  decide(observation, context) {
    const hottest = hottestAggregateNode(observation);
    if (!hottest || hottest.aggregatePercent < 100) return noOp('No BASIC node is red yet');
    return firstAffordable(
      observation,
      context,
      this.id,
      rawCapacityCandidates(observation, hottest, `BASIC load ${hottest.aggregatePercent}%`),
    ) ?? noOp('No affordable BASIC correction is available');
  },
  decideViral(observation) {
    return (hottestAggregateNode(observation)?.aggregatePercent ?? 0) >= 100 ? 'THROTTLE' : 'RIDE';
  },
};
