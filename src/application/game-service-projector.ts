import {
  AppCluster,
  COMMUNITY_BOOTSTRAP,
  COMMUNITY_FEATURES,
  DatabaseCluster,
  GameEngine,
  GameSnapshot,
  InfrastructureNodeKind,
  LoadSnapshot,
  NodeResourceKind,
  maxNodeLoad,
  maxResourceLoad,
  ServerSize,
  ServiceTopology,
  V1_MODULE_ID,
  V1ServiceTopologyFactory,
} from '../core';
import {
  AlertView,
  InfrastructureCostView,
  NodeScalingView,
  ObservabilityView,
  ServiceOperationsView,
  TopologyView,
} from './game-view';
import type { GameFinancialProjection } from './game-overview-projector';
import { OperationalNodeSelection, OperationalViewProjector } from './operational-view-projector';
import { presentationCatalog } from './presentation-catalog';
import { TopologyViewProjector } from './topology-view-projector';

const SERVER_SIZES: readonly ServerSize[] = [ServerSize.SMALL, ServerSize.MEDIUM, ServerSize.LARGE, ServerSize.XLARGE];

function percent(value: number): number {
  return Math.max(0, Math.round(value * 100));
}

function pressure(
  load: LoadSnapshot,
  nodeKind: InfrastructureNodeKind,
  resourceKind?: NodeResourceKind,
): { readonly ratio: number; readonly nodeId?: string } {
  const match = resourceKind
    ? maxResourceLoad(load, { nodeKind, resourceKind })
    : maxNodeLoad(load, { nodeKind });
  if (!match) return { ratio: 0 };
  return 'resource' in match
    ? { ratio: match.resource.ratio, nodeId: match.node.nodeId }
    : { ratio: match.loadRatio, nodeId: match.nodeId };
}

export interface FeatureImpactPreview {
  readonly summary: string;
  readonly tone: AlertView['tone'];
  readonly nodeId?: string;
}

export interface GameServiceProjection {
  readonly alerts: readonly AlertView[];
  readonly topology: TopologyView;
  readonly infrastructureCosts: InfrastructureCostView;
  readonly service: ServiceOperationsView;
}

function requiredV1Deployment(topology: ServiceTopology) {
  const deployment = topology.deployment(V1_MODULE_ID);
  if (!deployment) throw new Error(`Missing required module deployment: ${V1_MODULE_ID}`);
  return deployment;
}

function requiredTopologyBinding(
  topology: ServiceTopology,
  role: 'ENTRY_APP' | 'PRIMARY_DATABASE' | 'OBJECT_STORAGE',
): string {
  const nodeId = requiredV1Deployment(topology).bindingFor(role);
  if (!nodeId) throw new Error(`Missing required topology binding: ${role}`);
  return nodeId;
}

function operationalNodeSelection(topology: ServiceTopology): OperationalNodeSelection {
  const deployment = requiredV1Deployment(topology);
  return {
    appNodeId: requiredTopologyBinding(topology, 'ENTRY_APP'),
    databaseNodeId: requiredTopologyBinding(topology, 'PRIMARY_DATABASE'),
    queueNodeId: deployment.bindingFor('EVENT_BUS') ?? null,
    storageNodeId: requiredTopologyBinding(topology, 'OBJECT_STORAGE'),
  };
}

export class GameServiceProjector {
  readonly #engine: GameEngine;

  constructor(engine: GameEngine) {
    this.#engine = engine;
  }

  project(snapshot: GameSnapshot, financials: GameFinancialProjection): GameServiceProjection {
    const topology = this.serviceTopology(snapshot);
    const service = OperationalViewProjector.project(
      snapshot,
      this.#engine.developer,
      operationalNodeSelection(topology),
    );
    return {
      alerts: this.alerts(snapshot, financials.monthlyProfit, service.observability),
      topology: this.topology(snapshot, topology),
      infrastructureCosts: this.infrastructureCostView(),
      service,
    };
  }

  featureImpact(featureId: string): FeatureImpactPreview | null {
    const snapshot = this.#engine.snapshot;
    return this.featureImpactFor(snapshot, featureId);
  }

