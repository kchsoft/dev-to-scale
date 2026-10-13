import { FEATURE_CATALOG, FEATURE_ORDER, type FeatureId } from './founder-run';
import {
  INVESTMENTS, NODE_ORDER, ROOT_CAUSES, calculateOperations, detectIncidentCause,
  type IncidentCauseId, type InvestmentId, type NodeId, type OperationalSnapshot,
} from './operational-model';
import { marketEventForSprint, type MarketDecisionRecord } from './market-events';

/**
 * Second campaign: actual 90 one-day transitions with interrupting decisions.
 * Game dates and outages (minutes) are separate units. No real-time scheduling.
 */
export const CAMPAIGN_LENGTH = 90;
export const MONTH_LENGTH = 30;
export type CampaignPhase =
  | 'market' | 'planning' | 'development' | 'operating'
  | 'incident' | 'report' | 'complete';
export type DailyCause = IncidentCauseId | 'DEBT_REGRESSION';
export type EngineeringPace = 'NORMAL' | 'FAST_TRACK';
export type RepairChoice = InvestmentId | 'REFACTOR' | 'THROTTLE';

export interface DevelopmentJob {
  feature: FeatureId;
  pace: EngineeringPace;
  total: number;
  remaining: number;
}

export interface DailyIncident {
  cause: DailyCause;
  node: NodeId;
  findings: readonly ('metrics' | 'logs' | 'trace')[];
  attempted: readonly RepairChoice[];
  minutes: number;
  mitigated: boolean;
}

export interface DayRecord {
  day: number;
  dau: number;
  revenue: number;
  expense: number;
  debt: number;
  event: string;
  healthy: boolean;
}

export interface MonthReport {
  month: number;
  feature: FeatureId | null;
  revenue: number;
  cost: number;
  incidents: number;
  outageMinutes: number;
  healthyDays: number;
  endCash: number;
  endDau: number;
  endTrust: number;
  endDebt: number;
}

export interface DailyCampaignState {
  seed: number;
  day: number;
  month: number;
  phase: CampaignPhase;
  cash: number;
  dau: number;
  trust: number;
  debt: number;
  features: readonly FeatureId[];
  investments: readonly InvestmentId[];
  job: DevelopmentJob | null;
  currentMonthFeature: FeatureId | null;
  preparedThisMonth: boolean;
  decidedFeature: boolean;
  peakMultiplier: number;
  peakUntilDay: number;
  marketBonus: number;
  marketHistory: readonly MarketDecisionRecord[];
  ops: OperationalSnapshot;
  incident: DailyIncident | null;
  suppressedCause: DailyCause | null;
  monthRevenue: number;
  monthCost: number;
  monthIncidents: number;
  monthOutageMinutes: number;
  monthHealthyDays: number;
  healthyDays: number;
  reports: readonly MonthReport[];
  history: readonly DayRecord[];
  journal: readonly string[];
  feedback: string;
}

const clip = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const marketPeak = (s: DailyCampaignState): number => s.day <= s.peakUntilDay ? s.peakMultiplier : 1;
const price = (id: InvestmentId): number => INVESTMENTS.find((item) => item.id === id)?.cost ?? 0;
const simple = (s: DailyCampaignState): OperationalSnapshot =>
  calculateOperations(s.features, s.investments, s.dau, marketPeak(s), s.debt);

export const DEVELOPMENT_DAYS: Readonly<Record<FeatureId, number>> = {
  SEARCH: 8, IMAGES: 10, ADS: 7, NOTIFICATIONS: 9,
};

const REFACTOR_COST = 80000;
const THROTTLE_COST = 25000;

/** Predict a development duration before committing to a pace. */
export function developmentDays(feature: FeatureId, debt: number, pace: EngineeringPace): number {
  const baseline = DEVELOPMENT_DAYS[feature] + Math.ceil(debt / 18);
  return Math.max(3, pace === 'FAST_TRACK' ? Math.ceil(baseline * 0.62) : baseline);
}

