import { describe, expect, it } from 'vitest';
import { ServerSize } from '../../core/infrastructure';
import * as balanceAction from '../balance-action';

interface ReleaseReadinessActionModule {
  withReleaseReadinessIntent?: (
    action: balanceAction.SimulationAction,
    intent: 'RELEASE_READINESS_DEPENDENCY' | 'RELEASE_READINESS_CAPACITY',
  ) => balanceAction.SimulationAction;
}

describe('release readiness actions', () => {
  it('tags a preventative action without changing executable identity', () => {
    const withIntent = (balanceAction as ReleaseReadinessActionModule).withReleaseReadinessIntent;
    expect(typeof withIntent).toBe('function');
    if (!withIntent) return;

    const action: balanceAction.SimulationAction = {
      type: 'RESIZE_NODE',
      nodeId: 'v1:app:SPRING_BOOT',
      size: ServerSize.MEDIUM,
      reason: 'prepare release capacity',
    };
    const tagged = withIntent(action, 'RELEASE_READINESS_CAPACITY');

    expect(tagged).toMatchObject({
      ...action,
      intent: 'RELEASE_READINESS_CAPACITY',
    });
    expect(balanceAction.simulationActionId(tagged)).toBe(balanceAction.simulationActionId(action));
    expect(Object.isFrozen(tagged)).toBe(true);
  });
});
