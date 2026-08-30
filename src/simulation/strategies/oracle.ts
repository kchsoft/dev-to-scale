import { simulationActionId, type SimulationAction } from '../balance-action';
import type { OracleBalanceObservation } from '../balance-observation';
import type { BalanceStrategy, StrategyDecisionContext } from '../balance-strategy';
import {
  affordable,
  hottestEffectiveNode,
  immediateCost,
  maxEffectiveRatioFromPreview,
  noOp,
  nodeFor,
  projectedMonthlyCost,
  resourceRemedyCandidates,
} from '../strategy-helpers';

function previewMax(observation: OracleBalanceObservation, action: SimulationAction): number {
  switch (action.type) {
    case 'RESIZE_NODE':
      return maxEffectiveRatioFromPreview(observation.previewPort.previewResize(action.nodeId, action.size));
    case 'SCALE_OUT_NODE':
      return maxEffectiveRatioFromPreview(observation.previewPort.previewScaleOut(action.nodeId));
    case 'START_TECHNOLOGY_BUILD':
      return maxEffectiveRatioFromPreview(observation.previewPort.previewTechnology(action.technologyId));
    case 'NO_OP':
    case 'RESPOND_TRAFFIC_SPIKE':
      return Math.max(0, ...observation.exactPressures.map(({ effectiveRatio }) => effectiveRatio));
  }
}

function oracleCandidates(observation: OracleBalanceObservation): readonly SimulationAction[] {
  const pressure = [...observation.exactPressures].sort((left, right) => (
    right.effectiveRatio - left.effectiveRatio
    || left.nodeId.localeCompare(right.nodeId)
    || left.resourceKind.localeCompare(right.resourceKind)
  ))[0];
  if (!pressure) return [];
  const node = nodeFor(observation, pressure.nodeId);
  if (!node) return [];
  const tags = new Set(observation.workloadTags);
  return resourceRemedyCandidates(
    observation,
    node,
    pressure.resourceKind,
    `ORACLE ${pressure.nodeKind} ${pressure.resourceKind} ${pressure.effectiveRatio.toFixed(2)}x`,
  ).filter((candidate): candidate is SimulationAction => {
    if (!candidate) return false;
    if (candidate.type !== 'START_TECHNOLOGY_BUILD') return true;
    if (candidate.technologyId === 'REDIS') {
      return tags.has('READ_HEAVY') || tags.has('CONTENT') || tags.has('SEARCH');
    }
    if (candidate.technologyId === 'SQS') {
      return tags.has('ASYNC') || tags.has('EVENT_HEAVY');
    }
    return true;
  });
}

function decideOracle(observation: OracleBalanceObservation, context: StrategyDecisionContext): SimulationAction {
  const currentMax = Math.max(0, ...observation.exactPressures.map(({ effectiveRatio }) => effectiveRatio));
  if (currentMax < 0.85) return noOp('ORACLE sees sufficient effective headroom');

  const ranked = oracleCandidates(observation).map((action, order) => {
    if (!affordable(observation, context, 'ORACLE', action)) return null;
    const nextMax = previewMax(observation, action);
    const relief = Math.max(0, currentMax - nextMax);
    const oneMonthCost = immediateCost(observation, action)
      + Math.max(0, projectedMonthlyCost(observation, action) - observation.monthlyInfrastructureCost);
    const requiredAlbEnablement = action.type === 'START_TECHNOLOGY_BUILD' && action.technologyId === 'ALB';
    if (relief < 0.02 && !requiredAlbEnablement) return null;
    return { action, order, nextMax, relief, oneMonthCost };
  }).filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  const target = ranked.filter(({ nextMax }) => nextMax <= 0.85);
  if (target.length > 0) {
    target.sort((left, right) => (
      left.oneMonthCost - right.oneMonthCost
      || left.order - right.order
      || simulationActionId(left.action).localeCompare(simulationActionId(right.action))
    ));
    return target[0].action;
  }

  ranked.sort((left, right) => {
    const leftScore = left.relief / Math.max(1, left.oneMonthCost);
    const rightScore = right.relief / Math.max(1, right.oneMonthCost);
    return rightScore - leftScore
      || left.order - right.order
      || simulationActionId(left.action).localeCompare(simulationActionId(right.action));
  });
  return ranked[0]?.action ?? noOp('ORACLE found no meaningful affordable relief');
}

export const oracleStrategy: BalanceStrategy = {
  id: 'ORACLE',
  ceiling: 'ORACLE',
  decide(observation, context) {
    if (observation.level !== 'ORACLE') return noOp('ORACLE observation unavailable');
    return decideOracle(observation, context);
  },
  decideViral(observation, context) {
    const burst = { type: 'RESPOND_TRAFFIC_SPIKE' as const, response: 'BURST' as const, reason: 'ORACLE burst protection' };
    const pressure = hottestEffectiveNode(observation)?.effectivePercent ?? 0;
    if (pressure >= 85 && affordable(observation, context, this.id, burst)) return 'BURST';
    return pressure > 100 ? 'THROTTLE' : 'RIDE';
  },
};
