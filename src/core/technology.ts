import { DeveloperProfile, FundamentalSkillId, skillRef, TechnologySkillId } from './learning';

export type BuildableTechnologyId = 'REDIS' | 'SQS' | 'RABBITMQ' | 'KAFKA' | 'ALB' | 'OBJECT_STORAGE';

export interface TechnologyDefinitionProps {
  id: BuildableTechnologyId;
  name: string;
  buildWork: number;
  buildCost: number;
  monthlyCost: number;
  incidentRisk: 1 | 2 | 3 | 4 | 5;
  incidentDifficulty: number;
  prerequisites: Partial<Record<FundamentalSkillId, number>>;
  benefits?: string[];
  tradeoffs?: string[];
}

export class TechnologyDefinition {
  readonly id: BuildableTechnologyId;
  readonly name: string;
  readonly buildWork: number;
  readonly buildCost: number;
  readonly monthlyCost: number;
  readonly incidentRisk: 1 | 2 | 3 | 4 | 5;
  readonly incidentDifficulty: number;
  readonly prerequisites: Readonly<Partial<Record<FundamentalSkillId, number>>>;
  readonly benefits: readonly string[];
  readonly tradeoffs: readonly string[];

  constructor(props: TechnologyDefinitionProps) {
    Object.assign(this, props);
    this.id = props.id;
    this.name = props.name;
    this.buildWork = props.buildWork;
    this.buildCost = props.buildCost;
    this.monthlyCost = props.monthlyCost;
    this.incidentRisk = props.incidentRisk;
    this.incidentDifficulty = props.incidentDifficulty;
    this.prerequisites = { ...props.prerequisites };
    this.benefits = [...(props.benefits ?? [])];
    this.tradeoffs = [...(props.tradeoffs ?? [])];
  }
}

export const TECHNOLOGIES: Record<BuildableTechnologyId, TechnologyDefinition> = {
  REDIS: new TechnologyDefinition({
    id: 'REDIS', name: 'Redis', buildWork: 7, buildCost: 300_000, monthlyCost: 100_000,
    incidentRisk: 2, incidentDifficulty: 3, prerequisites: { DATABASE: 2, NETWORK: 2 },
    benefits: ['Read-heavy DB I/O를 크게 줄임', '읽기 병목의 P95 개선에 유리'],
    tradeoffs: ['월 비용과 Cache 장애 지점 추가', 'Write-heavy 병목에는 효과가 작음'],
  }),
  SQS: new TechnologyDefinition({
    id: 'SQS', name: 'SQS', buildWork: 5, buildCost: 200_000, monthlyCost: 80_000,
    incidentRisk: 1, incidentDifficulty: 2, prerequisites: { NETWORK: 2, SOFTWARE_DESIGN: 2 },
    benefits: ['APP의 비동기 I/O 압력을 빠르게 분리', '구축이 빠르고 장애 위험이 낮음'],
    tradeoffs: ['초대규모 Event-heavy 처리에는 한계', '고급 스트리밍 패턴에는 약함'],
  }),
  RABBITMQ: new TechnologyDefinition({
    id: 'RABBITMQ', name: 'RabbitMQ', buildWork: 10, buildCost: 500_000, monthlyCost: 150_000,
    incidentRisk: 3, incidentDifficulty: 4, prerequisites: { NETWORK: 3, SOFTWARE_DESIGN: 3 },
    benefits: ['SQS보다 높은 Queue Capacity', '범용 비동기 작업 처리에 강함'],
    tradeoffs: ['구축 시간이 길고 운영 위험 증가', 'Kafka보다 Event-heavy 효율은 낮음'],
  }),
  KAFKA: new TechnologyDefinition({
    id: 'KAFKA', name: 'Kafka', buildWork: 18, buildCost: 1_500_000, monthlyCost: 350_000,
    incidentRisk: 4, incidentDifficulty: 7, prerequisites: { NETWORK: 4, OS_RUNTIME: 4, SOFTWARE_DESIGN: 3 },
    benefits: ['가장 높은 Queue Capacity', 'Event-heavy Async Demand를 추가로 절감'],
    tradeoffs: ['구축비·월 비용·구축 시간이 큼', '장애 위험과 복구 난이도가 높음'],
  }),
  ALB: new TechnologyDefinition({
    id: 'ALB', name: 'Application Load Balancer', buildWork: 4, buildCost: 150_000, monthlyCost: 100_000,
    incidentRisk: 1, incidentDifficulty: 2, prerequisites: { NETWORK: 2 },
    benefits: ['APP Scale-out을 해금', '서버 여러 대로 CPU/I/O를 분산 가능'],
    tradeoffs: ['월 고정 비용 추가', '트래픽 경로에 장애 지점 하나 추가'],
  }),
  OBJECT_STORAGE: new TechnologyDefinition({
    id: 'OBJECT_STORAGE', name: 'Object Storage', buildWork: 5, buildCost: 200_000, monthlyCost: 80_000,
    incidentRisk: 1, incidentDifficulty: 2, prerequisites: { NETWORK: 2, SOFTWARE_DESIGN: 2 },
    benefits: ['Storage Capacity를 크게 확장', '이미지 기능의 저장 한계를 늦춤'],
    tradeoffs: ['월 비용 추가', 'Storage 경로 장애 가능성 추가'],
  }),
};

