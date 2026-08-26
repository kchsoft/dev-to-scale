export type FundamentalSkillId = 'NETWORK' | 'OS_RUNTIME' | 'DATABASE' | 'DSA' | 'SECURITY' | 'SOFTWARE_DESIGN';
export type LanguageId = 'JAVA' | 'TYPESCRIPT' | 'GO' | 'PYTHON' | 'CSHARP';
export type FrameworkSkillId = 'SPRING_BOOT' | 'NESTJS' | 'GIN' | 'FASTAPI' | 'ASPNET_CORE';
export type TechnologySkillId = 'POSTGRESQL' | 'MYSQL' | 'MONGODB' | 'REDIS' | 'SQS' | 'RABBITMQ' | 'KAFKA' | 'ALB' | 'OBJECT_STORAGE';

export type SkillRef =
  | { category: 'fundamental'; id: FundamentalSkillId }
  | { category: 'language'; id: LanguageId }
  | { category: 'framework'; id: FrameworkSkillId }
  | { category: 'technology'; id: TechnologySkillId };

export const skillRef = {
  fundamental: (id: FundamentalSkillId): SkillRef => ({ category: 'fundamental', id }),
  language: (id: LanguageId): SkillRef => ({ category: 'language', id }),
  framework: (id: FrameworkSkillId): SkillRef => ({ category: 'framework', id }),
  technology: (id: TechnologySkillId): SkillRef => ({ category: 'technology', id }),
};

export class Proficiency {
  private _level = 1;
  private _experienceDays = 0;

  get level(): number { return this._level; }
  get experienceDays(): number { return this._experienceDays; }

  gainExperience(days = 1): void {
    if (days < 0) throw new Error('Experience days must be positive');
    this._experienceDays += days;
  }

  setLevel(level: number): void {
    if (!Number.isInteger(level) || level < 1 || level > 10) throw new Error('Level must be between 1 and 10');
    this._level = level;
  }

  levelUp(): void {
    if (this._level >= 10) throw new Error('Already at max level');
    this._level += 1;
  }
}

const FUNDAMENTALS: FundamentalSkillId[] = ['NETWORK', 'OS_RUNTIME', 'DATABASE', 'DSA', 'SECURITY', 'SOFTWARE_DESIGN'];
const LANGUAGES: LanguageId[] = ['JAVA', 'TYPESCRIPT', 'GO', 'PYTHON', 'CSHARP'];
const FRAMEWORKS: FrameworkSkillId[] = ['SPRING_BOOT', 'NESTJS', 'GIN', 'FASTAPI', 'ASPNET_CORE'];
const TECHNOLOGIES: TechnologySkillId[] = ['POSTGRESQL', 'MYSQL', 'MONGODB', 'REDIS', 'SQS', 'RABBITMQ', 'KAFKA', 'ALB', 'OBJECT_STORAGE'];

function key(ref: SkillRef): string {
  return `${ref.category}:${ref.id}`;
}

export class DeveloperProfile {
  private readonly proficiencies = new Map<string, Proficiency>();

  constructor() {
    for (const id of FUNDAMENTALS) this.proficiencies.set(key(skillRef.fundamental(id)), new Proficiency());
    for (const id of LANGUAGES) this.proficiencies.set(key(skillRef.language(id)), new Proficiency());
    for (const id of FRAMEWORKS) this.proficiencies.set(key(skillRef.framework(id)), new Proficiency());
    for (const id of TECHNOLOGIES) this.proficiencies.set(key(skillRef.technology(id)), new Proficiency());
  }

  get(ref: SkillRef): Proficiency {
    const proficiency = this.proficiencies.get(key(ref));
    if (!proficiency) throw new Error(`Unknown skill ${key(ref)}`);
    return proficiency;
  }

  gainExperience(ref: SkillRef, days = 1): void {
    this.get(ref).gainExperience(days);
  }
}

interface BaseLearningCurveItem {
  experienceDays: number;
  studyDays: number;
  cost: number;
}

