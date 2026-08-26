import {
  AppCluster,
  BuildableTechnologyId,
  COMMUNITY_BOOTSTRAP,
  COMMUNITY_FEATURES,
  COMMUNITY_REQUIREMENT_THRESHOLDS,
  DatabaseCluster,
  DatabaseId,
  FrameworkId,
  FundamentalSkillId,
  GameEngine,
  GameEngineConfig,
  GameSnapshot,
  InfrastructureState,
  LanguageId,
  LearningRules,
  LoadCalculator,
  RevenuePolicy,
  ServerSize,
  SkillRef,
  TECHNOLOGIES,
  TechnologySkillId,
  skillRef,
} from '../core';

export type LoadTone = 'stable' | 'busy' | 'critical' | 'overload' | 'incident';
export type GameEventKind = 'requirement' | 'incident' | 'launch' | 'bankrupt' | 'won';

export interface GameEventView {
  id: string;
  kind: GameEventKind;
  title: string;
  message: string;
  severity?: string;
  nodeId?: string;
  autoPause: boolean;
}

export interface HudView {
  day: number;
  dau: number;
  cash: number;
  monthlyRevenue: number;
  monthlyCost: number;
  monthlyProfit: number;
  status: GameSnapshot['status'];
  launched: boolean;
}

export interface ServiceNodeView {
  id: string;
  kind: 'application' | 'database' | 'cache' | 'queue' | 'storage' | 'load-balancer';
  name: string;
  icon: string;
  loadPercent: number;
  tone: LoadTone;
  detail: string;
  incidentId?: string;
  incidentSeverity?: string;
}

export interface WorkSlotView {
  id: 'feature' | 'technology' | 'learning' | 'incident';
  label: string;
  title: string;
  progress: number | null;
  meta: string;
  active: boolean;
}

export interface AlertView {
  id: string;
  tone: 'info' | 'warning' | 'danger' | 'good';
  title: string;
  detail: string;
  nodeId?: string;
}

export interface TechnologyOptionView {
  id: BuildableTechnologyId;
  name: string;
  icon: string;
  buildCost: number;
  monthlyCost: number;
  buildWork: number;
  deployed: boolean;
  available: boolean;
  reason: string | null;
  preview: string;
}

export interface SkillNodeView {
  key: string;
  ref: SkillRef;
  name: string;
  icon: string;
  level: number;
  experienceDays: number;
  targetLevel: number | null;
  requiredExperience: number | null;
  studyDays: number | null;
  cost: number | null;
  canStudy: boolean;
  reason: string | null;
  category: SkillRef['category'];
}

export interface FeatureCardView {
  id: string;
  name: string;
  phase: 1 | 2 | 3;
  threshold: number;
  state: 'completed' | 'developing' | 'revealed' | 'hidden';
  load: { app: number; db: number; async: number; storage: number } | null;
}

export interface GameView {
  hud: HudView;
  nodes: ServiceNodeView[];
  workSlots: WorkSlotView[];
  alerts: AlertView[];
  technologies: TechnologyOptionView[];
  skills: SkillNodeView[];
  features: FeatureCardView[];
  snapshot: GameSnapshot;
  frameworkId: FrameworkId;
  databaseId: DatabaseId;
  appSize: ServerSize;
  appCount: number;
  dbSize: ServerSize;
  dbReplicaCount: number;
}

const FRAMEWORK_LANGUAGE: Record<FrameworkId, LanguageId> = {
  SPRING_BOOT: 'JAVA',
  NESTJS: 'TYPESCRIPT',
  GIN: 'GO',
  FASTAPI: 'PYTHON',
  ASPNET_CORE: 'CSHARP',
};

const LABELS: Record<string, string> = {
  COMMUNITY_MVP: '커뮤니티 MVP', COMMENT: '댓글', LIKE: '좋아요', IMAGE_UPLOAD: '이미지 업로드',
  SEARCH: '검색', NOTIFICATION: '알림', AI_RECOMMENDATION: 'AI 개인화 추천', POPULAR_POSTS: '인기글',
  FOLLOW_FEED: '팔로우 피드', ADS: '광고', PREMIUM: 'Premium',
  NETWORK: 'Network', OS_RUNTIME: 'OS & Runtime', DATABASE: 'Database', DSA: 'DS&A', SECURITY: 'Security', SOFTWARE_DESIGN: 'Software Design',
  JAVA: 'Java', TYPESCRIPT: 'TypeScript', GO: 'Go', PYTHON: 'Python', CSHARP: 'C#',
  SPRING_BOOT: 'Spring Boot', NESTJS: 'NestJS', GIN: 'Gin', FASTAPI: 'FastAPI', ASPNET_CORE: 'ASP.NET Core',
  POSTGRESQL: 'PostgreSQL', MYSQL: 'MySQL', MONGODB: 'MongoDB', REDIS: 'Redis', SQS: 'SQS', RABBITMQ: 'RabbitMQ', KAFKA: 'Kafka', ALB: 'ALB', OBJECT_STORAGE: 'Object Storage',
};

