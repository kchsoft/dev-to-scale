import { FrameworkId } from './feature';
import { IncidentCandidate } from './incident-manager';
import { DatabaseId, InfrastructureState, LoadSnapshot } from './infrastructure';
import { DeveloperProfile, FundamentalSkillId, skillRef, TechnologySkillId } from './learning';
import { BuildableTechnologyId, TECHNOLOGIES } from './technology';
import { TopologyGraph } from './topology';
import { V1_NODE_IDS, v1NodeIdForTechnology } from './v1-topology';

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
  topology: TopologyGraph;
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
    const frameworkNodeId = V1_NODE_IDS.app(context.frameworkId);
    const frameworkSkill = this.skillContext(frameworkNodeId, context);
    candidates.push({
      nodeId: frameworkNodeId,
      baseRisk: 2,
      difficulty: 4,
      loadRatio: this.nodeLoadRatio(frameworkNodeId, context.load),
      ...frameworkSkill,
    });

    const databaseNodeId = V1_NODE_IDS.database(context.databaseId);
    const databaseSkill = this.skillContext(databaseNodeId, context);
    const databaseIncident = DB_INCIDENT[context.databaseId];
    candidates.push({
      nodeId: databaseNodeId,
      baseRisk: databaseIncident.risk,
      difficulty: databaseIncident.difficulty,
      loadRatio: this.nodeLoadRatio(databaseNodeId, context.load),
      ...databaseSkill,
    });

    for (const technologyId of context.infrastructure.deployedTechnologies) {
      const definition = TECHNOLOGIES[technologyId];
      const nodeId = v1NodeIdForTechnology(technologyId);
      candidates.push({
        nodeId,
        baseRisk: definition.incidentRisk,
        difficulty: definition.incidentDifficulty,
        loadRatio: this.nodeLoadRatio(nodeId, context.load),
        ...this.skillContext(nodeId, context),
      });
    }

    return candidates;
  }

  static skillContext(nodeId: string, context: IncidentTopologyContext): IncidentSkillContext {
    const node = context.topology.node(nodeId);
    if (!node) throw new Error(`Incident node does not exist in topology: ${nodeId}`);

    if (node.kind === 'SERVER_GROUP') {
      return {
        proficiencyLevel: context.developer.get(skillRef.framework(node.productId as FrameworkId)).level,
        fundamentalAverage: this.fundamentalAverage(context.developer, ['NETWORK', 'OS_RUNTIME', 'SOFTWARE_DESIGN']),
      };
    }

    if (node.kind === 'DATABASE') {
      return {
        proficiencyLevel: context.developer.get(skillRef.technology(node.productId as TechnologySkillId)).level,
        fundamentalAverage: this.fundamentalAverage(context.developer, ['DATABASE', 'OS_RUNTIME', 'SOFTWARE_DESIGN']),
      };
    }

    const technologyId = node.productId as BuildableTechnologyId;
    const definition = TECHNOLOGIES[technologyId];
    if (!definition) throw new Error(`Incident node has no technology definition: ${nodeId}`);
    const fundamentals = Object.keys(TECHNOLOGIES[technologyId].prerequisites) as FundamentalSkillId[];
    return {
      proficiencyLevel: context.developer.get(skillRef.technology(technologyId)).level,
      fundamentalAverage: this.fundamentalAverage(context.developer, fundamentals),
    };
  }

  private static nodeLoadRatio(nodeId: string, load: LoadSnapshot): number {
    return load.nodeLoads.find((nodeLoad) => nodeLoad.nodeId === nodeId)?.effectiveLoadRatio ?? 0;
  }

  private static fundamentalAverage(developer: DeveloperProfile, ids: FundamentalSkillId[]): number {
    return average(ids.map((id) => developer.get(skillRef.fundamental(id)).level));
  }
}
