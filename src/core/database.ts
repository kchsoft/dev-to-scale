import { FeatureDefinition, FeatureTag } from './feature';

export type DatabaseId = 'POSTGRESQL' | 'MYSQL' | 'MONGODB';

export class DatabaseDefinition {
  private constructor(
    readonly id: DatabaseId,
    readonly capacityModifier: number,
    readonly costModifier: number,
    private readonly tagWorkModifiers: Partial<Record<FeatureTag, number>> = {},
  ) {}

  static postgresql(): DatabaseDefinition {
    return new DatabaseDefinition('POSTGRESQL', 1, 1, { TRANSACTIONAL: 0.9 });
  }

  static mysql(): DatabaseDefinition {
    return new DatabaseDefinition('MYSQL', 1, 0.95);
  }

  static mongodb(): DatabaseDefinition {
    return new DatabaseDefinition('MONGODB', 1.05, 1, { TRANSACTIONAL: 1.2 });
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
}
