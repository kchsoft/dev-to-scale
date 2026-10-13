/**
 * Founder Run is an independent, deterministic playable vertical slice.
 * Its decisions and causal incident outcomes are intentionally isolated
 * from the legacy long-running GameEngine until the mode is playtested.
 */
import {
  INVESTMENTS, ROOT_CAUSES, calculateOperations, detectIncidentCause, diagnostics,
  type IncidentCauseId, type InvestmentId, type OperationalSnapshot,
} from './operational-model';
import {
  marketEventForSprint, type MarketDecisionRecord, type MarketEvent, type MarketEventId,
} from './market-events';

export type FeatureId = 'SEARCH' | 'IMAGES' | 'ADS' | 'NOTIFICATIONS';
export type ProbeId = 'metrics' | 'logs' | 'trace';
export type RemedyEffect = 'fix' | 'mitigate' | 'wrong';
export type FounderPhase = 'market' | 'planning' | 'incident' | 'debrief' | 'complete';

export interface FeatureChoice {
  id: FeatureId;
  name: string;
  pitch: string;
  cost: number;
  users: number;
  revenue: number;
  risk: string;
}

export interface Probe {
  id: ProbeId;
  name: string;
  finding: string;
  cost: number;
  minutes: number;
}

export interface Remedy {
  id: string;
  label: string;
  description: string;
  cost: number;
  minutes: number;
  effect: RemedyEffect;
}

export interface IncidentCase {
  id: FeatureId | IncidentCauseId;
  title: string;
  story: string;
  cause: string;
  lesson: string;
  node: 'APP' | 'DB' | 'QUEUE' | 'STORAGE';
  metrics: readonly { label: string; value: string; critical?: boolean }[];
  probes: readonly Probe[];
  remedies: readonly Remedy[];
}

export interface SprintReport {
  sprint: number;
  feature: FeatureId;
  incident: string;
  cause: string;
  fixed: boolean;
  investigationCount: number;
  actionCount: number;
  downtimeMinutes: number;
  revenue: number;
  expenses: number;
  finalTrust: number;
  finalDau: number;
  score: number;
}

export interface FounderState {
  phase: FounderPhase;
  seed: number;
  sprint: number;
  day: number;
  cash: number;
  dau: number;
  trust: number;
  completed: readonly FeatureId[];
  activeFeature: FeatureId | null;
  examined: readonly ProbeId[];
  usedRemedies: readonly string[];
  downtimeMinutes: number;
  mitigated: boolean;
  investments: readonly InvestmentId[];
  investedThisSprint: boolean;
  peakTrafficMultiplier: number;
  marketRevenueBonus: number;
  marketHistory: readonly MarketDecisionRecord[];
  incidentCause: IncidentCauseId | null;
  operational: OperationalSnapshot;
  incidentsResolved: number;
  feedback: string;
  reports: readonly SprintReport[];
}

export const MAX_SPRINTS = 3;
export const CAMPAIGN_DAYS = MAX_SPRINTS * 30;
export const FEATURE_ORDER: readonly FeatureId[] = ['SEARCH', 'IMAGES', 'ADS', 'NOTIFICATIONS'];
export const FEATURE_CATALOG: Readonly<Record<FeatureId, FeatureChoice>> = {
  SEARCH: { id: 'SEARCH', name: '게시글 검색', pitch: '재방문율을 높이는 검색을 출시합니다.', cost: 180000, users: 460, revenue: 45000, risk: 'DB 읽기 부하 증가' },
  IMAGES: { id: 'IMAGES', name: '이미지 업로드', pitch: '콘텐츠를 풍부하게 만들어 신규 유저를 모읍니다.', cost: 220000, users: 700, revenue: 20000, risk: '스토리지 I/O 증가' },
  ADS: { id: 'ADS', name: '광고 수익화', pitch: '성장보다 현금흐름을 먼저 확보합니다.', cost: 120000, users: 140, revenue: 190000, risk: 'DB 연결 경합 증가' },
  NOTIFICATIONS: { id: 'NOTIFICATIONS', name: '실시간 알림', pitch: '재방문과 참여를 높이는 알림을 만듭니다.', cost: 200000, users: 540, revenue: 65000, risk: '메시지 적체 가능성' },
};

