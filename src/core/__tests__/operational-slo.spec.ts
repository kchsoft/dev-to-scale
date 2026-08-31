import { describe, expect, it } from 'vitest';
import { OperationalSloWindow, type OperationalSloSample } from '../operational-slo';

const healthy: OperationalSloSample = {
  failureRate: 0,
  overloaded: false,
  missingRequiredDependency: false,
};

function record(
  window: OperationalSloWindow,
  count: number,
  sample: OperationalSloSample = healthy,
): void {
  for (let index = 0; index < count; index += 1) window.record(sample);
}

describe('OperationalSloWindow', () => {
  it('does not pass before 30 launched operational samples', () => {
    const window = new OperationalSloWindow();

    record(window, 29);

    expect(window.status.sampleCount).toBe(29);
    expect(window.status.passes).toBe(false);
  });

  it('passes with 27 healthy and 3 overload-only unhealthy days when budgets remain valid', () => {
    const window = new OperationalSloWindow();

    record(window, 27);
    record(window, 3, {
      failureRate: 0,
      overloaded: true,
      missingRequiredDependency: false,
    });

    expect(window.status.healthyDays).toBe(27);
    expect(window.status.unhealthyDays).toBe(3);
    expect(window.status.passes).toBe(true);
  });

  it('fails with 26 healthy and 4 unhealthy days', () => {
    const window = new OperationalSloWindow();

    record(window, 26);
    record(window, 4, {
      failureRate: 0,
      overloaded: true,
      missingRequiredDependency: false,
    });

    expect(window.status.passes).toBe(false);
  });

  it('fails when average failure rate exceeds 2 percent even without a severe day', () => {
    const window = new OperationalSloWindow();

    record(window, 30, {
      failureRate: 0.021,
      overloaded: false,
      missingRequiredDependency: false,
    });

    expect(window.status.averageFailureRate).toBeCloseTo(0.021);
    expect(window.status.passes).toBe(false);
  });

  it('fails when any REQUIRED dependency is missing in the trailing window', () => {
    const window = new OperationalSloWindow();

    record(window, 29);
    window.record({
      failureRate: 0,
      overloaded: false,
      missingRequiredDependency: true,
    });

    expect(window.status.missingRequiredDependencyDays).toBe(1);
    expect(window.status.passes).toBe(false);
  });

  it('evicts the oldest sample when day 31 is recorded', () => {
    const window = new OperationalSloWindow();
    window.record({
      failureRate: 1,
      overloaded: true,
      missingRequiredDependency: true,
    });
    record(window, 29);

    expect(window.status.missingRequiredDependencyDays).toBe(1);

    window.record(healthy);

    expect(window.status.sampleCount).toBe(30);
    expect(window.status.missingRequiredDependencyDays).toBe(0);
    expect(window.status.averageFailureRate).toBe(0);
    expect(window.status.passes).toBe(true);
  });
});
