import {
  BuildableTechnologyId,
  COMMUNITY_FEATURES,
  COMMUNITY_REQUIREMENT_THRESHOLDS,
  FrameworkId,
  FundamentalSkillId,
  GameEngine,
  GameSnapshot,
  LanguageId,
  LearningRules,
  SkillRef,
  TECHNOLOGIES,
  TechnologySkillId,
  skillRef,
} from '../core';
import { FeatureCardView, SkillNodeView, TechnologyOptionView } from './game-view';
import { presentationCatalog } from './presentation-catalog';

const FRAMEWORK_LANGUAGE: Record<FrameworkId, LanguageId> = {
  SPRING_BOOT: 'JAVA',
  NESTJS: 'TYPESCRIPT',
  GIN: 'GO',
  FASTAPI: 'PYTHON',
  ASPNET_CORE: 'CSHARP',
};

const FUNDAMENTALS: FundamentalSkillId[] = ['NETWORK', 'OS_RUNTIME', 'DATABASE', 'DSA', 'SECURITY', 'SOFTWARE_DESIGN'];
const TECHNOLOGY_SKILLS: TechnologySkillId[] = ['POSTGRESQL', 'MYSQL', 'MONGODB', 'REDIS', 'SQS', 'RABBITMQ', 'KAFKA', 'ALB', 'OBJECT_STORAGE'];

function percent(value: number): number {
  return Math.max(0, Math.round(value * 100));
}

function phaseForSlot(index: number): 1 | 2 | 3 {
  if (index < 3) return 1;
  if (index < 6) return 2;
  return 3;
}

function sameSkill(left: SkillRef, right: SkillRef): boolean {
  return left.category === right.category && left.id === right.id;
}

export interface GameProgressionProjection {
  readonly technologies: readonly TechnologyOptionView[];
  readonly skills: readonly SkillNodeView[];
  readonly features: readonly FeatureCardView[];
}

export class GameProgressionProjector {
  readonly #engine: GameEngine;

  constructor(engine: GameEngine) {
    this.#engine = engine;
  }

  project(snapshot: GameSnapshot): GameProgressionProjection {
    return {
      technologies: this.technologyOptions(snapshot),
      skills: this.skillNodes(),
      features: this.featureCards(snapshot),
    };
  }

  private technologyOptions(snapshot: GameSnapshot): TechnologyOptionView[] {
    return (Object.keys(TECHNOLOGIES) as BuildableTechnologyId[]).map((id) => {
      const tech = TECHNOLOGIES[id];
      const deployed = this.#engine.infrastructure.hasTechnology(id);
      let reason: string | null = null;
      if (snapshot.currentTechnologyBuild) reason = '다른 기술을 구축 중';
      if (snapshot.cash < tech.buildCost) reason = '현금 부족';
      for (const [fundamental, level] of Object.entries(tech.prerequisites)) {
        if (this.#engine.developer.get(skillRef.fundamental(fundamental as FundamentalSkillId)).level < (level ?? 1)) {
          reason = `${presentationCatalog.label(fundamental)} Lv.${level} 필요`;
        }
      }
      return {
        id,
        name: tech.name,
        icon: presentationCatalog.technologyIcon(id),
        buildCost: tech.buildCost,
        monthlyCost: tech.monthlyCost,
        buildWork: tech.buildWork,
        deployed,
        available: !deployed && !reason,
        reason,
        preview: this.previewTechnology(id, snapshot),
        benefits: tech.benefits,
        tradeoffs: tech.tradeoffs,
      };
    });
  }