const probe = (id: ProbeId, name: string, finding: string): Probe => ({
  id, name, finding, cost: 10000, minutes: 3,
});

export const INCIDENT_CASES: Readonly<Record<FeatureId, IncidentCase>> = {
  SEARCH: {
    id: 'SEARCH', title: '검색 출시 직후 응답 지연', node: 'DB',
    story: '검색 기능이 입소문을 탔지만 응답 시간이 3초를 넘기기 시작했습니다. 사용자들이 페이지를 떠나고 있습니다.',
    cause: '검색 조건이 인덱스를 사용하지 못해 대량의 테이블 행을 스캔합니다.',
    lesson: 'DB CPU가 높다고 바로 서버를 증설하기보다 쿼리 실행 계획과 읽기 패턴을 확인해야 합니다.',
    metrics: [
      { label: 'APP CPU', value: '39%' }, { label: 'DB CPU', value: '96%', critical: true },
      { label: 'API P95', value: '3,400ms', critical: true }, { label: 'DB Pool', value: '63%' },
    ],
    probes: [
      probe('metrics', '시스템 메트릭', 'APP CPU는 여유가 있지만 DB CPU와 Read I/O가 급증했습니다.'),
      probe('logs', 'Slow Query 로그', '게시글 검색 SELECT가 테이블의 대부분을 읽고 있습니다.'),
      probe('trace', '요청 추적', '전체 지연의 89%가 DB SELECT 구간에서 발생합니다.'),
    ],
    remedies: [
      { id: 'search-index', label: '검색 쿼리 및 인덱스 최적화', description: '시간이 걸리지만 병목 원인을 제거합니다.', cost: 120000, minutes: 12, effect: 'fix' },
      { id: 'search-db-scale', label: 'DB 임시 Scale-up', description: '단기 부하를 흡수하지만 비용과 근본 원인은 남습니다.', cost: 170000, minutes: 4, effect: 'mitigate' },
      { id: 'search-app-scale', label: 'APP 서버 증설', description: '애플리케이션 처리 용량을 추가합니다.', cost: 160000, minutes: 5, effect: 'wrong' },
    ],
  },
  IMAGES: {
    id: 'IMAGES', title: '업로드 중 응답 실패', node: 'STORAGE',
    story: '이미지 게시글이 급증했습니다. 업로드 API에서 타임아웃이 발생하고 저장 실패가 늘고 있습니다.',
    cause: '이미지 데이터가 단일 서버의 로컬 저장소 I/O 한계를 넘었습니다.',
    lesson: '스토리지 처리량 문제가 발생했을 때 APP CPU나 DB 용량을 늘려도 저장 경로의 병목은 없어지지 않습니다.',
    metrics: [
      { label: 'APP CPU', value: '48%' }, { label: 'Disk I/O', value: '99%', critical: true },
      { label: 'Upload Error', value: '28%', critical: true }, { label: 'DB CPU', value: '33%' },
    ],
    probes: [
      probe('metrics', '스토리지 메트릭', 'Disk queue length가 급증했고 쓰기 지연이 누적되고 있습니다.'),
      probe('logs', '업로드 오류 로그', '파일 쓰기 단계에서 I/O timeout이 반복됩니다.'),
      probe('trace', '요청 추적', 'DB 조회는 빠르지만 파일 저장 단계에서 요청이 대기합니다.'),
    ],
    remedies: [
      { id: 'images-object', label: '오브젝트 스토리지로 업로드 이전', description: '업로드 경로를 분리해 저장 병목을 제거합니다.', cost: 160000, minutes: 13, effect: 'fix' },
      { id: 'images-limit', label: '이미지 업로드 임시 제한', description: '서비스를 안정화하지만 콘텐츠 생산이 감소합니다.', cost: 30000, minutes: 3, effect: 'mitigate' },
      { id: 'images-db', label: 'DB 인스턴스 증설', description: '현재 충분한 DB 자원을 추가합니다.', cost: 160000, minutes: 5, effect: 'wrong' },
    ],
  },
  ADS: {
    id: 'ADS', title: '광고 집계 API 타임아웃', node: 'DB',
    story: '광고가 노출되기 시작하자 집계 API에서 시간 초과가 발생합니다. 오류가 점점 늘고 있습니다.',
    cause: '광고 집계 코드가 DB 연결을 오래 점유해 Connection Pool이 고갈됩니다.',
    lesson: 'Connection Pool 고갈은 항상 DB CPU 문제는 아닙니다. 연결 점유 시간과 해제 여부를 조사해야 합니다.',
    metrics: [
      { label: 'DB CPU', value: '52%' }, { label: 'Pool Active', value: '100%', critical: true },
      { label: 'API Error', value: '24%', critical: true }, { label: 'APP CPU', value: '35%' },
    ],
    probes: [
      probe('metrics', '연결 풀 메트릭', '활성 Connection은 최대치지만 DB CPU는 포화 상태가 아닙니다.'),
      probe('logs', '애플리케이션 로그', 'Connection acquisition timeout이 광고 집계 요청에 집중됩니다.'),
      probe('trace', '트랜잭션 추적', '광고 집계 트랜잭션이 외부 호출을 기다리는 동안 Connection을 점유합니다.'),
    ],
    remedies: [
      { id: 'ads-connection', label: '트랜잭션 경계 수정', description: 'DB 연결을 불필요하게 점유하지 않도록 변경합니다.', cost: 100000, minutes: 10, effect: 'fix' },
      { id: 'ads-limit', label: '집계 요청 Rate Limit', description: '오류를 줄이지만 일부 집계 처리 지연이 생깁니다.', cost: 30000, minutes: 3, effect: 'mitigate' },
      { id: 'ads-db-scale', label: 'DB CPU 증설', description: '연결 점유 원인을 해결하지 않은 채 CPU를 늘립니다.', cost: 170000, minutes: 5, effect: 'wrong' },
    ],
  },
  NOTIFICATIONS: {
    id: 'NOTIFICATIONS', title: '알림 전송이 계속 지연된다', node: 'QUEUE',
    story: '사용자들이 새 알림을 몇 시간 뒤에 받고 있습니다. API는 정상인데 처리 대기열이 커지고 있습니다.',
    cause: '알림 Consumer의 처리 속도가 생산 속도보다 느려 Queue 적체가 발생합니다.',
    lesson: '비동기 작업은 API 응답 속도가 정상이어도 Consumer 처리량과 Queue 지연을 별도로 관측해야 합니다.',
    metrics: [
      { label: 'APP CPU', value: '31%' }, { label: 'Queue Depth', value: '24,000', critical: true },
      { label: 'Oldest Msg', value: '86m', critical: true }, { label: 'DB CPU', value: '41%' },
    ],
    probes: [
      probe('metrics', '메시지 메트릭', '생산 속도는 240msg/s, 처리 속도는 75msg/s입니다.'),
      probe('logs', 'Consumer 로그', 'Consumer 오류는 드물지만 처리 완료까지 시간이 오래 걸립니다.'),
      probe('trace', '비동기 실행 추적', '외부 전송 I/O 동안 작업자가 동기 대기하며 병렬성이 부족합니다.'),
    ],
    remedies: [
      { id: 'notify-workers', label: 'Consumer 병렬 처리 개선', description: '외부 호출 대기를 분리하고 처리량을 확장합니다.', cost: 140000, minutes: 12, effect: 'fix' },
      { id: 'notify-pause', label: '비필수 알림 일시 중단', description: '신규 메시지를 줄여 적체 속도를 낮춥니다.', cost: 25000, minutes: 3, effect: 'mitigate' },
      { id: 'notify-db', label: 'DB Read Replica 추가', description: '현재 병목이 아닌 DB 읽기를 분산합니다.', cost: 150000, minutes: 6, effect: 'wrong' },
    ],
  },
};

