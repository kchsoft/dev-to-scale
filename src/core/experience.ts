import { DatabaseId } from './database';
import { FrameworkId } from './feature';
import { TechnologyId } from './infrastructure';
import { DeveloperProfile, FundamentalSkillId, LanguageId, skillRef, TechnologySkillId } from './learning';

const FRAMEWORK_LANGUAGE: Record<FrameworkId, LanguageId> = {
  SPRING_BOOT: 'JAVA',
  NESTJS: 'TYPESCRIPT',
  GIN: 'GO',
  FASTAPI: 'PYTHON',
  ASPNET_CORE: 'CSHARP',
};

const DB_TECH: Record<DatabaseId, TechnologySkillId> = {
  POSTGRESQL: 'POSTGRESQL',
  MYSQL: 'MYSQL',
  MONGODB: 'MONGODB',
};

const FRAMEWORK_FUNDAMENTALS: FundamentalSkillId[] = ['NETWORK', 'OS_RUNTIME', 'SOFTWARE_DESIGN', 'DSA'];
const DATABASE_FUNDAMENTALS: FundamentalSkillId[] = ['DATABASE', 'OS_RUNTIME', 'SOFTWARE_DESIGN'];

const TECHNOLOGY_FUNDAMENTALS: Record<TechnologyId, FundamentalSkillId[]> = {
  REDIS: ['DATABASE', 'NETWORK'],
  SQS: ['NETWORK', 'SOFTWARE_DESIGN'],
  RABBITMQ: ['NETWORK', 'SOFTWARE_DESIGN'],
  KAFKA: ['NETWORK', 'OS_RUNTIME', 'SOFTWARE_DESIGN'],
  ALB: ['NETWORK'],
  OBJECT_STORAGE: ['NETWORK', 'SOFTWARE_DESIGN'],
};

export interface ActiveStackUsage {
  frameworkId: FrameworkId;
  databaseId: DatabaseId;
  technologies: readonly TechnologyId[];
}

export class ExperienceAccrualService {
  static recordDay(developer: DeveloperProfile, usage: ActiveStackUsage): void {
    const language = FRAMEWORK_LANGUAGE[usage.frameworkId];
    developer.gainExperience(skillRef.language(language));
    developer.gainExperience(skillRef.framework(usage.frameworkId));
    developer.gainExperience(skillRef.technology(DB_TECH[usage.databaseId]));

    const fundamentals = new Set<FundamentalSkillId>([
      ...FRAMEWORK_FUNDAMENTALS,
      ...DATABASE_FUNDAMENTALS,
    ]);

    for (const technology of usage.technologies) {
      developer.gainExperience(skillRef.technology(technology));
      for (const fundamental of TECHNOLOGY_FUNDAMENTALS[technology]) fundamentals.add(fundamental);
    }

    // A fundamental can gain at most one experience day per game day,
    // even when several active technologies depend on it.
    for (const fundamental of fundamentals) {
      developer.gainExperience(skillRef.fundamental(fundamental));
    }
  }
}
