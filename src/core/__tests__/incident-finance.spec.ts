import { describe, expect, it } from 'vitest';
import { FinanceAccount, RevenuePolicy } from '../finance';
import { IncidentPolicy } from '../incident';

describe('incident policy', () => {
  it('raises incident probability with load and low proficiency', () => {
    const safe = IncidentPolicy.dailyProbability({
      baseRisk: 2,
      loadRatio: 0.5,
      proficiencyLevel: 8,
      fundamentalAverage: 8,
    });
    const risky = IncidentPolicy.dailyProbability({
      baseRisk: 2,
      loadRatio: 1.1,
      proficiencyLevel: 2,
      fundamentalAverage: 3,
    });

    expect(risky).toBeGreaterThan(safe * 5);
  });

  it('reduces resolution time with higher proficiency and fundamentals', () => {
    const lowSkill = IncidentPolicy.resolutionDays({
      difficulty: 7,
      severity: 'MAJOR',
      proficiencyLevel: 2,
      fundamentalAverage: 3,
    });
    const highSkill = IncidentPolicy.resolutionDays({
      difficulty: 7,
      severity: 'MAJOR',
      proficiencyLevel: 8,
      fundamentalAverage: 8,
    });

    expect(highSkill).toBeLessThan(lowSkill);
  });
});

describe('finance', () => {
  it('uses average DAU with additive revenue modifiers', () => {
    expect(RevenuePolicy.monthlyRevenue(1_000_000, 0.1 + 0.3 + 0.5)).toBe(38_000_000);
    expect(RevenuePolicy.monthlyAiCost(1_000_000, true)).toBe(1_500_000);
  });

  it('adds revenue first, subtracts costs, and declares bankruptcy below zero', () => {
    const account = new FinanceAccount(3_000_000);

    const first = account.settleMonth({ revenue: 2_000_000, infrastructureCost: 4_000_000, aiCost: 500_000 });
    expect(first.cash).toBe(500_000);
    expect(first.bankrupt).toBe(false);

    const second = account.settleMonth({ revenue: 0, infrastructureCost: 600_000, aiCost: 0 });
    expect(second.cash).toBe(-100_000);
    expect(second.bankrupt).toBe(true);
  });
});
