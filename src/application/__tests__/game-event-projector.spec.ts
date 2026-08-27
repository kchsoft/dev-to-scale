import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../core';
import { GameEventProjector } from '../game-event-projector';
import { GameViewProjector } from '../game-view-projector';

describe('GameEventProjector', () => {
  it('projects the launch transition exactly once from before and after snapshots', () => {
    const engine = new GameEngine({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 10,
    });
    const viewProjector = new GameViewProjector(engine);
    const eventProjector = new GameEventProjector(engine, viewProjector);
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

  it('rejects stale snapshots instead of mixing them with current engine state', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 12 });
    const viewProjector = new GameViewProjector(engine);
    const eventProjector = new GameEventProjector(engine, viewProjector);
    const before = engine.snapshot;
    const after = engine.advanceDay();
    engine.advanceDay();

    expect(() => eventProjector.project(before, after)).toThrow('current engine transition');
  });
});
