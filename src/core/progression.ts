export type CommunityFeatureId =
  | 'COMMENT'
  | 'LIKE'
  | 'IMAGE_UPLOAD'
  | 'SEARCH'
  | 'NOTIFICATION'
  | 'AI_RECOMMENDATION'
  | 'POPULAR_POSTS'
  | 'FOLLOW_FEED'
  | 'ADS'
  | 'PREMIUM';

const PHASES: readonly CommunityFeatureId[][] = [
  ['COMMENT', 'LIKE', 'IMAGE_UPLOAD'],
  ['SEARCH', 'NOTIFICATION', 'AI_RECOMMENDATION'],
  ['POPULAR_POSTS', 'FOLLOW_FEED', 'ADS', 'PREMIUM'],
];

export const COMMUNITY_REQUIREMENT_THRESHOLDS = [
  100,
  400,
  1_500,
  8_000,
  30_000,
  100_000,
  300_000,
  1_000_000,
  3_000_000,
  10_000_000,
] as const;

export interface CommunityRequirement {
  slotIndex: number;
  featureId: CommunityFeatureId;
  thresholdDau: number;
  phase: 1 | 2 | 3;
}

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state += 0x6d2b79f5;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

function shuffle<T>(items: readonly T[], random: SeededRandom): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random.next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function phaseForSlot(slotIndex: number): 1 | 2 | 3 {
  if (slotIndex < 3) return 1;
  if (slotIndex < 6) return 2;
  return 3;
}

export class CommunityProgression {
  readonly featureOrder: readonly CommunityFeatureId[];
  private completedCount = 0;
  private unlockedRequirement: CommunityRequirement | null = null;

  constructor(seed: number) {
    const random = new SeededRandom(seed);
    this.featureOrder = PHASES.flatMap((phase) => shuffle(phase, random));
  }

  get finished(): boolean {
    return this.completedCount >= this.featureOrder.length;
  }

  get currentRequirement(): CommunityRequirement {
    if (this.finished) throw new Error('All community requirements are complete');
    return {
      slotIndex: this.completedCount,
      featureId: this.featureOrder[this.completedCount],
      thresholdDau: COMMUNITY_REQUIREMENT_THRESHOLDS[this.completedCount],
      phase: phaseForSlot(this.completedCount),
    };
  }

  tryUnlock(dau: number): CommunityRequirement | null {
    if (this.finished) return null;
    if (this.unlockedRequirement) return this.unlockedRequirement;

    const requirement = this.currentRequirement;
    if (dau < requirement.thresholdDau) return null;

    this.unlockedRequirement = requirement;
    return requirement;
  }

  completeCurrentFeature(): CommunityRequirement {
    if (!this.unlockedRequirement) throw new Error('No feature requirement is currently unlocked');
    const completed = this.unlockedRequirement;
    this.completedCount += 1;
    this.unlockedRequirement = null;
    return completed;
  }
}
