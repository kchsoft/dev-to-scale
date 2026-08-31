import { describe, expect, it } from 'vitest';
import { FinanceAccount, RevenuePolicy } from '../finance';
import { IncidentPolicy } from '../incident';
import { Incident, IncidentManager } from '../incident-manager';

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

  it('keeps total and remaining response days for progress UI', () => {
    const incident = new Incident('app-1', 'framework:SPRING_BOOT', 'MAJOR', 4);
    incident.startResponse(5, 5);

    expect(incident.totalResponseDays).toBeGreaterThan(0);
    expect(incident.remainingResponseDays).toBe(incident.totalResponseDays);

    incident.advanceResponseDay();
    expect(incident.elapsedResponseDays).toBe(1);
  });

  it('removes an incident when its infrastructure node is retired', () => {
    const manager = new IncidentManager();
    const incident = new Incident('queue-1', 'technology:SQS', 'MAJOR', 2);
    manager.add(incident);
    manager.startResponse(incident.id, 5, 5);

    expect(manager.removeForNode('technology:SQS')).toBe(incident);
    expect(manager.incidents).toHaveLength(0);
    expect(manager.developmentModifier).toBe(1);

    const replacementIncident = new Incident('queue-2', 'technology:KAFKA', 'MINOR', 2);
    manager.add(replacementIncident);
    expect(() => manager.startResponse(replacementIncident.id, 5, 5)).not.toThrow();
  });
});

describe('finance', () => {
  it('uses average DAU with additive revenue modifiers', () => {
    expect(RevenuePolicy.monthlyRevenue(1_000_000, 0.1 + 0.3 + 0.5)).toBe(38_000_000);
    expect(RevenuePolicy.monthlyAiCost(1_000_000, true)).toBe(1_500_000);
  });

  it('requires about 3.76M fully monetized average DAU for the Balance Pass 1 exit', () => {
    expect(RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET).toBe(143_000_000);
    expect(RevenuePolicy.monthlyRevenue(3_750_000, 0.9)).toBe(142_500_000);
    expect(RevenuePolicy.monthlyRevenue(3_763_158, 0.9)).toBeGreaterThanOrEqual(
      RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET,
    );
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
