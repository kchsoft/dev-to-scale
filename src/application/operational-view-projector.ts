import {
  DeveloperProfile,
  GameSnapshot,
  nodeLoad,
  resourceLoad,
} from '../core';
import type { NodeLoadSnapshot, NodeResourceKind } from '../core';
import { BottleneckView, LoadMetricView, ObservabilityView, ServiceHealthView, ServiceOperationsView } from './game-view';

const BOTTLENECK_LABELS: Record<BottleneckView, string> = {
  APP_CPU: 'APP CPU', APP_IO: 'APP I/O', DB_CPU: 'DB CPU', DB_IO: 'DB I/O',
  ASYNC: 'ASYNC QUEUE', STORAGE: 'STORAGE', NONE: 'NONE',
};

export interface OperationalNodeSelection {
  readonly appNodeId: string;
  readonly databaseNodeId: string;
  readonly queueNodeId: string | null;
  readonly storageNodeId: string;
}

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

function requiredResource(node: NodeLoadSnapshot, resourceKind: NodeResourceKind) {
  const resource = resourceLoad(node, resourceKind);
  if (!resource) throw new Error(`Missing ${resourceKind} resource load for topology node: ${node.nodeId}`);
  return resource;
}

interface BottleneckCandidate {
  readonly bottleneck: BottleneckView;
  readonly nodeId: string;
  readonly ratio: number;
}

