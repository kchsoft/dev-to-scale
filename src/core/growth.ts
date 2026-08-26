import { INCIDENT_GROWTH_PENALTY, IncidentSeverity } from './incident';

export interface RandomSource {
  next(): number;
}

export type GrowthEventType = 'VIRAL' | 'NEGATIVE_BUZZ';

export class GrowthEvent {
  private remainingDays = 7;

  constructor(readonly type: GrowthEventType) {}

  get modifier(): number {
    return this.type === 'VIRAL' ? 0.05 : -0.05;
  }

  get active(): boolean { return this.remainingDays > 0; }

  advanceDay(): void {
    this.remainingDays = Math.max(0, this.remainingDays - 1);
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
  random: RandomSource;
}

export interface DailyGrowthResult {
  baseModifier: number;
  featureModifier: number;
  eventModifier: number;
  incidentModifier: number;
  totalModifier: number;
}

export class GrowthPolicy {
  static readonly FEATURE_BONUS = 0.005;
  static readonly EVENT_CHANCE = 0.02;

  static calculate(input: DailyGrowthInput): DailyGrowthResult {
    const magnitude = Math.floor(input.random.next() * 5) + 1;
    const positive = input.random.next() < POSITIVE_PROBABILITY[input.phase];
    const baseModifier = (positive ? magnitude : -magnitude) / 100;
    const featureModifier = input.completedFeatureCount * this.FEATURE_BONUS;
    const eventModifier = input.event?.active ? input.event.modifier : 0;
    const incidentPenalty = input.incidents.reduce((sum, severity) => sum + INCIDENT_GROWTH_PENALTY[severity], 0);
    const incidentModifier = Math.max(-0.1, incidentPenalty);

    return {
      baseModifier,
      featureModifier,
      eventModifier,
      incidentModifier,
      totalModifier: baseModifier + featureModifier + eventModifier + incidentModifier,
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
