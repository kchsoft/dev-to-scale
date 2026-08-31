import { OperationalViewProjector } from '../application/operational-view-projector';
import {
  capacityStatus,
  hardLimitPercent,
} from '../application/operational-pressure-presenter';
import type { BottleneckView, CapacityStatusView } from '../application/game-view';
import { COMMUNITY_BOOTSTRAP, COMMUNITY_FEATURES } from '../core/community';
import type { DatabaseId } from '../core/database';
import type { FeatureDefinition, FeatureTag, FrameworkId } from '../core/feature';
import { GameEngine } from '../core/game-engine';
import type { TrafficSpikeResponseState } from '../core/growth';
import type { HorizontalScaleKind, LoadSnapshot, TechnologyId } from '../core/infrastructure';
import { ServerSize } from '../core/infrastructure';
import { skillRef } from '../core/learning';
import type { NodeResourceKind } from '../core/node-load';
import {
  operationalPressures,
  operationalPressuresForNode,
  primaryOperationalPressureForNode,
} from '../core/operational-pressure';
import type { CommunityFeatureId } from '../core/progression';
import type { ResourceRole } from '../core/service-topology';
import { TECHNOLOGIES, TechnologyBuildTask, type BuildableTechnologyId } from '../core/technology';
import type { InfrastructureNodeId, InfrastructureNodeKind } from '../core/topology';
import { V1RouteBlueprintAdapter, V1ServiceTopologyFactory } from '../core/v1-topology';
import type { SimulationAction } from './balance-action';

export type ObservationCeiling = 'BASIC' | 'METRICS' | 'APM' | 'ORACLE';
export type PlayerObservationLevel = 'BASIC' | 'METRICS' | 'APM';

export interface BalanceScaleOutObservation {
  readonly kind: HorizontalScaleKind;
  readonly count: number;
  readonly maxCount: number;
  readonly available: boolean;
  readonly reason: string | null;
}

export interface BalanceNodeObservation {
  readonly nodeId: InfrastructureNodeId;
  readonly kind: InfrastructureNodeKind;
  readonly productId: string;
  readonly size: ServerSize;
  readonly monthlyCost: number;
  readonly aggregatePercent: number;
  readonly effectivePercent: number;
  readonly hardLimitPercent: number;
  readonly status: CapacityStatusView;
  readonly scaleOut: BalanceScaleOutObservation | null;
}

export interface BalanceTechnologyOption {
  readonly id: BuildableTechnologyId;
  readonly buildCost: number;
  readonly monthlyCost: number;
  readonly deployed: boolean;
  readonly available: boolean;
}

export interface RequiredDependencyGapObservation {
  readonly role: ResourceRole;
  readonly workloadIds: readonly string[];
  readonly candidateTechnologyIds: readonly BuildableTechnologyId[];
}

export interface PendingFeatureObservation {
  readonly id: CommunityFeatureId;
  readonly estimatedRemainingDays: number;
  readonly requiredResourceRoles: readonly ResourceRole[];
}

export interface BalanceResourceLoadObservation {
  readonly nodeId: InfrastructureNodeId;
  readonly nodeKind: InfrastructureNodeKind;
  readonly resourceKind: NodeResourceKind;
  readonly percent: number;
  readonly effectivePercent: number;
  readonly hardLimitPercent: number;
  readonly status: CapacityStatusView;
}

export interface BalanceDiagnosisObservation {
  readonly topBottleneck: BottleneckView | null;
  readonly text: string | null;
}

export interface MetricsReleasePreviewObservation {
  readonly resourceLoads: readonly BalanceResourceLoadObservation[];
  readonly maxEffectivePercent: number;
}

export interface ApmReleasePreviewObservation extends MetricsReleasePreviewObservation {
  readonly diagnosis: BalanceDiagnosisObservation;
}

export interface OracleExactPressure {
  readonly nodeId: InfrastructureNodeId;
  readonly nodeKind: InfrastructureNodeKind;
  readonly resourceKind: NodeResourceKind;
  readonly demand: number;
  readonly nominalCapacity: number;
  readonly effectiveCapacity: number;
  readonly nominalRatio: number;
  readonly effectiveRatio: number;
}

