import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerSize, skillRef } from '../../core';
import { GameClock } from '../game-clock';
import { GameController, GameEventView } from '../game-controller';

describe('application layer', () => {
  afterEach(() => vi.useRealTimers());

  it('projects the core engine into an initial UI view without duplicating game rules', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const view = controller.getView();

    expect(view.hud.cash).toBe(3_000_000);
    expect(view.hud.month).toBe(1);
    expect(view.hud.dayOfMonth).toBe(1);
    expect(view.hud.daysUntilSettlement).toBe(30);
    expect(view.hud.launched).toBe(false);
    expect(view.snapshot.currentFeature?.id).toBe('COMMUNITY_MVP');
    expect(view.snapshot.currentFeature?.elapsedDays).toBe(0);
    expect(view.snapshot.currentFeature?.estimatedRemainingDays).toBeGreaterThan(0);
    expect(view.nodes.map((node) => node.id)).toEqual(['application', 'database']);
    expect(view.features).toHaveLength(10);
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

  it('projects recurring infrastructure costs before scale actions', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 8 });
    const costs = controller.getView().infrastructureCosts;

    expect(costs.appSizeMonthlyCosts[ServerSize.SMALL]).toBeCloseTo(105_000);
    expect(costs.appSizeMonthlyCosts[ServerSize.MEDIUM]).toBeCloseTo(210_000);
    expect(costs.dbSizeMonthlyCosts[ServerSize.SMALL]).toBe(120_000);
    expect(costs.addDbReplicaMonthlyCostDelta).toBe(120_000);
    expect(costs.addAppServerMonthlyCostDelta).toBeNull();
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

  it('projects a technology preview calculated with the current game context', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 15 });
    const current = controller.engine.snapshot.load;
    const previewLoad = vi.spyOn(controller.engine, 'previewLoadWithTechnology').mockReturnValue({
      ...current,
      dbRatio: current.dbRatio + 0.42,
    });

    const preview = controller.getView().technologies.find((technology) => technology.id === 'REDIS')?.preview;

    expect(previewLoad).toHaveBeenCalledWith('REDIS');
    expect(preview).toBe(`DB ${Math.round(current.dbRatio * 100)}% → ${Math.round((current.dbRatio + 0.42) * 100)}%`);
  });

  it('projects the active learning target and study progress into the UI', () => {
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 5 });
    const network = skillRef.fundamental('NETWORK');
    controller.engine.developer.gainExperience(network, 10);

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
