/**
 * Founder Run is an independent, deterministic playable vertical slice.
 * Its decisions and causal incident outcomes are intentionally isolated
 * from the legacy long-running GameEngine until the mode is playtested.
 */
export type FeatureId = 'SEARCH' | 'IMAGES' | 'ADS' | 'NOTIFICATIONS';
export type ProbeId = 'metrics' | 'logs' | 'trace';
export type RemedyEffect = 'fix' | 'mitigate' | 'wrong';
export type FounderPhase = 'planning' | 'incident' | 'debrief' | 'complete';

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
  id: FeatureId;
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
  incidentsResolved: number;
  feedback: string;
  reports: readonly SprintReport[];
}

export const MAX_SPRINTS = 3;
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

export function createFounderRun(): FounderState {
  return {
    phase: 'planning', sprint: 1, day: 1, cash: 3000000, dau: 650, trust: 80,
    completed: [], activeFeature: null, examined: [], usedRemedies: [],
    downtimeMinutes: 0, mitigated: false, incidentsResolved: 0,
    feedback: '첫 기능을 선택하세요. 성장과 위험은 함께 찾아옵니다.', reports: [],
  };
}

export function currentIncident(state: FounderState): IncidentCase | null {
  return state.activeFeature === null ? null : INCIDENT_CASES[state.activeFeature];
}

export function launchFeature(state: FounderState, featureId: FeatureId): FounderState {
  if (state.phase !== 'planning') throw new Error('지금은 기능을 출시할 수 없습니다.');
  if (state.completed.includes(featureId)) throw new Error('이미 출시한 기능입니다.');
  const feature = FEATURE_CATALOG[featureId];
  if (feature.cost > state.cash) throw new Error('기능 개발 예산이 부족합니다.');
  return {
    ...state, phase: 'incident', activeFeature: featureId,
    cash: state.cash - feature.cost, dau: state.dau + feature.users,
    completed: [...state.completed, featureId], examined: [], usedRemedies: [],
    downtimeMinutes: 0, mitigated: false,
    feedback: feature.name + ' 출시 성공! 곧 운영 경고가 도착했습니다.',
  };
}

export function investigate(state: FounderState, probeId: ProbeId): FounderState {
  if (state.phase !== 'incident') throw new Error('현재 조사 중인 장애가 없습니다.');
  if (state.examined.includes(probeId)) return state;
  const selected = currentIncident(state)?.probes.find((item) => item.id === probeId);
  if (!selected) throw new Error('알 수 없는 조사입니다.');
  if (selected.cost > state.cash) throw new Error('조사 예산이 부족합니다.');
  return {
    ...state, cash: state.cash - selected.cost,
    examined: [...state.examined, probeId],
    downtimeMinutes: state.downtimeMinutes + selected.minutes,
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
  const revenue = Math.round(dau * 85 + state.completed.reduce((sum, id) => sum + FEATURE_CATALOG[id].revenue, 0));
  const expenses = 90000 + state.completed.length * 28000;
  const cash = state.cash + revenue - expenses;
  const report: SprintReport = {
    sprint: state.sprint, feature: selectedId, incident: INCIDENT_CASES[selectedId].title,
    cause: INCIDENT_CASES[selectedId].cause, fixed: true,
    investigationCount: state.examined.length, actionCount: state.usedRemedies.length,
    downtimeMinutes: state.downtimeMinutes, revenue, expenses,
    finalTrust: trust, finalDau: dau,
    score: Math.max(0, Math.round(120 + trust * 2 + dau * 0.1 - penaltyMinutes * 1.2)),
  };
  return {
    ...state, phase: 'debrief', cash, dau, trust,
    incidentsResolved: state.incidentsResolved + 1,
    reports: [...state.reports, report],
    feedback: selected.name + '의 장애를 해결했습니다. 인과관계와 회고를 확인해보세요.',
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
      ? '원인 제거 성공! 실제 서비스 부하가 안정화되었습니다.'
      : selected.effect === 'mitigate'
        ? '긴급 완화에 성공했습니다. 하지만 근본 원인은 남아 있습니다.'
        : '병목을 해결하지 못했습니다. 현금과 복구 시간을 소비했습니다.',
  };

  if (selected.effect === 'fix') return settleIncident(next);
  if (selected.effect === 'wrong') {
    return { ...next, trust: Math.max(0, next.trust - 5), dau: Math.round(next.dau * 0.97) };
  }
  return next;
}

export function continueFounderRun(state: FounderState): FounderState {
  if (state.phase !== 'debrief') throw new Error('먼저 현재 장애를 해결하세요.');
  if (state.sprint >= MAX_SPRINTS || state.cash <= 0 || state.trust <= 0) {
    return { ...state, phase: 'complete', feedback: '런이 종료되었습니다. 경영과 복구 결과를 확인하세요.' };
  }
  return {
    ...state, phase: 'planning', sprint: state.sprint + 1,
    day: state.day + 7, activeFeature: null, examined: [], usedRemedies: [],
    downtimeMinutes: 0, mitigated: false,
    feedback: '다음 스프린트입니다. 이전 선택을 고려해 새로운 기능을 선택하세요.',
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
    incident: INCIDENT_CASES[featureId].title,
    cause: INCIDENT_CASES[featureId].cause,
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
    reports: [...state.reports, report],
    feedback: '서비스 중단을 선택했습니다. 사용자 신뢰와 성장 기회를 잃었습니다.',
  };
}