export interface OracleReleasePreviewObservation extends ApmReleasePreviewObservation {
  readonly exactPressures: readonly OracleExactPressure[];
}

export interface CommonBalanceObservation {
  readonly level: ObservationCeiling;
  readonly frameworkId: FrameworkId;
  readonly databaseId: DatabaseId;
  readonly day: number;
  readonly dau: number;
  readonly cash: number;
  readonly monthlyInfrastructureCost: number;
  readonly failureRate: number;
  readonly requiredDependencyGaps: readonly RequiredDependencyGapObservation[];
  readonly pendingFeature: PendingFeatureObservation | null;
  readonly upcomingRequiredDependencyGaps: readonly RequiredDependencyGapObservation[];
  readonly serviceHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  readonly growthEvent: null | {
    readonly type: 'VIRAL' | 'NEGATIVE_BUZZ';
    readonly response: TrafficSpikeResponseState;
    readonly trafficMultiplier: number;
    readonly loadMultiplier: number;
    readonly burstCost: number;
  };
  readonly currentTechnologyBuildId: BuildableTechnologyId | null;
  readonly deployedTechnologies: readonly TechnologyId[];
  readonly technologyOptions: readonly BalanceTechnologyOption[];
  readonly nodes: readonly BalanceNodeObservation[];
}

export interface BasicBalanceObservation extends CommonBalanceObservation {
  readonly level: 'BASIC';
}

export interface MetricsBalanceObservation extends CommonBalanceObservation {
  readonly level: 'METRICS';
  readonly resourceLoads: readonly BalanceResourceLoadObservation[];
  readonly releasePreview: MetricsReleasePreviewObservation | null;
}

export interface ApmBalanceObservation extends CommonBalanceObservation {
  readonly level: 'APM';
  readonly resourceLoads: readonly BalanceResourceLoadObservation[];
  readonly diagnosis: BalanceDiagnosisObservation;
  readonly releasePreview: ApmReleasePreviewObservation | null;
}

export interface OraclePreviewPort {
  previewTechnology(id: BuildableTechnologyId): LoadSnapshot;
  previewResize(nodeId: InfrastructureNodeId, size: ServerSize): LoadSnapshot;
  previewScaleOut(nodeId: InfrastructureNodeId): LoadSnapshot;
  previewReleaseAction(action: SimulationAction): LoadSnapshot;
  projectedMonthlyCost(action: SimulationAction): number;
  technologyReadyForRelease?(id: BuildableTechnologyId): boolean;
}

export interface OracleBalanceObservation extends CommonBalanceObservation {
  readonly level: 'ORACLE';
  readonly resourceLoads: readonly BalanceResourceLoadObservation[];
  readonly diagnosis: BalanceDiagnosisObservation;
  readonly exactPressures: readonly OracleExactPressure[];
  readonly workloadTags: readonly FeatureTag[];
  readonly releasePreview: OracleReleasePreviewObservation | null;
  readonly previewPort: OraclePreviewPort;
}

export type BalanceObservation =
  | BasicBalanceObservation
  | MetricsBalanceObservation
  | ApmBalanceObservation
  | OracleBalanceObservation;

const PLAYER_LEVEL_ORDER: Readonly<Record<PlayerObservationLevel, number>> = {
  BASIC: 0,
  METRICS: 1,
  APM: 2,
};

const REQUIRED_DEPENDENCY_TECHNOLOGIES: Readonly<Partial<Record<ResourceRole, readonly BuildableTechnologyId[]>>> = Object.freeze({
  EVENT_BUS: Object.freeze(['SQS', 'RABBITMQ', 'KAFKA'] as const),
});

function activeFeatures(engine: GameEngine): readonly FeatureDefinition[] {
  const snapshot = engine.snapshot;
  if (!snapshot.launched) return [];

  const completed = snapshot.completedFeatures.map((id) => {
    const feature = (COMMUNITY_FEATURES as Record<string, FeatureDefinition>)[id];
    if (!feature) throw new Error(`Unknown completed community feature: ${id}`);
    return feature;
  });
  return [COMMUNITY_BOOTSTRAP, ...completed];
}

