import { isQueueTechnology, nodeSizeProfile, ServerSize, SERVER_SIZE_VALUES } from '../core/infrastructure';
import { operationalPressures } from '../core/operational-pressure';
import type { BuildableTechnologyId } from '../core/technology';
import type { NodeResourceKind } from '../core/node-load';
import type { InfrastructureNodeKind } from '../core/topology';
import { simulationActionId, type SimulationAction } from './balance-action';
import type {
  BalanceNodeObservation,
  BalanceObservation,
  BalanceResourceLoadObservation,
} from './balance-observation';
import type { BalanceStrategyId } from './balance-scenario';
import { isAffordableCandidate } from './baseline-learning-controller';
import type { StrategyDecisionContext } from './balance-strategy';

export function noOp(reason: string): SimulationAction {
  return { type: 'NO_OP', reason };
}

export function nextServerSize(size: ServerSize): ServerSize | null {
  const index = SERVER_SIZE_VALUES.indexOf(size);
  return index >= 0 && index < SERVER_SIZE_VALUES.length - 1 ? SERVER_SIZE_VALUES[index + 1] : null;
}

export function nodeFor(observation: BalanceObservation, nodeId: string): BalanceNodeObservation | null {
  return observation.nodes.find((node) => node.nodeId === nodeId) ?? null;
}

export function hottestAggregateNode(observation: BalanceObservation): BalanceNodeObservation | null {
  return [...observation.nodes].sort((left, right) => (
    right.aggregatePercent - left.aggregatePercent || left.nodeId.localeCompare(right.nodeId)
  ))[0] ?? null;
}

export function hottestEffectiveNode(observation: BalanceObservation): BalanceNodeObservation | null {
  return [...observation.nodes].sort((left, right) => (
    right.effectivePercent - left.effectivePercent || left.nodeId.localeCompare(right.nodeId)
  ))[0] ?? null;
}

export function hottestResource(observation: BalanceObservation): BalanceResourceLoadObservation | null {
  if (!('resourceLoads' in observation)) return null;
  return [...observation.resourceLoads].sort((left, right) => (
    right.effectivePercent - left.effectivePercent
    || left.nodeId.localeCompare(right.nodeId)
    || left.resourceKind.localeCompare(right.resourceKind)
  ))[0] ?? null;
}

function technologyOption(observation: BalanceObservation, id: BuildableTechnologyId) {
  return observation.technologyOptions.find((option) => option.id === id) ?? null;
}

export function technologyAction(
  observation: BalanceObservation,
  id: BuildableTechnologyId,
  reason: string,
): SimulationAction | null {
  const option = technologyOption(observation, id);
  if (!option?.available) return null;
  return { type: 'START_TECHNOLOGY_BUILD', technologyId: id, reason };
}

export function resizeAction(node: BalanceNodeObservation, reason: string): SimulationAction | null {
  const size = nextServerSize(node.size);
  return size ? { type: 'RESIZE_NODE', nodeId: node.nodeId, size, reason } : null;
}

export function scaleOutAction(node: BalanceNodeObservation, reason: string): SimulationAction | null {
  if (!node.scaleOut?.available) return null;
  return { type: 'SCALE_OUT_NODE', nodeId: node.nodeId, reason };
}

export function projectedMonthlyCost(
  observation: BalanceObservation,
  action: SimulationAction,
): number {
  if (observation.level === 'ORACLE') return observation.previewPort.projectedMonthlyCost(action);

  switch (action.type) {
    case 'NO_OP':
    case 'RESPOND_TRAFFIC_SPIKE':
      return observation.monthlyInfrastructureCost;
    case 'RESIZE_NODE': {
      const node = nodeFor(observation, action.nodeId);
      if (!node) return Number.POSITIVE_INFINITY;
      const perUnit = nodeSizeProfile(node.productId, action.size).monthlyCost;
      let replacementCost = perUnit;
      if (node.kind === 'SERVER_GROUP' && node.scaleOut?.kind === 'INSTANCE') {
        replacementCost *= node.scaleOut.count;
      } else if (node.kind === 'DATABASE' && node.scaleOut?.kind === 'READ_REPLICA') {
        replacementCost *= 1 + node.scaleOut.count;
      }
      return observation.monthlyInfrastructureCost - node.monthlyCost + replacementCost;
    }
    case 'SCALE_OUT_NODE': {
      const node = nodeFor(observation, action.nodeId);
      if (!node?.scaleOut) return Number.POSITIVE_INFINITY;
      const existingUnits = node.scaleOut.kind === 'READ_REPLICA'
        ? 1 + node.scaleOut.count
        : Math.max(1, node.scaleOut.count);
      return observation.monthlyInfrastructureCost + node.monthlyCost / existingUnits;
    }
    case 'START_TECHNOLOGY_BUILD': {
      const option = technologyOption(observation, action.technologyId);
      if (!option) return Number.POSITIVE_INFINITY;
      let retiredMonthlyCost = 0;
      if (isQueueTechnology(action.technologyId)) {
        retiredMonthlyCost = observation.nodes.find(({ kind }) => kind === 'QUEUE')?.monthlyCost ?? 0;
      } else if (action.technologyId === 'OBJECT_STORAGE') {
        retiredMonthlyCost = observation.nodes.find(({ kind }) => kind === 'OBJECT_STORAGE')?.monthlyCost ?? 0;
      }
      return observation.monthlyInfrastructureCost - retiredMonthlyCost + option.monthlyCost;
    }
  }
}

