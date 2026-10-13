/**
 * Market deck. Events are chosen from a stable scenario seed and sprint index,
 * independently of feature choices or incident RNG calls.
 * The first sprint always starts with a growth-pressure event.
 */
export type MarketEventId =
  | 'VIRAL_POST' | 'PARTNER_SPOTLIGHT'
  | 'RIVAL_LAUNCH' | 'PRESS_BACKLASH'
  | 'ENTERPRISE_DEAL' | 'CLOUD_INCREASE';

export interface MarketChoice {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly dauDelta: number;
  readonly cashDelta: number;
  readonly trustDelta: number;
  /** Peak load amplification this sprint, not permanent DAU growth. */
  readonly trafficMultiplier: number;
  /** This sprint's extra net revenue; negative amounts indicate loss. */
  readonly revenueBonus: number;
}

export interface MarketEvent {
  readonly id: MarketEventId;
  readonly title: string;
  readonly story: string;
  readonly tag: string;
  readonly options: readonly MarketChoice[];
}

const choice = (
  id: string, label: string, description: string,
  dauDelta: number, cashDelta: number, trustDelta: number,
  trafficMultiplier: number, revenueBonus = 0,
): MarketChoice => ({
  id, label, description, dauDelta, cashDelta, trustDelta, trafficMultiplier, revenueBonus,
});

export const MARKET_EVENTS: Readonly<Record<MarketEventId, MarketEvent>> = {
  VIRAL_POST: {
    id: 'VIRAL_POST', tag: 'TRAFFIC / OPPORTUNITY',
    title: '인플루언서가 우리 서비스를 소개했다!',
    story: '커뮤니티가 SNS에서 바이럴을 탔습니다. 신규 유입이 폭발하고 있지만 현재 인프라가 버틸지는 미지수입니다.',
    options: [
      choice('embrace', '기회를 전부 잡는다', '최대 신규 유입 · 최고 피크 부하', 620, 0, 0, 1.75),
      choice('limit', '신규 유입을 일부 제한한다', '안정성 우선 · 성장 기회 감소', 240, 0, 1, 1.12),
      choice('burst', '긴급 처리 용량을 임대한다', '성장 확보 · 초기 비용 발생', 620, -140000, 0, 1.22),
    ],
  },
  PARTNER_SPOTLIGHT: {
    id: 'PARTNER_SPOTLIGHT', tag: 'GROWTH / PARTNERSHIP',
    title: '유명 커뮤니티와 제휴 제안',
    story: '큰 커뮤니티가 당신의 서비스로 사용자들을 유입시키겠다고 합니다. 단기간 유입이 생기지만 서버도 바빠집니다.',
    options: [
      choice('full', '전면 제휴를 수락한다', '성장 폭이 크지만 높은 피크 부하', 480, 90000, 0, 1.55),
      choice('pilot', '소규모 파일럿부터 진행한다', '현금 보너스 · 완만한 성장', 180, 40000, 0, 1.12),
      choice('pass', '현재 사용자에 집중한다', '새로운 부담 없이 신뢰도 유지', 0, 0, 3, 1.0),
    ],
  },
  RIVAL_LAUNCH: {
    id: 'RIVAL_LAUNCH', tag: 'MARKET / COMPETITION',
    title: '강력한 경쟁 서비스 등장',
    story: '비슷한 서비스를 가진 경쟁사가 대형 마케팅을 시작했습니다. 일부 사용자가 떠날 조짐이 보입니다.',
    options: [
      choice('counter', '맞불 마케팅으로 대응한다', '현금 지출 · 유입 회복 · 트래픽 증가', 350, -165000, -2, 1.3),
      choice('retention', '기존 사용자 품질에 집중한다', '신규 유입 감소 · 고객 신뢰 강화', -110, 0, 5, 0.96),
      choice('community', '커뮤니티 이벤트를 연다', '저비용 마케팅 · 완만한 회복', 110, -60000, 1, 1.10),
    ],
  },
  PRESS_BACKLASH: {
    id: 'PRESS_BACKLASH', tag: 'TRUST / REPUTATION',
    title: '서비스 품질 논란이 확산 중',
    story: '사용자들이 느린 응답과 부족한 안내를 비판하고 있습니다. 신뢰가 흔들리는 상황입니다.',
    options: [
      choice('transparent', '공식 해명과 보상 공지', '비용 지출 · 신뢰 회복', -30, -100000, 8, 0.98),
      choice('ignore', '일단 대응하지 않는다', '비용은 아끼지만 이용자 이탈', -230, 0, -13, 0.94),
      choice('focus', '고객 지원을 강화한다', '부분 회복 · 적은 비용', -80, -45000, 4, 0.98),
    ],
  },
  ENTERPRISE_DEAL: {
    id: 'ENTERPRISE_DEAL', tag: 'B2B / REVENUE',
    title: '대형 고객의 도입 문의',
    story: '기업 고객이 단체 이용을 제안했습니다. 수익성이 좋아질 수 있지만 운영 부하와 안정성 요구가 높아집니다.',
    options: [
      choice('full', '전면 도입 계약을 맺는다', '수익 기회 증가 · 높은 피크 부하', 460, 0, 0, 1.65, 170000),
      choice('staged', '단계별 도입을 제안한다', '기술 준비 비용 · 안정적인 유입', 190, -60000, 2, 1.18, 75000),
      choice('pass', '이번 계약은 거절한다', '운영 안정성 확보', 0, 0, 2, 1.0),
    ],
  },
  CLOUD_INCREASE: {
    id: 'CLOUD_INCREASE', tag: 'COST / OPERATIONS',
    title: '클라우드 요금이 예상보다 높다',
    story: '예상보다 많은 네트워크 전송과 스토리지 비용이 청구됐습니다. 비용 절감과 서비스 품질 중 선택해야 합니다.',
    options: [
      choice('absorb', '비용을 부담하고 운영을 유지한다', '추가 비용 · 서비스 영향 없음', 0, -130000, 0, 1.0),
      choice('optimize', '비용 효율 개선 작업을 한다', '작업 비용 · 일부 사용자 영향', -60, -55000, 1, 0.93),
      choice('delay', '비용을 줄이지 않고 기능을 축소한다', '현금 보존 · 수익 감소', -80, 0, -4, 0.95, -65000),
    ],
  },
};

const DECK: readonly (readonly MarketEventId[])[] = [
  ['VIRAL_POST', 'PARTNER_SPOTLIGHT'],
  ['RIVAL_LAUNCH', 'PRESS_BACKLASH'],
  ['ENTERPRISE_DEAL', 'CLOUD_INCREASE'],
];

export function marketEventForSprint(seed: number, sprint: number): MarketEvent {
  if (!Number.isInteger(sprint) || sprint < 1 || sprint > DECK.length) {
    throw new Error('존재하지 않는 시장 이벤트 단계입니다.');
  }
  // Arithmetic is independent from game actions, preventing RNG-call-order drift.
  const mask = ((seed >>> 0) ^ Math.imul(sprint, 0x9e3779b9)) >>> 0;
  return MARKET_EVENTS[DECK[sprint - 1][mask & 1]];
}

export interface MarketDecisionRecord {
  readonly sprint: number;
  readonly eventId: MarketEventId;
  readonly choiceId: string;
  readonly label: string;
  readonly dauDelta: number;
  readonly cashDelta: number;
  readonly trustDelta: number;
  readonly trafficMultiplier: number;
  readonly revenueBonus: number;
}