function pendingFeatureDefinition(engine: GameEngine): FeatureDefinition | null {
  const current = engine.snapshot.currentFeature;
  if (!current || current.id === COMMUNITY_BOOTSTRAP.id) return null;
  const feature = (COMMUNITY_FEATURES as Record<string, FeatureDefinition>)[current.id];
  if (!feature) throw new Error(`Unknown pending community feature: ${current.id}`);
  return feature;
}

function explicitRequiredResourceRoles(feature: FeatureDefinition): readonly ResourceRole[] {
  const blueprint = V1RouteBlueprintAdapter.fromFeature(feature);
  const roles = feature.requestRoute.flatMap((step, index) => (
    step.requirement === 'REQUIRED' && blueprint.steps[index]
      ? [blueprint.steps[index].role]
      : []
  ));
  return Object.freeze([...new Set(roles)].sort());
}

function copiedBottleneck(bottleneck: BottleneckView | null): BottleneckView | null {
  return bottleneck ? Object.freeze({ ...bottleneck }) : null;
}

function percent(ratio: number): number {
  return Math.max(0, Math.round(ratio * 100));
}

function requiredDependencyGaps(load: LoadSnapshot): readonly RequiredDependencyGapObservation[] {
  const workloadIdsByRole = new Map<ResourceRole, Set<string>>();
  for (const trace of load.requestTraces) {
    for (const node of trace.nodes) {
      if (node.requirement !== 'REQUIRED' || node.status !== 'MISSING') continue;
      let workloadIds = workloadIdsByRole.get(node.role);
      if (!workloadIds) {
        workloadIds = new Set<string>();
        workloadIdsByRole.set(node.role, workloadIds);
      }
      workloadIds.add(trace.workloadId);
    }
  }

  return Object.freeze([...workloadIdsByRole.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([role, workloadIds]) => Object.freeze({
      role,
      workloadIds: Object.freeze([...workloadIds].sort()),
      candidateTechnologyIds: Object.freeze([...(REQUIRED_DEPENDENCY_TECHNOLOGIES[role] ?? [])]),
    })));
}

function upcomingRequiredDependencyGaps(
  engine: GameEngine,
  feature: FeatureDefinition | null,
): readonly RequiredDependencyGapObservation[] {
  if (!feature) return Object.freeze([]);
  return Object.freeze(requiredDependencyGaps(engine.previewLoadWithFeature(feature))
    .map((gap) => Object.freeze({
      ...gap,
      workloadIds: Object.freeze(gap.workloadIds.filter((workloadId) => workloadId === feature.id)),
    }))
    .filter((gap) => gap.workloadIds.length > 0));
}

function resourceObservationsFromLoad(load: LoadSnapshot): readonly BalanceResourceLoadObservation[] {
  return Object.freeze(operationalPressures(load).map((pressure) => Object.freeze({
    nodeId: pressure.nodeId,
    nodeKind: pressure.nodeKind,
    resourceKind: pressure.resourceKind,
    percent: percent(pressure.nominalRatio),
    effectivePercent: percent(pressure.effectiveRatio),
    hardLimitPercent: hardLimitPercent(pressure),
    status: capacityStatus(pressure.nominalRatio, pressure.effectiveRatio),
  })));
}

function exactPressuresFromLoad(load: LoadSnapshot): readonly OracleExactPressure[] {
  return Object.freeze(operationalPressures(load).map((pressure) => Object.freeze({
    nodeId: pressure.nodeId,
    nodeKind: pressure.nodeKind,
    resourceKind: pressure.resourceKind,
    demand: pressure.demand,
    nominalCapacity: pressure.nominalCapacity,
    effectiveCapacity: pressure.effectiveCapacity,
    nominalRatio: pressure.nominalRatio,
    effectiveRatio: pressure.effectiveRatio,
  })));
}

function resourceObservations(engine: GameEngine): readonly BalanceResourceLoadObservation[] {
  return resourceObservationsFromLoad(engine.snapshot.load);
}

