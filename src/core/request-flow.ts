import type { FeatureDefinition } from './feature';
import type { IncidentSeverity } from './incident';

export type RequestNodeKind = 'ALB' | 'APP' | 'DB' | 'CACHE' | 'QUEUE' | 'STORAGE' | 'AI';
export type RequestRequirement = 'REQUIRED' | 'OPTIONAL';

export interface RequestRouteStep {
  node: RequestNodeKind;
  requirement?: RequestRequirement;
}

export interface RequestFlowEnvironment {
  available?: Partial<Record<RequestNodeKind, boolean>>;
  health?: Partial<Record<RequestNodeKind, number>>;
  prependAlb?: boolean;
}

export interface RequestFlowNodeResult {
  node: RequestNodeKind;
  arrivalRatio: number;
  passThroughRatio: number;
  available: boolean;
}

export class RequestFlowResult {
  constructor(
    readonly featureId: string,
    readonly nodes: readonly RequestFlowNodeResult[],
    readonly successRatio: number,
    readonly failureNode: RequestNodeKind | null,
  ) {}

  arrivalRatio(node: RequestNodeKind): number {
    return this.nodes.find((item) => item.node === node)?.arrivalRatio ?? 0;
  }
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isAvailable(node: RequestNodeKind, environment: RequestFlowEnvironment): boolean {
  return environment.available?.[node] ?? ['APP', 'DB', 'STORAGE', 'AI'].includes(node);
}

export class RequestFlowSimulator {
  static simulate(feature: FeatureDefinition, environment: RequestFlowEnvironment = {}): RequestFlowResult {
    const route: RequestRouteStep[] = [
      ...(environment.prependAlb ? [{ node: 'ALB' as const, requirement: 'REQUIRED' as const }] : []),
      ...feature.requestRoute,
    ];
    const nodes: RequestFlowNodeResult[] = [];
    let currentRatio = 1;
    let failureNode: RequestNodeKind | null = null;

    for (const step of route) {
      const requirement = step.requirement ?? 'REQUIRED';
      const available = isAvailable(step.node, environment);

      if (!available) {
        nodes.push({ node: step.node, arrivalRatio: 0, passThroughRatio: currentRatio, available: false });
        if (requirement === 'REQUIRED') {
          failureNode = step.node;
          currentRatio = 0;
          break;
        }
        continue;
      }

      const arrivalRatio = currentRatio;
      const health = clampRatio(environment.health?.[step.node] ?? 1);
      currentRatio = arrivalRatio * health;
      nodes.push({ node: step.node, arrivalRatio, passThroughRatio: currentRatio, available: true });

      if (arrivalRatio > 0 && currentRatio <= 0) {
        failureNode = step.node;
        break;
      }
    }

    return new RequestFlowResult(feature.id, nodes, currentRatio, failureNode);
  }
}

export function trafficHealthForSeverity(severity: IncidentSeverity): number {
  switch (severity) {
    case 'MINOR': return 0.8;
    case 'MAJOR': return 0.4;
    case 'CRITICAL': return 0;
  }
}

export function requestNodeForIncident(nodeId: string): RequestNodeKind | null {
  if (nodeId.startsWith('framework:')) return 'APP';
  if (nodeId.startsWith('database:')) return 'DB';
  if (nodeId === 'technology:REDIS') return 'CACHE';
  if (nodeId === 'technology:ALB') return 'ALB';
  if (nodeId === 'technology:OBJECT_STORAGE') return 'STORAGE';
  if (nodeId === 'technology:SQS' || nodeId === 'technology:RABBITMQ' || nodeId === 'technology:KAFKA') return 'QUEUE';
  return null;
}
