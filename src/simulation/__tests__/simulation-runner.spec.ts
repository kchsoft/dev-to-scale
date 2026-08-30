import { describe, expect, it } from 'vitest';
import type { BalanceScenario } from '../balance-scenario';
import { BALANCE_DAY_LIMIT, runBalanceScenario } from '../simulation-runner';

const scenario: BalanceScenario = {
  frameworkId: 'SPRING_BOOT',
  databaseId: 'POSTGRESQL',
  seed: 17,
  strategyId: 'APM_AWARE',
};

describe('balance simulation runner', () => {
  it('repeats the same scenario identically', () => {
    expect(runBalanceScenario(scenario)).toEqual(runBalanceScenario(scenario));
  });

  it('never performs more than the fixed 1080 day limit', () => {
    expect(BALANCE_DAY_LIMIT).toBe(1_080);
    expect(runBalanceScenario(scenario).daysPlayed).toBeLessThanOrEqual(BALANCE_DAY_LIMIT);
  });

  it('keeps optional trace collection observational only', () => {
    const withoutTrace = runBalanceScenario(scenario);
    const withTrace = runBalanceScenario(scenario, { trace: true });

    expect(withTrace.result).toEqual(withoutTrace);
    expect(withTrace.trace.length).toBeGreaterThan(0);
  });
});
