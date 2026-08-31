import { describe, expect, it } from 'vitest';
import { RevenuePolicy } from '../finance';
import { GameEngine, type GameStatus } from '../game-engine';

interface ExitTestEngineState {
  _day: number;
  _status: GameStatus;
  monthlyLedger: {
    recordDay(dau: number, additiveRevenueModifier: number, aiFeatureActive: boolean): void;
  };
  settleMonthIfEnding(): void;
}

function createGame(startingCash = 1_000_000_000): GameEngine {
  return new GameEngine({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 991,
    startingCash,
  });
}

function finishProgression(game: GameEngine): void {
  const progression = game.progression as unknown as { completedCount: number };
  progression.completedCount = game.progression.featureOrder.length;
  expect(game.progression.finished).toBe(true);
}

function fillHealthySlo(game: GameEngine): void {
  for (let day = 0; day < 30; day += 1) {
    game.operationalSlo.record({
      failureRate: 0,
      overloaded: false,
      missingRequiredDependency: false,
    });
  }
  expect(game.operationalSlo.status.passes).toBe(true);
}

function settleRevenue(game: GameEngine, monthlyRevenue: number): void {
  const state = game as unknown as ExitTestEngineState;
  state._day = 30;
  const dailyWeightedDau = monthlyRevenue / RevenuePolicy.BASE_REVENUE_PER_AVG_DAU;
  for (let day = 0; day < 30; day += 1) {
    state.monthlyLedger.recordDay(dailyWeightedDau, 0, false);
  }
  state.settleMonthIfEnding();
}

describe('stable-scale exit readiness', () => {
  it('exposes progression, settled revenue target, and trailing SLO readiness in the snapshot', () => {
    const game = createGame();

    expect(game.snapshot.exitReadiness).toEqual({
      monthlyRevenueTarget: RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET,
      lastSettledMonthlyRevenue: 0,
      progressionComplete: false,
      slo: {
        sampleCount: 0,
        healthyDays: 0,
        unhealthyDays: 0,
        averageFailureRate: 0,
        missingRequiredDependencyDays: 0,
        passes: false,
      },
      qualified: false,
    });
  });

  it('does not win on revenue and completed progression while the SLO is failing', () => {
    const game = createGame();
    finishProgression(game);

    settleRevenue(game, RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET);

    expect(game.status).toBe('RUNNING');
    expect(game.lastMonthlyRevenue).toBe(RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET);
  });

  it('wins at monthly settlement when progression, revenue, and the trailing SLO all qualify', () => {
    const game = createGame();
    finishProgression(game);
    fillHealthySlo(game);

    settleRevenue(game, RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET);

    expect(game.status).toBe('WON');
    expect(game.snapshot.exitReadiness.qualified).toBe(true);
  });

  it('keeps bankruptcy precedence over an otherwise qualified exit', () => {
    const game = createGame(-200_000_000);
    finishProgression(game);
    fillHealthySlo(game);

    settleRevenue(game, RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET);

    expect(game.status).toBe('BANKRUPT');
  });
});
