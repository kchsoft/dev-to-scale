import type { FeatureId } from './founder-run';

/**
 * One authoritative, deterministic model for the experimental campaign.
 * All visible metrics and incident pressure come from the same workload state.
 * Units are game capacity units, NOT cloud hardware benchmark values.
 */
export type InvestmentId =
  | 'INDEX' | 'DB_SCALE' | 'APP_SCALE'
  | 'OBJECT_STORAGE' | 'QUEUE_WORKERS' | 'POOL_TUNING' | 'APM';

export type NodeId = 'APP' | 'DB' | 'STORAGE' | 'QUEUE';
export type IncidentCauseId =
  | 'SEARCH_SCAN' | 'POOL_EXHAUSTION' | 'STORAGE_IO' | 'QUEUE_CONSUMER'
  | 'DB_CAPACITY' | 'APP_CAPACITY';

export interface Investment {
  id: InvestmentId;
  name: string;
  description: string;
  cost: number;
  relatedTo: string;
}

export const INVESTMENTS: readonly Investment[] = [
  { id: 'INDEX', name: '검색 쿼리 최적화', description: '검색 DB 읽기 부하를 약 65% 줄입니다.', cost: 125000, relatedTo: '검색' },
  { id: 'DB_SCALE', name: 'DB 용량 확장', description: 'DB 처리 용량 +100. 쿼리 자체의 문제는 해결하지 못합니다.', cost: 220000, relatedTo: '전체 서비스' },
  { id: 'APP_SCALE', name: 'APP Scale-out', description: '애플리케이션 처리 용량 +85.', cost: 195000, relatedTo: '전체 서비스' },
  { id: 'OBJECT_STORAGE', name: '오브젝트 스토리지 도입', description: '저장 I/O 용량 +130. 업로드 경로 병목에 대비합니다.', cost: 160000, relatedTo: '이미지' },
  { id: 'QUEUE_WORKERS', name: 'Consumer 병렬화', description: 'Queue 처리량 +130. 알림 적체에 대비합니다.', cost: 145000, relatedTo: '알림' },
  { id: 'POOL_TUNING', name: '트랜잭션 경계 개선', description: '불필요한 DB 연결 점유를 제거합니다.', cost: 110000, relatedTo: '광고' },
  { id: 'APM', name: 'Observability 도입', description: '조사 시간과 비용을 줄입니다. 처리 용량은 늘어나지 않습니다.', cost: 90000, relatedTo: '장애 진단' },
];

export interface NodePressure {
  id: NodeId;
  demand: number;
  capacity: number;
  ratio: number;
  utilization: number;
}

export interface OperationalSnapshot {
  nodes: Record<NodeId, NodePressure>;
  p95Ms: number;
  poolUsePercent: number;
  hasWarning: boolean;
}

const DEMAND: Record<FeatureId, Record<NodeId, number>> = {
  SEARCH: { APP: 20, DB: 78, STORAGE: 0, QUEUE: 0 },
  IMAGES: { APP: 24, DB: 12, STORAGE: 87, QUEUE: 0 },
  ADS: { APP: 17, DB: 62, STORAGE: 0, QUEUE: 0 },
  NOTIFICATIONS: { APP: 23, DB: 16, STORAGE: 0, QUEUE: 100 },
};
const BASE: Record<NodeId, number> = { APP: 20, DB: 17, STORAGE: 9, QUEUE: 5 };
const CAPACITY: Record<NodeId, number> = { APP: 120, DB: 105, STORAGE: 95, QUEUE: 110 };
export const NODE_ORDER: readonly NodeId[] = ['APP', 'DB', 'STORAGE', 'QUEUE'];

const has = (investments: readonly InvestmentId[], id: InvestmentId) => investments.includes(id);

