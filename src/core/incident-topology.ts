import { FrameworkId } from './feature';
import { IncidentCandidate } from './incident-manager';
import { DatabaseId, InfrastructureState, LoadSnapshot, TechnologyId } from './infrastructure';
import { DeveloperProfile, FundamentalSkillId, skillRef, TechnologySkillId } from './learning';
import { BuildableTechnologyId, TECHNOLOGIES } from './technology';

const DB_INCIDENT: Record<DatabaseId, { risk: 1 | 2 | 3 | 4 | 5; difficulty: number }> = {
  POSTGRESQL: { risk: 2, difficulty: 5 },
  MYSQL: { risk: 2, difficulty: 4 },
  MONGODB: { risk: 3, difficulty: 4 },
};

export interface IncidentTopologyContext {
  frameworkId: FrameworkId;
  databaseId: DatabaseId;
  developer: DeveloperProfile;
  infrastructure: InfrastructureState;
  load: LoadSnapshot;
}

export interface IncidentSkillContext {
  proficiencyLevel: number;
  fundamentalAverage: number;
}

function average(values: number[]): number {
  return values.length === 0 ? 1 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export class IncidentTopology {
  static candidates(context: IncidentTopologyContext): IncidentCandidate[] {
    const candidates: IncidentCandidate[] = [];
    const frameworkNodeId = `framework:${context.frameworkId}`;
    const frameworkSkill = this.skillContext(frameworkNodeId, context);
    candidates.push({
      nodeId: frameworkNodeId,
      baseRisk: 2,
      difficulty: 4,
      loadRatio: context.load.appRatio,
      ...frameworkSkill,
    });

    const databaseNodeId = `database:${context.databaseId}`;
    const databaseSkill = this.skillContext(databaseNodeId, context);
    const databaseIncident = DB_INCIDENT[context.databaseId];
    candidates.push({
      nodeId: databaseNodeId,
      baseRisk: databaseIncident.risk,
      difficulty: databaseIncident.difficulty,
      loadRatio: context.load.dbRatio,
      ...databaseSkill,
    });

    for (const technologyId of context.infrastructure.deployedTechnologies) {
      const definition = TECHNOLOGIES[technologyId];
      candidates.push({
        nodeId: `technology:${technologyId}`,
        baseRisk: definition.incidentRisk,
        difficulty: definition.incidentDifficulty,
        loadRatio: this.technologyLoadRatio(technologyId, context.load),
        ...this.skillContext(`technology:${technologyId}`, context),
      });
    }

    return candidates;
  }

  static skillContext(nodeId: string, context: IncidentTopologyContext): IncidentSkillContext {
    if (nodeId.startsWith('framework:')) {
      return {
        proficiencyLevel: context.developer.get(skillRef.framework(context.frameworkId)).level,
        fundamentalAverage: this.fundamentalAverage(context.developer, ['NETWORK', 'OS_RUNTIME', 'SOFTWARE_DESIGN']),
      };
    }

    if (nodeId.startsWith('database:')) {
      return {
        proficiencyLevel: context.developer.get(skillRef.technology(context.databaseId as TechnologySkillId)).level,
        fundamentalAverage: this.fundamentalAverage(context.developer, ['DATABASE', 'OS_RUNTIME', 'SOFTWARE_DESIGN']),
      };
    }

    const technologyId = nodeId.split(':')[1] as BuildableTechnologyId;
    const fundamentals = Object.keys(TECHNOLOGIES[technologyId].prerequisites) as FundamentalSkillId[];
    return {
      proficiencyLevel: context.developer.get(skillRef.technology(technologyId)).level,
      fundamentalAverage: this.fundamentalAverage(context.developer, fundamentals),
    };
  }

  private static technologyLoadRatio(id: TechnologyId, load: LoadSnapshot): number {
    switch (id) {
      case 'REDIS': return load.dbRatio;
      case 'SQS':
      case 'RABBITMQ':
      case 'KAFKA': return load.asyncRatio;
      case 'ALB': return load.appRatio;
      case 'OBJECT_STORAGE': return load.storageRatio;
    }
  }

  private static fundamentalAverage(developer: DeveloperProfile, ids: FundamentalSkillId[]): number {
    return average(ids.map((id) => developer.get(skillRef.fundamental(id)).level));
  }
}
