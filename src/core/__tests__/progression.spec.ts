import { describe, expect, it } from 'vitest';
import { COMMUNITY_REQUIREMENT_THRESHOLDS, CommunityProgression } from '../progression';

describe('community progression', () => {
  it('uses 3/3/4 phase pools with deterministic seeded order', () => {
    const a = new CommunityProgression(12345);
    const b = new CommunityProgression(12345);

    expect(a.featureOrder).toEqual(b.featureOrder);
    expect(a.featureOrder.slice(0, 3).sort()).toEqual(['COMMENT', 'IMAGE_UPLOAD', 'LIKE'].sort());
    expect(a.featureOrder.slice(3, 6).sort()).toEqual(['AI_RECOMMENDATION', 'NOTIFICATION', 'SEARCH'].sort());
    expect(a.featureOrder.slice(6, 10).sort()).toEqual(['ADS', 'FOLLOW_FEED', 'POPULAR_POSTS', 'PREMIUM'].sort());
  });

  it('uses the Balance Pass 1 late-game DAU curve', () => {
    expect(COMMUNITY_REQUIREMENT_THRESHOLDS).toEqual([
      100,
      400,
      1_500,
      8_000,
      30_000,
      100_000,
      300_000,
      900_000,
      2_000_000,
      3_000_000,
    ]);
  });

  it('attaches DAU thresholds to requirement slots rather than specific features', () => {
    const progression = new CommunityProgression(1);

    expect(progression.currentRequirement.thresholdDau).toBe(100);
    expect(progression.tryUnlock(99)).toBeNull();
    expect(progression.tryUnlock(100)?.featureId).toBe(progression.featureOrder[0]);
  });

  it('never skips multiple requirements even if DAU jumps far ahead', () => {
    const progression = new CommunityProgression(7);

    const first = progression.tryUnlock(1_000_000);
    expect(first?.slotIndex).toBe(0);
    expect(progression.tryUnlock(1_000_000)).toEqual(first);

    progression.completeCurrentFeature();
    const second = progression.tryUnlock(1_000_000);
    expect(second?.slotIndex).toBe(1);
  });

  it('never relocks an already unlocked requirement when DAU falls', () => {
    const progression = new CommunityProgression(9);

    const requirement = progression.tryUnlock(100);
    expect(requirement).not.toBeNull();
    expect(progression.tryUnlock(50)).toEqual(requirement);
  });
});