export function calculateOperations(
  features: readonly FeatureId[],
  investments: readonly InvestmentId[],
  dau: number,
  trafficMultiplier = 1,
  techDebt = 0,
): OperationalSnapshot {
  if (!Number.isFinite(trafficMultiplier) || trafficMultiplier <= 0) throw new Error('유효하지 않은 트래픽 배율입니다.');
  if (!Number.isFinite(techDebt) || techDebt < 0 || techDebt > 100) throw new Error('기술 부채는 0~100이어야 합니다.');
  const factor = (1 + Math.max(0, dau - 650) / 5000) * trafficMultiplier;
  const capacity: Record<NodeId, number> = {
    ...CAPACITY,
    APP: CAPACITY.APP + (has(investments, 'APP_SCALE') ? 85 : 0),
    DB: CAPACITY.DB + (has(investments, 'DB_SCALE') ? 100 : 0),
    STORAGE: CAPACITY.STORAGE + (has(investments, 'OBJECT_STORAGE') ? 130 : 0),
    QUEUE: CAPACITY.QUEUE + (has(investments, 'QUEUE_WORKERS') ? 130 : 0),
  };
  const demand: Record<NodeId, number> = { ...BASE };
  for (const feature of features) {
    for (const node of NODE_ORDER) {
      const work = DEMAND[feature][node];
      demand[node] += feature === 'SEARCH' && node === 'DB' && has(investments, 'INDEX')
        ? work * 0.35
        : work;
    }
  }
  const nodes = {} as Record<NodeId, NodePressure>;
  for (const id of NODE_ORDER) {
    // Rework, retries and suboptimal application code introduce excess pressure.
    // Capacity decisions and technical debt now share the same pressure model.
    const debtLoad = id === 'APP' ? 1 + techDebt * 0.004 : id === 'DB' ? 1 + techDebt * 0.0015 : 1;
    const weightedDemand = Math.round(demand[id] * factor * debtLoad * 10) / 10;
    const ratio = weightedDemand / capacity[id];
    nodes[id] = {
      id, demand: weightedDemand, capacity: capacity[id], ratio,
      utilization: Math.min(100, Math.round(ratio * 100)),
    };
  }
  const maxRatio = Math.max(...NODE_ORDER.map((node) => nodes[node].ratio));
  const p95Ms = Math.round(110 + Math.pow(Math.max(0, maxRatio - 0.55), 2) * 2400);
  const poolUsePercent = has(investments, 'POOL_TUNING')
    ? Math.min(94, Math.round(nodes.DB.ratio * 72))
    : features.includes('ADS')
      ? 100
      : Math.min(100, Math.round(nodes.DB.ratio * 75));
  return {
    nodes, p95Ms, poolUsePercent,
    hasWarning: maxRatio >= 0.85,
  };
}

/** Structural faults take precedence; capacity saturation emerges second. */
export function detectIncidentCause(
  latestFeature: FeatureId,
  investments: readonly InvestmentId[],
  operations: OperationalSnapshot,
): IncidentCauseId | null {
  if (latestFeature === 'SEARCH' && !has(investments, 'INDEX')) return 'SEARCH_SCAN';
  if (latestFeature === 'IMAGES' && !has(investments, 'OBJECT_STORAGE')) return 'STORAGE_IO';
  if (latestFeature === 'ADS' && !has(investments, 'POOL_TUNING')) return 'POOL_EXHAUSTION';
  if (latestFeature === 'NOTIFICATIONS' && !has(investments, 'QUEUE_WORKERS')) return 'QUEUE_CONSUMER';
  if (operations.nodes.DB.ratio > 0.96) return 'DB_CAPACITY';
  if (operations.nodes.APP.ratio > 0.96) return 'APP_CAPACITY';
  // STORAGE and QUEUE pressure can only become critical when the matching
  // launch feature is added; the structural fault above already covers it.
  return null;
}

