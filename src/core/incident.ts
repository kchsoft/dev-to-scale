export type IncidentSeverity = 'MINOR' | 'MAJOR' | 'CRITICAL';

const BASE_RISK: Record<number, number> = {
  1: 0.001,
  2: 0.0018,
  3: 0.003,
  4: 0.0045,
  5: 0.0065,
};

const PROFICIENCY_RISK_MULTIPLIER: Record<number, number> = {
  1: 1.6, 2: 1.45, 3: 1.3, 4: 1.15, 5: 1,
  6: 0.9, 7: 0.8, 8: 0.7, 9: 0.6, 10: 0.5,
};

const PROFICIENCY_RESOLUTION_MULTIPLIER: Record<number, number> = {
  1: 1.5, 2: 1.4, 3: 1.3, 4: 1.2, 5: 1.1,
  6: 1, 7: 0.9, 8: 0.8, 9: 0.7, 10: 0.6,
};

const SEVERITY_RESOLUTION_MULTIPLIER: Record<IncidentSeverity, number> = {
  MINOR: 0.5,
  MAJOR: 1,
  CRITICAL: 1.5,
};

export const INCIDENT_GROWTH_PENALTY: Record<IncidentSeverity, number> = {
  MINOR: -0.01,
  MAJOR: -0.03,
  CRITICAL: -0.05,
};

export const INCIDENT_DEVELOPMENT_MODIFIER: Record<IncidentSeverity, number> = {
  MINOR: 0.9,
  MAJOR: 0.7,
  CRITICAL: 0.5,
};

function loadMultiplier(loadRatio: number): number {
  if (loadRatio > 1) return 5;
  if (loadRatio >= 0.9) return 2.5;
  if (loadRatio >= 0.7) return 1.5;
  return 1;
}

function fundamentalRiskMultiplier(average: number): number {
  if (average < 3) return 1.4;
  if (average < 5) return 1.15;
  if (average < 7) return 1;
  if (average < 9) return 0.9;
  return 0.8;
}

function fundamentalResolutionMultiplier(average: number): number {
  if (average < 3) return 1.3;
  if (average < 5) return 1.15;
  if (average < 7) return 1;
  if (average < 9) return 0.9;
  return 0.8;
}

export interface IncidentProbabilityInput {
  baseRisk: 1 | 2 | 3 | 4 | 5;
  loadRatio: number;
  proficiencyLevel: number;
  fundamentalAverage: number;
}

export interface IncidentResolutionInput {
  difficulty: number;
  severity: IncidentSeverity;
  proficiencyLevel: number;
  fundamentalAverage: number;
}

export class IncidentPolicy {
  static dailyProbability(input: IncidentProbabilityInput): number {
    return BASE_RISK[input.baseRisk]
      * loadMultiplier(input.loadRatio)
      * PROFICIENCY_RISK_MULTIPLIER[input.proficiencyLevel]
      * fundamentalRiskMultiplier(input.fundamentalAverage);
  }

  static resolutionDays(input: IncidentResolutionInput): number {
    return Math.max(1, Math.ceil(
      input.difficulty
      * SEVERITY_RESOLUTION_MULTIPLIER[input.severity]
      * PROFICIENCY_RESOLUTION_MULTIPLIER[input.proficiencyLevel]
      * fundamentalResolutionMultiplier(input.fundamentalAverage),
    ));
  }

  static severityRoll(loadRatio: number, random: number): IncidentSeverity {
    const distribution = loadRatio > 1
      ? { minor: 0.2, major: 0.5 }
      : loadRatio >= 0.9
        ? { minor: 0.5, major: 0.4 }
        : { minor: 0.75, major: 0.22 };

    if (random < distribution.minor) return 'MINOR';
    if (random < distribution.minor + distribution.major) return 'MAJOR';
    return 'CRITICAL';
  }
}
