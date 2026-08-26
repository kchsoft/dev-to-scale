import {
  INCIDENT_DEVELOPMENT_MODIFIER,
  IncidentPolicy,
  IncidentSeverity,
} from './incident';
import { RandomSource } from './growth';

export interface IncidentCandidate {
  nodeId: string;
  baseRisk: 1 | 2 | 3 | 4 | 5;
  difficulty: number;
  loadRatio: number;
  proficiencyLevel: number;
  fundamentalAverage: number;
}

export class Incident {
  private _remainingResponseDays: number | null = null;

  constructor(
    readonly id: string,
    readonly nodeId: string,
    readonly severity: IncidentSeverity,
    readonly difficulty: number,
  ) {}

  get responding(): boolean { return this._remainingResponseDays !== null; }
  get remainingResponseDays(): number | null { return this._remainingResponseDays; }

  startResponse(proficiencyLevel: number, fundamentalAverage: number): void {
    if (this.responding) throw new Error('Incident response already started');
    this._remainingResponseDays = IncidentPolicy.resolutionDays({
      difficulty: this.difficulty,
      severity: this.severity,
      proficiencyLevel,
      fundamentalAverage,
    });
  }

  advanceResponseDay(): boolean {
    if (this._remainingResponseDays === null) return false;
    this._remainingResponseDays -= 1;
    return this._remainingResponseDays <= 0;
  }
}

export class IncidentGenerator {
  private sequence = 0;

  tryGenerate(candidates: readonly IncidentCandidate[], activeNodeIds: ReadonlySet<string>, random: RandomSource): Incident | null {
    for (const candidate of candidates) {
      if (activeNodeIds.has(candidate.nodeId)) continue;
      const probability = IncidentPolicy.dailyProbability(candidate);
      if (random.next() >= probability) continue;

      const severity = IncidentPolicy.severityRoll(candidate.loadRatio, random.next());
      this.sequence += 1;
      return new Incident(`incident-${this.sequence}`, candidate.nodeId, severity, candidate.difficulty);
    }
    return null;
  }
}

export class IncidentManager {
  private readonly active = new Map<string, Incident>();
  private responseIncidentId: string | null = null;

  get incidents(): readonly Incident[] { return [...this.active.values()]; }
  get activeNodeIds(): ReadonlySet<string> { return new Set([...this.active.values()].map((incident) => incident.nodeId)); }
  get severities(): readonly IncidentSeverity[] { return this.incidents.map((incident) => incident.severity); }

  add(incident: Incident): void {
    if (this.activeNodeIds.has(incident.nodeId)) throw new Error(`Node ${incident.nodeId} already has an incident`);
    this.active.set(incident.id, incident);
  }

  removeForNode(nodeId: string): Incident | null {
    const incident = this.incidents.find((candidate) => candidate.nodeId === nodeId);
    if (!incident) return null;

    this.active.delete(incident.id);
    if (this.responseIncidentId === incident.id) this.responseIncidentId = null;
    return incident;
  }

  startResponse(incidentId: string, proficiencyLevel: number, fundamentalAverage: number): Incident {
    if (this.responseIncidentId) throw new Error('An incident response is already in progress');
    const incident = this.active.get(incidentId);
    if (!incident) throw new Error('Incident not found');
    incident.startResponse(proficiencyLevel, fundamentalAverage);
    this.responseIncidentId = incidentId;
    return incident;
  }

  advanceResponseDay(): Incident | null {
    if (!this.responseIncidentId) return null;
    const incident = this.active.get(this.responseIncidentId);
    if (!incident) throw new Error('Response incident missing');
    if (!incident.advanceResponseDay()) return null;

    this.active.delete(incident.id);
    this.responseIncidentId = null;
    return incident;
  }

  get developmentModifier(): number {
    if (this.active.size === 0) return 1;
    return Math.min(...this.incidents.map((incident) => INCIDENT_DEVELOPMENT_MODIFIER[incident.severity]));
  }
}
