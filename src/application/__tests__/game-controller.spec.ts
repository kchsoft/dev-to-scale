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
    expect(view.service.visibleLoads.map((metric) => metric.label)).toEqual(['APP', 'DB', 'ASYNC', 'STORAGE']);
  });

  it('does not expose the mutable domain engine through the command facade', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 24 });

    expect(Object.hasOwn(controller, 'engine')).toBe(false);
    expect(Object.keys(controller)).not.toContain('engine');
  });

  it('emits exactly one current view after each successful command', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 25 });
    const listener = vi.fn();
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
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 8 });
    const nodes = controller.getView().topology.nodes;
    const app = nodes.find((node) => node.id === 'v1:app:SPRING_BOOT')!;
    const db = nodes.find((node) => node.id === 'v1:database:POSTGRESQL')!;

    expect(app.scaling?.sizeOptions.find(({ size }) => size === ServerSize.SMALL)?.monthlyCost).toBeCloseTo(105_000);
    expect(app.scaling?.sizeOptions.find(({ size }) => size === ServerSize.MEDIUM)?.monthlyCost).toBeCloseTo(210_000);
    expect(db.scaling?.sizeOptions.find(({ size }) => size === ServerSize.SMALL)?.monthlyCost).toBe(120_000);
    expect(db.scaling?.scaleOut?.monthlyCostDelta).toBe(120_000);
    expect(app.scaling?.scaleOut).toMatchObject({ available: false, monthlyCostDelta: null, reason: expect.stringMatching(/ALB/i) });
  });

  it('launches through domain day advancement instead of UI-owned countdown rules', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 11 });

    for (let i = 0; i < 30 && !controller.getView().hud.launched; i += 1) {
      controller.advanceDay();
    }

    const view = controller.getView();
    expect(view.hud.launched).toBe(true);
    expect(view.hud.dau).toBeGreaterThanOrEqual(80);
    expect(view.topology.traces[0]).toMatchObject({
      id: 'COMMUNITY_MVP',
      nodes: [
        { nodeId: 'v1:app:SPRING_BOOT', status: 'healthy' },
        { nodeId: 'v1:database:POSTGRESQL', status: 'healthy' },
      ],
      successPercent: 100,
      failureNodeId: null,
    });
    expect(view.topology.traces[0].edges.map((edge) => edge.edgeId)).toEqual([
      'v1:edge:v1:app:SPRING_BOOT:v1:database:POSTGRESQL:SYNC',
    ]);
  });

  it('derives technology availability from developer prerequisites', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 3 });
    expect(controller.getView().technologies.find((tech) => tech.id === 'REDIS')?.available).toBe(false);

    advance(controller, 10);
    controller.startLearning(skillRef.fundamental('NETWORK'));
    advance(controller, 3);
    controller.startLearning(skillRef.fundamental('DATABASE'));
    advance(controller, 3);

    expect(controller.getView().technologies.find((tech) => tech.id === 'REDIS')?.available).toBe(true);
  });

  it('projects technology previews through the public view contract', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 15 });

    const preview = controller.getView().technologies.find((technology) => technology.id === 'REDIS')?.preview;

    expect(preview).toMatch(/^DB \d+% → \d+%$/);
  });

  it('projects the active learning target and study progress into the UI', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 5 });
    const network = skillRef.fundamental('NETWORK');
    advance(controller, 10);

    controller.startLearning(network);
    let view = controller.getView();
    const learningSlot = view.workSlots.find((slot) => slot.id === 'learning');
    const networkNode = view.skills.find((skill) => skill.key === 'fundamental:NETWORK');

    expect(learningSlot?.title).toBe('Network → Lv.2');
    expect(learningSlot?.progress).toBe(0);
    expect(learningSlot?.meta).toContain('0/3일');
    expect(networkNode?.studying).toBe(true);
    expect(networkNode?.studyProgress).toBe(0);

    controller.advanceDay();
    view = controller.getView();
    expect(view.workSlots.find((slot) => slot.id === 'learning')?.progress).toBeCloseTo(1 / 3);
    expect(view.workSlots.find((slot) => slot.id === 'learning')?.meta).toContain('1/3일');
    expect(view.skills.find((skill) => skill.key === 'fundamental:NETWORK')?.elapsedStudyDays).toBe(1);
  });

  it('keeps x1=3s and x2=1.5s timing with visible day progress', () => {
    vi.useFakeTimers();
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 1 });
    const clock = new GameClock(controller);

    expect(controller.getView().hud.day).toBe(1);
    expect(clock.dayProgress).toBe(0);

    clock.setSpeed(1);
    vi.advanceTimersByTime(1_500);
    expect(clock.dayProgress).toBeCloseTo(0.5, 1);
    expect(controller.getView().hud.day).toBe(1);

    clock.pause();
    const pausedProgress = clock.dayProgress;
    vi.advanceTimersByTime(5_000);
    expect(clock.dayProgress).toBeCloseTo(pausedProgress);
    expect(controller.getView().hud.day).toBe(1);

    clock.setSpeed(1);
    vi.advanceTimersByTime(1_500);
    expect(controller.getView().hud.day).toBe(2);
    expect(clock.dayProgress).toBeCloseTo(0);

    clock.setSpeed(2);
    vi.advanceTimersByTime(1_500);
    expect(controller.getView().hud.day).toBe(3);

    clock.pause();
    vi.advanceTimersByTime(20_000);
    expect(controller.getView().hud.day).toBe(3);
    clock.dispose();
  });

  it('auto-pauses for a blocking popup and resumes the previous speed when it closes', () => {
    vi.useFakeTimers();
    const blockingEvent: GameEventView = {
      id: 'requirement-1',
      kind: 'requirement',
      title: 'NEW REQUIREMENT',
      message: '새 요구사항',
      autoPause: true,
    };
    let ticks = 0;
    const fakeController = {
      advanceDay: () => {
        ticks += 1;
        return ticks === 1 ? [blockingEvent] : [];
      },
      getView: () => ({ hud: { status: 'RUNNING' } }),
    } as unknown as GameController;
    const clock = new GameClock(fakeController);

    clock.setSpeed(2);
    vi.advanceTimersByTime(1_500);
    expect(clock.speed).toBe(0);

    clock.resumeAfterAutoPause();
    expect(clock.speed).toBe(2);
    vi.advanceTimersByTime(750);
    expect(clock.dayProgress).toBeCloseTo(0.5, 1);
    clock.dispose();
  });
});