const ICONS: Record<string, string> = {
  application: '◈', database: '◉', cache: '◆', queue: '⇢', storage: '▣', 'load-balancer': '⎇',
  NETWORK: '⌁', OS_RUNTIME: '▤', DATABASE: '◉', DSA: '⌘', SECURITY: '◇', SOFTWARE_DESIGN: '⬡',
  JAVA: 'J', TYPESCRIPT: 'TS', GO: 'GO', PYTHON: 'PY', CSHARP: 'C#',
  SPRING_BOOT: 'S', NESTJS: 'N', GIN: 'G', FASTAPI: 'F', ASPNET_CORE: '.N',
  POSTGRESQL: 'PG', MYSQL: 'MY', MONGODB: 'MO', REDIS: 'R', SQS: 'Q', RABBITMQ: 'RM', KAFKA: 'K', ALB: 'LB', OBJECT_STORAGE: 'OS',
};

const TECH_ICONS: Record<BuildableTechnologyId, string> = {
  REDIS: '◆', SQS: '⇢', RABBITMQ: '⇄', KAFKA: '≋', ALB: '⎇', OBJECT_STORAGE: '▣',
};

const FUNDAMENTALS: FundamentalSkillId[] = ['NETWORK', 'OS_RUNTIME', 'DATABASE', 'DSA', 'SECURITY', 'SOFTWARE_DESIGN'];
const TECHNOLOGY_SKILLS: TechnologySkillId[] = ['POSTGRESQL', 'MYSQL', 'MONGODB', 'REDIS', 'SQS', 'RABBITMQ', 'KAFKA', 'ALB', 'OBJECT_STORAGE'];

function percent(value: number): number {
  return Math.max(0, Math.round(value * 100));
}

function loadTone(ratio: number, incident = false): LoadTone {
  if (incident) return 'incident';
  if (ratio > 1) return 'overload';
  if (ratio >= 0.9) return 'critical';
  if (ratio >= 0.7) return 'busy';
  return 'stable';
}

function phaseForSlot(index: number): 1 | 2 | 3 {
  if (index < 3) return 1;
  if (index < 6) return 2;
  return 3;
}

function cloneInfrastructure(engine: GameEngine): InfrastructureState {
  const current = engine.infrastructure;
  const clone = new InfrastructureState(
    new AppCluster(engine.config.frameworkId, current.app.size, current.app.count, current.hasTechnology('ALB')),
    new DatabaseCluster(engine.config.databaseId, current.database.size, current.database.replicaCount),
  );
  for (const technology of current.deployedTechnologies) clone.deployTechnology(technology);
  return clone;
}

export class GameController {
  readonly engine: GameEngine;
  private readonly listeners = new Set<(view: GameView) => void>();

  constructor(config: GameEngineConfig) {
    this.engine = new GameEngine(config);
  }

  subscribe(listener: (view: GameView) => void): () => void {
    this.listeners.add(listener);
    listener(this.getView());
    return () => this.listeners.delete(listener);
  }

  getView(): GameView {
    const snapshot = this.engine.snapshot;
    const revenueModifier = snapshot.completedFeatures.reduce(
      (sum, id) => sum + (COMMUNITY_FEATURES[id as keyof typeof COMMUNITY_FEATURES]?.revenueModifier ?? 0),
      0,
    );
    const aiActive = snapshot.completedFeatures.includes('AI_RECOMMENDATION');
    const monthlyRevenue = RevenuePolicy.monthlyRevenue(snapshot.dau, revenueModifier);
    const monthlyCost = this.engine.infrastructure.monthlyCost + RevenuePolicy.monthlyAiCost(snapshot.dau, aiActive);

    return {
      hud: {
        day: snapshot.day,
        dau: snapshot.dau,
        cash: snapshot.cash,
        monthlyRevenue,
        monthlyCost,
        monthlyProfit: monthlyRevenue - monthlyCost,
        status: snapshot.status,
        launched: snapshot.launched,
      },
      nodes: this.serviceNodes(snapshot),
      workSlots: this.workSlots(snapshot),
      alerts: this.alerts(snapshot, monthlyRevenue - monthlyCost),
      technologies: this.technologyOptions(snapshot),
      skills: this.skillNodes(),
      features: this.featureCards(snapshot),
      snapshot,
      frameworkId: this.engine.config.frameworkId,
      databaseId: this.engine.config.databaseId,
      appSize: this.engine.infrastructure.app.size,
      appCount: this.engine.infrastructure.app.count,
      dbSize: this.engine.infrastructure.database.size,
      dbReplicaCount: this.engine.infrastructure.database.replicaCount,
    };
  }

