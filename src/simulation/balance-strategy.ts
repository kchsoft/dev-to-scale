import type { TrafficSpikeResponse } from '../core/growth';
import type { SimulationAction } from './balance-action';
import type { BalanceObservation, ObservationCeiling } from './balance-observation';
import type { BalanceStrategyId } from './balance-scenario';

export interface StrategyDecisionContext {
  readonly protectedLearningReserve: number;
}

export interface BalanceStrategy {
  readonly id: BalanceStrategyId;
  readonly ceiling: ObservationCeiling;
  decide(observation: BalanceObservation, context: StrategyDecisionContext): SimulationAction;
  decideViral(observation: BalanceObservation, context: StrategyDecisionContext): TrafficSpikeResponse;
}
