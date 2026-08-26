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
  }
}

export const TECHNOLOGIES: Record<BuildableTechnologyId, TechnologyDefinition> = {
  REDIS: new TechnologyDefinition({
    id: 'REDIS', name: 'Redis', buildWork: 7, buildCost: 300_000, monthlyCost: 100_000,
    incidentRisk: 2, incidentDifficulty: 3, prerequisites: { DATABASE: 2, NETWORK: 2 },
  }),
  SQS: new TechnologyDefinition({
    id: 'SQS', name: 'SQS', buildWork: 5, buildCost: 200_000, monthlyCost: 80_000,
    incidentRisk: 1, incidentDifficulty: 2, prerequisites: { NETWORK: 2, SOFTWARE_DESIGN: 2 },
  }),
  RABBITMQ: new TechnologyDefinition({
    id: 'RABBITMQ', name: 'RabbitMQ', buildWork: 10, buildCost: 500_000, monthlyCost: 150_000,
    incidentRisk: 3, incidentDifficulty: 4, prerequisites: { NETWORK: 3, SOFTWARE_DESIGN: 3 },
  }),
  KAFKA: new TechnologyDefinition({
    id: 'KAFKA', name: 'Kafka', buildWork: 18, buildCost: 1_500_000, monthlyCost: 350_000,
    incidentRisk: 4, incidentDifficulty: 7, prerequisites: { NETWORK: 4, OS_RUNTIME: 4, SOFTWARE_DESIGN: 3 },
  }),
  ALB: new TechnologyDefinition({
    id: 'ALB', name: 'Application Load Balancer', buildWork: 4, buildCost: 150_000, monthlyCost: 100_000,
    incidentRisk: 1, incidentDifficulty: 2, prerequisites: { NETWORK: 2 },
  }),
  OBJECT_STORAGE: new TechnologyDefinition({
    id: 'OBJECT_STORAGE', name: 'Object Storage', buildWork: 5, buildCost: 200_000, monthlyCost: 80_000,
    incidentRisk: 1, incidentDifficulty: 2, prerequisites: { NETWORK: 2, SOFTWARE_DESIGN: 2 },
  }),
};

const BUILD_PRODUCTIVITY: Record<number, number> = {
  1: 0.65, 2: 0.75, 3: 0.85, 4: 0.93, 5: 1,
  6: 1.08, 7: 1.16, 8: 1.25, 9: 1.35, 10: 1.5,
};

export class TechnologyBuildTask {
  private _completedWork = 0;

  constructor(readonly definition: TechnologyDefinition) {}

  get completedWork(): number { return this._completedWork; }
  get completed(): boolean { return this._completedWork >= this.definition.buildWork; }

  advanceDay(technologyLevel: number, incidentModifier: number): number {
    if (this.completed) return 0;
    const progress = BUILD_PRODUCTIVITY[technologyLevel] * incidentModifier;
    this._completedWork = Math.min(this.definition.buildWork, this._completedWork + progress);
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