/**
 * The original authored stories are presentation assets only. Root causes,
 * readings and actual incident activation now come from one operations model.
 */
const REMEDIATION_INVESTMENTS: Readonly<Record<string, InvestmentId>> = {
  'search-index': 'INDEX',
  'images-object': 'OBJECT_STORAGE',
  'ads-connection': 'POOL_TUNING',
  'notify-workers': 'QUEUE_WORKERS',
  'db-capacity': 'DB_SCALE',
  'app-capacity': 'APP_SCALE',
};

function investmentById(id: InvestmentId) {
  const option = INVESTMENTS.find((candidate) => candidate.id === id);
  if (!option) throw new Error('알 수 없는 투자 옵션입니다.');
  return option;
}

export function investInOperations(state: FounderState, investmentId: InvestmentId): FounderState {
  if (state.phase !== 'planning') throw new Error('기능 출시 전에만 투자할 수 있습니다.');
  if (state.investedThisSprint) throw new Error('스프린트당 사전 투자는 한 번만 가능합니다.');
  if (state.investments.includes(investmentId)) throw new Error('이미 도입한 개선입니다.');
  const selected = investmentById(investmentId);
  if (state.cash < selected.cost) throw new Error('투자 예산이 부족합니다.');
  const investments = [...state.investments, investmentId];
  return {
    ...state, cash: state.cash - selected.cost,
    investments, investedThisSprint: true,
    operational: calculateOperations(state.completed, investments, state.dau, state.peakTrafficMultiplier),
    feedback: selected.name + ' 도입 완료. 앞으로의 출시와 장애에 영향을 줍니다.',
  };
}

