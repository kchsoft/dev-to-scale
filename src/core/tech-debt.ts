import type { FeatureComplexity } from './feature';

const FAST_TRACK_DEBT: Record<FeatureComplexity, number> = {
  SIMPLE: 10,
  NORMAL: 14,
  COMPLEX: 18,
};

export class TechDebtState {
  static readonly REFACTOR_DAYS = 5;
  static readonly REFACTOR_REDUCTION = 30;

  private debt = 0;
  private refactorDaysRemaining = 0;
  private readonly fastTrackedFeatures = new Set<string>();

  get value(): number { return this.debt; }
  get refactoring(): boolean { return this.refactorDaysRemaining > 0; }
  get remainingRefactorDays(): number { return this.refactorDaysRemaining; }

  /** At maximum debt, feature delivery is 20% slower. */
  get developmentModifier(): number {
    return 1 - Math.min(0.2, this.debt * 0.002);
  }

  /** At maximum debt, daily incident rolls are 50% more likely. */
  get incidentRiskMultiplier(): number {
    return 1 + Math.min(0.5, this.debt * 0.005);
  }

  canFastTrack(featureId: string): boolean {
    return !this.fastTrackedFeatures.has(featureId) && !this.refactoring;
  }

  fastTrack(featureId: string, complexity: FeatureComplexity): number {
    if (!this.canFastTrack(featureId)) throw new Error('Feature already fast-tracked or refactoring is active');
    this.fastTrackedFeatures.add(featureId);
    const added = FAST_TRACK_DEBT[complexity];
    this.debt = Math.min(100, this.debt + added);
    return added;
  }

  startRefactor(): void {
    if (this.refactoring) throw new Error('Refactoring is already in progress');
    if (this.debt < 10) throw new Error('Tech Debt is too low to refactor');
    this.refactorDaysRemaining = TechDebtState.REFACTOR_DAYS;
  }

  advanceDay(): boolean {
    if (!this.refactoring) return false;
    this.refactorDaysRemaining -= 1;
    if (this.refactorDaysRemaining > 0) return false;
    this.debt = Math.max(0, this.debt - TechDebtState.REFACTOR_REDUCTION);
    return true;
  }
}