  private previewTechnology(id: BuildableTechnologyId, snapshot: GameSnapshot): string {
    if (this.#engine.infrastructure.hasTechnology(id)) return '이미 서비스에 연결됨';
    const after = this.#engine.previewLoadWithTechnology(id);
    if ((id === 'SQS' || id === 'RABBITMQ' || id === 'KAFKA') && snapshot.load.failureRate > after.failureRate) {
      return `실패율 ${percent(snapshot.load.failureRate)}% → ${percent(after.failureRate)}% · 요청 경로 복구`;
    }
    if (id === 'REDIS') return `DB ${percent(snapshot.load.dbRatio)}% → ${percent(after.dbRatio)}%`;
    if (id === 'SQS' || id === 'RABBITMQ' || id === 'KAFKA') {
      return `App ${percent(snapshot.load.appRatio)}% → ${percent(after.appRatio)}% · Async 분리`;
    }
    if (id === 'OBJECT_STORAGE') return `Storage Capacity ${snapshot.load.storageCapacity} → ${after.storageCapacity}`;
    if (id === 'ALB') return 'Application 서버 Scale-out 해금';
    return '';
  }

  private skillNodes(): SkillNodeView[] {
    const refs: SkillRef[] = [
      ...FUNDAMENTALS.map(skillRef.fundamental),
      skillRef.language(FRAMEWORK_LANGUAGE[this.#engine.config.frameworkId]),
      skillRef.framework(this.#engine.config.frameworkId),
      skillRef.technology(this.#engine.config.databaseId),
      ...TECHNOLOGY_SKILLS.filter((id) => id !== this.#engine.config.databaseId).map(skillRef.technology),
    ];
    const currentLearning = this.#engine.learning.current;

    return refs.map((ref) => {
      const proficiency = this.#engine.developer.get(ref);
      const studying = Boolean(currentLearning && sameSkill(currentLearning.skill, ref));
      let targetLevel: number | null = null;
      let requiredExperience: number | null = null;
      let studyDays: number | null = null;
      let cost: number | null = null;
      let canStudy = false;
      let reason: string | null = null;

      if (proficiency.level >= 10) {
        reason = 'MAX';
      } else {
        const requirement = LearningRules.requirement(ref, proficiency.level);
        targetLevel = requirement.targetLevel;
        requiredExperience = requirement.experienceDays;
        studyDays = requirement.studyDays;
        cost = requirement.cost;

        if (currentLearning) {
          reason = studying
            ? `학습 중 · ${currentLearning.elapsedStudyDays}/${currentLearning.requiredStudyDays}일`
            : '다른 학습 진행 중';
        } else if (proficiency.experienceDays < requirement.experienceDays) {
          reason = `경험 ${requirement.experienceDays - proficiency.experienceDays}일 부족`;
        } else {
          const missing = requirement.prerequisites.find((item) => this.#engine.developer.get(item.ref).level < item.level);
          if (missing) reason = `${presentationCatalog.label(missing.ref.id)} Lv.${missing.level} 필요`;
          else if (this.#engine.finance.cash < requirement.cost) reason = '현금 부족';
          else canStudy = true;
        }
      }

      return {
        key: `${ref.category}:${ref.id}`,
        ref,
        name: presentationCatalog.label(ref.id),
        icon: presentationCatalog.icon(ref.id),
        level: proficiency.level,
        experienceDays: proficiency.experienceDays,
        targetLevel,
        requiredExperience,
        studyDays,
        cost,
        canStudy,
        studying,
        studyProgress: studying && currentLearning ? currentLearning.progress : null,
        elapsedStudyDays: studying && currentLearning ? currentLearning.elapsedStudyDays : null,
        reason,
        category: ref.category,
      };
    });
  }

  private featureCards(snapshot: GameSnapshot): FeatureCardView[] {
    return this.#engine.progression.featureOrder.map((featureId, slotIndex) => {
      const threshold = COMMUNITY_REQUIREMENT_THRESHOLDS[slotIndex];
      const phase = phaseForSlot(slotIndex);
      const completed = snapshot.completedFeatures.includes(featureId);
      const developing = snapshot.currentFeature?.id === featureId;
      const revealed = completed || developing || snapshot.dau >= threshold;
      const feature = COMMUNITY_FEATURES[featureId];
      return {
        id: featureId,
        name: revealed ? presentationCatalog.label(featureId) : '?',
        phase,
        threshold,
        state: completed ? 'completed' : developing ? 'developing' : revealed ? 'revealed' : 'hidden',
        load: revealed ? feature.load : null,
        route: revealed ? feature.requestRoute.map((step) => step.node) : null,
      };
    });
  }
}
