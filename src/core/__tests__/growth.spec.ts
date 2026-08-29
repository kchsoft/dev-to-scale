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
  it.each([
    { completedFeatureGrowthBonus: 0.002, expected: 0.002 },
    { completedFeatureGrowthBonus: 0.020, expected: 0.020 },
  ])('uses the supplied feature growth contribution $completedFeatureGrowthBonus', ({ completedFeatureGrowthBonus, expected }) => {
    const result = GrowthPolicy.calculate({
      phase: 1,
      completedFeatureGrowthBonus,
      event: null,
      incidents: [],
      random: new SequenceRandom([0, 0]),
    });

    expect(result.featureModifier).toBe(expected);
  });

  it('adds +0.5 percentage points per completed feature', () => {
    const result = GrowthPolicy.calculate({
      phase: 1,
      completedFeatureGrowthBonus: 0.02,
      event: null,
      incidents: [],
      random: new SequenceRandom([0, 0]),
    });

    expect(result.baseModifier).toBe(0.01);
    expect(result.featureModifier).toBe(0.02);
    expect(result.totalModifier).toBe(0.03);
  });

  it('uses 58% positive organic probability in phase 3', () => {
    const result = GrowthPolicy.calculate({
      phase: 3,
      completedFeatureGrowthBonus: 0,
      event: null,
      incidents: [],
      random: new SequenceRandom([0, 0.56]),
    });

    expect(result.baseModifier).toBe(0.01);
  });

  it('applies 7-day viral and negative buzz modifiers', () => {
    const viral = new GrowthEvent('VIRAL');
    const negative = new GrowthEvent('NEGATIVE_BUZZ');

    expect(viral.modifier).toBe(0.05);
    expect(viral.trafficMultiplier).toBe(1.8);
    expect(viral.loadMultiplier).toBe(1.8);
    expect(viral.response).toBe('PENDING');
    expect(viral.remainingDays).toBe(7);
    expect(negative.modifier).toBe(-0.05);
    expect(negative.trafficMultiplier).toBe(1);
    expect(negative.loadMultiplier).toBe(1);

    viral.advanceDay();
    expect(viral.remainingDays).toBe(6);
  });

  it('makes viral response choices trade growth, load pressure and cost semantics', () => {
    const ride = new GrowthEvent('VIRAL');
    ride.respond('RIDE');
    expect(ride.loadMultiplier).toBe(1.8);
    expect(ride.modifier).toBe(0.05);

    const throttle = new GrowthEvent('VIRAL');
    throttle.respond('THROTTLE');
    expect(throttle.trafficMultiplier).toBe(1.8);
    expect(throttle.loadMultiplier).toBe(1.15);
    expect(throttle.modifier).toBe(0.01);

    const burst = new GrowthEvent('VIRAL');
    burst.respond('BURST');
    expect(burst.trafficMultiplier).toBe(1.8);
    expect(burst.loadMultiplier).toBe(1.35);
    expect(burst.modifier).toBe(0.05);
  });

  it('allows only one response to a viral traffic spike', () => {
    const viral = new GrowthEvent('VIRAL');
    viral.respond('THROTTLE');
    expect(() => viral.respond('BURST')).toThrow('already selected');
    expect(() => new GrowthEvent('NEGATIVE_BUZZ').respond('RIDE')).toThrow('No active viral traffic spike');
  });

  it('caps stacked incident growth penalties at -10 percentage points', () => {
    const result = GrowthPolicy.calculate({
      phase: 3,
      completedFeatureGrowthBonus: 0,
      event: null,
      incidents: ['CRITICAL', 'CRITICAL', 'MAJOR'],
      random: new SequenceRandom([0, 0]),
    });

    expect(result.incidentModifier).toBe(-0.1);
  });

  it('turns failed service requests into DAU pressure without exceeding the operational penalty cap', () => {
    const result = GrowthPolicy.calculate({
      phase: 1,
      completedFeatureGrowthBonus: 0,
      event: null,
      incidents: ['CRITICAL'],
      failureRate: 1,
      random: new SequenceRandom([0, 0]),
    });

    expect(result.availabilityModifier).toBe(-0.08);
    expect(result.operationalModifier).toBe(-0.1);
    expect(result.baseModifier).toBe(0);
    expect(result.totalModifier).toBeCloseTo(-0.1);
  });

  it('suppresses all positive growth while an incident is active, even during a viral event', () => {
    const result = GrowthPolicy.calculate({
      phase: 1,
      completedFeatureGrowthBonus: 0.04,
      event: new GrowthEvent('VIRAL'),
      incidents: ['MINOR'],
      random: new SequenceRandom([0.99, 0]),
    });

    expect(result.baseModifier).toBe(0);
    expect(result.featureModifier).toBe(0);
    expect(result.eventModifier).toBe(0);
    expect(result.incidentModifier).toBe(-0.01);
    expect(result.totalModifier).toBeLessThan(0);
  });

  it('keeps negative market movement on top of incident churn', () => {
    const result = GrowthPolicy.calculate({
      phase: 1,
      completedFeatureGrowthBonus: 0.04,
      event: new GrowthEvent('NEGATIVE_BUZZ'),
      incidents: ['MAJOR'],
      random: new SequenceRandom([0, 0.99]),
    });

    expect(result.baseModifier).toBe(-0.01);
    expect(result.featureModifier).toBe(0);
    expect(result.eventModifier).toBe(-0.05);
    expect(result.totalModifier).toBeLessThanOrEqual(-0.09);
  });

  it('drops DAU by the amount capacity exceeds 100%, capped at 30 percentage points per day', () => {
    const overloaded = GrowthPolicy.calculate({
      phase: 1,
      completedFeatureGrowthBonus: 0,
      event: null,
      incidents: [],
      maxLoadRatio: 1.2,
      random: new SequenceRandom([0, 0]),
    });
    const severelyOverloaded = GrowthPolicy.calculate({
      phase: 1,
      completedFeatureGrowthBonus: 0,
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
