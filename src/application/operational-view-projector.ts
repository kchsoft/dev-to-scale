import {
  DeveloperProfile,
  GameSnapshot,
  nodeLoad,
  operationalPressuresForNode,
  primaryOperationalPressure,
  primaryOperationalPressureForNode,
  ServiceTopology,
} from '../core';
import type { InfrastructureNodeKind, NodeLoadSnapshot, NodeResourceKind, OperationalPressure } from '../core';
import { LoadMetricView, ObservabilityView, ServiceHealthView, ServiceOperationsView } from './game-view';
import {
  capacityFailurePercent,
  capacityStatus,
  hardLimitPercent,
  operationalLoadTone,
  operationalNodeLabel,
  operationalPressureLabel,
  playerOwnedTopologyNodeIds,
  playerOwnedTopologyNodes,
  resourceLabel,
  toBottleneckView,
} from './operational-pressure-presenter';

function percent(value: number): number {
  return Math.max(0, Math.round(value * 100));
}

function metricFromPressure(
  id: string,
  nodeId: string | null,
  label: string,
  pressure: OperationalPressure,
): LoadMetricView {
  return {
    id,
    nodeId,
    label,
    percent: percent(pressure.nominalRatio),
    effectivePercent: percent(pressure.effectiveRatio),
    hardLimitPercent: hardLimitPercent(pressure),
    capacityFailurePercent: capacityFailurePercent(pressure.effectiveRatio),
    status: capacityStatus(pressure.nominalRatio, pressure.effectiveRatio),
    tone: operationalLoadTone(pressure.nominalRatio, pressure.effectiveRatio),
  };
}

function emptyMetric(id: string, nodeId: string, label: string): LoadMetricView {
  return {
    id,
    nodeId,
    label,
    percent: 0,
    effectivePercent: 0,
    hardLimitPercent: 0,
    capacityFailurePercent: 0,
    status: 'NORMAL',
    tone: 'stable',
  };
}

function requiredNodeLoad(load: GameSnapshot['load'], nodeId: string): NodeLoadSnapshot {
  const node = nodeLoad(load, nodeId);
  if (!node) throw new Error(`Missing load for topology node: ${nodeId}`);
  return node;
}

function latencyFromPressure(maxRatio: number, failureRate: number): number {
  let latency: number;
  if (maxRatio <= 0.5) latency = 110 + maxRatio * 80;
  else if (maxRatio <= 0.7) latency = 150 + (maxRatio - 0.5) * 250;
  else if (maxRatio <= 0.9) latency = 200 + (maxRatio - 0.7) * 900;
  else if (maxRatio <= 1) latency = 380 + (maxRatio - 0.9) * 2_200;
  else latency = 600 + Math.min(2_400, (maxRatio - 1) * 5_000);

  latency += failureRate * 1_500;
  return Math.round(Math.max(100, Math.min(4_500, latency)));
}

function projectHealth(
  load: GameSnapshot['load'],
  topology: ServiceTopology,
): ServiceHealthView {
  const pressure = primaryOperationalPressure(load, {
    nodeIds: playerOwnedTopologyNodeIds(topology),
    basis: 'EFFECTIVE',
  });
  const bottleneckRatio = pressure?.effectiveRatio ?? 0;
  const p95LatencyMs = latencyFromPressure(bottleneckRatio, load.failureRate);
  const status = load.failureRate >= 0.1 || bottleneckRatio > 1.1 || p95LatencyMs >= 1_500
    ? 'CRITICAL'
    : load.failureRate >= 0.01 || bottleneckRatio >= 0.85 || p95LatencyMs >= 500
      ? 'DEGRADED'
      : 'HEALTHY';

  return {
    status,
    p95LatencyMs,
    bottleneck: pressure ? toBottleneckView(topology, pressure) : null,
  };
}

function projectObservability(developer: DeveloperProfile): ObservabilityView {
  const osRuntime = developer.get({ category: 'fundamental', id: 'OS_RUNTIME' }).level;
  const network = developer.get({ category: 'fundamental', id: 'NETWORK' }).level;
  const softwareDesign = developer.get({ category: 'fundamental', id: 'SOFTWARE_DESIGN' }).level;

  if (osRuntime >= 3 && network >= 2 && softwareDesign >= 2) {
    return {
      level: 'APM', label: 'APM', nextUnlock: null,
      showsResourceSignature: true, tracesRequests: true,
    };
  }
  if (osRuntime >= 2) {
    return {
      level: 'METRICS', label: 'CPU / I/O METRICS',
      nextUnlock: 'APM: OS & Runtime Lv.3 + Network Lv.2 + Software Design Lv.2',
      showsResourceSignature: true, tracesRequests: false,
    };
  }
  return {
    level: 'BASIC', label: 'BASIC HEALTH', nextUnlock: 'Metrics: OS & Runtime Lv.2',
    showsResourceSignature: false, tracesRequests: false,
  };
}

