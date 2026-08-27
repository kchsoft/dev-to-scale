import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../core';
import { GameEventProjector } from '../game-event-projector';
import { GameServiceProjector } from '../game-service-projector';

describe('GameEventProjector', () => {
  it('projects the launch transition exactly once from before and after snapshots', () => {
    const engine = new GameEngine({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 10,
    });
    const serviceProjector = new GameServiceProjector(engine);
    const eventProjector = new GameEventProjector(engine, serviceProjector);
    let launchEvents = 0;

    for (let day = 0; day < 30 && !engine.launched; day += 1) {
      const before = engine.snapshot;
      const after = engine.advanceDay();
      const events = eventProjector.project(before, after);
      launchEvents += events.filter((event) => event.kind === 'launch').length;

      if (after.launched) {
        expect(events).toContainEqual({
          id: `launch-${after.day}`,
          kind: 'launch',
          title: 'SERVICE ONLINE',
          message: '커뮤니티 서비스가 공개되었습니다. DAU 80에서 시작합니다.',
          autoPause: false,
        });
      }
    }

    expect(engine.launched).toBe(true);
    expect(launchEvents).toBe(1);
  });

  it('includes the service impact preview in a new requirement event', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 10 });
    const serviceProjector = new GameServiceProjector(engine);
    const eventProjector = new GameEventProjector(engine, serviceProjector);
    let requirementEvent;

    for (let day = 0; day < 180 && !requirementEvent; day += 1) {
      const before = engine.snapshot;
      const after = engine.advanceDay();
      requirementEvent = eventProjector.project(before, after).find((event) => event.kind === 'requirement');
    }

    expect(requirementEvent).toMatchObject({
      kind: 'requirement',
      title: 'NEW REQUIREMENT',
      autoPause: true,
    });
    expect(requirementEvent?.message).toContain('개발이 자동으로 시작되었습니다. 출시 예상 ·');
    expect(requirementEvent?.message).toContain('현재 Capacity 안쪽');
  });

  it('rejects stale snapshots instead of mixing them with current engine state', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 12 });
    const serviceProjector = new GameServiceProjector(engine);
    const eventProjector = new GameEventProjector(engine, serviceProjector);
    const before = engine.snapshot;
    const after = engine.advanceDay();
    engine.advanceDay();

    expect(() => eventProjector.project(before, after)).toThrow('current engine transition');
  });
});
