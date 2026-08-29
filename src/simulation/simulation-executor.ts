import type { GameEngine } from '../core/game-engine';
import type { TrafficSpikeResponse } from '../core/growth';
import type { SimulationAction } from './balance-action';
import type { BalanceObservation } from './balance-observation';
import type { BalanceStrategy, StrategyDecisionContext } from './balance-strategy';

export class SimulationExecutor {
  private normalInvestmentDay: number | null = null;
  private normalInvestmentUsed = false;

  private syncDay(engine: GameEngine): void {
    if (this.normalInvestmentDay === engine.day) return;
    this.normalInvestmentDay = engine.day;
    this.normalInvestmentUsed = false;
  }

  maybeStartIncidentResponse(engine: GameEngine): string | null {
    const incidents = engine.snapshot.incidents;
    if (incidents.some(({ remainingResponseDays }) => remainingResponseDays !== null)) return null;
    const pending = incidents.find(({ remainingResponseDays }) => remainingResponseDays === null);
    if (!pending) return null;
    engine.startIncidentResponse(pending.id);
    return pending.id;
  }

  maybeRespondToViral(
    engine: GameEngine,
    strategy: BalanceStrategy,
    observation: BalanceObservation,
    context: StrategyDecisionContext,
  ): TrafficSpikeResponse | null {
    const event = engine.snapshot.growthEvent;
    if (!event || event.type !== 'VIRAL' || event.response !== 'PENDING') return null;
    const response = strategy.decideViral(observation, context);
    engine.respondToTrafficSpike(response);
    return response;
  }

  executeNormalInvestment(engine: GameEngine, action: SimulationAction): void {
    this.syncDay(engine);
    if (action.type === 'NO_OP') return;
    if (this.normalInvestmentUsed) {
      throw new Error('Normal investment action already used for this day');
    }
    this.normalInvestmentUsed = true;

    switch (action.type) {
      case 'RESIZE_NODE':
        engine.resizeInfrastructureNode(action.nodeId, action.size);
        break;
      case 'SCALE_OUT_NODE':
        engine.scaleOutInfrastructureNode(action.nodeId);
        break;
      case 'START_TECHNOLOGY_BUILD':
        engine.startTechnologyBuild(action.technologyId);
        break;
      case 'RESPOND_TRAFFIC_SPIKE':
        engine.respondToTrafficSpike(action.response);
        break;
    }
  }
}
