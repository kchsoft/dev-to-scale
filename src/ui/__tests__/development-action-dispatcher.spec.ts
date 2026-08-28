import { describe, expect, it, vi } from 'vitest';
import { dispatchDevelopmentAction, type DevelopmentActionHandlers } from '../development-action-dispatcher';

function handlers(): DevelopmentActionHandlers {
  return {
    startTechnologyBuild: vi.fn(),
    startLearning: vi.fn(),
    fastTrackFeature: vi.fn(),
    startRefactor: vi.fn(),
  };
}

describe('dispatchDevelopmentAction', () => {
  it('maps every Application UI action to exactly one existing command handler', () => {
    const target = handlers();

    dispatchDevelopmentAction({ kind: 'start-technology', technologyId: 'REDIS' }, target);
    dispatchDevelopmentAction({ kind: 'start-learning', skill: { category: 'fundamental', id: 'NETWORK' } }, target);
    dispatchDevelopmentAction({ kind: 'fast-track-feature', featureId: 'COMMUNITY_POST' }, target);
    dispatchDevelopmentAction({ kind: 'start-refactor' }, target);

    expect(target.startTechnologyBuild).toHaveBeenCalledOnce();
    expect(target.startTechnologyBuild).toHaveBeenCalledWith('REDIS');
    expect(target.startLearning).toHaveBeenCalledOnce();
    expect(target.startLearning).toHaveBeenCalledWith({ category: 'fundamental', id: 'NETWORK' });
    expect(target.fastTrackFeature).toHaveBeenCalledOnce();
    expect(target.fastTrackFeature).toHaveBeenCalledWith('COMMUNITY_POST');
    expect(target.startRefactor).toHaveBeenCalledOnce();
  });
});
