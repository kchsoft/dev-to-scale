import { DatabaseDefinition, DatabaseId } from './database';
import { FeatureDefinition, FrameworkDefinition, FrameworkId } from './feature';
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
   * Deploys a technology and returns any technology nodes retired by the change.
   *
   * V1 product policy allows one active queue implementation at a time. The
   * infrastructure still stores technologies as a collection so a future MSA
   * topology can relax this policy and attach different queues to different
   * services without replacing the entire model.
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

  /** V1 convenience accessor. queueTechnologies is intentionally collection-shaped for future MSA support. */
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

export interface LoadSnapshot {
  appDemand: number;
  dbDemand: number;
  asyncDemand: number;
  storageDemand: number;
  appCapacity: number;
  dbCapacity: number;
  asyncCapacity: number;
  storageCapacity: number;
  appRatio: number;
  dbRatio: number;
  asyncRatio: number;
  storageRatio: number;
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

export class LoadCalculator {
  static calculate(dau: number, features: readonly FeatureDefinition[], infrastructure: InfrastructureState): LoadSnapshot {
    const weights = features.reduce(
      (sum, feature) => ({
        app: sum.app + feature.load.app,
        db: sum.db + feature.load.db,
        async: sum.async + feature.load.async,
        storage: sum.storage + feature.load.storage,
      }),
      { app: 0, db: 0, async: 0, storage: 0 },
    );

    const hasReadHeavy = features.some((feature) => feature.tags.has('READ_HEAVY'));
    const hasEventHeavy = features.some((feature) => feature.tags.has('EVENT_HEAVY'));
    const rawAsync = demand(weights.async, dau, LOAD_CURVE.async);
    const queue = infrastructure.queueTechnology;
    const asyncDemand = queue === 'KAFKA' && hasEventHeavy ? rawAsync * 0.85 : rawAsync;
    const appDemand = demand(weights.app, dau, LOAD_CURVE.app) + (queue ? 0 : rawAsync);

    let dbDemand = demand(weights.db, dau, LOAD_CURVE.db);
    if (infrastructure.hasTechnology('REDIS')) dbDemand *= hasReadHeavy ? 0.7 : 0.75;

    const storageDemand = demand(weights.storage, dau, LOAD_CURVE.storage);
    const appCapacity = infrastructure.app.capacity;
    const dbCapacity = infrastructure.database.capacity;
    const asyncCapacity = infrastructure.asyncCapacity;
    const storageCapacity = infrastructure.storageCapacity;

    return {
      appDemand,
      dbDemand,
      asyncDemand: queue ? asyncDemand : 0,
      storageDemand,
      appCapacity,
      dbCapacity,
      asyncCapacity,
      storageCapacity,
      appRatio: appDemand / appCapacity,
      dbRatio: dbDemand / dbCapacity,
      asyncRatio: queue && asyncCapacity > 0 ? asyncDemand / asyncCapacity : 0,
      storageRatio: storageDemand / storageCapacity,
    };
  }
}
