import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../core';
import { GameViewProjector } from '../game-view-projector';

describe('GameViewProjector', () => {
  it('projects the initial engine state into the complete Application view', () => {
    const engine = new GameEngine({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 7,
    });

    const view = new GameViewProjector(engine).project();

    expect(view.hud).toMatchObject({
      day: 1,
      month: 1,
      dayOfMonth: 1,
      daysUntilSettlement: 30,
      dau: 0,
      cash: 3_000_000,
      launched: false,
    });
    expect(view.workSlots.find((slot) => slot.id === 'feature')).toMatchObject({
      title: '게시글',
      progress: 0,
      active: true,
    });
    expect(view.topology.nodes).toContainEqual(expect.objectContaining({
      id: 'v1:storage:OBJECT_STORAGE',
      name: 'Local Storage',
      kind: 'object-storage',
    }));
    expect(view.service.observability).toMatchObject({
      level: 'BASIC',
      showsResourceSignature: false,
      tracesRequests: false,
    });
  });
});