export function createFounderRun(seed = 17): FounderState {
  if (!Number.isSafeInteger(seed)) throw new Error('시드 값은 정수여야 합니다.');
  return {
    phase: 'market', seed, sprint: 1, day: 1, cash: 3000000, dau: 650, trust: 80,
    completed: [], activeFeature: null, examined: [], usedRemedies: [],
    downtimeMinutes: 0, mitigated: false,
    investments: [], investedThisSprint: false, incidentCause: null,
    peakTrafficMultiplier: 1, marketRevenueBonus: 0, marketHistory: [],
    operational: calculateOperations([], [], 650),
    incidentsResolved: 0,
    feedback: '시장 상황을 살펴보고 이번 달의 사업 전략을 결정하세요.', reports: [],
  };
}

export function currentMarketEvent(state: FounderState): MarketEvent | null {
  return state.phase === 'market' ? marketEventForSprint(state.seed, state.sprint) : null;
}

/** Resolve a market decision once. Market event selection ignores action RNG order. */
export function chooseMarketStrategy(state: FounderState, choiceId: string): FounderState {
  if (state.phase !== 'market') throw new Error('현재 결정할 시장 이벤트가 없습니다.');
  const event = marketEventForSprint(state.seed, state.sprint);
  const selected = event.options.find((option) => option.id === choiceId);
  if (!selected) throw new Error('알 수 없는 시장 대응입니다.');
  if (state.cash + selected.cashDelta < 0) throw new Error('해당 전략을 실행할 자금이 부족합니다.');
  const dau = Math.max(0, state.dau + selected.dauDelta);
  const cash = state.cash + selected.cashDelta;
  const trust = Math.max(0, Math.min(100, state.trust + selected.trustDelta));
  const marketHistory: readonly MarketDecisionRecord[] = [...state.marketHistory, {
    sprint: state.sprint, eventId: event.id, choiceId: selected.id,
    label: selected.label, dauDelta: selected.dauDelta, cashDelta: selected.cashDelta,
    trustDelta: selected.trustDelta, trafficMultiplier: selected.trafficMultiplier,
    revenueBonus: selected.revenueBonus,
  }];
  return {
    ...state, phase: 'planning', cash, dau, trust,
    marketHistory, peakTrafficMultiplier: selected.trafficMultiplier,
    marketRevenueBonus: selected.revenueBonus,
    operational: calculateOperations(state.completed, state.investments, dau, selected.trafficMultiplier),
    feedback: event.title + ' — ' + selected.label + '. 기술 투자와 기능 출시로 이 전략을 뒷받침하세요.',
  };
}

