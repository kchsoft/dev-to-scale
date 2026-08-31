import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../core/game-engine';
import type { RandomSource } from '../../core/growth';
import { skillRef } from '../../core/learning';
import { v1NodeIdForTechnology } from '../../core/v1-topology';
import type { SimulationAction } from '../balance-action';
import { observeForStrategy } from '../balance-observation';

class ConstantRandom implements RandomSource {
  next(): number { return 0.99; }
}

function gameWithPendingFeature(
  predicate: (remainingDays: number) => boolean,
): GameEngine {
  const game = new GameEngine({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 73,
    random: new ConstantRandom(),
    incidentRandom: new ConstantRandom(),
    startingCash: 100_000_000,
  });
  game.developer.get(skillRef.fundamental('NETWORK')).setLevel(2);

  for (let day = 0; day < 600; day += 1) {
    const current = game.snapshot.currentFeature;
    if (
      game.launched
      && current
      && current.estimatedRemainingDays > 0
      && predicate(current.estimatedRemainingDays)
    ) {
      return game;
    }
    game.advanceDay();
  }
  throw new Error('Expected a pending post-launch feature matching the requested lead time');
}

function releaseActionPreview(game: GameEngine, action: SimulationAction) {
  const observation = observeForStrategy(game, 'ORACLE');
  if (observation.level !== 'ORACLE') throw new Error('Expected ORACLE observation');
  if (!observation.releasePreview) throw new Error('Expected pending release preview');
  return observation.previewPort.previewReleaseAction(action);
}

const noOp: SimulationAction = Object.freeze({
  type: 'NO_OP',
  reason: 'compare release without capacity action',
});
const buildAlb: SimulationAction = Object.freeze({
  type: 'START_TECHNOLOGY_BUILD',
  technologyId: 'ALB',
  reason: 'prepare load balancer before release',
});

describe('ORACLE release technology lead time', () => {
  it('does not preview a technology as deployed when it cannot finish before the pending release', () => {
    const game = gameWithPendingFeature((remainingDays) => remainingDays <= 3);
    const observation = observeForStrategy(game, 'ORACLE');
    if (observation.level !== 'ORACLE') throw new Error('Expected ORACLE observation');
    expect(observation.pendingFeature?.estimatedRemainingDays).toBeLessThanOrEqual(3);
    expect(observation.technologyOptions.find(({ id }) => id === 'ALB')).toMatchObject({
      deployed: false,
      available: true,
    });

    const withoutAction = releaseActionPreview(game, noOp);
    const withLateAlb = releaseActionPreview(game, buildAlb);
    const albNodeId = v1NodeIdForTechnology('ALB');

    expect(withLateAlb).toEqual(withoutAction);
    expect(withLateAlb.nodeLoads.some(({ nodeId }) => nodeId === albNodeId)).toBe(false);
  });

  it('still previews a technology deployment when enough feature lead time remains', () => {
    const game = gameWithPendingFeature((remainingDays) => remainingDays >= 10);
    const withoutAction = releaseActionPreview(game, noOp);
    const withAlb = releaseActionPreview(game, buildAlb);
    const albNodeId = v1NodeIdForTechnology('ALB');

    expect(withAlb).not.toEqual(withoutAction);
    expect(withAlb.nodeLoads.some(({ nodeId }) => nodeId === albNodeId)).toBe(true);
  });
});
