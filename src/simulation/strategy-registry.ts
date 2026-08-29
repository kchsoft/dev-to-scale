import type { BalanceStrategy } from './balance-strategy';
import type { BalanceStrategyId } from './balance-scenario';
import { apmAwareStrategy } from './strategies/apm-aware';
import { cheapskateStrategy } from './strategies/cheapskate';
import { metricsAwareStrategy } from './strategies/metrics-aware';
import { oracleStrategy } from './strategies/oracle';
import { reactiveBasicStrategy } from './strategies/reactive-basic';
import { yoloScaleStrategy } from './strategies/yolo-scale';

export const BALANCE_STRATEGIES: Readonly<Record<BalanceStrategyId, BalanceStrategy>> = Object.freeze({
  ORACLE: oracleStrategy,
  APM_AWARE: apmAwareStrategy,
  METRICS_AWARE: metricsAwareStrategy,
  REACTIVE_BASIC: reactiveBasicStrategy,
  YOLO_SCALE: yoloScaleStrategy,
  CHEAPSKATE: cheapskateStrategy,
});