function nodeObservations(engine: GameEngine): readonly BalanceNodeObservation[] {
  const topology = V1ServiceTopologyFactory.create(engine.infrastructure, activeFeatures(engine));
  return Object.freeze(topology.graph.nodes
    .filter(({ kind }) => kind !== 'EXTERNAL_SERVICE')
    .map((node) => {
      const nominal = primaryOperationalPressureForNode(engine.snapshot.load, node.id, 'NOMINAL');
      const effective = primaryOperationalPressureForNode(engine.snapshot.load, node.id, 'EFFECTIVE');
      const pressure = nominal ?? effective;
      const horizontal = engine.infrastructure.horizontalScale(node.id);
      return Object.freeze({
        nodeId: node.id,
        kind: node.kind,
        productId: node.productId,
        size: engine.infrastructure.nodeSize(node.id),
        monthlyCost: engine.infrastructure.nodeMonthlyCost(node.id),
        aggregatePercent: nominal ? percent(nominal.nominalRatio) : 0,
        effectivePercent: effective ? percent(effective.effectiveRatio) : 0,
        hardLimitPercent: pressure ? hardLimitPercent(pressure) : 0,
        status: pressure
          ? capacityStatus(nominal?.nominalRatio ?? 0, effective?.effectiveRatio ?? 0)
          : 'NORMAL',
        scaleOut: horizontal ? Object.freeze({
          kind: horizontal.kind,
          count: horizontal.count,
          maxCount: horizontal.maxCount,
          available: horizontal.available,
          reason: horizontal.reason,
        }) : null,
      });
    }));
}

function technologyObservations(engine: GameEngine): readonly BalanceTechnologyOption[] {
  const buildInProgress = engine.snapshot.currentTechnologyBuild !== null;
  return Object.freeze(Object.values(TECHNOLOGIES).map((definition) => {
    const deployed = engine.infrastructure.hasTechnology(definition.id);
    const prerequisitesMet = Object.entries(definition.prerequisites).every(([fundamental, level]) => (
      engine.developer.get({ category: 'fundamental', id: fundamental as 'NETWORK' | 'OS_RUNTIME' | 'DATABASE' | 'DSA' | 'SECURITY' | 'SOFTWARE_DESIGN' }).level >= (level ?? 1)
    ));
    return Object.freeze({
      id: definition.id,
      buildCost: definition.buildCost,
      monthlyCost: definition.monthlyCost,
      deployed,
      available: !deployed && !buildInProgress && prerequisitesMet,
    });
  }));
}

function commonObservation(
  engine: GameEngine,
  level: ObservationCeiling,
): CommonBalanceObservation {
  const snapshot = engine.snapshot;
  const topology = V1ServiceTopologyFactory.create(engine.infrastructure, activeFeatures(engine));
  const service = OperationalViewProjector.project(snapshot, engine.developer, topology);
  const pendingFeature = pendingFeatureDefinition(engine);

  return Object.freeze({
    level,
    frameworkId: engine.config.frameworkId,
    databaseId: engine.config.databaseId,
    day: snapshot.day,
    dau: snapshot.dau,
    cash: snapshot.cash,
    monthlyInfrastructureCost: engine.infrastructure.monthlyCost,
    failureRate: snapshot.load.failureRate,
    requiredDependencyGaps: requiredDependencyGaps(snapshot.load),
    pendingFeature: pendingFeature && snapshot.currentFeature
      ? Object.freeze({
        id: pendingFeature.id as CommunityFeatureId,
        estimatedRemainingDays: snapshot.currentFeature.estimatedRemainingDays,
        requiredResourceRoles: explicitRequiredResourceRoles(pendingFeature),
      })
      : null,
    upcomingRequiredDependencyGaps: upcomingRequiredDependencyGaps(engine, pendingFeature),
    serviceHealth: service.health.status,
    growthEvent: snapshot.growthEvent ? Object.freeze({
      type: snapshot.growthEvent.type,
      response: snapshot.growthEvent.response,
      trafficMultiplier: snapshot.growthEvent.trafficMultiplier,
      loadMultiplier: snapshot.growthEvent.loadMultiplier,
      burstCost: snapshot.growthEvent.burstCost,
    }) : null,
    currentTechnologyBuildId: snapshot.currentTechnologyBuild?.id as BuildableTechnologyId | undefined ?? null,
    deployedTechnologies: Object.freeze([...engine.infrastructure.deployedTechnologies]),
    technologyOptions: technologyObservations(engine),
    nodes: nodeObservations(engine),
  });
}

