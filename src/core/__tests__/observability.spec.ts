import { describe, expect, it } from 'vitest';
import { DeveloperProfile, ObservabilityPolicy, skillRef } from '..';

describe('observability progression', () => {
  it('starts with basic health visibility', () => {
    const developer = new DeveloperProfile();
    expect(ObservabilityPolicy.evaluate(developer)).toEqual({
      level: 'BASIC',
      nextUnlock: 'Metrics: OS & Runtime Lv.2',
    });
  });

  it('unlocks CPU/I/O metrics at OS & Runtime level 2', () => {
    const developer = new DeveloperProfile();
    developer.get(skillRef.fundamental('OS_RUNTIME')).setLevel(2);

    expect(ObservabilityPolicy.evaluate(developer).level).toBe('METRICS');
  });

  it('unlocks APM only after runtime, network and design fundamentals are ready', () => {
    const developer = new DeveloperProfile();
    developer.get(skillRef.fundamental('OS_RUNTIME')).setLevel(3);
    developer.get(skillRef.fundamental('NETWORK')).setLevel(2);
    developer.get(skillRef.fundamental('SOFTWARE_DESIGN')).setLevel(2);

    expect(ObservabilityPolicy.evaluate(developer)).toEqual({
      level: 'APM',
      nextUnlock: null,
    });
  });
});
