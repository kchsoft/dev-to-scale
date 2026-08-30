import { describe, expect, it } from 'vitest';
import type { RandomSource } from '../../core/growth';
import { ServerSize } from '../../core/infrastructure';
import {
  BALANCE_DATABASE_IDS,
  BALANCE_FRAMEWORK_IDS,
  BALANCE_STRATEGY_IDS,
  FULL_BALANCE_SEEDS,
  GROWTH_STREAM_XOR,
  INCIDENT_STREAM_XOR,
  buildBalanceScenarios,
  createBalanceEngine,
} from '../balance-scenario';
import { simulationActionId } from '../balance-action';

describe('balance scenario matrix', () => {
  it('builds exactly 2700 default scenarios', () => {
    expect(buildBalanceScenarios()).toHaveLength(2_700);
    expect(BALANCE_FRAMEWORK_IDS).toHaveLength(5);
    expect(BALANCE_DATABASE_IDS).toHaveLength(3);
    expect(FULL_BALANCE_SEEDS).toHaveLength(30);
    expect(BALANCE_STRATEGY_IDS).toHaveLength(6);
  });

  it('keeps stable framework -> database -> seed -> strategy ordering', () => {
    expect(buildBalanceScenarios()[0]).toEqual({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 1,
      strategyId: 'ORACLE',
    });
  });

  it('filters scenarios without changing deterministic ordering', () => {
    const scenarios = buildBalanceScenarios({ seed: 17, frameworkId: 'GIN' });

    expect(scenarios).toHaveLength(18);
    expect(scenarios.every(({ seed, frameworkId }) => seed === 17 && frameworkId === 'GIN')).toBe(true);
    expect(scenarios[0]).toEqual({
      frameworkId: 'GIN',
      databaseId: 'POSTGRESQL',
      seed: 17,
      strategyId: 'ORACLE',
    });
  });

  it('uses stable isolated growth and incident random streams', () => {
    expect(GROWTH_STREAM_XOR).toBe(0x51f15e5d);
    expect(INCIDENT_STREAM_XOR).toBe(0x2c9277b5);

    const engine = createBalanceEngine({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 17,
      strategyId: 'ORACLE',
    });
    const randoms = engine as unknown as {
      random: RandomSource;
      incidentRandom: RandomSource;
    };

    expect([randoms.random.next(), randoms.random.next(), randoms.random.next()]).toEqual([
      0.21433419943787158,
      0.28947579371742904,
      0.41933348565362394,
    ]);
    expect([
      randoms.incidentRandom.next(),
      randoms.incidentRandom.next(),
      randoms.incidentRandom.next(),
    ]).toEqual([
      0.9377268273383379,
      0.7102065004874021,
      0.2487550585065037,
    ]);
  });

  it('creates stable action identifiers', () => {
    expect(simulationActionId({ type: 'NO_OP', reason: 'nothing to do' })).toBe('NO_OP');
    expect(simulationActionId({
      type: 'RESIZE_NODE',
      nodeId: 'v1:app:SPRING_BOOT',
      size: ServerSize.MEDIUM,
      reason: 'capacity',
    })).toBe('RESIZE_NODE:v1:app:SPRING_BOOT:MEDIUM');
    expect(simulationActionId({
      type: 'SCALE_OUT_NODE',
      nodeId: 'v1:database:POSTGRESQL',
      reason: 'capacity',
    })).toBe('SCALE_OUT_NODE:v1:database:POSTGRESQL');
    expect(simulationActionId({
      type: 'START_TECHNOLOGY_BUILD',
      technologyId: 'REDIS',
      reason: 'read io',
    })).toBe('START_TECHNOLOGY_BUILD:REDIS');
    expect(simulationActionId({
      type: 'RESPOND_TRAFFIC_SPIKE',
      response: 'THROTTLE',
      reason: 'protect service',
    })).toBe('RESPOND_TRAFFIC_SPIKE:THROTTLE');
  });
});