export const ROOT_CAUSES: Readonly<Record<IncidentCauseId, {
  title: string;
  root: string;
  lesson: string;
  node: NodeId;
  fix: InvestmentId;
  action: string;
  diagnosis: readonly [string, string, string];
}>> = {
  SEARCH_SCAN: {
    title: '검색 API 응답 지연',
    root: '인덱스를 사용하지 못하는 검색 쿼리의 대량 테이블 스캔',
    lesson: 'CPU만 높다고 증설부터 하지 마세요. 쿼리 실행 계획과 읽기 패턴이 원인일 수 있습니다.',
    node: 'DB', fix: 'INDEX', action: '실행 계획 분석 후 검색 인덱스 최적화',
    diagnosis: [
      'DB Read I/O가 증가했고 APP CPU에는 아직 여유가 있습니다.',
      '검색 SELECT에서 Full Table Scan과 느린 실행 시간이 발견됩니다.',
      '요청 지연의 대부분이 DB 검색 처리에서 발생합니다.',
    ],
  },
  POOL_EXHAUSTION: {
    title: '광고 집계 API 타임아웃',
    root: '광고 트랜잭션이 외부 호출 동안 DB Connection을 점유',
    lesson: 'Pool 고갈은 반드시 DB CPU 부족을 뜻하지 않습니다. 연결을 오래 잡는 구간을 조사해야 합니다.',
    node: 'DB', fix: 'POOL_TUNING', action: '트랜잭션 경계와 Connection 점유 시간 개선',
    diagnosis: [
      'DB CPU 사용량에 비해 Connection Pool 활성 연결이 포화 상태입니다.',
      '광고 집계 요청에 Connection acquisition timeout이 집중됩니다.',
      '외부 응답을 기다리는 동안 광고 트랜잭션이 DB 연결을 놓지 않습니다.',
    ],
  },
  STORAGE_IO: {
    title: '이미지 업로드 처리 실패',
    root: '서버 로컬 스토리지의 쓰기 I/O 포화',
    lesson: '이미지 파일 경로가 병목이라면 APP 또는 DB 증설만으로 복구되지 않습니다.',
    node: 'STORAGE', fix: 'OBJECT_STORAGE', action: '오브젝트 스토리지로 업로드 경로 이전',
    diagnosis: [
      'Disk write queue와 파일 저장 대기가 증가합니다.',
      '파일 쓰기 단계에서 I/O timeout이 반복됩니다.',
      'DB 접근보다 저장 경로에서 대부분의 지연이 발생합니다.',
    ],
  },
  QUEUE_CONSUMER: {
    title: '알림 메시지 대규모 지연',
    root: '발행 속도보다 낮은 Consumer 처리량으로 Queue 적체',
    lesson: 'API가 정상이어도 비동기 Consumer 처리량은 별도의 병목이 될 수 있습니다.',
    node: 'QUEUE', fix: 'QUEUE_WORKERS', action: 'Consumer 병렬 처리와 외부 I/O 대기 개선',
    diagnosis: [
      'Queue Depth가 증가하고 oldest message age가 길어집니다.',
      'Consumer 처리 속도가 Producer의 메시지 생성 속도보다 느립니다.',
      '외부 알림 전송 I/O 대기 때문에 Consumer의 처리량이 부족합니다.',
    ],
  },
  DB_CAPACITY: {
    title: '데이터베이스 처리 용량 초과',
    root: '복합 워크로드로 인한 데이터베이스 총 처리 용량 포화',
    lesson: '쿼리가 충분히 최적화됐더라도 실제 트래픽이 처리 용량을 넘으면 수평·수직 확장이 필요합니다.',
    node: 'DB', fix: 'DB_SCALE', action: 'DB 인스턴스 용량 확대',
    diagnosis: [
      'DB CPU와 I/O가 지속적으로 높은 수준입니다.',
      '느린 개별 쿼리는 없지만 전체 동시 요청량이 증가했습니다.',
      '여러 쿼리가 고르게 느려져 전체 DB 용량 부족이 의심됩니다.',
    ],
  },
  APP_CAPACITY: {
    title: '애플리케이션 처리 용량 초과',
    root: '동시 요청 증가로 인한 애플리케이션 CPU 및 처리량 포화',
    lesson: 'APP에 실제 병목이 있는지 확인한 후 Scale-out해야 비용과 효과가 일치합니다.',
    node: 'APP', fix: 'APP_SCALE', action: '애플리케이션 서버 Scale-out',
    diagnosis: [
      'APP CPU가 상한에 가까우며 요청 대기열이 증가합니다.',
      'APP 요청 처리 지연이 관측되지만 DB는 정상 응답합니다.',
      '트레이스에서 데이터베이스보다 애플리케이션 실행 구간이 길어집니다.',
    ],
  },
};

export function diagnostics(
  cause: IncidentCauseId,
  operations: OperationalSnapshot,
): readonly { label: string; value: string; critical?: boolean }[] {
  const definition = ROOT_CAUSES[cause];
  const main = operations.nodes[definition.node];
  const latency = cause === 'SEARCH_SCAN'
    ? Math.max(1900, operations.p95Ms + 1700)
    : cause === 'POOL_EXHAUSTION' ? Math.max(2200, operations.p95Ms + 1500)
      : Math.max(1600, operations.p95Ms + 850);
  return [
    { label: 'APP CPU', value: operations.nodes.APP.utilization + '%', critical: definition.node === 'APP' },
    { label: 'DB CPU', value: operations.nodes.DB.utilization + '%', critical: definition.node === 'DB' && cause !== 'POOL_EXHAUSTION' },
    { label: cause === 'POOL_EXHAUSTION' ? 'DB Pool Active' : definition.node === 'QUEUE' ? 'Queue Load' : definition.node === 'STORAGE' ? 'Storage I/O' : 'API P95',
      value: cause === 'POOL_EXHAUSTION'
        ? operations.poolUsePercent + '%'
        : definition.node === 'QUEUE' || definition.node === 'STORAGE'
          ? main.utilization + '%' : latency.toLocaleString('ko-KR') + 'ms',
      critical: true },
    { label: 'API P95', value: latency.toLocaleString('ko-KR') + 'ms', critical: true },
  ];
}
