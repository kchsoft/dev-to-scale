import { describe, expect, it } from 'vitest';
import { skillRef } from '../../core';
import { GameController } from '../game-controller';

function advance(controller: GameController, days: number): void {
  for (let day = 0; day < days; day += 1) controller.advanceDay();
}

describe('DevelopmentWorkbenchProjector', () => {
  it('projects unique feature, technology, and learning IDs in stable action-priority order', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const view = controller.getView();
    const options = view.development.options;

    expect(view.development.workSlots).toBe(view.workSlots);
    expect(new Set(options.map(({ id }) => id)).size).toBe(options.length);
    expect(options.some(({ id }) => id === 'feature:COMMUNITY_MVP')).toBe(true);
    expect(options.some(({ id }) => id === 'feature:refactor')).toBe(true);
    expect(options.some(({ id }) => id === 'technology:REDIS')).toBe(true);
    expect(options.some(({ id }) => id === 'learning:fundamental:NETWORK')).toBe(true);
    expect(options.map(({ sortRank }) => sortRank)).toEqual(
      [...options.map(({ sortRank }) => sortRank)].sort((left, right) => left - right),
    );
  });

  it('does not expose unsupported startFeature behavior for the bootstrap feature', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const option = controller.getView().development.options.find(({ id }) => id === 'feature:COMMUNITY_MVP');

    expect(option).toMatchObject({ state: 'active', action: null });
    expect(option?.unavailableReason).toContain('Fast Track');
  });

  it('projects a ready technology action only after existing learning prerequisites are satisfied', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 3 });
    expect(controller.getView().development.options.find(({ id }) => id === 'technology:REDIS')?.action).toBeNull();

    advance(controller, 10);
    controller.startLearning(skillRef.fundamental('NETWORK'));
    advance(controller, 3);
    controller.startLearning(skillRef.fundamental('DATABASE'));
    advance(controller, 3);

    expect(controller.getView().development.options.find(({ id }) => id === 'technology:REDIS')).toMatchObject({
      state: 'ready',
      action: { kind: 'start-technology', technologyId: 'REDIS' },
    });
  });

  it('projects a ready learning action and then moves it to active after the existing command runs', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 5 });
    advance(controller, 10);

    const ready = controller.getView().development.options.find(({ id }) => id === 'learning:fundamental:NETWORK');
    expect(ready).toMatchObject({
      state: 'ready',
      action: { kind: 'start-learning', skill: { category: 'fundamental', id: 'NETWORK' } },
    });

    controller.startLearning(skillRef.fundamental('NETWORK'));
    const active = controller.getView().development.options.find(({ id }) => id === 'learning:fundamental:NETWORK');
    expect(active).toMatchObject({ state: 'active', action: null, progress: 0 });
  });

  it('projects FAST TRACK and Refactor through existing commands without creating a feature-start action', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 11, startingCash: 10_000_000 });

    for (let day = 0; day < 60 && !controller.getView().hud.launched; day += 1) controller.advanceDay();
    for (let day = 0; day < 20 && !controller.getView().operations.currentFeature; day += 1) controller.advanceDay();

    const before = controller.getView();
    const currentId = before.operations.currentFeature?.id;
    expect(currentId).toBeTruthy();
    expect(before.development.options.find(({ id }) => id === `feature:${currentId}`)?.action).toEqual({
      kind: 'fast-track-feature',
      featureId: currentId,
    });

    controller.fastTrackCurrentFeature();
    const after = controller.getView();
    expect(after.development.options.find(({ id }) => id === 'feature:refactor')).toMatchObject({
      state: 'ready',
      action: { kind: 'start-refactor' },
    });
    expect(after.development.options.map(({ action }) => action?.kind)).not.toContain('start-feature');
  });
});
