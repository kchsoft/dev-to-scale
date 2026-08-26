import { describe, expect, it } from 'vitest';
import { DeveloperProfile, skillRef } from '../learning';
import { TechnologyBuildSlot } from '../technology';

describe('technology build', () => {
  it('blocks builds until fundamental prerequisites are met', () => {
    const developer = new DeveloperProfile();
    const slot = new TechnologyBuildSlot();

    expect(() => slot.start('REDIS', developer)).toThrow(/DATABASE|NETWORK/i);

    developer.get(skillRef.fundamental('DATABASE')).setLevel(2);
    developer.get(skillRef.fundamental('NETWORK')).setLevel(2);
    expect(() => slot.start('REDIS', developer)).not.toThrow();
  });

  it('allows only one technology build at a time', () => {
    const developer = new DeveloperProfile();
    developer.get(skillRef.fundamental('DATABASE')).setLevel(2);
    developer.get(skillRef.fundamental('NETWORK')).setLevel(2);
    developer.get(skillRef.fundamental('SOFTWARE_DESIGN')).setLevel(2);

    const slot = new TechnologyBuildSlot();
    slot.start('REDIS', developer);

    expect(() => slot.start('SQS', developer)).toThrow(/already/i);
  });

  it('tracks elapsed days and exposes a current-speed duration estimate for progress UI', () => {
    const developer = new DeveloperProfile();
    developer.get(skillRef.fundamental('DATABASE')).setLevel(2);
    developer.get(skillRef.fundamental('NETWORK')).setLevel(2);

    const slot = new TechnologyBuildSlot();
    const task = slot.start('REDIS', developer);

    expect(task.elapsedDays).toBe(0);
    expect(task.estimatedRemainingDays(1, 1)).toBe(11);

    slot.advanceDay(developer, 1);
    expect(task.elapsedDays).toBe(1);
    expect(task.estimatedRemainingDays(1, 1)).toBe(10);
  });

  it('makes a new level-1 technology slower to build than its nominal work', () => {
    const developer = new DeveloperProfile();
    developer.get(skillRef.fundamental('DATABASE')).setLevel(2);
    developer.get(skillRef.fundamental('NETWORK')).setLevel(2);

    const slot = new TechnologyBuildSlot();
    slot.start('REDIS', developer);

    for (let day = 0; day < 10; day += 1) {
      expect(slot.advanceDay(developer, 1)).toBeNull();
    }
    expect(slot.advanceDay(developer, 1)).toBe('REDIS');
  });
});
