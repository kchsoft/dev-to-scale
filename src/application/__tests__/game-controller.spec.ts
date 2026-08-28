import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerSize, skillRef } from '../../core';
import { GameClock } from '../game-clock';
import { GameController, GameEventView } from '../game-controller';

describe('application layer', () => {
  afterEach(() => vi.useRealTimers());

  function advance(controller: GameController, days: number): void {
    for (let day = 0; day < days; day += 1) controller.advanceDay();
  }

  it('projects the core engine into an initial UI view without duplicating game rules', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const view = controller.getView();

    expect(view.hud.cash).toBe(3_000_000);
    expect(view.hud.month).toBe(1);
    expect(view.hud.dayOfMonth).toBe(1);
    expect(view.hud.daysUntilSettlement).toBe(30);
    expect(view.hud.launched).toBe(false);
    expect(view.operations.currentFeature?.id).toBe('COMMUNITY_MVP');
    expect(view.operations.currentFeature?.elapsedDays).toBe(0);
    expect(view.operations.currentFeature?.estimatedRemainingDays).toBeGreaterThan(0);
    expect(Object.hasOwn(view, 'nodes')).toBe(false);
    expect(Object.hasOwn(view, 'requestFlows')).toBe(false);
    expect(view.topology.nodes.map((node) => node.id)).toEqual([
      'v1:app:SPRING_BOOT',
      'v1:database:POSTGRESQL',
      'v1:storage:OBJECT_STORAGE',
    ]);
    expect(view.topology.edges).toEqual([]);
    expect(view.topology.traces).toEqual([]);
    expect(view.features).toHaveLength(10);
  });

  it('exposes an application-owned immutable view instead of a raw domain snapshot', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 21 });
    const view = controller.getView();

    expect(Object.hasOwn(view, 'snapshot')).toBe(false);
    expect(view.operations.currentFeature?.id).toBe('COMMUNITY_MVP');
    expect(view.service.visibleLoads.map((metric) => metric.label)).toEqual([
      'Spring Boot', 'PostgreSQL', 'Local Storage',
    ]);
  });

  it('does not expose the mutable domain engine through the command facade', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 24 });

    expect(Object.hasOwn(controller, 'engine')).toBe(false);
    expect(Object.keys(controller)).not.toContain('engine');
  });

  it('emits exactly one current view after each successful command', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 25 });
    const listener = vi.fn<(view: ReturnType<GameController['getView']>) => void>();
    const unsubscribe = controller.subscribe(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    controller.resizeInfrastructureNode('v1:app:SPRING_BOOT', ServerSize.MEDIUM);

    expect(listener).toHaveBeenCalledTimes(2);
    const app = listener.mock.lastCall?.[0].topology.nodes.find((node) => node.id === 'v1:app:SPRING_BOOT');
    expect(app?.scaling?.currentSize).toBe(ServerSize.MEDIUM);
    unsubscribe();
  });

  it('rolls M1 D30 into M2 D1 with a visible settlement event', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 17 });
    let settlement: GameEventView | undefined;

    for (let day = 0; day < 30; day += 1) {
      settlement = controller.advanceDay().find((event) => event.kind === 'settlement') ?? settlement;
    }

    const view = controller.getView();
    expect(view.hud.month).toBe(2);
    expect(view.hud.dayOfMonth).toBe(1);
    expect(view.hud.daysUntilSettlement).toBe(30);
    expect(view.hud.lastSettlement?.month).toBe(1);
    expect(settlement?.title).toBe('M1 SETTLEMENT');
  });

  it('projects recurring infrastructure costs into node-local scaling choices', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 31 });
    const view = controller.getView();
    const app = view.topology.nodes.find((node) => node.id === 'v1:app:SPRING_BOOT');
    const database = view.topology.nodes.find((node) => node.id === 'v1:database:POSTGRESQL');

    expect(app?.scaling?.sizeOptions.map(({ monthlyCost }) => monthlyCost)).toEqual([105_000, 210_000, 420_000, 840_000]);
    expect(database?.scaling?.sizeOptions.map(({ monthlyCost }) => monthlyCost)).toEqual([120_000, 250_000, 500_000, 1_000_000]);
    expect(database?.scaling?.scaleOut?.monthlyCostDelta).toBe(120_000);
  });

  it('launches through domain day advancement instead of UI-owned countdown rules', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 10 });

    advance(controller, 18);

    expect(controller.getView().hud.launched).toBe(true);
    expect(controller.getView().hud.dau).toBe(80);
  });

  it('derives technology availability from developer prerequisites', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });

    expect(controller.getView().technologies.find((technology) => technology.id === 'REDIS')?.available).toBe(false);

    controller.developerForTesting().get(skillRef.fundamental('DATABASE')).setLevel(2);
    controller.developerForTesting().get(skillRef.fundamental('OS_RUNTIME')).setLevel(2);

    expect(controller.getView().technologies.find((technology) => technology.id === 'REDIS')?.available).toBe(true);
  });

  it('projects technology previews through the public view contract', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    controller.developerForTesting().get(skillRef.fundamental('DATABASE')).setLevel(2);
    controller.developerForTesting().get(skillRef.fundamental('OS_RUNTIME')).setLevel(2);

    const redis = controller.getView().technologies.find((technology) => technology.id === 'REDIS');
    expect(redis?.preview).toContain('DB');
  });

  it('projects the active learning target and study progress into the UI', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    controller.startLearning({ category: 'fundamental', id: 'NETWORK' });

    const view = controller.getView();
    const network = view.skills.find((skill) => skill.ref.category === 'fundamental' && skill.ref.id === 'NETWORK');
    expect(network?.studying).toBe(true);
    expect(network?.targetLevel).toBe(2);
    expect(network?.studyProgress).toBe(0);
  });

  it('keeps x1=3s and x2=1.5s timing with visible day progress', () => {
    vi.useFakeTimers();
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const clock = new GameClock(controller, { tickMs: 100 });
    clock.setSpeed(2);
    clock.start();

    vi.advanceTimersByTime(750);
    expect(clock.progress).toBeCloseTo(0.5, 1);
    vi.advanceTimersByTime(750);
    expect(controller.getView().hud.day).toBe(2);
    clock.stop();
  });

  it('auto-pauses for a blocking popup and resumes the previous speed when it closes', () => {
    vi.useFakeTimers();
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const clock = new GameClock(controller, { tickMs: 100 });
    clock.setSpeed(2);
    clock.start();

    clock.openBlockingPopup();
    expect(clock.paused).toBe(true);
    clock.closeBlockingPopup();
    expect(clock.paused).toBe(false);
    expect(clock.speed).toBe(2);
    clock.stop();
  });
});