function bottleneckCandidates(
  load: GameSnapshot['load'],
  selection: OperationalNodeSelection,
): readonly BottleneckCandidate[] {
  const app = requiredNodeLoad(load, selection.appNodeId);
  const database = requiredNodeLoad(load, selection.databaseNodeId);
  const storage = requiredNodeLoad(load, selection.storageNodeId);
  const queue = selection.queueNodeId === null ? null : requiredNodeLoad(load, selection.queueNodeId);
  return [
    { bottleneck: 'APP_CPU', nodeId: app.nodeId, ratio: requiredResource(app, 'CPU').ratio },
    { bottleneck: 'APP_IO', nodeId: app.nodeId, ratio: requiredResource(app, 'IO').ratio },
    { bottleneck: 'DB_CPU', nodeId: database.nodeId, ratio: requiredResource(database, 'CPU').ratio },
    { bottleneck: 'DB_IO', nodeId: database.nodeId, ratio: requiredResource(database, 'IO').ratio },
    ...(queue === null ? [] : [{ bottleneck: 'ASYNC' as const, nodeId: queue.nodeId, ratio: requiredResource(queue, 'THROUGHPUT').ratio }]),
    { bottleneck: 'STORAGE', nodeId: storage.nodeId, ratio: requiredResource(storage, 'STORAGE').ratio },
  ];
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

function projectHealth(load: GameSnapshot['load'], selection: OperationalNodeSelection): ServiceHealthView {
  let bottleneck: BottleneckView = 'NONE';
  let bottleneckRatio = 0;
  let bottleneckNodeId: string | null = null;
  for (const candidate of bottleneckCandidates(load, selection)) {
    if (candidate.ratio > bottleneckRatio) {
      bottleneck = candidate.bottleneck;
      bottleneckRatio = candidate.ratio;
      bottleneckNodeId = candidate.nodeId;
    }
  }

  const p95LatencyMs = latencyFromPressure(bottleneckRatio, load.failureRate);
  const status = load.failureRate >= 0.1 || bottleneckRatio > 1.1 || p95LatencyMs >= 1_500
    ? 'CRITICAL'
    : load.failureRate >= 0.01 || bottleneckRatio >= 0.85 || p95LatencyMs >= 500
      ? 'DEGRADED'
      : 'HEALTHY';
  return {
    status,
    p95LatencyMs,
    bottleneck,
    bottleneckLabel: BOTTLENECK_LABELS[bottleneck],
    bottleneckPercent: percent(bottleneckRatio),
    bottleneckNodeId,
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

function strongest(candidates: readonly { label: string; ratio: number }[]): { label: string; ratio: number } {
  let strongest = candidates[0];
  for (const candidate of candidates.slice(1)) {
    if (candidate.ratio > strongest.ratio) strongest = candidate;
  }
  return strongest;
}

function diagnose(nodeId: string, snapshot: GameSnapshot): Diagnosis {
  const node = nodeLoad(snapshot.load, nodeId);
  if (!node) throw new Error(`Missing load for topology node: ${nodeId}`);
  const load = snapshot.load;
  const trafficMultiplier = Math.max(1, snapshot.growthEvent?.trafficMultiplier ?? 1);
  let primary = {
    label: 'SERVICE LOAD',
    ratio: node.loadRatio,
  };
  let suggestions: string[] = ['현재 병목을 확인한 뒤 Capacity 또는 구조 변경'];

  if (node.nodeKind === 'SERVER_GROUP') {
    primary = strongest([
      { label: 'APP CPU', ratio: requiredResource(node, 'CPU').ratio },
      { label: 'APP I/O', ratio: requiredResource(node, 'IO').ratio },
    ]);
    suggestions = primary.label === 'APP CPU'
      ? ['APP Scale-up', 'ALB + Scale-out', '개발자 숙련도 향상']
      : ['ALB + Scale-out', 'Queue로 비동기 I/O 분리', '요청량 급증 여부 확인'];
  } else if (node.nodeKind === 'DATABASE') {
    primary = strongest([
      { label: 'DB CPU', ratio: requiredResource(node, 'CPU').ratio },
      { label: 'DB I/O', ratio: requiredResource(node, 'IO').ratio },
    ]);
    suggestions = primary.label === 'DB I/O'
      ? ['Redis로 Read I/O 절감', 'Read Replica 추가', 'DB Size-up']
      : ['DB Size-up', 'Replica로 Query 분산', 'DB 숙련도 향상'];
  } else if (node.nodeKind === 'CACHE') {
    primary = { label: 'DB I/O', ratio: requiredResource(node, 'THROUGHPUT').ratio };
    suggestions = ['Cache 의존도를 확인', 'DB Capacity 확보', '장애 복구 우선'];
  } else if (node.nodeKind === 'QUEUE') {
    primary = { label: 'ASYNC', ratio: requiredResource(node, 'THROUGHPUT').ratio };
    suggestions = ['Queue Capacity 상향', '상위 Queue 기술 검토', 'Event-heavy 기능 부하 확인'];
  } else if (node.nodeKind === 'OBJECT_STORAGE') {
    primary = { label: 'STORAGE', ratio: requiredResource(node, 'STORAGE').ratio };
    suggestions = ['Storage Capacity 확인', '이미지/파일 기능 부하 확인', '장애 복구 우선'];
  } else if (node.nodeKind === 'LOAD_BALANCER') {
    primary = { label: 'APP', ratio: requiredResource(node, 'THROUGHPUT').ratio };
    suggestions = ['APP 서버 상태 확인', 'Scale-out 구성 확인', '트래픽 급증 여부 확인'];
  }

  const signals: string[] = [`${primary.label} ${percent(primary.ratio)}%`];
  if (trafficMultiplier > 1) signals.push(`Traffic ×${trafficMultiplier.toFixed(1)}`);
  if (snapshot.techDebt.value >= 40) signals.push(`Tech Debt ${snapshot.techDebt.value}/100`);
  if (load.failureRate >= 0.01) signals.push(`Request Failure ${percent(load.failureRate)}%`);

  let likelyCause = primary.ratio > 1
    ? `${primary.label} Capacity 초과가 가장 강한 신호입니다.`
    : primary.ratio >= 0.85
      ? `${primary.label}가 Critical 구간에 근접해 있습니다.`
      : `${primary.label}만으로는 과부하 원인이 확정되지 않습니다.`;

  if (trafficMultiplier > 1 && primary.ratio >= 0.85) {
    likelyCause = `Traffic Spike가 ${primary.label} 병목을 드러낸 가능성이 높습니다.`;
  } else if (snapshot.techDebt.value >= 60 && node.nodeKind === 'SERVER_GROUP') {
    likelyCause = `높은 Tech Debt와 ${primary.label} 압력이 함께 장애 위험을 높였습니다.`;
  } else if (load.failureRate >= 0.1) {
    likelyCause = `요청 실패율이 높습니다. ${primary.label}와 Request Flow를 함께 확인해야 합니다.`;
  }

  return { primarySignal: primary.label, primaryRatio: primary.ratio, likelyCause, signals, suggestions };
}

export class OperationalViewProjector {
  static project(
    snapshot: GameSnapshot,
    developer: DeveloperProfile,
    selection: OperationalNodeSelection,
  ): ServiceOperationsView {
    const observability = projectObservability(developer);
    const health = projectHealth(snapshot.load, selection);
    const app = requiredNodeLoad(snapshot.load, selection.appNodeId);
    const database = requiredNodeLoad(snapshot.load, selection.databaseNodeId);
    const queue = selection.queueNodeId === null ? null : requiredNodeLoad(snapshot.load, selection.queueNodeId);
    const storage = requiredNodeLoad(snapshot.load, selection.storageNodeId);
    const visibleLoads = observability.level === 'BASIC'
      ? [
          metric(`${app.nodeId}:load`, app.nodeId, 'APP', app.loadRatio),
          metric(`${database.nodeId}:load`, database.nodeId, 'DB', database.loadRatio),
          queue
            ? metric(`${queue.nodeId}:load`, queue.nodeId, 'ASYNC', requiredResource(queue, 'THROUGHPUT').ratio)
            : metric('optional:QUEUE:THROUGHPUT', null, 'ASYNC', 0),
          metric(`${storage.nodeId}:load`, storage.nodeId, 'STORAGE', storage.loadRatio),
        ]
      : [
          metric(`${app.nodeId}:CPU`, app.nodeId, 'APP CPU', requiredResource(app, 'CPU').ratio),
          metric(`${app.nodeId}:IO`, app.nodeId, 'APP I/O', requiredResource(app, 'IO').ratio),
          metric(`${database.nodeId}:CPU`, database.nodeId, 'DB CPU', requiredResource(database, 'CPU').ratio),
          metric(`${database.nodeId}:IO`, database.nodeId, 'DB I/O', requiredResource(database, 'IO').ratio),
          queue
            ? metric(`${queue.nodeId}:THROUGHPUT`, queue.nodeId, 'ASYNC', requiredResource(queue, 'THROUGHPUT').ratio)
            : metric('optional:QUEUE:THROUGHPUT', null, 'ASYNC', 0),
          metric(`${storage.nodeId}:STORAGE`, storage.nodeId, 'STORAGE', requiredResource(storage, 'STORAGE').ratio),
        ];
    return {
      observability,
      health,
      summary: {
        headline: observability.level === 'BASIC'
          ? `LOAD ${percent(Math.max(app.loadRatio, database.loadRatio))}%`
          : `P95 ${health.p95LatencyMs.toLocaleString()}ms`,
        detail: observability.level === 'APM'
          ? `TOP BOTTLENECK · ${health.bottleneckLabel} ${health.bottleneckPercent}% · 요청 경로와 출시 영향까지 추적 가능합니다.`
          : observability.level === 'METRICS'
            ? `CPU / I/O와 P95가 해금되었습니다. ${observability.nextUnlock}`
            : `현재는 서비스 상태와 전체 Load만 보입니다. ${observability.nextUnlock}`,
      },
      visibleLoads,
      failurePercent: percent(snapshot.load.failureRate),
    };
  }

  static diagnosisText(nodeId: string, snapshot: GameSnapshot, developer: DeveloperProfile): string {
    const observability = projectObservability(developer);
    if (observability.level === 'BASIC') {
      return 'DIAGNOSIS LOCKED · METRICS에서 CPU/I/O 자원 신호를 확인할 수 있습니다.';
    }

    const diagnosis = diagnose(nodeId, snapshot);
    if (observability.level === 'METRICS') {
      return `SIGNAL · ${diagnosis.primarySignal} ${percent(diagnosis.primaryRatio)}% · APM에서 Traffic / Tech Debt / Request Failure 상관관계 분석이 해금됩니다.`;
    }
    return `${diagnosis.likelyCause} · SIGNALS ${diagnosis.signals.join(' / ')} · OPTIONS ${diagnosis.suggestions.slice(0, 3).join(' / ')}`;
  }
}
