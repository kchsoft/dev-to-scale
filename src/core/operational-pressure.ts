import type { NodeLoadCollection, NodeResourceKind } from './node-load';
import type { InfrastructureNodeId, InfrastructureNodeKind } from './topology';

export type OperationalPressureBasis = 'NOMINAL' | 'EFFECTIVE';

export interface OperationalPressure {
  readonly nodeId: InfrastructureNodeId;
  readonly nodeKind: InfrastructureNodeKind;
  readonly resourceKind: NodeResourceKind;
  readonly demand: number;
  readonly nominalCapacity: number;
  readonly effectiveCapacity: number;
  readonly nominalRatio: number;
  readonly effectiveRatio: number;
  /** @deprecated Migration alias. Technical pressure uses effective capacity. */
  readonly capacity: number;
  /** @deprecated Migration alias. Technical pressure uses effective ratio. */
  readonly ratio: number;
}

export interface OperationalPressureScope {
  readonly nodeIds?: ReadonlySet<InfrastructureNodeId>;
  readonly basis?: OperationalPressureBasis;
}

export function operationalPressureRatio(
  pressure: OperationalPressure,
  basis: OperationalPressureBasis,
): number {
  return basis === 'NOMINAL' ? pressure.nominalRatio : pressure.effectiveRatio;
}

export function operationalPressures(
  load: NodeLoadCollection,
  scope?: OperationalPressureScope,
): readonly OperationalPressure[] {
  const pressures: OperationalPressure[] = [];

  for (const node of load.nodeLoads) {
    if (node.nodeKind === 'EXTERNAL_SERVICE') continue;
    if (scope?.nodeIds && !scope.nodeIds.has(node.nodeId)) continue;

    for (const resource of node.resources) {
      pressures.push(Object.freeze({
        nodeId: node.nodeId,
        nodeKind: node.nodeKind,
        resourceKind: resource.resourceKind,
        demand: resource.demand,
        nominalCapacity: resource.nominalCapacity,
        effectiveCapacity: resource.effectiveCapacity,
        nominalRatio: resource.nominalRatio,
        effectiveRatio: resource.effectiveRatio,
        capacity: resource.effectiveCapacity,
        ratio: resource.effectiveRatio,
      }));
    }
  }

  return Object.freeze(pressures);
}

function firstMax(
  pressures: readonly OperationalPressure[],
  basis: OperationalPressureBasis = 'EFFECTIVE',
): OperationalPressure | null {
  let maximum: OperationalPressure | null = null;

  for (const pressure of pressures) {
    if (
      maximum === null
      || operationalPressureRatio(pressure, basis) > operationalPressureRatio(maximum, basis)
    ) {
      maximum = pressure;
    }
  }

  return maximum;
}

export function primaryOperationalPressure(
  load: NodeLoadCollection,
  scope?: OperationalPressureScope,
): OperationalPressure | null {
  return firstMax(operationalPressures(load, scope), scope?.basis ?? 'EFFECTIVE');
}

export function operationalPressuresForNode(
  load: NodeLoadCollection,
  nodeId: InfrastructureNodeId,
): readonly OperationalPressure[] {
  return operationalPressures(load, { nodeIds: new Set([nodeId]) });
}

export function primaryOperationalPressureForNode(
  load: NodeLoadCollection,
  nodeId: InfrastructureNodeId,
  basis: OperationalPressureBasis = 'EFFECTIVE',
): OperationalPressure | null {
  return firstMax(operationalPressuresForNode(load, nodeId), basis);
}

/**
 * Capacity pressure becomes user-visible request loss only after an owned
 * resource exceeds 100%. Every additional 10 percentage points of overload
 * contributes 5 percentage points of failure, capped at 35%.
 *
 * Existing request/incident failures are combined as independent failure
 * sources rather than added, so the result always remains a probability.
 */
export function failureRateWithCapacityOverload(
  load: NodeLoadCollection,
  existingFailureRate = 0,
): number {
  const normalizedExisting = Math.max(0, Math.min(1, existingFailureRate));
  const primaryRatio = primaryOperationalPressure(load)?.ratio ?? 0;
  const overload = Math.max(0, primaryRatio - 1);
  const capacityFailureRate = Math.min(0.35, overload * 0.5);

  return 1 - (1 - normalizedExisting) * (1 - capacityFailureRate);
}
