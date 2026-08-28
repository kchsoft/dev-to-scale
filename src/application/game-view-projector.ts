import { COMMUNITY_FEATURES, GameEngine, GameSnapshot, RevenuePolicy } from '../core';
import { GameView } from './game-view';
import { GameFinancialProjection, GameOverviewProjector } from './game-overview-projector';
import { GameProgressionProjector } from './game-progression-projector';
import { GameServiceProjector } from './game-service-projector';

export class GameViewProjector {
  readonly #engine: GameEngine;
  readonly #overviewProjector: GameOverviewProjector;
  readonly #serviceProjector: GameServiceProjector;
  readonly #progressionProjector: GameProgressionProjector;

  constructor(engine: GameEngine, serviceProjector = new GameServiceProjector(engine)) {
    this.#engine = engine;
    this.#overviewProjector = new GameOverviewProjector(engine);
    this.#serviceProjector = serviceProjector;
    this.#progressionProjector = new GameProgressionProjector(engine);
  }

  private financials(snapshot: GameSnapshot): GameFinancialProjection {
    const revenueModifier = snapshot.completedFeatures.reduce(
      (sum, id) => sum + (COMMUNITY_FEATURES[id as keyof typeof COMMUNITY_FEATURES]?.revenueModifier ?? 0),
      0,
    );
    const monthlyRevenue = RevenuePolicy.monthlyRevenue(snapshot.dau, revenueModifier);
    const monthlyCost = this.#engine.infrastructure.monthlyCost + RevenuePolicy.monthlyAiCost(
      snapshot.dau,
      snapshot.completedFeatures.includes('AI_RECOMMENDATION'),
    );
    return { monthlyRevenue, monthlyCost, monthlyProfit: monthlyRevenue - monthlyCost };
  }

  project(): GameView {
    const snapshot = this.#engine.snapshot;
    const financials = this.financials(snapshot);
    return {
      ...this.#overviewProjector.project(snapshot, financials),
      ...this.#serviceProjector.project(snapshot, financials),
      ...this.#progressionProjector.project(snapshot),
      frameworkId: this.#engine.config.frameworkId,
      databaseId: this.#engine.config.databaseId,
    };
  }
}