const BUILD_PRODUCTIVITY: Record<number, number> = {
  1: 0.65, 2: 0.75, 3: 0.85, 4: 0.93, 5: 1,
  6: 1.08, 7: 1.16, 8: 1.25, 9: 1.35, 10: 1.5,
};

export function technologyBuildProductivity(level: number): number {
  const normalized = Math.max(1, Math.min(10, Math.round(level)));
  return BUILD_PRODUCTIVITY[normalized];
}

export class TechnologyBuildTask {
  private _completedWork = 0;
  private _elapsedDays = 0;

  constructor(readonly definition: TechnologyDefinition) {}

  get completedWork(): number { return this._completedWork; }
  get elapsedDays(): number { return this._elapsedDays; }
  get completed(): boolean { return this._completedWork >= this.definition.buildWork; }

  estimatedRemainingDays(technologyLevel: number, incidentModifier: number): number {
    const dailyProgress = technologyBuildProductivity(technologyLevel) * incidentModifier;
    if (dailyProgress <= 0) return 0;
    return Math.max(0, Math.ceil((this.definition.buildWork - this._completedWork) / dailyProgress));
  }

  advanceDay(technologyLevel: number, incidentModifier: number): number {
    if (this.completed) return 0;
    const progress = technologyBuildProductivity(technologyLevel) * incidentModifier;
    this._completedWork = Math.min(this.definition.buildWork, this._completedWork + progress);
    this._elapsedDays += 1;
    return progress;
  }
}

export class TechnologyBuildSlot {
  private _current: TechnologyBuildTask | null = null;

  get current(): TechnologyBuildTask | null { return this._current; }

  start(id: BuildableTechnologyId, developer: DeveloperProfile): TechnologyBuildTask {
    if (this._current) throw new Error('A technology build is already in progress');
    const definition = TECHNOLOGIES[id];

    for (const [fundamental, requiredLevel] of Object.entries(definition.prerequisites)) {
      const ref = skillRef.fundamental(fundamental as FundamentalSkillId);
      if (developer.get(ref).level < (requiredLevel ?? 1)) {
        throw new Error(`Requires ${fundamental} Lv.${requiredLevel}`);
      }
    }

    this._current = new TechnologyBuildTask(definition);
    return this._current;
  }

  advanceDay(developer: DeveloperProfile, incidentModifier: number): BuildableTechnologyId | null {
    if (!this._current) return null;
    const technologyId = this._current.definition.id as TechnologySkillId;
    const level = developer.get(skillRef.technology(technologyId)).level;
    this._current.advanceDay(level, incidentModifier);
    if (!this._current.completed) return null;

    const finished = this._current.definition.id;
    this._current = null;
    return finished;
  }
}
