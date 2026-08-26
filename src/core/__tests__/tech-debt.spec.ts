import { describe, expect, it } from 'vitest';
import { TechDebtState } from '../tech-debt';

describe('tech debt', () => {
  it('adds debt by feature complexity and only fast-tracks a feature once', () => {
    const debt = new TechDebtState();

    expect(debt.fastTrack('SEARCH', 'NORMAL')).toBe(14);
    expect(debt.value).toBe(14);
    expect(() => debt.fastTrack('SEARCH', 'NORMAL')).toThrow(/already fast-tracked/i);

    expect(debt.fastTrack('AI', 'COMPLEX')).toBe(18);
    expect(debt.value).toBe(32);
  });

  it('caps the downside so debt stays meaningful without making a run unrecoverable', () => {
    const debt = new TechDebtState();
    for (let index = 0; index < 8; index += 1) {
      debt.fastTrack(`feature-${index}`, 'COMPLEX');
    }

    expect(debt.value).toBe(100);
    expect(debt.developmentModifier).toBe(0.8);
    expect(debt.incidentRiskMultiplier).toBe(1.5);
  });

  it('spends five days refactoring then removes thirty debt', () => {
    const debt = new TechDebtState();
    debt.fastTrack('SEARCH', 'COMPLEX');
    debt.fastTrack('AI', 'COMPLEX');
    expect(debt.value).toBe(36);

    debt.startRefactor();
    expect(debt.remainingRefactorDays).toBe(5);

    for (let day = 0; day < 4; day += 1) {
      expect(debt.advanceDay()).toBe(false);
    }
    expect(debt.refactoring).toBe(true);
    expect(debt.value).toBe(36);

    expect(debt.advanceDay()).toBe(true);
    expect(debt.refactoring).toBe(false);
    expect(debt.value).toBe(6);
  });
});
