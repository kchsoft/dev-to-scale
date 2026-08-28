import type { SkillRefView, TechnologyIdView, WorkSlotView } from './game-view';

export type DevelopmentOptionKind = 'feature' | 'technology' | 'learning';
export type DevelopmentOptionState = 'active' | 'ready' | 'locked' | 'completed';

export type DevelopmentActionView =
  | { readonly kind: 'start-technology'; readonly technologyId: TechnologyIdView }
  | { readonly kind: 'start-learning'; readonly skill: SkillRefView }
  | { readonly kind: 'fast-track-feature'; readonly featureId: string }
  | { readonly kind: 'start-refactor' };

export interface DevelopmentOptionView {
  readonly id: string;
  readonly kind: DevelopmentOptionKind;
  readonly title: string;
  readonly eyebrow: string;
  readonly summary: string;
  readonly state: DevelopmentOptionState;
  readonly statusLabel: string;
  readonly sortRank: number;
  readonly progress: number | null;
  readonly durationLabel: string | null;
  readonly upfrontCost: number | null;
  readonly monthlyCost: number | null;
  readonly benefits: readonly string[];
  readonly risks: readonly string[];
  readonly requirements: readonly string[];
  readonly unavailableReason: string | null;
  readonly actionLabel: string | null;
  readonly action: DevelopmentActionView | null;
}

export interface DevelopmentWorkbenchView {
  readonly workSlots: readonly WorkSlotView[];
  readonly options: readonly DevelopmentOptionView[];
}
