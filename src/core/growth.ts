import { INCIDENT_GROWTH_PENALTY, IncidentSeverity } from './incident';

export interface RandomSource {
  next(): number;
}

export type GrowthEventType = 'VIRAL' | 'NEGATIVE_BUZZ';

export class GrowthEvent {
  private remaining = 7;

  constructor(readonly type: GrowthEventType) {}

  get modifier(): number {
    return this.type === 'VIRAL' ? 0.05 : -0.05;
  }

  /** Viral attention creates more requests than DAU alone would imply. */
  get trafficMultiplier(): number {
    return this.type === 'VIRAL' ? 1.8 : 1;
  }

  get remainingDays(): number { return this.remaining; }
  get active(): boolean { return this.remaining > 0; }

  advanceDay(): void {
    this.remaining = Math.max(0, this.remaining - 1);
  }
}

const POSITIVE_PROBABILITY: Record<1 | 2 | 3, number> = {
  1: 0.75,
  2: 0.65,
  3: 0.55,
};

export interface DailyGrowthInput {
  phase: 1 | 2 | 3;
  completedFeatureCount: number;
  event: GrowthEvent | null;
  incidents: readonly IncidentSeverity[];
  failureRate?: number;
  maxLoadRatio?: number;
  random: RandomSource;
}

export interface DailyGrowthResult {
  baseModifier: number;
  featureModifier: number;
  eventModifier: number;
  incidentModifier: number;
  availabilityModifier: number;
  operationalModifier: number;
  capacityModifier: number;
  totalModifier: number;
}

export class GrowthPolicy {
  static readonly FEATURE_BONUS = 0.005;
  static readonly EVENT_CHANCE = 0.02;
  static readonly MAX_AVAILABILITY_PENALTY = 0.08;
  static readonly MAX_OPERATIONAL_PENALTY = 0.1;
  static readonly MAX_CAPACITY_PENALTY = 0.3;

  static calculate(input: DailyGrowthInput): DailyGrowthResult {
    const magnitude = Math.floor(input.random.next() * 5) + 1;
    const positive = input.random.next() < POSITIVE_PROBABILITY[input.phase];
    const baseModifier = (positive ? magnitude : -magnitude) / 100;
    const featureModifier = input.completedFeatureCount * this.FEATURE_BONUS;
    const eventModifier = input.event?.active ? input.event.modifier : 0;
    const incidentPenalty = input.incidents.reduce((sum, severity) => sum + INCIDENT_GROWTH_PENALTY[severity], 0);
    const incidentModifier = Math.max(-this.MAX_OPERATIONAL_PENALTY, incidentPenalty);
    const failureRate = Math.max(0, Math.min(1, input.failureRate ?? 0));
    const availabilityModifier = -failureRate * this.MAX_AVAILABILITY_PENALTY;
    const operationalModifier = Math.max(
      -this.MAX_OPERATIONAL_PENALTY,
      incidentModifier + availabilityModifier,
    );

    const maxLoadRatio = Math.max(0, input.maxLoadRatio ?? 0);
    const overloadRatio = Math.max(0, maxLoadRatio - 1);
    const capacityModifier = -Math.min(this.MAX_CAPACITY_PENALTY, overloadRatio);

    return {
      baseModifier,
      featureModifier,
      eventModifier,
      incidentModifier,
      availabilityModifier,
      operationalModifier,
      capacityModifier,
      totalModifier: baseModifier + featureModifier + eventModifier + operationalModifier + capacityModifier,
    };
  }

  static nextDau(currentDau: number, modifier: number): number {
    return Math.max(0, Math.round(currentDau * (1 + modifier)));
  }

  static maybeStartEvent(current: GrowthEvent | null, random: RandomSource): GrowthEvent | null {
    if (current?.active) return current;
    if (random.next() >= this.EVENT_CHANCE) return null;
    return new GrowthEvent(random.next() < 0.5 ? 'VIRAL' : 'NEGATIVE_BUZZ');
  }
}