export function immediateCost(observation: BalanceObservation, action: SimulationAction): number {
  if (action.type === 'START_TECHNOLOGY_BUILD') {
    return technologyOption(observation, action.technologyId)?.buildCost ?? Number.POSITIVE_INFINITY;
  }
  if (action.type === 'RESPOND_TRAFFIC_SPIKE' && action.response === 'BURST') {
    return observation.growthEvent?.burstCost ?? Number.POSITIVE_INFINITY;
  }
  return 0;
}

export function affordable(
  observation: BalanceObservation,
  context: StrategyDecisionContext,
  strategyId: BalanceStrategyId,
  action: SimulationAction,
): boolean {
  return isAffordableCandidate({
    cash: observation.cash,
    immediateCost: immediateCost(observation, action),
    protectedLearningReserve: context.protectedLearningReserve,
    projectedMonthlyInfrastructureCost: projectedMonthlyCost(observation, action),
    strategyId,
  });
}

export function firstAffordable(
  observation: BalanceObservation,
  context: StrategyDecisionContext,
  strategyId: BalanceStrategyId,
  candidates: readonly (SimulationAction | null)[],
): SimulationAction | null {
  for (const candidate of candidates) {
    if (candidate && affordable(observation, context, strategyId, candidate)) return candidate;
  }
  return null;
}

export function cheapestAffordable(
  observation: BalanceObservation,
  context: StrategyDecisionContext,
  strategyId: BalanceStrategyId,
  candidates: readonly (SimulationAction | null)[],
): SimulationAction | null {
  return candidates
    .filter((candidate): candidate is SimulationAction => candidate !== null)
    .filter((candidate) => affordable(observation, context, strategyId, candidate))
    .sort((left, right) => {
      const leftCost = immediateCost(observation, left) + projectedMonthlyCost(observation, left);
      const rightCost = immediateCost(observation, right) + projectedMonthlyCost(observation, right);
      return leftCost - rightCost || simulationActionId(left).localeCompare(simulationActionId(right));
    })[0] ?? null;
}

export function rawCapacityCandidates(
  observation: BalanceObservation,
  node: BalanceNodeObservation,
  reason: string,
): readonly (SimulationAction | null)[] {
  const resize = resizeAction(node, reason);
  if (resize) return [resize];
  if (node.kind === 'SERVER_GROUP') {
    const alb = observation.deployedTechnologies.includes('ALB')
      ? null
      : technologyAction(observation, 'ALB', `${reason}; enable ALB for scale-out`);
    return [alb, scaleOutAction(node, reason)];
  }
  if (node.kind === 'DATABASE') return [scaleOutAction(node, reason)];
  return [];
}

export function resourceRemedyCandidates(
  observation: BalanceObservation,
  node: BalanceNodeObservation,
  resourceKind: NodeResourceKind,
  reason: string,
): readonly (SimulationAction | null)[] {
  if (node.kind === 'DATABASE' && resourceKind === 'IO') {
    return [
      observation.deployedTechnologies.includes('REDIS') ? null : technologyAction(observation, 'REDIS', reason),
      scaleOutAction(node, reason),
      resizeAction(node, reason),
    ];
  }
  if (node.kind === 'DATABASE' && resourceKind === 'CPU') {
    return [scaleOutAction(node, reason), resizeAction(node, reason)];
  }
  if (node.kind === 'SERVER_GROUP' && resourceKind === 'CPU') {
    return [
      observation.deployedTechnologies.includes('ALB') ? null : technologyAction(observation, 'ALB', reason),
      scaleOutAction(node, reason),
      resizeAction(node, reason),
    ];
  }
  if (node.kind === 'SERVER_GROUP' && resourceKind === 'IO') {
    const resize = resizeAction(node, reason);
    const alb = resize || observation.deployedTechnologies.includes('ALB')
      ? null
      : technologyAction(observation, 'ALB', `${reason}; enable ALB for scale-out`);
    return [
      observation.deployedTechnologies.some((id) => isQueueTechnology(id)) ? null : technologyAction(observation, 'SQS', reason),
      alb,
      scaleOutAction(node, reason),
      resize,
    ];
  }
  if (node.kind === 'OBJECT_STORAGE') {
    return [
      observation.deployedTechnologies.includes('OBJECT_STORAGE') ? null : technologyAction(observation, 'OBJECT_STORAGE', reason),
      resizeAction(node, reason),
    ];
  }
  return [resizeAction(node, reason)];
}

export function maxEffectiveRatioFromPreview(snapshot: { readonly nodeLoads: readonly unknown[] }): number {
  return Math.max(0, ...operationalPressures(snapshot as Parameters<typeof operationalPressures>[0]).map(({ effectiveRatio }) => effectiveRatio));
}

export function candidateKindOrder(nodeKind: InfrastructureNodeKind): number {
  const order: readonly InfrastructureNodeKind[] = [
    'LOAD_BALANCER', 'SERVER_GROUP', 'DATABASE', 'CACHE', 'QUEUE', 'OBJECT_STORAGE', 'WORKER', 'EXTERNAL_SERVICE',
  ];
  return order.indexOf(nodeKind);
}