function diagnosisObservation(engine: GameEngine): BalanceDiagnosisObservation {
  const snapshot = engine.snapshot;
  const topology = V1ServiceTopologyFactory.create(engine.infrastructure, activeFeatures(engine));
  const service = OperationalViewProjector.project(snapshot, engine.developer, topology);
  const bottleneck = copiedBottleneck(service.health.bottleneck);
  return Object.freeze({
    topBottleneck: bottleneck,
    text: bottleneck
      ? OperationalViewProjector.diagnosisText(bottleneck.nodeId, snapshot, engine.developer, topology)
      : null,
  });
}

function projectedDiagnosisObservation(
  engine: GameEngine,
  feature: FeatureDefinition,
  load: LoadSnapshot,
): BalanceDiagnosisObservation {
  const snapshot = Object.freeze({ ...engine.snapshot, load });
  const topology = V1ServiceTopologyFactory.create(
    engine.infrastructure,
    [...activeFeatures(engine), feature],
  );
  const service = OperationalViewProjector.project(snapshot, engine.developer, topology);
  const bottleneck = copiedBottleneck(service.health.bottleneck);
  return Object.freeze({
    topBottleneck: bottleneck,
    text: bottleneck
      ? OperationalViewProjector.diagnosisText(bottleneck.nodeId, snapshot, engine.developer, topology)
      : null,
  });
}

function metricsReleasePreview(engine: GameEngine): MetricsReleasePreviewObservation | null {
  const feature = pendingFeatureDefinition(engine);
  if (!feature) return null;
  const load = engine.previewLoadWithFeature(feature);
  const resourceLoads = resourceObservationsFromLoad(load);
  return Object.freeze({
    resourceLoads,
    maxEffectivePercent: Math.max(0, ...resourceLoads.map(({ effectivePercent }) => effectivePercent)),
  });
}

function apmReleasePreview(engine: GameEngine): ApmReleasePreviewObservation | null {
  const feature = pendingFeatureDefinition(engine);
  if (!feature) return null;
  const load = engine.previewLoadWithFeature(feature);
  const resourceLoads = resourceObservationsFromLoad(load);
  return Object.freeze({
    resourceLoads,
    maxEffectivePercent: Math.max(0, ...resourceLoads.map(({ effectivePercent }) => effectivePercent)),
    diagnosis: projectedDiagnosisObservation(engine, feature, load),
  });
}

function oracleReleasePreview(engine: GameEngine): OracleReleasePreviewObservation | null {
  const feature = pendingFeatureDefinition(engine);
  if (!feature) return null;
  const load = engine.previewLoadWithFeature(feature);
  const resourceLoads = resourceObservationsFromLoad(load);
  return Object.freeze({
    resourceLoads,
    maxEffectivePercent: Math.max(0, ...resourceLoads.map(({ effectivePercent }) => effectivePercent)),
    diagnosis: projectedDiagnosisObservation(engine, feature, load),
    exactPressures: exactPressuresFromLoad(load),
  });
}

function freshTechnologyBuildDays(engine: GameEngine, id: BuildableTechnologyId): number {
  const technologyLevel = engine.developer.get(skillRef.technology(id)).level;
  return new TechnologyBuildTask(TECHNOLOGIES[id]).estimatedRemainingDays(
    technologyLevel,
    engine.incidents.developmentModifier,
  );
}

function technologyReadyForPendingRelease(engine: GameEngine, id: BuildableTechnologyId): boolean {
  const featureRemainingDays = engine.snapshot.currentFeature?.estimatedRemainingDays;
  return featureRemainingDays !== undefined
    && freshTechnologyBuildDays(engine, id) <= featureRemainingDays;
}

