import { describe, expect, it } from 'vitest';
import {
  DeveloperProfile,
  LearningSlot,
  skillRef,
} from '../learning';

describe('learning', () => {
  it('starts every proficiency at level 1', () => {
    const developer = new DeveloperProfile();

    expect(developer.get(skillRef.fundamental('NETWORK')).level).toBe(1);
    expect(developer.get(skillRef.language('JAVA')).level).toBe(1);
    expect(developer.get(skillRef.framework('SPRING_BOOT')).level).toBe(1);
    expect(developer.get(skillRef.technology('POSTGRESQL')).level).toBe(1);
  });

  it('does not allow a language level-up without experience and prerequisite fundamentals', () => {
    const developer = new DeveloperProfile();
    const java = skillRef.language('JAVA');

    developer.gainExperience(java, 10);
    developer.get(skillRef.fundamental('OS_RUNTIME')).setLevel(2);
    developer.get(skillRef.fundamental('DSA')).setLevel(2);

    const slot = new LearningSlot();
    expect(() => slot.start(java, developer)).toThrow(/NETWORK/i);

    developer.get(skillRef.fundamental('NETWORK')).setLevel(1);
    developer.get(skillRef.fundamental('OS_RUNTIME')).setLevel(1);
    developer.get(skillRef.fundamental('DSA')).setLevel(1);
    expect(() => slot.start(java, developer)).not.toThrow();
  });

  it('keeps experience cumulative after study completes and raises exactly one level', () => {
    const developer = new DeveloperProfile();
    const java = skillRef.language('JAVA');
    developer.gainExperience(java, 25);

    const slot = new LearningSlot();
    const task = slot.start(java, developer);
    expect(task.targetLevel).toBe(2);
    expect(task.requiredStudyDays).toBe(3);

    slot.advanceDay(developer);
    slot.advanceDay(developer);
    expect(developer.get(java).level).toBe(1);

    slot.advanceDay(developer);
    expect(developer.get(java).level).toBe(2);
    expect(developer.get(java).experienceDays).toBe(25);
    expect(slot.current).toBeNull();
  });

  it('allows only one learning task at a time', () => {
    const developer = new DeveloperProfile();
    const java = skillRef.language('JAVA');
    const network = skillRef.fundamental('NETWORK');
    developer.gainExperience(java, 10);
    developer.gainExperience(network, 10);

    const slot = new LearningSlot();
    slot.start(java, developer);

    expect(() => slot.start(network, developer)).toThrow(/already/i);
  });

  it('uses language as the main framework prerequisite', () => {
    const developer = new DeveloperProfile();
    const spring = skillRef.framework('SPRING_BOOT');
    developer.gainExperience(spring, 8);

    expect(() => new LearningSlot().start(spring, developer)).toThrow(/JAVA/i);

    developer.get(skillRef.language('JAVA')).setLevel(2);
    expect(() => new LearningSlot().start(spring, developer)).not.toThrow();
  });

  it('uses fundamental prerequisites for technology learning', () => {
    const developer = new DeveloperProfile();
    const kafka = skillRef.technology('KAFKA');
    developer.gainExperience(kafka, 10);

    expect(() => new LearningSlot().start(kafka, developer)).toThrow(/NETWORK|OS_RUNTIME|SOFTWARE_DESIGN/i);
  });
});
