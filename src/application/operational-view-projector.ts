import {
  DeveloperProfile,
  GameSnapshot,
  nodeLoad,
  operationalPressuresForNode,
  primaryOperationalPressure,
  primaryOperationalPressureForNode,
  ServiceTopology,
} from '../core';
import type { InfrastructureNodeKind, NodeLoadSnapshot, NodeResourceKind } from '../core';
import { LoadMetricView, ObservabilityView, ServiceHealthView, ServiceOperationsView } from './game-view';
import {
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

function metric(id: string, nodeId: string | null, label: string, ratio: number): LoadMetricView {
  const tone = ratio > 1 ? 'overload' : ratio >= 0.9 ? 'critical' : ratio >= 0.7 ? 'busy' : 'stable';
  return { id, nodeId, label, percent: percent(ratio), tone };
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
  const pressure = primaryOperationalPressure(load, { nodeIds: playerOwnedTopologyNodeIds(topology) });
  const bottleneckRatio = pressure?.ratio ?? 0;
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
  return ['현재 병목 노드 Size-up 검토', '연결된 요청 경로 확인', '관련 기술 숙련도와 구조 검토'];
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
  const primary = primaryOperationalPressureForNode(snapshot.load, nodeId);
  if (!primary) throw new Error(`Missing operational pressure for topology node: ${nodeId}`);

  const load = snapshot.load;
  const primaryLabel = operationalPressureLabel(topology, primary);
  const trafficMultiplier = Math.max(1, snapshot.growthEvent?.trafficMultiplier ?? 1);
  const suggestions = recommendationsFor(primary.nodeKind, primary.resourceKind);
  const signals: string[] = [`${primaryLabel} ${percent(primary.ratio)}%`];
  if (trafficMultiplier > 1) signals.push(`Traffic ×${trafficMultiplier.toFixed(1)}`);
  if (snapshot.techDebt.value >= 40) signals.push(`Tech Debt ${snapshot.techDebt.value}/100`);
  if (load.failureRate >= 0.01) signals.push(`Request Failure ${percent(load.failureRate)}%`);

  let likelyCause = primary.ratio > 1
    ? `${primaryLabel} Capacity 초과가 가장 강한 신호입니다.`
    : primary.ratio >= 0.85
      ? `${primaryLabel}가 Critical 구간에 근접해 있습니다.`
      : `${primaryLabel}만으로는 과부하 원인이 확정되지 않습니다.`;

  if (trafficMultiplier > 1 && primary.ratio >= 0.85) {
    likelyCause = `Traffic Spike가 ${primaryLabel} 병목을 드러낸 가능성이 높습니다.`;
  } else if (snapshot.techDebt.value >= 60 && primary.nodeKind === 'SERVER_GROUP') {
    likelyCause = `높은 Tech Debt와 ${primaryLabel} 압력이 함께 장애 위험을 높였습니다.`;
  } else if (load.failureRate >= 0.1) {
    likelyCause = `요청 실패율이 높습니다. ${primaryLabel}와 Request Flow를 함께 확인해야 합니다.`;
  }

  return {
    primarySignal: primaryLabel,
    primaryRatio: primary.ratio,
    likelyCause,
    signals,
    suggestions,
  };
}

function basicMetrics(snapshot: GameSnapshot, topology: ServiceTopology): readonly LoadMetricView[] {
  return playerOwnedTopologyNodes(topology).map((node) => {
    const load = requiredNodeLoad(snapshot.load, node.id);
    return metric(`${node.id}:load`, node.id, operationalNodeLabel(topology, node.id), load.loadRatio);
  });
}

function resourceMetrics(snapshot: GameSnapshot, topology: ServiceTopology): readonly LoadMetricView[] {
  return playerOwnedTopologyNodes(topology).flatMap((node) => {
    const load = requiredNodeLoad(snapshot.load, node.id);
    const nodeLabel = operationalNodeLabel(topology, node.id);
    return operationalPressuresForNode(snapshot.load, node.id).map((pressure) => metric(
      `${node.id}:${pressure.resourceKind}`,
      node.id,
      `${nodeLabel} ${resourceLabel(pressure.resourceKind)}`,
      pressure.ratio,
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
    const bottleneckPercent = health.bottleneck?.percent ?? 0;

    return {
      observability,
      health,
      summary: {
        headline: observability.level === 'BASIC'
          ? `LOAD ${bottleneckPercent}%`
          : `P95 ${health.p95LatencyMs.toLocaleString()}ms`,
        detail: observability.level === 'APM'
          ? `TOP BOTTLENECK · ${health.bottleneck?.label ?? 'NONE'} ${bottleneckPercent}% · 요청 경로와 출시 영향까지 추적 가능합니다.`
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
      return `SIGNAL · ${diagnosis.primarySignal} ${percent(diagnosis.primaryRatio)}% · APM에서 Traffic / Tech Debt / Request Failure 상관관계 분석이 해금됩니다.`;
    }
    return `${diagnosis.likelyCause} · SIGNALS ${diagnosis.signals.join(' / ')} · OPTIONS ${diagnosis.suggestions.slice(0, 3).join(' / ')}`;
  }
}
