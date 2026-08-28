import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../core';
import { GameController } from '../game-controller';

const LEGACY_COMMANDS = [
  'scaleApplication',
  'addApplicationServer',
  'scaleDatabase',
  'addDatabaseReplica',
] as const;

const LEGACY_VIEW_FIELDS = [
  'infrastructureCosts',
  'appSize',
  'appCount',
  'dbSize',
  'dbReplicaCount',
] as const;

describe('generic scaling public surface', () => {
  it('does not expose APP/DB-specific scaling commands from Core or Application', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 51 });
    const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 51 });

    for (const command of LEGACY_COMMANDS) {
      expect(typeof (engine as unknown as Record<string, unknown>)[command]).toBe('undefined');
      expect(typeof (controller as unknown as Record<string, unknown>)[command]).toBe('undefined');
    }
  });

  it('does not project APP/DB-specific root sizing or cost fields', () => {
    const view = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 52 }).getView();

    for (const field of LEGACY_VIEW_FIELDS) {
      expect(Object.hasOwn(view, field)).toBe(false);
    }
  });
});