interface Diagnosis {
  primarySignal: string;
  primaryRatio: number;
  primaryDisplayPercent: number;
  primaryHardLimitPercent: number;
  likelyCause: string;
  signals: readonly string[];
  suggestions: readonly string[];
}

function recommendationsFor(
  nodeKind: InfrastructureNodeKind,
  resourceKind: NodeResourceKind,
): readonly string[] {
  if (nodeKind === 'SERVER_GROUP') {
    return resourceKind === 'CPU'
      ? ['APP Scale-up', 'ALB + Scale-out', '개발자 숙련도 향상']
      : ['ALB + Scale-out', 'Queue로 비동기 I/O 분리', '요청량 급증 여부 확인'];
  }
  if (nodeKind === 'DATABASE') {
    return resourceKind === 'IO'
      ? ['Redis로 Read I/O 절감', 'Read Replica 추가', 'DB Size-up']
      : ['DB Size-up', 'Replica로 Query 분산', 'DB 숙련도 향상'];
  }
  if (nodeKind === 'CACHE') {
    return ['Redis Size-up', 'Cache workload 확인', 'DB fallback pressure 확인'];
  }
  if (nodeKind === 'LOAD_BALANCER') {
    return ['ALB Size-up', 'Entry traffic 확인', 'APP downstream 상태 확인'];
  }
  if (nodeKind === 'QUEUE') {
    return ['Queue Capacity 상향', '상위 Queue 기술 검토', 'Event-heavy 기능 부하 확인'];
  }
  if (nodeKind === 'OBJECT_STORAGE') {
    return ['Storage Capacity 상향', '이미지/파일 기능 부하 확인', 'Storage 기술 선택 검토'];
  }
  return ['Capacity 조정', '트래픽·워크로드 확인', 'downstream 상태 확인'];
}

function diagnose(
  nodeId: string,
  snapshot: GameSnapshot,
  topology: ServiceTopology,
): Diagnosis {
  const topologyNode = topology.graph.node(nodeId);
  if (!topologyNode || topologyNode.kind === 'EXTERNAL_SERVICE') {
    throw new Error(`Missing player-owned topology node: ${nodeId}`);
  }
  const primary = primaryOperationalPressureForNode(snapshot.load, nodeId, 'EFFECTIVE');
  if (!primary) throw new Error(`Missing operational pressure for topology node: ${nodeId}`);

  const load = snapshot.load;
  const primaryLabel = operationalPressureLabel(topology, primary);
  const trafficMultiplier = Math.max(1, snapshot.growthEvent?.trafficMultiplier ?? 1);
  const suggestions = recommendationsFor(primary.nodeKind, primary.resourceKind);
  const primaryDisplayPercent = percent(primary.nominalRatio);
  const primaryHardLimitPercent = hardLimitPercent(primary);
  const signals: string[] = [`${primaryLabel} ${primaryDisplayPercent}% · HARD ${primaryHardLimitPercent}%`];
  if (trafficMultiplier > 1) signals.push(`Traffic ×${trafficMultiplier.toFixed(1)}`);
  if (snapshot.techDebt.value >= 40) signals.push(`Tech Debt ${snapshot.techDebt.value}/100`);
  if (load.failureRate >= 0.01) signals.push(`Request Failure ${percent(load.failureRate)}%`);

  let likelyCause = primary.effectiveRatio > 1
    ? `${primaryLabel} Hard Limit 초과가 가장 강한 신호입니다.`
    : primary.effectiveRatio >= 0.85
      ? `${primaryLabel}가 실제 처리 한계에 근접해 있습니다.`
      : `${primaryLabel}만으로는 과부하 원인이 확정되지 않습니다.`;

  if (trafficMultiplier > 1 && primary.effectiveRatio >= 0.85) {
    likelyCause = `Traffic Spike가 ${primaryLabel} 병목을 드러낸 가능성이 높습니다.`;
  } else if (snapshot.techDebt.value >= 60 && primary.nodeKind === 'SERVER_GROUP') {
    likelyCause = `높은 Tech Debt와 ${primaryLabel} 압력이 함께 장애 위험을 높였습니다.`;
  } else if (load.failureRate >= 0.1) {
    likelyCause = `요청 실패율이 높습니다. ${primaryLabel}와 Request Flow를 함께 확인해야 합니다.`;
  }

  return {
    primarySignal: primaryLabel,
    primaryRatio: primary.effectiveRatio,
    primaryDisplayPercent,
    primaryHardLimitPercent,
    likelyCause,
    signals,
    suggestions,
  };
}

