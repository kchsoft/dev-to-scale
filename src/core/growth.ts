import { INCIDENT_GROWTH_PENALTY, IncidentSeverity } from './incident';

export interface RandomSource {
  next(): number;
}

export type GrowthEventType = 'VIRAL' | 'NEGATIVE_BUZZ';
export type TrafficSpikeResponse = 'RIDE' | 'THROTTLE' | 'BURST';
export type TrafficSpikeResponseState = 'PENDING' | TrafficSpikeResponse;

export class GrowthEvent {
  private remaining = 7;
  private responseState: TrafficSpikeResponseState = 'PENDING';

  constructor(readonly type: GrowthEventType) {}

  get response(): TrafficSpikeResponseState { return this.responseState; }
  get canRespond(): boolean { return this.type === 'VIRAL' && this.active && this.responseState === 'PENDING'; }

  get modifier(): number {
    if (this.type !== 'VIRAL') return -0.05;
    // Throttling deliberately trades acquisition for stability.
    return this.responseState === 'THROTTLE' ? 0.01 : 0.05;
  }

  /** Incoming attention remains the same regardless of how we respond. */
  get trafficMultiplier(): number {
    return this.type === 'VIRAL' ? 1.8 : 1;
  }

  /**
   * Effective request pressure after the player's response.
   * THROTTLE rejects/defers traffic aggressively; BURST absorbs part of the spike
   * through temporary emergency capacity without pretending the incoming traffic vanished.
   */
  get loadMultiplier(): number {
    if (this.type !== 'VIRAL') return 1;
    if (this.responseState === 'THROTTLE') return 1.15;
    if (this.responseState === 'BURST') return 1.35;
    return 1.8;
  }

  get remainingDays(): number { return this.remaining; }
  get active(): boolean { return this.remaining > 0; }

  respond(response: TrafficSpikeResponse): void {
    if (this.type !== 'VIRAL' || !this.active) throw new Error('No active viral traffic spike');
    if (this.responseState !== 'PENDING') throw new Error('Traffic spike response already selected');
    this.responseState = response;
  }

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
  completedFeatureGrowthBonus: number;
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
  static readonly EVENT_CHANCE = 0.02;
  static readonly MAX_AVAILABILITY_PENALTY = 0.08;
  static readonly MAX_OPERATIONAL_PENALTY = 0.1;
  static readonly MAX_CAPACITY_PENALTY = 0.3;

  static calculate(input: DailyGrowthInput): DailyGrowthResult {
    const magnitude = Math.floor(input.random.next() * 5) + 1;
    const positive = input.random.next() < POSITIVE_PROBABILITY[input.phase];
    const rawBaseModifier = (positive ? magnitude : -magnitude) / 100;
    const rawFeatureModifier = input.completedFeatureGrowthBonus;
    const rawEventModifier = input.event?.active ? input.event.modifier : 0;
    const incidentActive = input.incidents.length > 0;

    // During an active incident the service cannot acquire net-positive DAU from
    // organic luck, completed features or a viral growth bonus. Negative market
    // movement still applies. Viral traffic pressure itself remains active in
    // the load model, so an outage during a spike is especially dangerous.
    const baseModifier = incidentActive ? Math.min(0, rawBaseModifier) : rawBaseModifier;
    const featureModifier = incidentActive ? 0 : rawFeatureModifier;
    const eventModifier = incidentActive ? Math.min(0, rawEventModifier) : rawEventModifier;

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