export function createDailyCampaign(seed = 17): DailyCampaignState {
  if (!Number.isSafeInteger(seed)) throw new Error('시드는 정수여야 합니다.');
  return {
    seed, day: 1, month: 1, phase: 'market', cash: 3000000, dau: 650,
    trust: 80, debt: 0, features: [], investments: [], job: null,
    currentMonthFeature: null, preparedThisMonth: false, decidedFeature: false,
    peakMultiplier: 1, peakUntilDay: 0, marketBonus: 0, marketHistory: [],
    ops: calculateOperations([], [], 650), incident: null, suppressedCause: null,
    monthRevenue: 0, monthCost: 0, monthIncidents: 0, monthOutageMinutes: 0,
    monthHealthyDays: 0, healthyDays: 0, reports: [], history: [], journal: [],
    feedback: '1개월 차입니다. 시장 사건에 대응해 사업 방향을 결정하세요.',
  };
}

export function dailyMarketEvent(s: DailyCampaignState) {
  return s.phase === 'market' ? marketEventForSprint(s.seed, s.month) : null;
}

export function chooseDailyMarket(s: DailyCampaignState, choiceId: string): DailyCampaignState {
  if (s.phase !== 'market') throw new Error('지금은 시장 이벤트를 선택할 수 없습니다.');
  const event = marketEventForSprint(s.seed, s.month);
  const option = event.options.find((choice) => choice.id === choiceId);
  if (!option) throw new Error('알 수 없는 시장 선택입니다.');
  if (s.cash + option.cashDelta < 0) throw new Error('시장 전략을 실행할 자금이 부족합니다.');
  const next: DailyCampaignState = {
    ...s, phase: 'planning',
    dau: Math.max(0, s.dau + option.dauDelta),
    cash: s.cash + option.cashDelta,
    trust: clip(s.trust + option.trustDelta, 0, 100),
    marketBonus: option.revenueBonus,
    peakMultiplier: option.trafficMultiplier,
    peakUntilDay: (s.month - 1) * MONTH_LENGTH + 16,
    marketHistory: [...s.marketHistory, {
      sprint: s.month, eventId: event.id, choiceId: option.id, label: option.label,
      dauDelta: option.dauDelta, cashDelta: option.cashDelta,
      trustDelta: option.trustDelta, trafficMultiplier: option.trafficMultiplier,
      revenueBonus: option.revenueBonus,
    }],
    feedback: option.label + ' 전략을 선택했습니다. 앞으로 16일간의 부하에 대비하세요.',
  };
  return { ...next, ops: simple(next) };
}

export function prepareDailyOperations(s: DailyCampaignState, id: InvestmentId): DailyCampaignState {
  if (s.phase !== 'planning') throw new Error('출시 전에만 사전 투자가 가능합니다.');
  if (s.preparedThisMonth) throw new Error('월별 사전 투자는 1회만 가능합니다.');
  if (s.investments.includes(id)) throw new Error('이미 구축한 기술입니다.');
  if (s.cash < price(id)) throw new Error('투자 예산이 부족합니다.');
  const next = {
    ...s, investments: [...s.investments, id], cash: s.cash - price(id),
    preparedThisMonth: true, feedback: id + ' 사전 투자 완료.',
  };
  return { ...next, ops: simple(next) };
}

export function startDailyDevelopment(s: DailyCampaignState, feature: FeatureId, pace: EngineeringPace): DailyCampaignState {
  if (s.phase !== 'planning' || s.decidedFeature) throw new Error('이번 달의 기능 전략이 이미 확정되었습니다.');
  if (!FEATURE_ORDER.includes(feature) || s.features.includes(feature)) throw new Error('출시할 수 없는 기능입니다.');
  const cost = FEATURE_CATALOG[feature].cost;
  if (s.cash < cost) throw new Error('개발 비용이 부족합니다.');
  const days = developmentDays(feature, s.debt, pace);
  const debt = clip(s.debt + (pace === 'FAST_TRACK' ? 27 : 4), 0, 100);
  return {
    ...s, phase: 'development', decidedFeature: true,
    currentMonthFeature: feature,
    job: { feature, pace, total: days, remaining: days },
    cash: s.cash - cost, debt,
    ops: calculateOperations(s.features, s.investments, s.dau, marketPeak(s), debt),
    feedback: FEATURE_CATALOG[feature].name + ' 개발 시작. 예상 ' + days + '일 · 기술 부채 +' + (pace === 'FAST_TRACK' ? 27 : 4),
  };
}