  advanceDay(): GameEventView[] {
    const before = this.engine.snapshot;
    const after = this.engine.advanceDay();
    const events = this.detectEvents(before, after);
    this.emit();
    return events;
  }

  startTechnologyBuild(id: BuildableTechnologyId): void { this.engine.startTechnologyBuild(id); this.emit(); }
  startLearning(ref: SkillRef): void { this.engine.startLearning(ref); this.emit(); }
  startIncidentResponse(id: string): void { this.engine.startIncidentResponse(id); this.emit(); }
  scaleApplication(size: ServerSize): void { this.engine.scaleApplication(size); this.emit(); }
  addApplicationServer(): void { this.engine.addApplicationServer(); this.emit(); }
  scaleDatabase(size: ServerSize): void { this.engine.scaleDatabase(size); this.emit(); }
  addDatabaseReplica(): void { this.engine.addDatabaseReplica(); this.emit(); }

  private emit(): void {
    const view = this.getView();
    for (const listener of this.listeners) listener(view);
  }

  private detectEvents(before: GameSnapshot, after: GameSnapshot): GameEventView[] {
    const events: GameEventView[] = [];
    if (!before.launched && after.launched) {
      events.push({ id: `launch-${after.day}`, kind: 'launch', title: 'SERVICE ONLINE', message: '커뮤니티 서비스가 공개되었습니다. DAU 80에서 시작합니다.', autoPause: false });
    }
    if (after.currentFeature && after.currentFeature.id !== before.currentFeature?.id && after.currentFeature.id !== COMMUNITY_BOOTSTRAP.id) {
      events.push({ id: `req-${after.day}-${after.currentFeature.id}`, kind: 'requirement', title: 'NEW REQUIREMENT', message: `${LABELS[after.currentFeature.id] ?? after.currentFeature.id} 개발이 자동으로 시작되었습니다.`, autoPause: true });
    }
    const previousIncidents = new Set(before.incidents.map((incident) => incident.id));
    for (const incident of after.incidents) {
      if (previousIncidents.has(incident.id)) continue;
      const autoPause = incident.severity === 'MAJOR' || incident.severity === 'CRITICAL';
      events.push({
        id: incident.id,
        kind: 'incident',
        title: `${incident.severity} INCIDENT`,
        message: `${this.nodeLabel(incident.nodeId)}에서 장애가 발생했습니다.`,
        severity: incident.severity,
        nodeId: incident.nodeId,
        autoPause,
      });
    }
    if (before.status !== after.status && after.status === 'BANKRUPT') {
      events.push({ id: `bankrupt-${after.day}`, kind: 'bankrupt', title: 'BANKRUPT', message: '월 정산 후 현금이 음수가 되었습니다.', autoPause: true });
    }
    if (before.status !== after.status && after.status === 'WON') {
      events.push({ id: `won-${after.day}`, kind: 'won', title: 'EXIT', message: '모든 기능을 완성하고 목표 월 매출을 달성했습니다.', autoPause: true });
    }
    return events;
  }

