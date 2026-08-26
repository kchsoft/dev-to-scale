import { DatabaseDefinition, DatabaseId } from './database';
import { FeatureDefinition, FrameworkDefinition, FrameworkId } from './feature';
import { RequestFlowResult, RequestFlowSimulator, RequestNodeKind } from './request-flow';
import { BuildableTechnologyId, TECHNOLOGIES } from './technology';

export enum ServerSize {
  SMALL = 'SMALL',
  MEDIUM = 'MEDIUM',
  LARGE = 'LARGE',
  XLARGE = 'XLARGE',
}

export type { DatabaseId } from './database';
export type TechnologyId = BuildableTechnologyId;
export type QueueTechnologyId = 'SQS' | 'RABBITMQ' | 'KAFKA';

export const QUEUE_TECHNOLOGY_IDS: readonly QueueTechnologyId[] = ['SQS', 'RABBITMQ', 'KAFKA'];

export function isQueueTechnology(technology: TechnologyId): technology is QueueTechnologyId {
  return QUEUE_TECHNOLOGY_IDS.includes(technology as QueueTechnologyId);
}

const APP_SIZE: Record<ServerSize, { capacity: number; cost: number }> = {
  [ServerSize.SMALL]: { capacity: 100, cost: 100_000 },
  [ServerSize.MEDIUM]: { capacity: 180, cost: 200_000 },
  [ServerSize.LARGE]: { capacity: 320, cost: 400_000 },
  [ServerSize.XLARGE]: { capacity: 520, cost: 800_000 },
};

const DB_SIZE: Record<ServerSize, { capacity: number; cost: number }> = {
  [ServerSize.SMALL]: { capacity: 80, cost: 120_000 },
  [ServerSize.MEDIUM]: { capacity: 150, cost: 250_000 },
  [ServerSize.LARGE]: { capacity: 270, cost: 500_000 },
  [ServerSize.XLARGE]: { capacity: 450, cost: 1_000_000 },
};

const ASYNC_CAPACITY: Partial<Record<TechnologyId, number>> = {
  SQS: 300,
  RABBITMQ: 500,
  KAFKA: 1_000,
};

const CAPACITY_TUNING: Record<number, number> = {
  1: 1,
  2: 1.02,
  3: 1.04,
  4: 1.06,
  5: 1.08,
  6: 1.10,
  7: 1.13,
  8: 1.16,
  9: 1.20,
  10: 1.25,
};

export function capacityTuningMultiplier(level: number): number {
  const normalized = Math.max(1, Math.min(10, Math.round(level)));
  return CAPACITY_TUNING[normalized];
}

export class AppCluster {
  private albAvailable: boolean;

  constructor(
    readonly frameworkId: FrameworkId,
    private _size: ServerSize = ServerSize.SMALL,
    private _count = 1,
    albAvailable = false,
  ) {
    if (_count < 1 || _count > 10) throw new Error('Application server count must be between 1 and 10');
    this.albAvailable = albAvailable;
    if (_count > 1 && !albAvailable) throw new Error('ALB is required for more than one application server');
  }

  get size(): ServerSize { return this._size; }
  get count(): number { return this._count; }

  enableAlb(): void { this.albAvailable = true; }
  scaleUp(size: ServerSize): void { this._size = size; }

  addServer(): void {
    if (!this.albAvailable) throw new Error('ALB is required before application scale-out');
    if (this._count >= 10) throw new Error('Application server limit reached');
    this._count += 1;
  }

  get capacity(): number {
    const framework = FrameworkDefinition.byId(this.frameworkId);
    return APP_SIZE[this._size].capacity * this._count * framework.capacityModifier;
  }

  get monthlyCost(): number {
    const framework = FrameworkDefinition.byId(this.frameworkId);
    return APP_SIZE[this._size].cost * this._count * framework.costModifier;
  }
}

export class DatabaseCluster {
  constructor(
    readonly databaseId: DatabaseId,
    private _size: ServerSize = ServerSize.SMALL,
    private _replicaCount = 0,
  ) {
    if (_replicaCount < 0 || _replicaCount > 3) throw new Error('Replica count must be between 0 and 3');
  }

  get size(): ServerSize { return this._size; }
  get replicaCount(): number { return this._replicaCount; }