export function skipDailyFeature(s: DailyCampaignState): DailyCampaignState {
  if (s.phase !== 'planning') throw new Error('이번 달의 기능 전략이 이미 확정되었습니다.');
  return { ...s, phase: 'operating', decidedFeature: true, job: null,
    currentMonthFeature: null, feedback: '신규 기능 없이 안정성과 비용에 집중합니다.' };
}

export function dailyIncidentInfo(s: DailyCampaignState): {
  title: string; node: NodeId; cause: string; lesson: string;
  metrics: readonly { label: string; value: string; critical: boolean }[];
  probes: readonly { id: 'metrics' | 'logs' | 'trace'; title: string; finding: string }[];
} | null {
  if (!s.incident) return null;
  const cause = s.incident.cause;
  const definition = cause === 'DEBT_REGRESSION' ? {
    title: '최근 배포에서 오류율 급증',
    node: 'APP' as const,
    root: '빠른 개발로 누적된 기술 부채 때문에 신규 배포에서 회귀 결함이 발생',
    lesson: '급한 배포는 개발 시간을 줄이지만 품질 리스크가 누적됩니다. 리팩터링과 회귀 검증이 필요합니다.',
    diagnosis: [
      'API 오류율이 높아졌지만 서버 CPU와 DB 처리량은 여유가 있습니다.',
      '신규 배포 이후 특정 요청에서 null reference 오류가 반복됩니다.',
      '문제 요청의 지연보다 예외 발생률이 높고 이전 버전에서 정상 처리됐습니다.',
    ] as const,
  } : ROOT_CAUSES[cause];
  const node = definition.node;
  const pressure = s.ops.nodes[node];
  const metrics = [
    { label: 'APP LOAD', value: s.ops.nodes.APP.utilization + '%', critical: node === 'APP' },
    { label: 'DB LOAD', value: s.ops.nodes.DB.utilization + '%', critical: node === 'DB' },
    { label: node === 'QUEUE' ? 'QUEUE LOAD' : node === 'STORAGE' ? 'STORAGE LOAD' : cause === 'POOL_EXHAUSTION' ? 'DB POOL' : 'API P95',
      value: node === 'QUEUE' || node === 'STORAGE' ? pressure.utilization + '%'
        : cause === 'POOL_EXHAUSTION' ? s.ops.poolUsePercent + '%' : s.ops.p95Ms + 'ms',
      critical: true },
    { label: 'TECH DEBT', value: s.debt + '/100', critical: cause === 'DEBT_REGRESSION' },
  ];
  return {
    title: definition.title, node, cause: definition.root, lesson: definition.lesson,
    metrics, probes: [
      { id: 'metrics', title: '메트릭 확인', finding: definition.diagnosis[0] },
      { id: 'logs', title: '에러 로그 확인', finding: definition.diagnosis[1] },
      { id: 'trace', title: '요청 추적', finding: definition.diagnosis[2] },
    ],
  };
}

function detected(s: DailyCampaignState): DailyCause | null {
  // A once-conceded incident cannot immediately re-trigger during this month.
  const latest = s.features[s.features.length - 1];
  if (!latest) return null;
  const structural = detectIncidentCause(latest, s.investments, s.ops);
  const cause: DailyCause | null = structural === 'DB_CAPACITY' || structural === 'APP_CAPACITY'
    ? (s.debt >= 55 ? 'DEBT_REGRESSION' : structural)
    : structural ?? (s.debt >= 55 ? 'DEBT_REGRESSION' : null);
  if (cause === s.suppressedCause) return null;
  return cause;
}

/**
 * An incident interrupts the *end* of the recorded calendar day.
 * Finishing it must never replay that same day and double-charge revenue.
 */