const BASE_CURVE: Record<number, BaseLearningCurveItem> = {
  2: { experienceDays: 10, studyDays: 3, cost: 50_000 },
  3: { experienceDays: 25, studyDays: 4, cost: 100_000 },
  4: { experienceDays: 45, studyDays: 5, cost: 200_000 },
  5: { experienceDays: 70, studyDays: 6, cost: 350_000 },
  6: { experienceDays: 105, studyDays: 8, cost: 550_000 },
  7: { experienceDays: 150, studyDays: 10, cost: 800_000 },
  8: { experienceDays: 210, studyDays: 13, cost: 1_200_000 },
  9: { experienceDays: 290, studyDays: 17, cost: 1_800_000 },
  10: { experienceDays: 400, studyDays: 22, cost: 2_700_000 },
};

const LANGUAGE_FUNDAMENTAL_REQUIREMENTS: Record<number, [number, number, number]> = {
  2: [1, 1, 1],
  3: [2, 1, 2],
  4: [2, 2, 2],
  5: [3, 3, 3],
  6: [4, 3, 4],
  7: [5, 4, 5],
  8: [6, 5, 6],
  9: [7, 6, 7],
  10: [8, 7, 8],
};

const FRAMEWORK_LANGUAGE: Record<FrameworkSkillId, LanguageId> = {
  SPRING_BOOT: 'JAVA',
  NESTJS: 'TYPESCRIPT',
  GIN: 'GO',
  FASTAPI: 'PYTHON',
  ASPNET_CORE: 'CSHARP',
};

const FRAMEWORK_LANGUAGE_LEVEL: Record<number, number> = {
  2: 2, 3: 3, 4: 4, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9,
};

const TECHNOLOGY_MULTIPLIER: Record<TechnologySkillId, number> = {
  POSTGRESQL: 1,
  MYSQL: 1,
  MONGODB: 1,
  REDIS: 0.8,
  SQS: 0.8,
  RABBITMQ: 1,
  KAFKA: 1.2,
  ALB: 0.8,
  OBJECT_STORAGE: 0.8,
};

export interface LearningRequirement {
  targetLevel: number;
  experienceDays: number;
  studyDays: number;
  cost: number;
  prerequisites: Array<{ ref: SkillRef; level: number }>;
}

function technologyPrerequisites(id: TechnologySkillId, targetLevel: number): LearningRequirement['prerequisites'] {
  const basic = Math.min(8, Math.max(2, targetLevel));
  const softer = Math.max(1, basic - 1);
  switch (id) {
    case 'POSTGRESQL':
    case 'MYSQL':
      return [
        { ref: skillRef.fundamental('DATABASE'), level: basic },
        { ref: skillRef.fundamental('OS_RUNTIME'), level: softer },
        { ref: skillRef.fundamental('SOFTWARE_DESIGN'), level: softer },
      ];
    case 'MONGODB':
      return [
        { ref: skillRef.fundamental('DATABASE'), level: basic },
        { ref: skillRef.fundamental('SOFTWARE_DESIGN'), level: softer },
      ];
    case 'REDIS':
      return [
        { ref: skillRef.fundamental('DATABASE'), level: basic },
        { ref: skillRef.fundamental('NETWORK'), level: basic },
      ];
    case 'SQS':
    case 'RABBITMQ':
      return [
        { ref: skillRef.fundamental('NETWORK'), level: basic },
        { ref: skillRef.fundamental('SOFTWARE_DESIGN'), level: softer },
      ];
    case 'KAFKA':
      return [
        { ref: skillRef.fundamental('NETWORK'), level: basic },
        { ref: skillRef.fundamental('OS_RUNTIME'), level: basic },
        { ref: skillRef.fundamental('SOFTWARE_DESIGN'), level: basic },
      ];
    case 'ALB':
      return [{ ref: skillRef.fundamental('NETWORK'), level: basic }];
    case 'OBJECT_STORAGE':
      return [
        { ref: skillRef.fundamental('NETWORK'), level: softer },
        { ref: skillRef.fundamental('SOFTWARE_DESIGN'), level: softer },
      ];
  }
}