  private serviceNodes(snapshot: GameSnapshot): ServiceNodeView[] {
    const incidentByNode = new Map(snapshot.incidents.map((incident) => [incident.nodeId, incident]));
    const appIncident = incidentByNode.get(`framework:${this.engine.config.frameworkId}`);
    const dbIncident = incidentByNode.get(`database:${this.engine.config.databaseId}`);
    const nodes: ServiceNodeView[] = [
      {
        id: 'application',
        kind: 'application',
        name: LABELS[this.engine.config.frameworkId],
        icon: ICONS.application,
        loadPercent: percent(snapshot.load.appRatio),
        tone: loadTone(snapshot.load.appRatio, Boolean(appIncident)),
        detail: `${this.engine.infrastructure.app.size} ×${this.engine.infrastructure.app.count}`,
        incidentId: appIncident?.id,
        incidentSeverity: appIncident?.severity,
      },
      {
        id: 'database',
        kind: 'database',
        name: LABELS[this.engine.config.databaseId],
        icon: ICONS.database,
        loadPercent: percent(snapshot.load.dbRatio),
        tone: loadTone(snapshot.load.dbRatio, Boolean(dbIncident)),
        detail: `${this.engine.infrastructure.database.size} · Replica ${this.engine.infrastructure.database.replicaCount}`,
        incidentId: dbIncident?.id,
        incidentSeverity: dbIncident?.severity,
      },
    ];

    for (const technology of this.engine.infrastructure.deployedTechnologies) {
      const nodeId = `technology:${technology}`;
      const incident = incidentByNode.get(nodeId);
      const kind: ServiceNodeView['kind'] = technology === 'REDIS'
        ? 'cache'
        : technology === 'ALB'
          ? 'load-balancer'
          : technology === 'OBJECT_STORAGE'
            ? 'storage'
            : 'queue';
      const ratio = technology === 'REDIS'
        ? snapshot.load.dbRatio
        : technology === 'ALB'
          ? snapshot.load.appRatio
          : technology === 'OBJECT_STORAGE'
            ? snapshot.load.storageRatio
            : snapshot.load.asyncRatio;
      nodes.push({
        id: technology,
        kind,
        name: LABELS[technology],
        icon: TECH_ICONS[technology],
        loadPercent: percent(ratio),
        tone: loadTone(ratio, Boolean(incident)),
        detail: 'ACTIVE',
        incidentId: incident?.id,
        incidentSeverity: incident?.severity,
      });
    }
    return nodes;
  }

  private workSlots(snapshot: GameSnapshot): WorkSlotView[] {
    const feature = snapshot.currentFeature;
    const tech = snapshot.currentTechnologyBuild;
    const learning = this.engine.learning.current;
    const responding = snapshot.incidents.find((incident) => incident.remainingResponseDays !== null);
    return [
      {
        id: 'feature',
        label: 'FEATURE',
        title: feature ? (LABELS[feature.id] ?? feature.id) : '비어 있음',
        progress: feature ? feature.progress / feature.requiredWork : null,
        meta: feature ? '자동 개발 중' : '다음 요구사항 대기',
        active: Boolean(feature),
      },
      {
        id: 'technology',
        label: 'TECHNOLOGY',
        title: tech ? (LABELS[tech.id] ?? tech.id) : '비어 있음',
        progress: tech ? tech.progress / tech.requiredWork : null,
        meta: tech ? '구축 중' : '기술을 선택하세요',
        active: Boolean(tech),
      },
      {
        id: 'learning',
        label: 'LEARNING',
        title: learning ? (LABELS[learning.skill.id] ?? learning.skill.id) : '비어 있음',
        progress: null,
        meta: learning ? `Lv.${learning.targetLevel} 학습 중 · ${learning.requiredStudyDays}일` : '학습을 선택하세요',
        active: Boolean(learning),
      },
      {
        id: 'incident',
        label: 'INCIDENT',
        title: responding ? this.nodeLabel(responding.nodeId) : '비어 있음',
        progress: null,
        meta: responding ? `${responding.remainingResponseDays}일 남음` : `${snapshot.incidents.length}건 미해결`,
        active: Boolean(responding),
      },
    ];
  }

  private alerts(snapshot: GameSnapshot, profit: number): AlertView[] {
    const alerts: AlertView[] = [];
    const ratios: Array<[string, number, string]> = [
      ['Application', snapshot.load.appRatio, 'application'],
      ['Database', snapshot.load.dbRatio, 'database'],
      ['Async', snapshot.load.asyncRatio, 'queue'],
      ['Storage', snapshot.load.storageRatio, 'storage'],
    ];
    for (const [name, ratio, nodeId] of ratios) {
      if (ratio >= 0.9) {
        alerts.push({
          id: `load-${name}`,
          tone: ratio > 1 ? 'danger' : 'warning',
          title: `${name} Load ${percent(ratio)}%`,
          detail: ratio > 1 ? 'Overload 상태' : 'Critical 구간',
          nodeId,
        });
      }
    }
    for (const incident of snapshot.incidents) {
      alerts.push({
        id: incident.id,
        tone: incident.severity === 'MINOR' ? 'warning' : 'danger',
        title: `${incident.severity} · ${this.nodeLabel(incident.nodeId)}`,
        detail: incident.remainingResponseDays === null ? '대응 대기 중' : `복구 ${incident.remainingResponseDays}일`,
        nodeId: incident.nodeId,
      });
    }
    if (profit < 0) {
      alerts.push({ id: 'profit', tone: 'warning', title: '월 손익 적자 예상', detail: `현재 조건 기준 ${Math.abs(profit).toLocaleString()}원 적자` });
    }
    if (!snapshot.launched) {
      alerts.push({ id: 'bootstrap', tone: 'info', title: 'Bootstrap 개발 중', detail: '완료되면 DAU 80으로 서비스가 공개됩니다.' });
    }
    if (alerts.length === 0) {
      alerts.push({ id: 'stable', tone: 'good', title: '서비스 안정', detail: '현재 즉시 확인할 경고가 없습니다.' });
    }
    return alerts.slice(0, 6);
  }