function resumeAfterIncident(s: DailyCampaignState): DailyCampaignState {
  const resumed = { ...s, phase: 'operating' as const, incident: null };
  if (resumed.cash <= 0 || resumed.trust <= 0) {
    return { ...resumed, phase: 'complete', feedback: '자금 또는 신뢰가 고갈되었습니다.' };
  }
  if (resumed.day % MONTH_LENGTH === 0) return finalizeDailyMonth(resumed);
  return { ...resumed, day: resumed.day + 1 };
}

function beginIncident(s: DailyCampaignState, cause: DailyCause): DailyCampaignState {
  const node = cause === 'DEBT_REGRESSION' ? 'APP' : ROOT_CAUSES[cause].node;
  return {
    ...s, phase: 'incident', monthIncidents: s.monthIncidents + 1,
    incident: { cause, node, findings: [], attempted: [], minutes: 0, mitigated: false },
    feedback: '프로덕션 경고! 메트릭과 로그를 조사한 뒤 대응하세요.',
  };
}

function recordDay(s: DailyCampaignState, event: string): DailyCampaignState {
  const peak = marketPeak(s);
  const todayOps = calculateOperations(s.features, s.investments, s.dau, peak, s.debt);
  const pressure = Math.max(...NODE_ORDER.map((node) => todayOps.nodes[node].ratio));
  const trustFactor = clip(s.trust / 80, 0.35, 1.3);
  const pressureFactor = pressure > 1 ? 0.35 : pressure > 0.85 ? 0.75 : 1;
  const organic = Math.round(Math.max(1, s.dau * 0.005 * trustFactor * pressureFactor));
  const dau = Math.max(0, s.dau + organic);
  const revenue = Math.max(0, Math.round(dau * 0.12 + (s.features.includes('ADS') ? 2600 : 0) + s.marketBonus / MONTH_LENGTH));
  const expense = Math.round(1200 + s.investments.length * 310 + s.features.length * 450 + Math.max(0, pressure - 0.75) * 1700);
  const cash = s.cash + revenue - expense;
  const ops = calculateOperations(s.features, s.investments, dau, peak, s.debt);
  const next: DailyCampaignState = {
    ...s, cash, dau, ops, monthRevenue: s.monthRevenue + revenue,
    monthCost: s.monthCost + expense,
    feedback: event, history: [...s.history, {
      day: s.day, dau, revenue, expense, debt: s.debt, event, healthy: false,
    }],
  };
  return next;
}

function finalizeDailyMonth(s: DailyCampaignState): DailyCampaignState {
  const report: MonthReport = {
    month: s.month, feature: s.currentMonthFeature,
    revenue: s.monthRevenue, cost: s.monthCost,
    incidents: s.monthIncidents, outageMinutes: s.monthOutageMinutes,
    healthyDays: s.monthHealthyDays,
    endCash: s.cash, endDau: s.dau, endTrust: s.trust, endDebt: s.debt,
  };
  return {
    ...s, phase: 'report', job: null,
    reports: [...s.reports, report],
    peakMultiplier: 1, peakUntilDay: 0, marketBonus: 0,
    ops: calculateOperations(s.features, s.investments, s.dau, 1, s.debt),
    feedback: s.month + '개월 차 정산 완료. 일별 성장과 장애 영향을 확인하세요.',
  };
}

function finishDay(s: DailyCampaignState, event: string): DailyCampaignState {
  const incidentCause = detected(s);
  // A day is healthy only if it ends without a newly surfaced incident
  // and no resource crosses the critical saturation threshold.
  const overloaded = NODE_ORDER.some((id) => s.ops.nodes[id].ratio > 0.96);
  const healthy = !incidentCause && !overloaded;
  const history = s.history.map((entry, index) => index === s.history.length - 1
    ? { ...entry, event, healthy } : entry);
  const revised = {
    ...s, history,
    healthyDays: s.healthyDays + (healthy ? 1 : 0),
    monthHealthyDays: s.monthHealthyDays + (healthy ? 1 : 0),
    trust: clip(s.trust + (!healthy && overloaded ? -1 : 0), 0, 100),
  };
  if (revised.cash <= 0 || revised.trust <= 0) {
    return { ...revised, phase: 'complete', feedback: '운영 자금 또는 사용자 신뢰가 고갈되었습니다.' };
  }
  if (incidentCause && revised.phase !== 'incident') return beginIncident(revised, incidentCause);
  if (revised.day % MONTH_LENGTH === 0) return finalizeDailyMonth(revised);
  return { ...revised, day: revised.day + 1 };
}

