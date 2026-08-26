import type { LoadSnapshot } from './infrastructure';

export interface IncidentDiagnosisInput {
  nodeId: string;
  load: LoadSnapshot;
  techDebt: number;
  trafficMultiplier?: number;
}

export interface IncidentDiagnosis {
  primarySignal: string;
  primaryRatio: number;
  likelyCause: string;
  signals: readonly string[];
  suggestions: readonly string[];
}

function percent(value: number): string {
  return `${Math.max(0, Math.round(value * 100))}%`;
}

function strongest(
  candidates: Array<{ label: string; ratio: number }>,
): { label: string; ratio: number } {
  return [...candidates].sort((left, right) => right.ratio - left.ratio)[0];
}

export class IncidentDiagnosisPolicy {
  static diagnose(input: IncidentDiagnosisInput): IncidentDiagnosis {
    const trafficMultiplier = Math.max(1, input.trafficMultiplier ?? 1);
    let primary = { label: 'SERVICE LOAD', ratio: Math.max(input.load.appRatio, input.load.dbRatio, input.load.asyncRatio, input.load.storageRatio) };
    let suggestions: string[] = ['현재 병목을 확인한 뒤 Capacity 또는 구조 변경'];

    if (input.nodeId.startsWith('framework:')) {
      primary = strongest([
        { label: 'APP CPU', ratio: input.load.appCpuRatio },
        { label: 'APP I/O', ratio: input.load.appIoRatio },
      ]);
      suggestions = primary.label === 'APP CPU'
        ? ['APP Scale-up', 'ALB + Scale-out', '개발자 숙련도 향상']
        : ['ALB + Scale-out', 'Queue로 비동기 I/O 분리', '요청량 급증 여부 확인'];
    } else if (input.nodeId.startsWith('database:')) {
      primary = strongest([
        { label: 'DB CPU', ratio: input.load.dbCpuRatio },
        { label: 'DB I/O', ratio: input.load.dbIoRatio },
      ]);
      suggestions = primary.label === 'DB I/O'
        ? ['Redis로 Read I/O 절감', 'Read Replica 추가', 'DB Size-up']
        : ['DB Size-up', 'Replica로 Query 분산', 'DB 숙련도 향상'];
    } else if (input.nodeId === 'technology:REDIS') {
      primary = { label: 'DB I/O', ratio: input.load.dbIoRatio };
      suggestions = ['Cache 의존도를 확인', 'DB Capacity 확보', '장애 복구 우선'];
    } else if (input.nodeId === 'technology:SQS' || input.nodeId === 'technology:RABBITMQ' || input.nodeId === 'technology:KAFKA') {
      primary = { label: 'ASYNC', ratio: input.load.asyncRatio };
      suggestions = ['Queue Capacity 상향', '상위 Queue 기술 검토', 'Event-heavy 기능 부하 확인'];
    } else if (input.nodeId === 'technology:OBJECT_STORAGE') {
      primary = { label: 'STORAGE', ratio: input.load.storageRatio };
      suggestions = ['Storage Capacity 확인', '이미지/파일 기능 부하 확인', '장애 복구 우선'];
    } else if (input.nodeId === 'technology:ALB') {
      primary = { label: 'APP', ratio: input.load.appRatio };
      suggestions = ['APP 서버 상태 확인', 'Scale-out 구성 확인', '트래픽 급증 여부 확인'];
    }

    const signals: string[] = [`${primary.label} ${percent(primary.ratio)}`];
    if (trafficMultiplier > 1) signals.push(`Traffic ×${trafficMultiplier.toFixed(1)}`);
    if (input.techDebt >= 40) signals.push(`Tech Debt ${input.techDebt}/100`);
    if (input.load.failureRate >= 0.01) signals.push(`Request Failure ${percent(input.load.failureRate)}`);

    let likelyCause = primary.ratio > 1
      ? `${primary.label} Capacity 초과가 가장 강한 신호입니다.`
      : primary.ratio >= 0.85
        ? `${primary.label}가 Critical 구간에 근접해 있습니다.`
        : `${primary.label}만으로는 과부하 원인이 확정되지 않습니다.`;

    if (trafficMultiplier > 1 && primary.ratio >= 0.85) {
      likelyCause = `Traffic Spike가 ${primary.label} 병목을 드러낸 가능성이 높습니다.`;
    } else if (input.techDebt >= 60 && input.nodeId.startsWith('framework:')) {
      likelyCause = `높은 Tech Debt와 ${primary.label} 압력이 함께 장애 위험을 높였습니다.`;
    } else if (input.load.failureRate >= 0.1) {
      likelyCause = `요청 실패율이 높습니다. ${primary.label}와 Request Flow를 함께 확인해야 합니다.`;
    }

    return {
      primarySignal: primary.label,
      primaryRatio: primary.ratio,
      likelyCause,
      signals,
      suggestions,
    };
  }
}