  private technologyOptions(snapshot: GameSnapshot): TechnologyOptionView[] {
    return (Object.keys(TECHNOLOGIES) as BuildableTechnologyId[]).map((id) => {
      const tech = TECHNOLOGIES[id];
      const deployed = this.engine.infrastructure.hasTechnology(id);
      let reason: string | null = null;
      if (snapshot.currentTechnologyBuild) reason = '다른 기술을 구축 중';
      if (snapshot.cash < tech.buildCost) reason = '현금 부족';
      for (const [fundamental, level] of Object.entries(tech.prerequisites)) {
        if (this.engine.developer.get(skillRef.fundamental(fundamental as FundamentalSkillId)).level < (level ?? 1)) {
          reason = `${LABELS[fundamental]} Lv.${level} 필요`;
        }
      }
      return {
        id,
        name: tech.name,
        icon: TECH_ICONS[id],
        buildCost: tech.buildCost,
        monthlyCost: tech.monthlyCost,
        buildWork: tech.buildWork,
        deployed,
        available: !deployed && !reason,
        reason,
        preview: this.previewTechnology(id),
      };
    });
  }

  private previewTechnology(id: BuildableTechnologyId): string {
    if (this.engine.infrastructure.hasTechnology(id)) return '이미 서비스에 연결됨';
    const snapshot = this.engine.snapshot;
    const clone = cloneInfrastructure(this.engine);
    clone.deployTechnology(id);
    const features = snapshot.launched
      ? [
          COMMUNITY_BOOTSTRAP,
          ...snapshot.completedFeatures
            .map((featureId) => COMMUNITY_FEATURES[featureId as keyof typeof COMMUNITY_FEATURES])
            .filter(Boolean),
        ]
      : [];
    const after = LoadCalculator.calculate(snapshot.dau, features, clone);
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
      skillRef.language(FRAMEWORK_LANGUAGE[this.engine.config.frameworkId]),
      skillRef.framework(this.engine.config.frameworkId),
      skillRef.technology(this.engine.config.databaseId),
      ...TECHNOLOGY_SKILLS.filter((id) => id !== this.engine.config.databaseId).map(skillRef.technology),
    ];
    return refs.map((ref) => {
      const proficiency = this.engine.developer.get(ref);
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

        if (this.engine.learning.current) {
          reason = '다른 학습 진행 중';
        } else if (proficiency.experienceDays < requirement.experienceDays) {
          reason = `경험 ${requirement.experienceDays - proficiency.experienceDays}일 부족`;
        } else {
          const missing = requirement.prerequisites.find((item) => this.engine.developer.get(item.ref).level < item.level);
          if (missing) reason = `${LABELS[missing.ref.id]} Lv.${missing.level} 필요`;
          else if (this.engine.finance.cash < requirement.cost) reason = '현금 부족';
          else canStudy = true;
        }
      }

      return {
        key: `${ref.category}:${ref.id}`,
        ref,
        name: LABELS[ref.id] ?? ref.id,
        icon: ICONS[ref.id] ?? '•',
        level: proficiency.level,
        experienceDays: proficiency.experienceDays,
        targetLevel,
        requiredExperience,
        studyDays,
        cost,
        canStudy,
        reason,
        category: ref.category,
      };
    });
  }

  private featureCards(snapshot: GameSnapshot): FeatureCardView[] {
    return this.engine.progression.featureOrder.map((featureId, slotIndex) => {
      const threshold = COMMUNITY_REQUIREMENT_THRESHOLDS[slotIndex];
      const phase = phaseForSlot(slotIndex);
      const completed = snapshot.completedFeatures.includes(featureId);
      const developing = snapshot.currentFeature?.id === featureId;
      const revealed = completed || developing || snapshot.dau >= threshold;
      const feature = COMMUNITY_FEATURES[featureId];
      return {
        id: featureId,
        name: revealed ? (LABELS[featureId] ?? feature.name) : '?',
        phase,
        threshold,
        state: completed ? 'completed' : developing ? 'developing' : revealed ? 'revealed' : 'hidden',
        load: revealed ? feature.load : null,
      };
    });
  }

  private nodeLabel(nodeId: string): string {
    const id = nodeId.split(':').pop() ?? nodeId;
    return LABELS[id] ?? id;
  }
}
