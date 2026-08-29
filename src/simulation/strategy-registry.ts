import type { BalanceStrategy } from './balance-strategy';
import type { BalanceStrategyId } from './balance-scenario';
import { cheapestAffordable, noOp, technologyAction } from './strategy-helpers';
import { apmAwareStrategy } from './strategies/apm-aware';
import { cheapskateStrategy } from './strategies/cheapskate';
import { metricsAwareStrategy } from './strategies/metrics-aware';
import { oracleStrategy } from './strategies/oracle';
import { reactiveBasicStrategy } from './strategies/reactive-basic';
import { yoloScaleStrategy } from './strategies/yolo-scale';

function withRequiredDependencyRecovery(strategy: BalanceStrategy): BalanceStrategy {
  return Object.freeze({
    id: strategy.id,
    ceiling: strategy.ceiling,
    decide(observation, context) {
      const gap = observation.requiredDependencyGaps[0];
      if (!gap) return strategy.decide(observation, context);

      const reason = `Required ${gap.role} dependency for ${gap.workloadIds.join(', ')}`;
      const recovery = cheapestAffordable(
        observation,
        context,
        strategy.id,
        gap.candidateTechnologyIds.map((technologyId) => (
          technologyAction(observation, technologyId, reason)
        )),
      );
      return recovery ?? noOp(`Required ${gap.role} dependency has no available affordable remedy`);
    },
    decideViral(observation, context) {
      return strategy.decideViral(observation, context);
    },
  });
}

export const BALANCE_STRATEGIES: Readonly<Record<BalanceStrategyId, BalanceStrategy>> = Object.freeze({
  ORACLE: withRequiredDependencyRecovery(oracleStrategy),
  APM_AWARE: withRequiredDependencyRecovery(apmAwareStrategy),
  METRICS_AWARE: withRequiredDependencyRecovery(metricsAwareStrategy),
  REACTIVE_BASIC: withRequiredDependencyRecovery(reactiveBasicStrategy),
  YOLO_SCALE: withRequiredDependencyRecovery(yoloScaleStrategy),
  CHEAPSKATE: withRequiredDependencyRecovery(cheapskateStrategy),
});