  scaleUp(size: ServerSize): void { this._size = size; }

  addReplica(): void {
    if (this._replicaCount >= 3) throw new Error('Database replica limit reached');
    this._replicaCount += 1;
  }

  get capacity(): number {
    const database = DatabaseDefinition.byId(this.databaseId);
    return DB_SIZE[this._size].capacity * (1 + 0.6 * this._replicaCount) * database.capacityModifier;
  }

  get monthlyCost(): number {
    const database = DatabaseDefinition.byId(this.databaseId);
    return DB_SIZE[this._size].cost * (1 + this._replicaCount) * database.costModifier;
  }
}

export class InfrastructureState {
  private readonly technologies = new Set<TechnologyId>();

  constructor(readonly app: AppCluster, readonly database: DatabaseCluster) {}

  static initial(frameworkId: FrameworkId, databaseId: DatabaseId): InfrastructureState {
    return new InfrastructureState(
      new AppCluster(frameworkId, ServerSize.SMALL, 1, false),
      new DatabaseCluster(databaseId, ServerSize.SMALL, 0),
    );
  }

  /**
   * V1 allows one active queue implementation. The collection-shaped model is
   * intentionally retained so a future MSA topology can attach queues per service.
   */
  deployTechnology(technology: TechnologyId): readonly TechnologyId[] {
    const retired: TechnologyId[] = [];

    if (isQueueTechnology(technology)) {
      for (const queue of this.queueTechnologies) {
        if (queue === technology) continue;
        this.technologies.delete(queue);
        retired.push(queue);
      }
    }

    this.technologies.add(technology);
    if (technology === 'ALB') this.app.enableAlb();
    return retired;
  }

  hasTechnology(technology: TechnologyId): boolean { return this.technologies.has(technology); }
  get deployedTechnologies(): readonly TechnologyId[] { return [...this.technologies]; }

  get queueTechnologies(): readonly QueueTechnologyId[] {
    return QUEUE_TECHNOLOGY_IDS.filter((technology) => this.technologies.has(technology));
  }

  get queueTechnology(): QueueTechnologyId | null {
    return this.queueTechnologies[0] ?? null;
  }

  get asyncCapacity(): number {
    const queue = this.queueTechnology;
    return queue ? ASYNC_CAPACITY[queue] ?? 0 : 0;
  }

  get storageCapacity(): number { return this.hasTechnology('OBJECT_STORAGE') ? 1_000 : 100; }

  get monthlyCost(): number {
    let total = this.app.monthlyCost + this.database.monthlyCost;
    for (const technology of this.technologies) total += TECHNOLOGIES[technology].monthlyCost;
    return total;
  }
}

export interface LoadCalculationContext {
  appProficiencyLevel?: number;
  databaseProficiencyLevel?: number;
  technologyProficiencyLevels?: Partial<Record<TechnologyId, number>>;
  nodeHealth?: Partial<Record<RequestNodeKind, number>>;
}

export interface LoadSnapshot {
  appDemand: number;
  dbDemand: number;
  asyncDemand: number;
  storageDemand: number;
  rawAppCapacity: number;
  rawDbCapacity: number;
  rawAsyncCapacity: number;
  appCapacity: number;
  dbCapacity: number;
  asyncCapacity: number;
  storageCapacity: number;
  appRatio: number;
  dbRatio: number;
  asyncRatio: number;
  storageRatio: number;
  failureRate: number;
  requestFlows: readonly RequestFlowResult[];
}

const LOAD_CURVE = {
  app: { coefficient: 0.55, exponent: 0.63 },
  db: { coefficient: 0.96, exponent: 0.42 },
  async: { coefficient: 0.39, exponent: 0.55 },
  storage: { coefficient: 0.33, exponent: 0.66 },
} as const;

function demand(weight: number, dau: number, curve: { coefficient: number; exponent: number }): number {
  if (dau <= 0 || weight <= 0) return 0;
  return weight * curve.coefficient * Math.pow(dau / 1_000, curve.exponent);
}

function queueRequirement(feature: FeatureDefinition): 'REQUIRED' | 'OPTIONAL' | null {
  const queueStep = feature.requestRoute.find((step) => step.node === 'QUEUE');
  return queueStep ? queueStep.requirement ?? 'REQUIRED' : null;
}

