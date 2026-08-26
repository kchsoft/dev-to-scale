import { describe, expect, it } from 'vitest';
import { GrowthEvent, GrowthPolicy, RandomSource } from '../growth';

class SequenceRandom implements RandomSource {
  private index = 0;
  constructor(private readonly values: number[]) {}
  next(): number {
    const value = this.values[this.index % this.values.length];
    this.index += 1;
    return value;
  }
}

describe('growth', () => {
  it('adds +0.5 percentage points per completed feature', () => {
    const result = GrowthPolicy.calculate({
      phase: 1,
      completedFeatureCount: 4,
      event: null,
      incidents: [],
      random: new SequenceRandom([0, 0]),
    });

    expect(result.baseModifier).toBe(0.01);
    expect(result.featureModifier).toBe(0.02);
    expect(result.totalModifier).toBe(0.03);
  });

  it('applies 7-day viral and negative buzz modifiers', () => {
    expect(new GrowthEvent('VIRAL').modifier).toBe(0.05);
    expect(new GrowthEvent('NEGATIVE_BUZZ').modifier).toBe(-0.05);
  });

  it('caps stacked incident growth penalties at -10 percentage points', () => {
    const result = GrowthPolicy.calculate({
      phase: 3,
      completedFeatureCount: 0,
      event: null,
      incidents: ['CRITICAL', 'CRITICAL', 'MAJOR'],
      random: new SequenceRandom([0, 0]),
    });

    expect(result.incidentModifier).toBe(-0.1);
  });

  it('turns failed service requests into DAU pressure without exceeding the operational penalty cap', () => {
    const result = GrowthPolicy.calculate({
      phase: 1,
      completedFeatureCount: 0,
      event: null,
      incidents: ['CRITICAL'],
      failureRate: 1,
      random: new SequenceRandom([0, 0]),
    });

    expect(result.availabilityModifier).toBe(-0.08);
    expect(result.operationalModifier).toBe(-0.1);
    expect(result.totalModifier).toBeCloseTo(-0.09);
  });

  it('drops DAU by the amount capacity exceeds 100%, capped at 30 percentage points per day', () => {
    const overloaded = GrowthPolicy.calculate({
      phase: 1,
      completedFeatureCount: 0,
      event: null,
      incidents: [],
      maxLoadRatio: 1.2,
      random: new SequenceRandom([0, 0]),
    });
    const severelyOverloaded = GrowthPolicy.calculate({
      phase: 1,
      completedFeatureCount: 0,
      event: null,
      incidents: [],
      maxLoadRatio: 1.8,
      random: new SequenceRandom([0, 0]),
    });

    expect(overloaded.capacityModifier).toBeCloseTo(-0.2);
    expect(overloaded.totalModifier).toBeCloseTo(-0.19);
    expect(severelyOverloaded.capacityModifier).toBe(-0.3);
  });

  it('rounds DAU to an integer', () => {
    expect(GrowthPolicy.nextDau(101, 0.015)).toBe(103);
  });
});
