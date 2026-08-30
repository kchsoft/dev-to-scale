import type { BalanceStrategy } from '../balance-strategy';
import { affordable, firstAffordable, hottestAggregateNode, hottestEffectiveNode, noOp, rawCapacityCandidates } from '../strategy-helpers';

export const yoloScaleStrategy: BalanceStrategy = {
  id: 'YOLO_SCALE',
  ceiling: 'BASIC',
  decide(observation, context) {
    const hottest = hottestAggregateNode(observation);
    if (!hottest || hottest.aggregatePercent < 70) return noOp('YOLO threshold not reached');
    return firstAffordable(
      observation,
      context,
      this.id,
      rawCapacityCandidates(observation, hottest, `YOLO preemptive scale at ${hottest.aggregatePercent}%`),
    ) ?? noOp('YOLO has no affordable raw capacity action');
  },
  decideViral(observation, context) {
    const burst = { type: 'RESPOND_TRAFFIC_SPIKE' as const, response: 'BURST' as const, reason: 'YOLO emergency burst' };
    if (affordable(observation, context, this.id, burst)) return 'BURST';
    return (hottestEffectiveNode(observation)?.effectivePercent ?? 0) > 100 ? 'THROTTLE' : 'RIDE';
  },
};