export class LoadCalculator {
  static calculate(
    dau: number,
    features: readonly FeatureDefinition[],
    infrastructure: InfrastructureState,
    context: LoadCalculationContext = {},
  ): LoadSnapshot {
    const queue = infrastructure.queueTechnology;
    const requestFlows = features.map((feature) => RequestFlowSimulator.simulate(feature, {
      prependAlb: infrastructure.hasTechnology('ALB'),
      available: {
        ALB: infrastructure.hasTechnology('ALB'),
        APP: true,
        DB: true,
        CACHE: infrastructure.hasTechnology('REDIS'),
        QUEUE: Boolean(queue),
        STORAGE: true,
        AI: true,
      },
      health: context.nodeHealth,
    }));

    let appDemand = 0;
    let dbDemand = 0;
    let asyncDemand = 0;
    let storageDemand = 0;
    let weightedSuccess = 0;
    let totalTrafficWeight = 0;

    features.forEach((feature, index) => {
      const flow = requestFlows[index];
      const appBase = demand(feature.load.app, dau, LOAD_CURVE.app);
      const dbBase = demand(feature.load.db, dau, LOAD_CURVE.db);
      const asyncBase = demand(feature.load.async, dau, LOAD_CURVE.async);
      const storageBase = demand(feature.load.storage, dau, LOAD_CURVE.storage);

      appDemand += appBase * flow.arrivalRatio('APP');
      dbDemand += dbBase * flow.arrivalRatio('DB');
      storageDemand += storageBase * flow.arrivalRatio('STORAGE');

      const requirement = queueRequirement(feature);
      if (queue) {
        const kafkaModifier = queue === 'KAFKA' && feature.tags.has('EVENT_HEAVY') ? 0.85 : 1;
        asyncDemand += asyncBase * flow.arrivalRatio('QUEUE') * kafkaModifier;
      } else if (requirement === 'OPTIONAL') {
        appDemand += asyncBase * flow.arrivalRatio('APP');
      }

      const trafficWeight = Math.max(
        1,
        feature.load.app + feature.load.db + feature.load.async + feature.load.storage,
      );
      totalTrafficWeight += trafficWeight;
      weightedSuccess += trafficWeight * flow.successRatio;
    });

    if (infrastructure.hasTechnology('REDIS')) {
      const hasReadHeavy = features.some((feature) => feature.tags.has('READ_HEAVY'));
      const cacheHealth = Math.max(0, Math.min(1, context.nodeHealth?.CACHE ?? 1));
      const reduction = (hasReadHeavy ? 0.30 : 0.25) * cacheHealth;
      dbDemand *= 1 - reduction;
    }

    const rawAppCapacity = infrastructure.app.capacity;
    const rawDbCapacity = infrastructure.database.capacity;
    const rawAsyncCapacity = infrastructure.asyncCapacity;
    const appCapacity = rawAppCapacity * capacityTuningMultiplier(context.appProficiencyLevel ?? 1);
    const dbCapacity = rawDbCapacity * capacityTuningMultiplier(context.databaseProficiencyLevel ?? 1);
    const queueLevel = queue ? context.technologyProficiencyLevels?.[queue] ?? 1 : 1;
    const asyncCapacity = rawAsyncCapacity * capacityTuningMultiplier(queueLevel);
    const storageCapacity = infrastructure.storageCapacity;
    const failureRate = totalTrafficWeight > 0 ? 1 - weightedSuccess / totalTrafficWeight : 0;

    return {
      appDemand,
      dbDemand,
      asyncDemand,
      storageDemand,
      rawAppCapacity,
      rawDbCapacity,
      rawAsyncCapacity,
      appCapacity,
      dbCapacity,
      asyncCapacity,
      storageCapacity,
      appRatio: appCapacity > 0 ? appDemand / appCapacity : 0,
      dbRatio: dbCapacity > 0 ? dbDemand / dbCapacity : 0,
      asyncRatio: queue && asyncCapacity > 0 ? asyncDemand / asyncCapacity : 0,
      storageRatio: storageCapacity > 0 ? storageDemand / storageCapacity : 0,
      failureRate: Math.max(0, Math.min(1, failureRate)),
      requestFlows,
    };
  }
}