export function campaignOutcome(state: FounderState): 'won' | 'survived' | 'failed' {
  if (state.cash <= 0 || state.trust <= 0) return 'failed';
  if (state.phase !== 'complete') return 'survived';
  return state.reports.length === MAX_SPRINTS
    && state.reports.every((report) => report.fixed)
    && state.dau >= 1700 && state.trust >= 50
    ? 'won' : 'survived';
}

export function currentIncident(state: FounderState): IncidentCase | null {
  const featureId = state.activeFeature;
  const cause = state.incidentCause;
  if (featureId === null || cause === null) return null;
  const definition = ROOT_CAUSES[cause];
  const authored = INCIDENT_CASES[featureId];
  const selectedFixId = Object.entries(REMEDIATION_INVESTMENTS)
    .find(([, investment]) => investment === definition.fix)?.[0];
  if (!selectedFixId) throw new Error('원인을 해결할 수단이 없습니다.');
  const originalRemedy = authored.remedies.find((remedy) => remedy.id === selectedFixId);
  const fix: Remedy = originalRemedy ?? {
    id: selectedFixId, label: definition.action,
    description: '실제 병목을 해결하도록 서비스 처리 용량을 변경합니다.',
    cost: investmentById(definition.fix).cost, minutes: 9, effect: 'fix',
  };
  // Root-cause variants deliberately share some symptoms but not remedies.
  const remedies = cause === 'DB_CAPACITY' || cause === 'APP_CAPACITY'
    ? [
        fix,
        { id: cause + '-limit', label: '일시적 트래픽 제한', description: '추가 부하를 억제하지만 근본 용량 문제는 남습니다.', cost: 25000, minutes: 3, effect: 'mitigate' as const },
        { id: cause + '-wrong', label: '무관한 시스템 확장', description: '병목과 관련 없는 노드를 확장합니다.', cost: 140000, minutes: 5, effect: 'wrong' as const },
      ]
    : authored.remedies;
  const probes: readonly Probe[] = [
    { id: 'metrics', name: '운영 메트릭 확인', finding: definition.diagnosis[0], cost: 10000, minutes: 3 },
    { id: 'logs', name: '로그 분석', finding: definition.diagnosis[1], cost: 10000, minutes: 3 },
    { id: 'trace', name: '요청 추적', finding: definition.diagnosis[2], cost: 10000, minutes: 3 },
  ];
  return {
    id: cause, title: definition.title, story: authored.story,
    cause: definition.root, lesson: definition.lesson,
    node: definition.node, probes, remedies,
    metrics: diagnostics(cause, state.operational),
  };
}

export function launchFeature(state: FounderState, featureId: FeatureId): FounderState {
  if (state.phase !== 'planning') throw new Error('지금은 기능을 출시할 수 없습니다.');
  if (state.completed.includes(featureId)) throw new Error('이미 출시한 기능입니다.');
  const feature = FEATURE_CATALOG[featureId];
  if (feature.cost > state.cash) throw new Error('기능 개발 예산이 부족합니다.');
  const completed = [...state.completed, featureId];
  const dau = state.dau + feature.users;
  const operational = calculateOperations(completed, state.investments, dau, state.peakTrafficMultiplier);
  const incidentCause = detectIncidentCause(featureId, state.investments, operational);
  const next: FounderState = {
    ...state, phase: incidentCause ? 'incident' : 'debrief', activeFeature: featureId,
    cash: state.cash - feature.cost, dau, completed, incidentCause, operational,
    examined: [], usedRemedies: [], downtimeMinutes: 0, mitigated: false,
    feedback: incidentCause
      ? feature.name + ' 출시 후 운영 경고가 발생했습니다. 병목 원인을 조사하세요.'
      : feature.name + ' 안정적인 출시 성공! 사전 준비 덕분에 장애 없이 진행했습니다.',
  };
  return incidentCause ? next : settleIncident(next);
}