export class LearningRules {
  static requirement(ref: SkillRef, currentLevel: number): LearningRequirement {
    const targetLevel = currentLevel + 1;
    if (targetLevel > 10) throw new Error('Already at max level');
    const base = BASE_CURVE[targetLevel];

    switch (ref.category) {
      case 'fundamental':
        return {
          targetLevel,
          experienceDays: base.experienceDays,
          studyDays: base.studyDays,
          cost: Math.round(base.cost * 0.7),
          prerequisites: [],
        };
      case 'language': {
        const [os, network, dsa] = LANGUAGE_FUNDAMENTAL_REQUIREMENTS[targetLevel];
        return {
          targetLevel,
          experienceDays: base.experienceDays,
          studyDays: base.studyDays,
          cost: base.cost,
          prerequisites: [
            { ref: skillRef.fundamental('OS_RUNTIME'), level: os },
            { ref: skillRef.fundamental('NETWORK'), level: network },
            { ref: skillRef.fundamental('DSA'), level: dsa },
          ],
        };
      }
      case 'framework':
        return {
          targetLevel,
          experienceDays: Math.ceil(base.experienceDays * 0.8),
          studyDays: Math.ceil(base.studyDays * 0.8),
          cost: base.cost,
          prerequisites: [{ ref: skillRef.language(FRAMEWORK_LANGUAGE[ref.id]), level: FRAMEWORK_LANGUAGE_LEVEL[targetLevel] }],
        };
      case 'technology': {
        const multiplier = TECHNOLOGY_MULTIPLIER[ref.id];
        return {
          targetLevel,
          experienceDays: Math.ceil(base.experienceDays * multiplier),
          studyDays: Math.ceil(base.studyDays * multiplier),
          cost: Math.round(base.cost * (ref.id === 'KAFKA' ? 1.5 : multiplier)),
          prerequisites: technologyPrerequisites(ref.id, targetLevel),
        };
      }
    }
  }
}

export class LearningTask {
  private _elapsedStudyDays = 0;

  constructor(
    readonly skill: SkillRef,
    readonly targetLevel: number,
    readonly requiredStudyDays: number,
    readonly cost: number,
  ) {}

  get elapsedStudyDays(): number { return this._elapsedStudyDays; }
  get progress(): number { return this.requiredStudyDays === 0 ? 1 : this._elapsedStudyDays / this.requiredStudyDays; }

  advanceDay(): boolean {
    this._elapsedStudyDays += 1;
    return this._elapsedStudyDays >= this.requiredStudyDays;
  }
}

export class LearningSlot {
  private _current: LearningTask | null = null;

  get current(): LearningTask | null { return this._current; }

  start(skill: SkillRef, developer: DeveloperProfile): LearningTask {
    if (this._current) throw new Error('A learning task is already in progress');
    const proficiency = developer.get(skill);
    const requirement = LearningRules.requirement(skill, proficiency.level);

    if (proficiency.experienceDays < requirement.experienceDays) {
      throw new Error(`Requires ${requirement.experienceDays} experience days`);
    }
    for (const prerequisite of requirement.prerequisites) {
      if (developer.get(prerequisite.ref).level < prerequisite.level) {
        throw new Error(`Requires ${prerequisite.ref.id} Lv.${prerequisite.level}`);
      }
    }

    this._current = new LearningTask(skill, requirement.targetLevel, requirement.studyDays, requirement.cost);
    return this._current;
  }

  advanceDay(developer: DeveloperProfile): LearningTask | null {
    if (!this._current) return null;
    const completed = this._current.advanceDay();
    if (!completed) return null;

    const finished = this._current;
    developer.get(finished.skill).levelUp();
    this._current = null;
    return finished;
  }
}