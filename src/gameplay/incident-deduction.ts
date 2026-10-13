import type { IncidentCauseId, NodeId, OperationalSnapshot } from './operational-model';

/** Names are hypotheses shown to players, not an automatic answer key. */
export type HypothesisId = IncidentCauseId | 'DEBT_REGRESSION';
export type EvidenceProbe = 'metrics' | 'logs' | 'trace';

export interface HypothesisOption {
  id: HypothesisId;
  name: string;
  check: string;
  category: string;
}

export interface HypothesisAttempt {
  id: HypothesisId;
  matched: boolean;
  evidenceCount: number;
}

/** All candidate explanations remain visible, including plausible distractors. */
export const HYPOTHESES: readonly HypothesisOption[] = [
  { id: 'SEARCH_SCAN', name: '비효율적인 SQL 실행 계획', check: '특정 검색 쿼리의 실행 계획과 DB span을 확인', category: 'DATABASE' },
  { id: 'DB_CAPACITY', name: 'DB 전체 처리 용량 부족', check: '여러 쿼리·요청의 동시 지연과 DB 처리량 확인', category: 'DATABASE' },
  { id: 'POOL_EXHAUSTION', name: 'DB Connection 점유·고갈', check: 'Pool 대기 시간과 트랜잭션의 점유 범위 확인', category: 'DATABASE' },
  { id: 'APP_CAPACITY', name: '애플리케이션 처리량 포화', check: 'APP 실행 span 및 CPU 대기열 확인', category: 'APPLICATION' },
  { id: 'DEBT_REGRESSION', name: '신규 배포로 발생한 회귀 결함', check: '배포 시점과 예외 스택의 상관관계 확인', category: 'APPLICATION' },
  { id: 'STORAGE_IO', name: '저장소 쓰기 I/O 병목', check: '파일 저장 단계의 지연과 스토리지 I/O 확인', category: 'STORAGE' },
  { id: 'QUEUE_CONSUMER', name: '비동기 Consumer 처리량 부족', check: 'Queue 유입/소비 속도 및 오래된 메시지 확인', category: 'ASYNC' },
];

/**
 * Each probe exposes observations, not conclusions. Numbers come from the same
 * model as the rest of the dashboard. A metric alone often cannot distinguish
 * two plausible causes (e.g. SEARCH_SCAN vs DB_CAPACITY).
 */
export function incidentEvidence(
  cause: HypothesisId,
  probe: EvidenceProbe,
  operations: OperationalSnapshot,
  debt: number,
): string {
  const db = operations.nodes.DB;
  const app = operations.nodes.APP;
  const storage = operations.nodes.STORAGE;
  const queue = operations.nodes.QUEUE;
  const sharedDb = `DB ${db.utilization}% · APP ${app.utilization}% · P95 ${operations.p95Ms}ms. 단일 지표만으로 원인을 확정하기 어렵습니다.`;
  const sharedApp = `APP ${app.utilization}% · DB ${db.utilization}% · 기술 부채 ${debt}/100. 배포 여부와 내부 지연 구간 확인이 필요합니다.`;
  const signals: Record<HypothesisId, readonly [string, string, string]> = {
    SEARCH_SCAN: [
      sharedDb,
      '느린 쿼리가 검색 GET 경로에 집중됩니다. 다른 API의 DB 대기 시간은 비교적 일정합니다.',
      '검색 요청의 SELECT span이 길고 읽은 행 수가 반환 행 수보다 크게 많습니다.',
    ],
    DB_CAPACITY: [
      sharedDb,
      '검색·광고·게시글 등 여러 경로에서 쿼리별 지연이 함께 늘었고 특정 SQL 하나로 집중되지 않습니다.',
      '여러 DB span이 동시에 늘어납니다. APP 실행·Connection 획득보다 DB 처리 구간 자체가 길어집니다.',
    ],
    POOL_EXHAUSTION: [
      `DB ${db.utilization}% · Connection 점유 ${operations.poolUsePercent}%. CPU만으로는 Pool 대기 여부가 구분되지 않습니다.`,
      'Connection acquisition timeout이 광고 집계 요청의 트랜잭션 경계에서 반복됩니다.',
      'DB 쿼리 자체보다 Connection 대기 구간이 길고 외부 I/O 이후에 반환되는 패턴이 있습니다.',
    ],
    APP_CAPACITY: [
      sharedApp,
      '다수의 HTTP 요청이 애플리케이션 실행 대기열에서 지연됩니다. DB 응답 시간은 상대적으로 일정합니다.',
      'APP 실행 span과 요청 대기 시간이 증가합니다. DB span의 비중은 낮습니다.',
    ],
    DEBT_REGRESSION: [
      sharedApp,
      '최근 배포 직후 특정 API에서 예외 스택이 늘었습니다. CPU는 장애 발생의 충분한 설명이 아닙니다.',
      '요청이 DB·Storage에 닿기 전 신규 코드 경로에서 예외로 종료됩니다.',
    ],
    STORAGE_IO: [
      `저장소 ${storage.utilization}% · APP ${app.utilization}%. 업로드 실패와 파일 쓰기 지연을 같이 살펴봐야 합니다.`,
      '업로드 요청에서 파일 쓰기 시간 초과가 반복됩니다. 메타데이터 DB 저장은 정상입니다.',
      '파일 쓰기 단계가 요청 시간 대부분을 차지합니다. DB span은 짧게 유지됩니다.',
    ],
    QUEUE_CONSUMER: [
      `Queue 부하 ${queue.utilization}% · APP ${app.utilization}%. API 성공률만 보면 지연이 감춰질 수 있습니다.`,
      '메시지 발행 속도가 소비 완료 속도를 지속적으로 초과하며 오래된 메시지가 누적됩니다.',
      '비동기 Consumer의 외부 전송 구간에서 긴 대기가 발생해 동시에 처리 가능한 메시지가 줄었습니다.',
    ],
  };
  const index: Record<EvidenceProbe, number> = { metrics: 0, logs: 1, trace: 2 };
  return signals[cause][index[probe]];
}

export function hypothesisById(id: HypothesisId): HypothesisOption {
  const matched = HYPOTHESES.find((item) => item.id === id);
  if (!matched) throw new Error('존재하지 않는 장애 원인 가설입니다.');
  return matched;
}

export function affectedNode(cause: HypothesisId): NodeId {
  if (cause === 'SEARCH_SCAN' || cause === 'DB_CAPACITY' || cause === 'POOL_EXHAUSTION') return 'DB';
  if (cause === 'STORAGE_IO') return 'STORAGE';
  if (cause === 'QUEUE_CONSUMER') return 'QUEUE';
  return 'APP';
}