  private serviceTopology(snapshot: GameSnapshot): ServiceTopology {
    const activeFeatureDefinitions = snapshot.launched
      ? [
          COMMUNITY_BOOTSTRAP,
          ...snapshot.completedFeatures.flatMap((featureId) => {
            const feature = COMMUNITY_FEATURES[featureId as keyof typeof COMMUNITY_FEATURES];
            return feature ? [feature] : [];
          }),
        ]
      : [];
    return V1ServiceTopologyFactory.create(this.#engine.infrastructure, activeFeatureDefinitions);
  }

  private topology(snapshot: GameSnapshot, topology: ServiceTopology): TopologyView {
    return TopologyViewProjector.project({
      graph: topology.graph,
      nodeLoads: snapshot.load.nodeLoads,
      traces: snapshot.load.requestTraces,
      incidents: snapshot.incidents,
      dau: snapshot.dau,
      scalingByNode: this.scalingByNode(topology),
    });
  }

  private scalingByNode(topology: ServiceTopology): ReadonlyMap<string, NodeScalingView> {
    const infrastructure = this.#engine.infrastructure;
    const scaling = new Map<string, NodeScalingView>();

    for (const node of topology.graph.nodes) {
      if (node.kind === 'EXTERNAL_SERVICE') continue;

      const currentSize = infrastructure.nodeSize(node.id);
      const sizeOptions = SERVER_SIZES.map((size) => {
        const candidate = infrastructure.clone();
        candidate.resizeNode(node.id, size);
        return Object.freeze({
          size: size as NodeScalingView['currentSize'],
          capacity: Object.freeze({ ...candidate.nodeCapacity(node.id) }),
          monthlyCost: candidate.nodeMonthlyCost(node.id),
        });
      });

      const horizontal = infrastructure.horizontalScale(node.id);
      let scaleOut: NodeScalingView['scaleOut'] = null;
      if (horizontal) {
        let monthlyCostDelta: number | null = null;
        if (horizontal.available) {
          const candidate = infrastructure.clone();
          const before = candidate.nodeMonthlyCost(node.id);
          candidate.scaleOutNode(node.id);
          monthlyCostDelta = candidate.nodeMonthlyCost(node.id) - before;
        }
        scaleOut = Object.freeze({
          kind: horizontal.kind,
          count: horizontal.count,
          maxCount: horizontal.maxCount,
          monthlyCostDelta,
          available: horizontal.available,
          reason: horizontal.reason,
        });
      }

      scaling.set(node.id, Object.freeze({
        currentSize: currentSize as NodeScalingView['currentSize'],
        sizeOptions: Object.freeze(sizeOptions),
        scaleOut,
      }));
    }

    return scaling;
  }

  private alerts(snapshot: GameSnapshot, profit: number, observability: ObservabilityView): AlertView[] {
    const alerts: AlertView[] = [];

    if (snapshot.growthEvent?.type === 'VIRAL') {
      const event = snapshot.growthEvent;
      const responseText = event.response === 'PENDING'
        ? '대응 선택 대기'
        : event.response === 'THROTTLE'
          ? `TRAFFIC LIMIT · 유효 부하 ×${event.loadMultiplier.toFixed(2)} · 성장 +${percent(event.growthModifier)}%p`
          : event.response === 'BURST'
            ? `EMERGENCY BURST · 유효 부하 ×${event.loadMultiplier.toFixed(2)} · 성장 +${percent(event.growthModifier)}%p`
            : `RIDE THE WAVE · 유효 부하 ×${event.loadMultiplier.toFixed(1)} · 성장 +${percent(event.growthModifier)}%p`;
      alerts.push({
        id: 'viral-traffic',
        tone: event.response === 'THROTTLE' ? 'info' : 'warning',
        title: `Viral Traffic ×${event.trafficMultiplier.toFixed(1)}`,
        detail: `${event.remainingDays}일 남음 · ${responseText}`,
      });
    }

    if (snapshot.techDebt.refactoring) {
      alerts.push({
        id: 'tech-debt-refactor',
        tone: 'info',
        title: `Refactoring · ${snapshot.techDebt.remainingRefactorDays}일`,
        detail: '기능 개발은 잠시 멈추지만 완료 시 Tech Debt가 30 감소합니다.',
      });
    } else if (snapshot.techDebt.value >= 20) {
      alerts.push({
        id: 'tech-debt',
        tone: snapshot.techDebt.value >= 60 ? 'danger' : 'warning',
        title: `Tech Debt ${snapshot.techDebt.value}/100`,
        detail: `Feature 개발 효율 ${percent(snapshot.techDebt.developmentModifier)}% · 장애 위험 ×${snapshot.techDebt.incidentRiskMultiplier.toFixed(2)}`,
      });
    }

    if (snapshot.currentFeature && snapshot.currentFeature.id !== COMMUNITY_BOOTSTRAP.id) {
      const impact = this.featureImpactFor(snapshot, snapshot.currentFeature.id);
      if (impact) {
        alerts.push({
          id: `feature-impact-${snapshot.currentFeature.id}`,
          tone: impact.tone,
          title: `출시 영향 · ${presentationCatalog.label(snapshot.currentFeature.id)}`,
          detail: impact.summary,
          nodeId: impact.nodeId,
        });
      }
    }

    const ratios: Array<[string, { ratio: number; nodeId?: string }]> = [
      ['Application', pressure(snapshot.load, 'SERVER_GROUP')],
      ['Database', pressure(snapshot.load, 'DATABASE')],
      ['Async', pressure(snapshot.load, 'QUEUE', 'THROUGHPUT')],
      ['Storage', pressure(snapshot.load, 'OBJECT_STORAGE', 'STORAGE')],
    ];
    for (const [name, loadPressure] of ratios) {
      const { ratio, nodeId } = loadPressure;
      if (ratio >= 0.9) {
        const overloadPenalty = ratio > 1 ? Math.min(30, Math.round((ratio - 1) * 100)) : 0;
        alerts.push({
          id: `load-${name}`,
          tone: ratio > 1 ? 'danger' : 'warning',
          title: `${name} Load ${percent(ratio)}%`,
          detail: ratio > 1
            ? `Capacity ${Math.round((ratio - 1) * 100)}% 초과 · 다음 날 DAU 최대 -${overloadPenalty}% 압력`
            : 'Critical 구간 · Scale 검토 필요',
          nodeId,
        });
      }
    }
    if (snapshot.load.failureRate > 0.001) {
      const failed = snapshot.load.requestTraces.filter((trace) => trace.successRatio < 0.999);
      const firstFailure = failed.find((trace) => trace.failureNodeId)?.failureNodeId ?? null;
      alerts.push({
        id: 'request-failure',
        tone: 'danger',
        title: `Request Failure ${percent(snapshot.load.failureRate)}%`,
        detail: failed.length > 0
          ? `${failed.slice(0, 2).map((trace) => presentationCatalog.label(trace.workloadId)).join(', ')} 요청 경로 확인 필요`
          : '요청 처리 성공률이 낮습니다.',
        nodeId: firstFailure ?? undefined,
      });
    }
    for (const incident of snapshot.incidents) {
      alerts.push({
        id: incident.id,
        tone: incident.severity === 'MINOR' ? 'warning' : 'danger',
        title: `${incident.severity} · ${presentationCatalog.label(incident.nodeId.split(':').pop() ?? incident.nodeId)}`,
        detail: incident.remainingResponseDays === null ? '대응 대기 중' : `복구 ${incident.elapsedResponseDays ?? 0}/${incident.totalResponseDays ?? 0}일`,
        nodeId: incident.nodeId,
      });
    }
    if (profit < 0) {
      alerts.push({ id: 'profit', tone: 'warning', title: '월 예상 순이익 적자', detail: `현재 조건 기준 ${Math.abs(profit).toLocaleString()}원 적자` });
    }
    if (!snapshot.launched) {
      alerts.push({ id: 'bootstrap', tone: 'info', title: 'Bootstrap 개발 중', detail: '완료되면 DAU 80으로 서비스가 공개됩니다.' });
    }
    if (alerts.length === 0) {
      alerts.push({ id: 'stable', tone: 'good', title: '서비스 안정', detail: '현재 즉시 확인할 경고가 없습니다.' });
    }
    return alerts.slice(0, 6).map((alert) => {
      if (!alert.id.startsWith('feature-impact-') || observability.level === 'APM') return alert;
      return {
        ...alert,
        tone: 'info',
        detail: observability.level === 'METRICS'
          ? '새 기능이 자원 사용량을 높입니다. APM 해금 시 축별 출시 영향과 예상 병목을 확인할 수 있습니다.'
          : '새 기능이 서비스 부하를 높일 수 있습니다. Metrics/APM을 해금하면 출시 영향을 더 정확히 볼 수 있습니다.',
        nodeId: undefined,
      };
    });
  }

  private featureImpactFor(snapshot: GameSnapshot, featureId: string): FeatureImpactPreview | null {
    const feature = COMMUNITY_FEATURES[featureId as keyof typeof COMMUNITY_FEATURES];
    if (!feature || !snapshot.launched) return null;
    const projected = this.#engine.previewLoadWithFeature(feature);
    const axes = [
      { label: 'APP CPU', before: pressure(snapshot.load, 'SERVER_GROUP', 'CPU'), after: pressure(projected, 'SERVER_GROUP', 'CPU') },
      { label: 'APP I/O', before: pressure(snapshot.load, 'SERVER_GROUP', 'IO'), after: pressure(projected, 'SERVER_GROUP', 'IO') },
      { label: 'DB CPU', before: pressure(snapshot.load, 'DATABASE', 'CPU'), after: pressure(projected, 'DATABASE', 'CPU') },
      { label: 'DB I/O', before: pressure(snapshot.load, 'DATABASE', 'IO'), after: pressure(projected, 'DATABASE', 'IO') },
      { label: 'ASYNC', before: pressure(snapshot.load, 'QUEUE', 'THROUGHPUT'), after: pressure(projected, 'QUEUE', 'THROUGHPUT') },
      { label: 'STORAGE', before: pressure(snapshot.load, 'OBJECT_STORAGE', 'STORAGE'), after: pressure(projected, 'OBJECT_STORAGE', 'STORAGE') },
    ];
    const top = [...axes].sort((left, right) => right.after.ratio - left.after.ratio)[0];
    const changes = [...axes]
      .sort((left, right) => (right.after.ratio - right.before.ratio) - (left.after.ratio - left.before.ratio))
      .slice(0, 2)
      .map((axis) => `${axis.label} ${percent(axis.before.ratio)}→${percent(axis.after.ratio)}%`);
    const failureIncrease = projected.failureRate - snapshot.load.failureRate;
    if (failureIncrease > 0.001) {
      changes.push(`FAIL ${percent(snapshot.load.failureRate)}→${percent(projected.failureRate)}%`);
    }
    const suffix = projected.failureRate >= 0.1
      ? ' · ⚠ 필수 요청 경로 확인 필요'
      : top.after.ratio > 1
        ? ` · ⚠ ${top.label} OVERLOAD 예상`
        : top.after.ratio >= 0.9
          ? ` · △ ${top.label} Critical 근접`
          : ' · 현재 Capacity 안쪽';
    return {
      summary: `${changes.join(' · ')}${suffix}`,
      tone: projected.failureRate >= 0.1 || top.after.ratio > 1 ? 'danger' : top.after.ratio >= 0.9 ? 'warning' : 'info',
      nodeId: top.after.nodeId ?? top.before.nodeId,
    };
  }

  /** @deprecated Kept until the old APP/DB inspector call sites are migrated. */
  private infrastructureCostView(): InfrastructureCostView {
    const currentApp = this.#engine.infrastructure.app;
    const currentDb = this.#engine.infrastructure.database;
    const hasAlb = this.#engine.infrastructure.hasTechnology('ALB');

    const appSizeMonthlyCosts = {} as Record<ServerSize, number>;
    const dbSizeMonthlyCosts = {} as Record<ServerSize, number>;
    for (const size of SERVER_SIZES) {
      appSizeMonthlyCosts[size] = new AppCluster(
        this.#engine.config.frameworkId,
        size,
        currentApp.count,
        hasAlb,
      ).monthlyCost;
      dbSizeMonthlyCosts[size] = new DatabaseCluster(
        this.#engine.config.databaseId,
        size,
        currentDb.replicaCount,
      ).monthlyCost;
    }

    let addAppServerMonthlyCostDelta: number | null = null;
    if (hasAlb && currentApp.count < 10) {
      const expanded = new AppCluster(
        this.#engine.config.frameworkId,
        currentApp.size,
        currentApp.count,
        true,
      );
      expanded.addServer();
      addAppServerMonthlyCostDelta = expanded.monthlyCost - currentApp.monthlyCost;
    }

    let addDbReplicaMonthlyCostDelta: number | null = null;
    if (currentDb.replicaCount < 3) {
      const expanded = new DatabaseCluster(
        this.#engine.config.databaseId,
        currentDb.size,
        currentDb.replicaCount,
      );
      expanded.addReplica();
      addDbReplicaMonthlyCostDelta = expanded.monthlyCost - currentDb.monthlyCost;
    }

    return {
      appSizeMonthlyCosts,
      dbSizeMonthlyCosts,
      addAppServerMonthlyCostDelta,
      addDbReplicaMonthlyCostDelta,
    };
  }
}