function createOraclePreviewPort(engine: GameEngine): OraclePreviewPort {
  return Object.freeze({
    previewTechnology: (id: BuildableTechnologyId) => engine.previewLoadWithTechnology(id),
    previewResize: (nodeId: InfrastructureNodeId, size: ServerSize) => (
      engine.previewLoadWithNodeResize(nodeId, size)
    ),
    previewScaleOut: (nodeId: InfrastructureNodeId) => engine.previewLoadWithNodeScaleOut(nodeId),
    previewReleaseAction: (action: SimulationAction) => {
      const feature = pendingFeatureDefinition(engine);
      if (!feature) throw new Error('No pending feature to preview');
      switch (action.type) {
        case 'RESIZE_NODE':
          return engine.previewLoadWithFeatureAndNodeResize(feature, action.nodeId, action.size);
        case 'SCALE_OUT_NODE':
          return engine.previewLoadWithFeatureAndNodeScaleOut(feature, action.nodeId);
        case 'START_TECHNOLOGY_BUILD':
          return technologyReadyForPendingRelease(engine, action.technologyId)
            ? engine.previewLoadWithFeatureAndTechnology(feature, action.technologyId)
            : engine.previewLoadWithFeature(feature);
        case 'NO_OP':
        case 'RESPOND_TRAFFIC_SPIKE':
          return engine.previewLoadWithFeature(feature);
      }
    },
    projectedMonthlyCost: (action: SimulationAction) => {
      const infrastructure = engine.infrastructure.clone();
      switch (action.type) {
        case 'RESIZE_NODE':
          infrastructure.resizeNode(action.nodeId, action.size);
          break;
        case 'SCALE_OUT_NODE':
          infrastructure.scaleOutNode(action.nodeId);
          break;
        case 'START_TECHNOLOGY_BUILD':
          infrastructure.deployTechnology(action.technologyId);
          break;
        case 'NO_OP':
        case 'RESPOND_TRAFFIC_SPIKE':
          break;
      }
      return infrastructure.monthlyCost;
    },
    technologyReadyForRelease: (id: BuildableTechnologyId) => technologyReadyForPendingRelease(engine, id),
  });
}

function playerLevelForCeiling(
  actual: PlayerObservationLevel,
  ceiling: Exclude<ObservationCeiling, 'ORACLE'>,
): PlayerObservationLevel {
  return PLAYER_LEVEL_ORDER[actual] <= PLAYER_LEVEL_ORDER[ceiling] ? actual : ceiling;
}

export function observeForStrategy(
  engine: GameEngine,
  ceiling: ObservationCeiling,
): BalanceObservation {
  const snapshot = engine.snapshot;
  const topology = V1ServiceTopologyFactory.create(engine.infrastructure, activeFeatures(engine));
  const service = OperationalViewProjector.project(snapshot, engine.developer, topology);

  if (ceiling === 'ORACLE') {
    const tags = new Set<FeatureTag>();
    for (const feature of activeFeatures(engine)) {
      for (const tag of feature.tags) tags.add(tag);
    }
    return Object.freeze({
      ...commonObservation(engine, 'ORACLE'),
      level: 'ORACLE' as const,
      resourceLoads: resourceObservations(engine),
      diagnosis: diagnosisObservation(engine),
      exactPressures: exactPressuresFromLoad(snapshot.load),
      workloadTags: Object.freeze([...tags].sort()),
      releasePreview: oracleReleasePreview(engine),
      previewPort: createOraclePreviewPort(engine),
    });
  }

  const level = playerLevelForCeiling(service.observability.level, ceiling);
  if (level === 'BASIC') {
    return Object.freeze({
      ...commonObservation(engine, 'BASIC'),
      level: 'BASIC' as const,
    });
  }
  if (level === 'METRICS') {
    return Object.freeze({
      ...commonObservation(engine, 'METRICS'),
      level: 'METRICS' as const,
      resourceLoads: resourceObservations(engine),
      releasePreview: metricsReleasePreview(engine),
    });
  }
  return Object.freeze({
    ...commonObservation(engine, 'APM'),
    level: 'APM' as const,
    resourceLoads: resourceObservations(engine),
    diagnosis: diagnosisObservation(engine),
    releasePreview: apmReleasePreview(engine),
  });
}