function basicMetrics(snapshot: GameSnapshot, topology: ServiceTopology): readonly LoadMetricView[] {
  return playerOwnedTopologyNodes(topology).map((node) => {
    requiredNodeLoad(snapshot.load, node.id);
    const nominal = primaryOperationalPressureForNode(snapshot.load, node.id, 'NOMINAL');
    const effective = primaryOperationalPressureForNode(snapshot.load, node.id, 'EFFECTIVE');
    const label = operationalNodeLabel(topology, node.id);
    if (!nominal || !effective) return emptyMetric(`${node.id}:load`, node.id, label);

    return {
      id: `${node.id}:load`,
      nodeId: node.id,
      label,
      percent: percent(nominal.nominalRatio),
      effectivePercent: percent(effective.effectiveRatio),
      hardLimitPercent: hardLimitPercent(nominal),
      capacityFailurePercent: capacityFailurePercent(effective.effectiveRatio),
      status: capacityStatus(nominal.nominalRatio, effective.effectiveRatio),
      tone: operationalLoadTone(nominal.nominalRatio, effective.effectiveRatio),
    };
  });
}

function resourceMetrics(snapshot: GameSnapshot, topology: ServiceTopology): readonly LoadMetricView[] {
  return playerOwnedTopologyNodes(topology).flatMap((node) => {
    requiredNodeLoad(snapshot.load, node.id);
    const nodeLabel = operationalNodeLabel(topology, node.id);
    return operationalPressuresForNode(snapshot.load, node.id).map((pressure) => metricFromPressure(
      `${node.id}:${pressure.resourceKind}`,
      node.id,
      `${nodeLabel} ${resourceLabel(pressure.resourceKind)}`,
      pressure,
    ));
  });
}

export class OperationalViewProjector {
  static project(
    snapshot: GameSnapshot,
    developer: DeveloperProfile,
    topology: ServiceTopology,
  ): ServiceOperationsView {
    const observability = projectObservability(developer);
    const health = projectHealth(snapshot.load, topology);
    const visibleLoads = observability.level === 'BASIC'
      ? basicMetrics(snapshot, topology)
      : resourceMetrics(snapshot, topology);
    const primaryPercent = Math.max(0, ...visibleLoads.map(({ percent: loadPercent }) => loadPercent));

    return {
      observability,
      health,
      summary: {
        headline: observability.level === 'BASIC'
          ? `LOAD ${primaryPercent}%`
          : `P95 ${health.p95LatencyMs.toLocaleString()}ms`,
        detail: observability.level === 'APM'
          ? `TOP BOTTLENECK · ${health.bottleneck?.label ?? 'NONE'} ${health.bottleneck?.percent ?? 0}% · 요청 경로와 출시 영향까지 추적 가능합니다.`
          : observability.level === 'METRICS'
            ? `노드별 자원 Metrics와 P95가 해금되었습니다. ${observability.nextUnlock}`
            : `현재는 노드별 전체 Load만 보입니다. ${observability.nextUnlock}`,
      },
      visibleLoads,
      failurePercent: percent(snapshot.load.failureRate),
    };
  }

  static diagnosisText(
    nodeId: string,
    snapshot: GameSnapshot,
    developer: DeveloperProfile,
    topology: ServiceTopology,
  ): string {
    const observability = projectObservability(developer);
    if (observability.level === 'BASIC') {
      return 'DIAGNOSIS LOCKED · METRICS에서 노드별 자원 신호를 확인할 수 있습니다.';
    }

    const diagnosis = diagnose(nodeId, snapshot, topology);
    if (observability.level === 'METRICS') {
      return `SIGNAL · ${diagnosis.primarySignal} ${diagnosis.primaryDisplayPercent}% · HARD ${diagnosis.primaryHardLimitPercent}% · APM에서 Traffic / Tech Debt / Request Failure 상관관계 분석이 해금됩니다.`;
    }
    return `${diagnosis.likelyCause} · SIGNALS ${diagnosis.signals.join(' / ')} · OPTIONS ${diagnosis.suggestions.slice(0, 3).join(' / ')}`;
  }
}