/** Exactly one simulated calendar day; every intermediate day is recorded. */
export function advanceDailyCampaign(s: DailyCampaignState): DailyCampaignState {
  if (s.phase !== 'development' && s.phase !== 'operating') throw new Error('지금은 날짜를 진행할 수 없습니다.');
  let next = s;
  let event = '일일 운영 및 성장';
  if (s.phase === 'development' && s.job) {
    const remaining = s.job.remaining - 1;
    if (remaining > 0) {
      next = { ...s, job: { ...s.job, remaining } };
      event = FEATURE_CATALOG[s.job.feature].name + ' 개발 진행 (' + (s.job.total - remaining) + '/' + s.job.total + ')';
    } else {
      const feature = s.job.feature;
      const features = [...s.features, feature];
      const dau = s.dau + FEATURE_CATALOG[feature].users;
      next = { ...s, phase: 'operating', job: null, features, dau };
      event = FEATURE_CATALOG[feature].name + ' 출시 완료';
    }
  }
  next = recordDay(next, event);
  return finishDay(next, event);
}

/** Optionally skip mundane days, but always stop at the next player decision. */
export function runUntilDecision(s: DailyCampaignState, maxDays = 30): DailyCampaignState {
  if (!Number.isInteger(maxDays) || maxDays < 1 || maxDays > 30) throw new Error('진행 일수는 1~30 사이여야 합니다.');
  let next = s;
  for (let n = 0; n < maxDays; n++) {
    if (next.phase !== 'development' && next.phase !== 'operating') break;
    next = advanceDailyCampaign(next);
  }
  return next;
}

export function investigateDailyIncident(s: DailyCampaignState, probe: 'metrics' | 'logs' | 'trace'): DailyCampaignState {
  if (s.phase !== 'incident' || !s.incident) throw new Error('진행 중인 장애가 없습니다.');
  if (s.incident.findings.includes(probe)) return s;
  const apm = s.investments.includes('APM');
  const cost = apm ? 3000 : 10000;
  if (s.cash < cost) throw new Error('조사할 현금이 부족합니다.');
  const minutes = apm ? 1 : 3;
  return {
    ...s, cash: s.cash - cost, monthCost: s.monthCost + cost,
    monthOutageMinutes: s.monthOutageMinutes + minutes,
    incident: { ...s.incident, findings: [...s.incident.findings, probe], minutes: s.incident.minutes + minutes },
    feedback: '조사 결과가 공개됐습니다. 현재 증거를 바탕으로 다음 대응을 선택하세요.',
  };
}