export function investigate(state: FounderState, probeId: ProbeId): FounderState {
  if (state.phase !== 'incident') throw new Error('현재 조사 중인 장애가 없습니다.');
  if (state.examined.includes(probeId)) return state;
  const selected = currentIncident(state)?.probes.find((item) => item.id === probeId);
  if (!selected) throw new Error('알 수 없는 조사입니다.');
  const apm = state.investments.includes('APM');
  const cost = apm ? 3000 : selected.cost;
  const minutes = apm ? 1 : selected.minutes;
  if (cost > state.cash) throw new Error('조사 예산이 부족합니다.');
  return {
    ...state, cash: state.cash - cost,
    examined: [...state.examined, probeId],
    downtimeMinutes: state.downtimeMinutes + minutes,
    feedback: selected.name + ' 확인 완료. 관측 결과를 토대로 대응해보세요.',
  };
}

function settleIncident(state: FounderState): FounderState {
  const selectedId = state.activeFeature;
  if (!selectedId) throw new Error('진행 중인 기능이 없습니다.');
  const selected = FEATURE_CATALOG[selectedId];
  const penaltyMinutes = Math.max(0, state.downtimeMinutes - (state.mitigated ? 5 : 0));
  const trustLoss = Math.ceil(penaltyMinutes / 8);
  const trust = Math.max(0, Math.min(100, state.trust - trustLoss));
  const usersLost = Math.min(0.25, penaltyMinutes * 0.003);
  const dau = Math.max(0, Math.round(state.dau * (1 - usersLost)));
  const revenue = Math.max(0, Math.round(dau * 85 + state.completed.reduce((sum, id) => sum + FEATURE_CATALOG[id].revenue, 0) + state.marketRevenueBonus));
  const expenses = 90000 + state.completed.length * 28000;
  const cash = state.cash + revenue - expenses;
  const incident = currentIncident(state);
  const report: SprintReport = {
    sprint: state.sprint, feature: selectedId,
    incident: incident?.title ?? '장애 없는 안정적인 기능 출시',
    cause: incident?.cause ?? '사전 기술 투자와 충분한 처리 용량으로 장애 예방',
    fixed: true,
    investigationCount: state.examined.length, actionCount: state.usedRemedies.length,
    downtimeMinutes: state.downtimeMinutes, revenue, expenses,
    finalTrust: trust, finalDau: dau,
    score: Math.max(0, Math.round(120 + trust * 2 + dau * 0.1 - penaltyMinutes * 1.2 + (incident ? 0 : 80))),
  };
  return {
    ...state, phase: 'debrief', cash, dau, trust,
    peakTrafficMultiplier: 1, marketRevenueBonus: 0,
    operational: calculateOperations(state.completed, state.investments, dau),
    incidentsResolved: state.incidentsResolved + (incident ? 1 : 0),
    reports: [...state.reports, report],
    feedback: incident
      ? selected.name + '의 장애를 해결했습니다. 인과관계와 회고를 확인해보세요.'
      : selected.name + '을 장애 없이 출시했습니다. 사전 투자가 효과를 냈습니다.',
  };
}

