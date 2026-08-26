import { afterEach, describe, expect, it, vi } from 'vitest';
import { skillRef } from '../../core';
import { GameClock } from '../game-clock';
import { GameController } from '../game-controller';

describe('application layer', () => {
  afterEach(() => vi.useRealTimers());

  it('projects the core engine into an initial UI view without duplicating game rules', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const view = controller.getView();

    expect(view.hud.cash).toBe(3_000_000);
    expect(view.hud.launched).toBe(false);
    expect(view.snapshot.currentFeature?.id).toBe('COMMUNITY_MVP');
    expect(view.nodes.map((node) => node.id)).toEqual(['application', 'database']);
    expect(view.features).toHaveLength(10);
  });

  it('launches through domain day advancement instead of UI-owned countdown rules', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 11 });

    for (let i = 0; i < 30 && !controller.getView().hud.launched; i += 1) {
      controller.advanceDay();
    }

    const view = controller.getView();
    expect(view.hud.launched).toBe(true);
    expect(view.hud.dau).toBeGreaterThanOrEqual(80);
  });

  it('derives technology availability from developer prerequisites', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 3 });
    expect(controller.getView().technologies.find((tech) => tech.id === 'REDIS')?.available).toBe(false);

    controller.engine.developer.get(skillRef.fundamental('DATABASE')).setLevel(2);
    controller.engine.developer.get(skillRef.fundamental('NETWORK')).setLevel(2);

    expect(controller.getView().technologies.find((tech) => tech.id === 'REDIS')?.available).toBe(true);
  });

  it('keeps x1/x2 timing in GameClock while the domain only advances one day at a time', () => {
    vi.useFakeTimers();
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 1 });
    const clock = new GameClock(controller);

    expect(controller.getView().hud.day).toBe(1);
    clock.setSpeed(1);
    vi.advanceTimersByTime(10_000);
    expect(controller.getView().hud.day).toBe(2);

    clock.setSpeed(2);
    vi.advanceTimersByTime(5_000);
    expect(controller.getView().hud.day).toBe(3);

    clock.pause();
    vi.advanceTimersByTime(20_000);
    expect(controller.getView().hud.day).toBe(3);
    clock.dispose();
  });
});
