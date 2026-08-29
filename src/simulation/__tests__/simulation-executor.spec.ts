import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../core/game-engine';
import { GrowthEvent } from '../../core/growth';
import { Incident } from '../../core/incident-manager';
import { ServerSize } from '../../core/infrastructure';
import { V1_NODE_IDS } from '../../core/v1-topology';
import { observeForStrategy } from '../balance-observation';
import type { BalanceStrategy } from '../balance-strategy';
import { SimulationExecutor } from '../simulation-executor';

function engine(): GameEngine {
  return new GameEngine({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 17,
  });
}

const strategy: BalanceStrategy = {
  id: 'APM_AWARE',
  ceiling: 'APM',
  decide: () => ({ type: 'NO_OP', reason: 'fixture' }),
  decideViral: () => 'THROTTLE',
};

describe('simulation executor', () => {
  it('allows incident, viral, and one normal investment slot on the same day', () => {
    const game = engine();
    const executor = new SimulationExecutor();
    const appNodeId = V1_NODE_IDS.app('SPRING_BOOT');
    const incident = new Incident('fixture-incident', appNodeId, 'MAJOR', 2);
    game.incidents.add(incident);
    (game as unknown as { growthEvent: GrowthEvent | null }).growthEvent = new GrowthEvent('VIRAL');

    expect(executor.maybeStartIncidentResponse(game)).toBe('fixture-incident');
    expect(game.snapshot.incidents[0]?.remainingResponseDays).not.toBeNull();

    const observation = observeForStrategy(game, strategy.ceiling);
    expect(executor.maybeRespondToViral(game, strategy, observation, { protectedLearningReserve: 0 })).toBe('THROTTLE');
    expect(game.snapshot.growthEvent?.response).toBe('THROTTLE');

    executor.executeNormalInvestment(game, {
      type: 'RESIZE_NODE',
      nodeId: appNodeId,
      size: ServerSize.MEDIUM,
      reason: 'fixture resize',
    });
    expect(game.infrastructure.app.size).toBe(ServerSize.MEDIUM);

    expect(() => executor.executeNormalInvestment(game, {
      type: 'RESIZE_NODE',
      nodeId: appNodeId,
      size: ServerSize.LARGE,
      reason: 'second resize',
    })).toThrow('Normal investment action already used for this day');
  });

  it('resets the normal investment slot when the engine day changes', () => {
    const game = engine();
    const executor = new SimulationExecutor();
    const appNodeId = V1_NODE_IDS.app('SPRING_BOOT');

    executor.executeNormalInvestment(game, {
      type: 'RESIZE_NODE', nodeId: appNodeId, size: ServerSize.MEDIUM, reason: 'day one',
    });
    game.advanceDay();
    executor.executeNormalInvestment(game, {
      type: 'RESIZE_NODE', nodeId: appNodeId, size: ServerSize.LARGE, reason: 'day two',
    });

    expect(game.infrastructure.app.size).toBe(ServerSize.LARGE);
  });

  it('does not start a second incident response while one is already active', () => {
    const game = engine();
    const executor = new SimulationExecutor();
    const appNodeId = V1_NODE_IDS.app('SPRING_BOOT');
    const dbNodeId = V1_NODE_IDS.database('POSTGRESQL');
    game.incidents.add(new Incident('first', appNodeId, 'MAJOR', 2));
    game.incidents.add(new Incident('second', dbNodeId, 'MINOR', 1));

    expect(executor.maybeStartIncidentResponse(game)).toBe('first');
    expect(executor.maybeStartIncidentResponse(game)).toBeNull();
    expect(game.snapshot.incidents.find(({ id }) => id === 'second')?.remainingResponseDays).toBeNull();
  });
});
