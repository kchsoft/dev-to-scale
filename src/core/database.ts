import { FeatureDefinition, FeatureTag } from './feature';

export type DatabaseId = 'POSTGRESQL' | 'MYSQL' | 'MONGODB';

export interface DatabaseResourceDemandModifier {
  readonly cpu: number;
  readonly io: number;
}

type DatabaseRuntimeTagModifiers = Partial<Record<FeatureTag, DatabaseResourceDemandModifier>>;

const MIN_RUNTIME_DEMAND_MODIFIER = 0.80;
const MAX_RUNTIME_DEMAND_MODIFIER = 1.25;

function clampRuntimeModifier(value: number): number {
  return Math.min(MAX_RUNTIME_DEMAND_MODIFIER, Math.max(MIN_RUNTIME_DEMAND_MODIFIER, value));
}

export class DatabaseDefinition {
  private constructor(
    readonly id: DatabaseId,
    readonly capacityModifier: number,
    readonly costModifier: number,
    private readonly tagWorkModifiers: Partial<Record<FeatureTag, number>> = {},
    private readonly runtimeTagDemandModifiers: DatabaseRuntimeTagModifiers = {},
  ) {}

  static postgresql(): DatabaseDefinition {
    return new DatabaseDefinition(
      'POSTGRESQL',
      1,
      1,
      { TRANSACTIONAL: 0.9 },
      {
        TRANSACTIONAL: { cpu: 0.90, io: 0.88 },
        WRITE_HEAVY: { cpu: 0.95, io: 0.90 },
        SEARCH: { cpu: 0.95, io: 0.95 },
      },
    );
  }

  static mysql(): DatabaseDefinition {
    return new DatabaseDefinition(
      'MYSQL',
      1,
      0.95,
      {},
      {
        READ_HEAVY: { cpu: 0.94, io: 0.90 },
        CONTENT: { cpu: 0.97, io: 0.95 },
        TRANSACTIONAL: { cpu: 1.03, io: 1.05 },
      },
    );
  }

  static mongodb(): DatabaseDefinition {
    return new DatabaseDefinition(
      'MONGODB',
      1.05,
      1,
      { TRANSACTIONAL: 1.2 },
      {
        CONTENT: { cpu: 0.90, io: 0.88 },
        READ_HEAVY: { cpu: 0.96, io: 0.94 },
        TRANSACTIONAL: { cpu: 1.15, io: 1.20 },
        SEARCH: { cpu: 1.05, io: 1.08 },
      },
    );
  }

  static byId(id: DatabaseId): DatabaseDefinition {
    switch (id) {
      case 'POSTGRESQL': return DatabaseDefinition.postgresql();
      case 'MYSQL': return DatabaseDefinition.mysql();
      case 'MONGODB': return DatabaseDefinition.mongodb();
    }
  }

  workModifierFor(feature: FeatureDefinition): number {
    let modifier = 1;
    for (const tag of feature.tags) modifier *= this.tagWorkModifiers[tag] ?? 1;
    return modifier;
  }

  resourceDemandModifierFor(feature: FeatureDefinition): DatabaseResourceDemandModifier {
    let cpu = 1;
    let io = 1;
    for (const tag of feature.tags) {
      const modifier = this.runtimeTagDemandModifiers[tag];
      if (!modifier) continue;
      cpu *= modifier.cpu;
      io *= modifier.io;
    }
    return {
      cpu: clampRuntimeModifier(cpu),
      io: clampRuntimeModifier(io),
    };
  }
}
