import { describe, expect, it } from 'vitest';
import { ExperienceAccrualService } from '../experience';
import { DeveloperProfile, skillRef } from '../learning';

describe('experience accrual', () => {
  it('adds at most one day to a fundamental even when multiple active technologies use it', () => {
    const developer = new DeveloperProfile();

    ExperienceAccrualService.recordDay(developer, {
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      technologies: ['REDIS', 'KAFKA', 'ALB'],
    });

    expect(developer.get(skillRef.fundamental('NETWORK')).experienceDays).toBe(1);
    expect(developer.get(skillRef.fundamental('OS_RUNTIME')).experienceDays).toBe(1);
    expect(developer.get(skillRef.fundamental('DATABASE')).experienceDays).toBe(1);
  });

  it('does not grant unrelated security experience just for running the stack', () => {
    const developer = new DeveloperProfile();

    ExperienceAccrualService.recordDay(developer, {
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      technologies: [],
    });

    expect(developer.get(skillRef.fundamental('SECURITY')).experienceDays).toBe(0);
  });

  it('accrues actual language, framework and deployed technology usage', () => {
    const developer = new DeveloperProfile();

    ExperienceAccrualService.recordDay(developer, {
      frameworkId: 'FASTAPI',
      databaseId: 'MONGODB',
      technologies: ['SQS'],
    });

    expect(developer.get(skillRef.language('PYTHON')).experienceDays).toBe(1);
    expect(developer.get(skillRef.framework('FASTAPI')).experienceDays).toBe(1);
    expect(developer.get(skillRef.technology('MONGODB')).experienceDays).toBe(1);
    expect(developer.get(skillRef.technology('SQS')).experienceDays).toBe(1);
    expect(developer.get(skillRef.technology('KAFKA')).experienceDays).toBe(0);
  });
});