export function remediate(state: FounderState, remedyId: string): FounderState {
  if (state.phase !== 'incident') throw new Error('현재 대응할 장애가 없습니다.');
  if (state.usedRemedies.includes(remedyId)) return state;
  const selected = currentIncident(state)?.remedies.find((item) => item.id === remedyId);
  if (!selected) throw new Error('알 수 없는 대응입니다.');
  if (selected.cost > state.cash) throw new Error('대응 예산이 부족합니다.');
  const next: FounderState = {
    ...state,
    cash: state.cash - selected.cost,
    usedRemedies: [...state.usedRemedies, remedyId],
    downtimeMinutes: state.downtimeMinutes + selected.minutes,
    mitigated: state.mitigated || selected.effect === 'mitigate',
    feedback: selected.effect === 'fix'
      ? '조치를 적용했습니다. 새로운 운영 상태를 검증합니다.'
      : selected.effect === 'mitigate'
        ? '긴급 완화에 성공했습니다. 하지만 근본 원인은 남아 있습니다.'
        : '병목을 해결하지 못했습니다. 현금과 복구 시간을 소비했습니다.',
  };
  if (selected.effect === 'fix') {
    const installed = REMEDIATION_INVESTMENTS[selected.id];
    if (!installed) throw new Error('실제 시스템에 반영할 해결 기술이 없습니다.');
    const investments = next.investments.includes(installed)
      ? next.investments : [...next.investments, installed];
    const operational = calculateOperations(next.completed, investments, next.dau, next.peakTrafficMultiplier);
    const nextCause = detectIncidentCause(next.activeFeature!, investments, operational);
    const verified: FounderState = { ...next, investments, operational, incidentCause: nextCause };
    if (nextCause) {
      return {
        ...verified, examined: [],
        feedback: '일부 병목은 해결했지만 시스템에 다른 병목이 남아 있습니다. 다시 조사해야 합니다.',
      };
    }
    // Keep the solved root cause for the postmortem.
    return settleIncident({ ...verified, incidentCause: state.incidentCause });
  }
  if (selected.effect === 'wrong') {
    return { ...next, trust: Math.max(0, next.trust - 5), dau: Math.round(next.dau * 0.97) };
  }
  return next;
}

export function continueFounderRun(state: FounderState): FounderState {
  if (state.phase !== 'debrief') throw new Error('먼저 현재 장애를 해결하세요.');
  if (state.sprint >= MAX_SPRINTS || state.cash <= 0 || state.trust <= 0) {
    return {
      ...state, phase: 'complete', day: Math.min(CAMPAIGN_DAYS, state.sprint * 30),
      peakTrafficMultiplier: 1, marketRevenueBonus: 0,
      feedback: '캠페인이 종료되었습니다. 성장·안정성·재무 성과를 종합 평가합니다.',
    };
  }
  const nextSprint = state.sprint + 1;
  return {
    ...state, phase: 'market', sprint: nextSprint,
    day: (nextSprint - 1) * 30 + 1, activeFeature: null, incidentCause: null,
    peakTrafficMultiplier: 1, marketRevenueBonus: 0,
    investedThisSprint: false, examined: [], usedRemedies: [],
    downtimeMinutes: 0, mitigated: false,
    feedback: '새로운 달이 시작됐습니다. 시장 이벤트에 대응할 전략을 결정하세요.',
  };
}

export function totalScore(state: FounderState): number {
  const completedScore = state.reports.reduce((sum, report) => sum + report.score, 0);
  const economy = Math.max(0, Math.min(200, Math.round(state.cash / 20000)));
  return completedScore + economy;
}

/** Explicit escape hatch: a player who runs out of repair cash cannot soft-lock. */
export function abandonIncident(state: FounderState): FounderState {
  if (state.phase !== 'incident' || state.activeFeature === null) {
    throw new Error('포기할 진행 중 장애가 없습니다.');
  }
  const featureId = state.activeFeature;
  const trust = Math.max(0, state.trust - 20);
  const dau = Math.max(0, Math.round(state.dau * 0.75));
  const expenses = Math.min(state.cash, 90000);
  const report: SprintReport = {
    sprint: state.sprint,
    feature: featureId,
    incident: currentIncident(state)?.title ?? INCIDENT_CASES[featureId].title,
    cause: currentIncident(state)?.cause ?? INCIDENT_CASES[featureId].cause,
    fixed: false,
    investigationCount: state.examined.length,
    actionCount: state.usedRemedies.length,
    downtimeMinutes: state.downtimeMinutes + 30,
    revenue: 0,
    expenses,
    finalTrust: trust,
    finalDau: dau,
    score: 0,
  };
  return {
    ...state, phase: 'debrief', cash: state.cash - expenses, trust, dau,
    peakTrafficMultiplier: 1, marketRevenueBonus: 0,
    operational: calculateOperations(state.completed, state.investments, dau),
    reports: [...state.reports, report],
    feedback: '서비스 중단을 선택했습니다. 사용자 신뢰와 성장 기회를 잃었습니다.',
  };
}