export function repairDailyIncident(s: DailyCampaignState, action: RepairChoice): DailyCampaignState {
  if (s.phase !== 'incident' || !s.incident) throw new Error('대응 중인 장애가 없습니다.');
  if (s.incident.attempted.includes(action)) return s;
  const cost = action === 'THROTTLE' ? THROTTLE_COST : action === 'REFACTOR' ? REFACTOR_COST : price(action);
  if (s.cash < cost) throw new Error('복구 비용이 부족합니다.');
  const minutes = action === 'THROTTLE' ? 4 : action === 'REFACTOR' ? 11 : 8;
  const mitigated = action === 'THROTTLE' || s.incident.mitigated;
  let investments = s.investments;
  let debt = s.debt;
  let peakMultiplier = s.peakMultiplier;
  if (action === 'REFACTOR') debt = Math.max(0, debt - 45);
  else if (action === 'THROTTLE') peakMultiplier = Math.max(1, s.peakMultiplier * 0.70);
  else if (!investments.includes(action)) investments = [...investments, action];
  const next: DailyCampaignState = {
    ...s, investments, debt, peakMultiplier, cash: s.cash - cost,
    monthCost: s.monthCost + cost,
    monthOutageMinutes: s.monthOutageMinutes + minutes,
    incident: {
      ...s.incident, attempted: [...s.incident.attempted, action],
      minutes: s.incident.minutes + minutes, mitigated,
    },
    feedback: '조치를 적용하고 부하를 다시 계산했습니다.',
  };
  const ops = simple(next);
  const reassessed = { ...next, ops };
  // THROTTLE always remains a mitigation, never a permanent causal repair.
  if (action === 'THROTTLE') return { ...reassessed, feedback: '트래픽이 감소했지만 근본 원인은 남아 있습니다.' };
  const newCause = detected(reassessed);
  if (!newCause) {
    return resumeAfterIncident({
      ...reassessed,
      feedback: '근본 원인이 제거됐습니다. 남은 기간의 서비스 운영을 재개합니다.',
      journal: [...s.journal, 'D' + s.day + ' ' + s.incident.cause + ' 해결 (' + action + ')'],
    });
  }
  if (newCause !== s.incident.cause) {
    const node = newCause === 'DEBT_REGRESSION' ? 'APP' : ROOT_CAUSES[newCause].node;
    return {
      ...reassessed,
      incident: { cause: newCause, node, findings: [], attempted: [], minutes: 0, mitigated: false },
      monthIncidents: s.monthIncidents + 1,
      feedback: '첫 번째 병목은 해결됐지만 새로운 근본 원인이 드러났습니다.',
    };
  }
  return { ...reassessed, feedback: '해당 조치만으로 현재 장애 원인을 해결하지 못했습니다.' };
}

export function concedeDailyIncident(s: DailyCampaignState): DailyCampaignState {
  if (s.phase !== 'incident' || !s.incident) throw new Error('현재 중단할 장애가 없습니다.');
  const suppressedCause = s.incident.cause;
  const dau = Math.round(s.dau * 0.78);
  const trust = clip(s.trust - 17, 0, 100);
  return resumeAfterIncident({
    ...s, suppressedCause, dau, trust,
    monthOutageMinutes: s.monthOutageMinutes + 180,
    ops: calculateOperations(s.features, s.investments, dau, marketPeak(s), s.debt),
    feedback: '일부 서비스를 중단했습니다. 이번 달에는 같은 장애를 다시 발생시키지 않지만 사용자 손실이 큽니다.',
    journal: [...s.journal, 'D' + s.day + ' ' + suppressedCause + ' 대응 포기'],
  });
}

export function nextDailyMonth(s: DailyCampaignState): DailyCampaignState {
  if (s.phase !== 'report') throw new Error('월말 리포트를 확인해야 합니다.');
  if (s.month === 3) return { ...s, phase: 'complete', feedback: '90일 캠페인이 종료됐습니다.' };
  const month = s.month + 1;
  return {
    ...s, day: (month - 1) * MONTH_LENGTH + 1, month, phase: 'market',
    preparedThisMonth: false, decidedFeature: false, currentMonthFeature: null,
    peakMultiplier: 1, peakUntilDay: 0, marketBonus: 0, suppressedCause: null,
    monthRevenue: 0, monthCost: 0, monthIncidents: 0, monthOutageMinutes: 0,
    monthHealthyDays: 0, feedback: month + '개월 차 시장 이벤트를 확인하세요.',
  };
}

export function dailyCampaignOutcome(s: DailyCampaignState): 'won' | 'survived' | 'failed' {
  if (s.cash <= 0 || s.trust <= 0) return 'failed';
  if (s.phase !== 'complete') return 'survived';
  return s.history.length === CAMPAIGN_LENGTH && s.features.length === 3
    && s.dau >= 1700 && s.trust >= 50 && s.healthyDays >= 72
    ? 'won' : 'survived';
}

export function dailyScore(s: DailyCampaignState): number {
  const growth = clip(Math.round((s.dau / 1700) * 240), 0, 280);
  const reliability = Math.round((s.healthyDays / CAMPAIGN_LENGTH) * 280);
  const finance = clip(Math.round((s.cash / 3000000) * 160), 0, 200);
  const progress = s.features.length * 60;
  const debtPenalty = s.debt * 1.2;
  return Math.max(0, Math.round(growth + reliability + finance + progress - debtPenalty));
}
