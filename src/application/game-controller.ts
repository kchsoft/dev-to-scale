import {
  AppCluster,
  BuildableTechnologyId,
  COMMUNITY_BOOTSTRAP,
  COMMUNITY_FEATURES,
  COMMUNITY_REQUIREMENT_THRESHOLDS,
  DatabaseCluster,
  FrameworkId,
  FundamentalSkillId,
  GameEngine,
  GameSnapshot,
  LanguageId,
  LearningRules,
  RequestNodeKind,
  RevenuePolicy,
  ServerSize,
  SkillRef,
  TECHNOLOGIES,
  TechnologySkillId,
  TrafficSpikeResponse,
  skillRef,
} from '../core';
import {
  AlertView,
  FeatureCardView,
  GameEventView,
  GameStartConfig,
  GameView,
  InfrastructureCostView,
  LoadTone,
  ObservabilityView,
  RequestFlowView,
  ServiceNodeView,
  SkillNodeView,
  TechnologyOptionView,
} from './game-view';
import { OperationalViewProjector } from './operational-view-projector';

export type {
  AlertView,
  FeatureCardView,
  GameEventView,
  GameView,
  InfrastructureCostView,
  RequestFlowView,
  ServiceNodeView,
  SkillNodeView,
  TechnologyOptionView,
} from './game-view';

const FRAMEWORK_LANGUAGE: Record<FrameworkId, LanguageId> = {
  SPRING_BOOT: 'JAVA',
  NESTJS: 'TYPESCRIPT',
  GIN: 'GO',
  FASTAPI: 'PYTHON',
  ASPNET_CORE: 'CSHARP',
};

const LABELS: Record<string, string> = {
  COMMUNITY_MVP: '게시글', COMMENT: '댓글', LIKE: '좋아요', IMAGE_UPLOAD: '이미지 업로드',
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
const SERVER_SIZES: readonly ServerSize[] = [ServerSize.SMALL, ServerSize.MEDIUM, ServerSize.LARGE, ServerSize.XLARGE];

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

function sameSkill(left: SkillRef, right: SkillRef): boolean {
  return left.category === right.category && left.id === right.id;
}

function trafficUnitForDau(dau: number): number {
  if (dau <= 100_000) return 10_000;
  if (dau <= 1_000_000) return 100_000;
  if (dau <= 10_000_000) return 1_000_000;
  return 5_000_000;
}

function nodeIdForRequestNode(node: RequestNodeKind | null): string | undefined {
  switch (node) {
    case 'ALB': return 'ALB';
    case 'APP': return 'application';
    case 'DB': return 'database';
    case 'CACHE': return 'REDIS';
    case 'QUEUE': return 'queue';
    case 'STORAGE': return 'storage';
    default: return undefined;
  }
}

function calendarForDay(day: number): { month: number; dayOfMonth: number; daysUntilSettlement: number } {
  const month = Math.floor((day - 1) / 30) + 1;
  const dayOfMonth = ((day - 1) % 30) + 1;
  return { month, dayOfMonth, daysUntilSettlement: 31 - dayOfMonth };
}

interface FeatureImpactPreview {
  summary: string;
  tone: AlertView['tone'];
  nodeId?: string;
}

export class GameController {
  readonly #engine: GameEngine;
  private readonly listeners = new Set<(view: GameView) => void>();

  constructor(config: GameStartConfig) {
    this.#engine = new GameEngine(config);
  }

  subscribe(listener: (view: GameView) => void): () => void {
    this.listeners.add(listener);
    listener(this.getView());
    return () => this.listeners.delete(listener);
  }

  getView(): GameView {
    const snapshot = this.#engine.snapshot;
    const revenueModifier = snapshot.completedFeatures.reduce(
      (sum, id) => sum + (COMMUNITY_FEATURES[id as keyof typeof COMMUNITY_FEATURES]?.revenueModifier ?? 0),
      0,
    );
    const aiActive = snapshot.completedFeatures.includes('AI_RECOMMENDATION');
    const monthlyRevenue = RevenuePolicy.monthlyRevenue(snapshot.dau, revenueModifier);
    const monthlyCost = this.#engine.infrastructure.monthlyCost + RevenuePolicy.monthlyAiCost(snapshot.dau, aiActive);
    const calendar = calendarForDay(snapshot.day);
    const service = OperationalViewProjector.project(snapshot, this.#engine.developer);

    return {
      hud: {
        day: snapshot.day,
        month: calendar.month,
        dayOfMonth: calendar.dayOfMonth,
        daysUntilSettlement: calendar.daysUntilSettlement,
        dau: snapshot.dau,
        cash: snapshot.cash,
        monthlyRevenue,
        monthlyCost,
        monthlyProfit: monthlyRevenue - monthlyCost,
        lastSettlement: snapshot.lastSettlement,
        status: snapshot.status,
        launched: snapshot.launched,
      },
      nodes: this.serviceNodes(snapshot),
      workSlots: this.workSlots(snapshot),
      alerts: this.alerts(snapshot, monthlyRevenue - monthlyCost, service.observability),
      technologies: this.technologyOptions(snapshot),
      skills: this.skillNodes(),
      features: this.featureCards(snapshot),
      requestFlows: this.requestFlowViews(snapshot),
      infrastructureCosts: this.infrastructureCostView(),
      service,
      operations: {
        currentFeature: snapshot.currentFeature,
        currentTechnologyBuild: snapshot.currentTechnologyBuild,
        techDebt: snapshot.techDebt,
        trafficSpike: snapshot.growthEvent?.type === 'VIRAL'
          ? { burstCost: snapshot.growthEvent.burstCost }
          : null,
      },
      frameworkId: this.#engine.config.frameworkId,
      databaseId: this.#engine.config.databaseId,
      appSize: this.#engine.infrastructure.app.size,
      appCount: this.#engine.infrastructure.app.count,
      dbSize: this.#engine.infrastructure.database.size,
      dbReplicaCount: this.#engine.infrastructure.database.replicaCount,
    };
  }

  advanceDay(): GameEventView[] {
    const before = this.#engine.snapshot;
    const after = this.#engine.advanceDay();
    const events = this.detectEvents(before, after);
    this.emit();
    return events;
  }

  startTechnologyBuild(id: BuildableTechnologyId): void { this.#engine.startTechnologyBuild(id); this.emit(); }
  startLearning(ref: SkillRef): void { this.#engine.startLearning(ref); this.emit(); }
  startIncidentResponse(id: string): void { this.#engine.startIncidentResponse(id); this.emit(); }
  scaleApplication(size: ServerSize): void { this.#engine.scaleApplication(size); this.emit(); }
  addApplicationServer(): void { this.#engine.addApplicationServer(); this.emit(); }
  scaleDatabase(size: ServerSize): void { this.#engine.scaleDatabase(size); this.emit(); }
  addDatabaseReplica(): void { this.#engine.addDatabaseReplica(); this.emit(); }
  fastTrackCurrentFeature(): void { this.#engine.fastTrackCurrentFeature(); this.emit(); }
  startRefactor(): void { this.#engine.startRefactor(); this.emit(); }
  respondTrafficSpike(response: TrafficSpikeResponse): void { this.#engine.respondToTrafficSpike(response); this.emit(); }

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
      const impact = this.featureImpact(after, after.currentFeature.id);
      events.push({
        id: `req-${after.day}-${after.currentFeature.id}`,
        kind: 'requirement',
        title: 'NEW REQUIREMENT',
        message: `${LABELS[after.currentFeature.id] ?? after.currentFeature.id} 개발이 자동으로 시작되었습니다.${impact ? ` 출시 예상 · ${impact.summary}` : ''}`,
        autoPause: true,
      });
    }
    if (after.growthEvent?.type === 'VIRAL' && before.growthEvent?.type !== 'VIRAL') {
      events.push({
        id: `traffic-${after.day}`,
        kind: 'traffic',
        title: 'TRAFFIC SPIKE',
        message: `바이럴 유입이 시작됐습니다. ${after.growthEvent.remainingDays}일 동안 유입 ×${after.growthEvent.trafficMultiplier.toFixed(1)}. 버티면 성장 기회를 모두 가져가지만 부하도 그대로 받고, Traffic Limit은 성장을 포기해 안정화하며, Emergency Burst는 비용을 내고 성장 기회를 유지합니다.`,
        autoPause: true,
      });
    }
    if (after.lastSettlement && after.lastSettlement.month !== before.lastSettlement?.month) {
      const settlement = after.lastSettlement;
      const sign = settlement.profit >= 0 ? '+' : '-';
      events.push({
        id: `settlement-${settlement.month}`,
        kind: 'settlement',
        title: `M${settlement.month} SETTLEMENT`,
        message: `월 매출 ${settlement.revenue.toLocaleString()}원 · 월 비용 ${settlement.totalCost.toLocaleString()}원 · 순변동 ${sign}${Math.abs(settlement.profit).toLocaleString()}원`,
        autoPause: false,
      });
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
        diagnosis: OperationalViewProjector.diagnosisText(incident.nodeId, after, this.#engine.developer),
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
    const appIncident = incidentByNode.get(`framework:${this.#engine.config.frameworkId}`);
    const dbIncident = incidentByNode.get(`database:${this.#engine.config.databaseId}`);
    const appCap = snapshot.load.appCapacity;
    const dbCap = snapshot.load.dbCapacity;
    const nodes: ServiceNodeView[] = [
      {
        id: 'application',
        kind: 'application',
        name: LABELS[this.#engine.config.frameworkId],
        icon: ICONS.application,
        loadPercent: percent(snapshot.load.appRatio),
        tone: loadTone(snapshot.load.appRatio, Boolean(appIncident)),
        detail: `${this.#engine.infrastructure.app.size} ×${this.#engine.infrastructure.app.count} · CAP ${Math.round(appCap)}`,
        incidentId: appIncident?.id,
        incidentSeverity: appIncident?.severity,
      },
      {
        id: 'database',
        kind: 'database',
        name: LABELS[this.#engine.config.databaseId],
        icon: ICONS.database,
        loadPercent: percent(snapshot.load.dbRatio),
        tone: loadTone(snapshot.load.dbRatio, Boolean(dbIncident)),
        detail: `${this.#engine.infrastructure.database.size} · Replica ${this.#engine.infrastructure.database.replicaCount} · CAP ${Math.round(dbCap)}`,
        incidentId: dbIncident?.id,
        incidentSeverity: dbIncident?.severity,
      },
    ];

    for (const technology of this.#engine.infrastructure.deployedTechnologies) {
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
      const detail = kind === 'queue'
        ? `ACTIVE · CAP ${Math.round(snapshot.load.asyncCapacity)}`
        : 'ACTIVE';
      nodes.push({
        id: technology,
        kind,
        name: LABELS[technology],
        icon: TECH_ICONS[technology],
        loadPercent: percent(ratio),
        tone: loadTone(ratio, Boolean(incident)),
        detail,
        incidentId: incident?.id,
        incidentSeverity: incident?.severity,
      });
    }
    return nodes;
  }

  private workSlots(snapshot: GameSnapshot): WorkSlotView[] {
    const feature = snapshot.currentFeature;
    const tech = snapshot.currentTechnologyBuild;
    const learning = this.#engine.learning.current;
    const responding = snapshot.incidents.find((incident) => incident.remainingResponseDays !== null);
    const featureTotal = feature ? feature.elapsedDays + feature.estimatedRemainingDays : 0;
    const techTotal = tech ? tech.elapsedDays + tech.estimatedRemainingDays : 0;
    const responseTotal = responding?.totalResponseDays ?? 0;
    const responseElapsed = responding?.elapsedResponseDays ?? 0;
    const refactorProgress = snapshot.techDebt.refactoring
      ? 1 - snapshot.techDebt.remainingRefactorDays / 5
      : null;
    return [
      snapshot.techDebt.refactoring
        ? {
            id: 'feature',
            label: 'FEATURE',
            title: 'REFACTORING',
            progress: refactorProgress,
            meta: `${snapshot.techDebt.remainingRefactorDays}일 남음 · 완료 시 Tech Debt -30`,
            active: true,
          }
        : {
            id: 'feature',
            label: 'FEATURE',
            title: feature ? (LABELS[feature.id] ?? feature.id) : '비어 있음',
            progress: feature ? feature.progress / feature.requiredWork : null,
            meta: feature ? `${feature.elapsedDays}/~${featureTotal}일 · 약 ${feature.estimatedRemainingDays}일 남음` : '다음 요구사항 대기',
            active: Boolean(feature),
          },
      {
        id: 'technology',
        label: 'TECHNOLOGY',
        title: tech ? (LABELS[tech.id] ?? tech.id) : '비어 있음',
        progress: tech ? tech.progress / tech.requiredWork : null,
        meta: tech ? `${tech.elapsedDays}/~${techTotal}일 · 약 ${tech.estimatedRemainingDays}일 남음` : '기술을 선택하세요',
        active: Boolean(tech),
      },
      {
        id: 'learning',
        label: 'LEARNING',
        title: learning ? `${LABELS[learning.skill.id] ?? learning.skill.id} → Lv.${learning.targetLevel}` : '비어 있음',
        progress: learning ? learning.progress : null,
        meta: learning ? `${learning.elapsedStudyDays}/${learning.requiredStudyDays}일 · ${Math.max(0, learning.requiredStudyDays - learning.elapsedStudyDays)}일 남음` : '학습을 선택하세요',
        active: Boolean(learning),
      },
      {
        id: 'incident',
        label: 'INCIDENT',
        title: responding ? this.nodeLabel(responding.nodeId) : '비어 있음',
        progress: responding && responseTotal > 0 ? responseElapsed / responseTotal : null,
        meta: responding
          ? `${responseElapsed}/${responseTotal}일 · ${responding.remainingResponseDays ?? 0}일 남음`
          : `${snapshot.incidents.length}건 미해결`,
        active: Boolean(responding),
      },
    ];
  }

  private alerts(snapshot: GameSnapshot, profit: number, observability: ObservabilityView): AlertView[] {
    const alerts: AlertView[] = [];

    if (snapshot.growthEvent?.type === 'VIRAL') {
      const event = snapshot.growthEvent;
      const responseText = event.response === 'PENDING'
        ? '대응 선택 대기'
        : event.response === 'THROTTLE'
          ? `TRAFFIC LIMIT · 유효 부하 ×${event.loadMultiplier.toFixed(2)} · 성장 +${percent(event.growthModifier)}%p`
          : event.response === 'BURST'
            ? `EMERGENCY BURST · 유효 부하 ×${event.loadMultiplier.toFixed(2)} · 성장 +${percent(event.growthModifier)}%p`
            : `RIDE THE WAVE · 유효 부하 ×${event.loadMultiplier.toFixed(1)} · 성장 +${percent(event.growthModifier)}%p`;
      alerts.push({
        id: 'viral-traffic',
        tone: event.response === 'THROTTLE' ? 'info' : 'warning',
        title: `Viral Traffic ×${event.trafficMultiplier.toFixed(1)}`,
        detail: `${event.remainingDays}일 남음 · ${responseText}`,
      });
    }

    if (snapshot.techDebt.refactoring) {
      alerts.push({
        id: 'tech-debt-refactor',
        tone: 'info',
        title: `Refactoring · ${snapshot.techDebt.remainingRefactorDays}일`,
        detail: '기능 개발은 잠시 멈추지만 완료 시 Tech Debt가 30 감소합니다.',
      });
    } else if (snapshot.techDebt.value >= 20) {
      alerts.push({
        id: 'tech-debt',
        tone: snapshot.techDebt.value >= 60 ? 'danger' : 'warning',
        title: `Tech Debt ${snapshot.techDebt.value}/100`,
        detail: `Feature 개발 효율 ${percent(snapshot.techDebt.developmentModifier)}% · 장애 위험 ×${snapshot.techDebt.incidentRiskMultiplier.toFixed(2)}`,
      });
    }

    if (snapshot.currentFeature && snapshot.currentFeature.id !== COMMUNITY_BOOTSTRAP.id) {
      const impact = this.featureImpact(snapshot, snapshot.currentFeature.id);
      if (impact) {
        alerts.push({
          id: `feature-impact-${snapshot.currentFeature.id}`,
          tone: impact.tone,
          title: `출시 영향 · ${LABELS[snapshot.currentFeature.id] ?? snapshot.currentFeature.id}`,
          detail: impact.summary,
          nodeId: impact.nodeId,
        });
      }
    }

    const ratios: Array<[string, number, string]> = [
      ['Application', snapshot.load.appRatio, 'application'],
      ['Database', snapshot.load.dbRatio, 'database'],
      ['Async', snapshot.load.asyncRatio, 'queue'],
      ['Storage', snapshot.load.storageRatio, 'storage'],
    ];
    for (const [name, ratio, nodeId] of ratios) {
      if (ratio >= 0.9) {
        const overloadPenalty = ratio > 1 ? Math.min(30, Math.round((ratio - 1) * 100)) : 0;
        alerts.push({
          id: `load-${name}`,
          tone: ratio > 1 ? 'danger' : 'warning',
          title: `${name} Load ${percent(ratio)}%`,
          detail: ratio > 1
            ? `Capacity ${Math.round((ratio - 1) * 100)}% 초과 · 다음 날 DAU 최대 -${overloadPenalty}% 압력`
            : 'Critical 구간 · Scale 검토 필요',
          nodeId,
        });
      }
    }
    if (snapshot.load.failureRate > 0.001) {
      const failed = snapshot.load.requestFlows.filter((flow) => flow.successRatio < 0.999);
      const firstFailure = failed.find((flow) => flow.failureNode)?.failureNode ?? null;
      alerts.push({
        id: 'request-failure',
        tone: 'danger',
        title: `Request Failure ${percent(snapshot.load.failureRate)}%`,
        detail: failed.length > 0
          ? `${failed.slice(0, 2).map((flow) => LABELS[flow.featureId] ?? flow.featureId).join(', ')} 요청 경로 확인 필요`
          : '요청 처리 성공률이 낮습니다.',
        nodeId: nodeIdForRequestNode(firstFailure),
      });
    }
    for (const incident of snapshot.incidents) {
      alerts.push({
        id: incident.id,
        tone: incident.severity === 'MINOR' ? 'warning' : 'danger',
        title: `${incident.severity} · ${this.nodeLabel(incident.nodeId)}`,
        detail: incident.remainingResponseDays === null ? '대응 대기 중' : `복구 ${incident.elapsedResponseDays ?? 0}/${incident.totalResponseDays ?? 0}일`,
        nodeId: incident.nodeId,
      });
    }
    if (profit < 0) {
      alerts.push({ id: 'profit', tone: 'warning', title: '월 예상 순이익 적자', detail: `현재 조건 기준 ${Math.abs(profit).toLocaleString()}원 적자` });
    }
    if (!snapshot.launched) {
      alerts.push({ id: 'bootstrap', tone: 'info', title: 'Bootstrap 개발 중', detail: '완료되면 DAU 80으로 서비스가 공개됩니다.' });
    }
    if (alerts.length === 0) {
      alerts.push({ id: 'stable', tone: 'good', title: '서비스 안정', detail: '현재 즉시 확인할 경고가 없습니다.' });
    }
    return alerts.slice(0, 6).map((alert) => {
      if (!alert.id.startsWith('feature-impact-') || observability.level === 'APM') return alert;
      return {
        ...alert,
        tone: 'info',
        detail: observability.level === 'METRICS'
          ? '새 기능이 자원 사용량을 높입니다. APM 해금 시 축별 출시 영향과 예상 병목을 확인할 수 있습니다.'
          : '새 기능이 서비스 부하를 높일 수 있습니다. Metrics/APM을 해금하면 출시 영향을 더 정확히 볼 수 있습니다.',
        nodeId: undefined,
      };
    });
  }

  private featureImpact(snapshot: GameSnapshot, featureId: string): FeatureImpactPreview | null {
    const feature = COMMUNITY_FEATURES[featureId as keyof typeof COMMUNITY_FEATURES];
    if (!feature || !snapshot.launched) return null;
    const projected = this.#engine.previewLoadWithFeature(feature);
    const axes = [
      { label: 'APP CPU', before: snapshot.load.appCpuRatio, after: projected.appCpuRatio, nodeId: 'application' },
      { label: 'APP I/O', before: snapshot.load.appIoRatio, after: projected.appIoRatio, nodeId: 'application' },
      { label: 'DB CPU', before: snapshot.load.dbCpuRatio, after: projected.dbCpuRatio, nodeId: 'database' },
      { label: 'DB I/O', before: snapshot.load.dbIoRatio, after: projected.dbIoRatio, nodeId: 'database' },
      { label: 'ASYNC', before: snapshot.load.asyncRatio, after: projected.asyncRatio, nodeId: 'queue' },
      { label: 'STORAGE', before: snapshot.load.storageRatio, after: projected.storageRatio, nodeId: 'storage' },
    ];
    const top = [...axes].sort((left, right) => right.after - left.after)[0];
    const changes = [...axes]
      .sort((left, right) => (right.after - right.before) - (left.after - left.before))
      .slice(0, 2)
      .map((axis) => `${axis.label} ${percent(axis.before)}→${percent(axis.after)}%`);
    const failureIncrease = projected.failureRate - snapshot.load.failureRate;
    if (failureIncrease > 0.001) {
      changes.push(`FAIL ${percent(snapshot.load.failureRate)}→${percent(projected.failureRate)}%`);
    }
    const suffix = projected.failureRate >= 0.1
      ? ' · ⚠ 필수 요청 경로 확인 필요'
      : top.after > 1
        ? ` · ⚠ ${top.label} OVERLOAD 예상`
        : top.after >= 0.9
          ? ` · △ ${top.label} Critical 근접`
          : ' · 현재 Capacity 안쪽';
    return {
      summary: `${changes.join(' · ')}${suffix}`,
      tone: projected.failureRate >= 0.1 || top.after > 1 ? 'danger' : top.after >= 0.9 ? 'warning' : 'info',
      nodeId: top.nodeId,
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
    if (this.#engine.infrastructure.hasTechnology(id)) return '이미 서비스에 연결됨';
    const snapshot = this.#engine.snapshot;
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
          if (missing) reason = `${LABELS[missing.ref.id]} Lv.${missing.level} 필요`;
          else if (this.#engine.finance.cash < requirement.cost) reason = '현금 부족';
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
        name: revealed ? (LABELS[featureId] ?? feature.name) : '?',
        phase,
        threshold,
        state: completed ? 'completed' : developing ? 'developing' : revealed ? 'revealed' : 'hidden',
        load: revealed ? feature.load : null,
        route: revealed ? feature.requestRoute.map((step) => step.node) : null,
      };
    });
  }

  private requestFlowViews(snapshot: GameSnapshot): RequestFlowView[] {
    if (!snapshot.launched || snapshot.load.requestFlows.length === 0) return [];

    const definitions = snapshot.load.requestFlows.map((flow) => {
      const feature = flow.featureId === COMMUNITY_BOOTSTRAP.id
        ? COMMUNITY_BOOTSTRAP
        : COMMUNITY_FEATURES[flow.featureId as keyof typeof COMMUNITY_FEATURES];
      const weight = feature
        ? Math.max(1, feature.load.app + feature.load.db + feature.load.async + feature.load.storage)
        : 1;
      return { flow, feature, weight };
    });
    const totalWeight = definitions.reduce((sum, item) => sum + item.weight, 0) || 1;
    const trafficUnit = trafficUnitForDau(snapshot.dau);

    return definitions.slice(-5).map(({ flow, feature, weight }) => {
      const estimatedTraffic = snapshot.dau * (weight / totalWeight);
      const particleCount = snapshot.dau <= 0
        ? 0
        : Math.max(1, Math.min(4, Math.ceil(estimatedTraffic / trafficUnit)));
      return {
        id: flow.featureId,
        name: LABELS[flow.featureId] ?? feature?.name ?? flow.featureId,
        nodes: flow.nodes.map((node) => ({
          node: node.node,
          arrivalPercent: percent(node.arrivalRatio),
          available: node.available,
        })),
        successPercent: percent(flow.successRatio),
        failureNode: flow.failureNode,
        particleCount,
        trafficUnit,
      };
    });
  }

  private infrastructureCostView(): InfrastructureCostView {
    const currentApp = this.#engine.infrastructure.app;
    const currentDb = this.#engine.infrastructure.database;
    const hasAlb = this.#engine.infrastructure.hasTechnology('ALB');

    const appSizeMonthlyCosts = {} as Record<ServerSize, number>;
    const dbSizeMonthlyCosts = {} as Record<ServerSize, number>;
    for (const size of SERVER_SIZES) {
      appSizeMonthlyCosts[size] = new AppCluster(
        this.#engine.config.frameworkId,
        size,
        currentApp.count,
        hasAlb,
      ).monthlyCost;
      dbSizeMonthlyCosts[size] = new DatabaseCluster(
        this.#engine.config.databaseId,
        size,
        currentDb.replicaCount,
      ).monthlyCost;
    }

    let addAppServerMonthlyCostDelta: number | null = null;
    if (hasAlb && currentApp.count < 10) {
      const expanded = new AppCluster(
        this.#engine.config.frameworkId,
        currentApp.size,
        currentApp.count,
        true,
      );
      expanded.addServer();
      addAppServerMonthlyCostDelta = expanded.monthlyCost - currentApp.monthlyCost;
    }

    let addDbReplicaMonthlyCostDelta: number | null = null;
    if (currentDb.replicaCount < 3) {
      const expanded = new DatabaseCluster(
        this.#engine.config.databaseId,
        currentDb.size,
        currentDb.replicaCount,
      );
      expanded.addReplica();
      addDbReplicaMonthlyCostDelta = expanded.monthlyCost - currentDb.monthlyCost;
    }

    return {
      appSizeMonthlyCosts,
      dbSizeMonthlyCosts,
      addAppServerMonthlyCostDelta,
      addDbReplicaMonthlyCostDelta,
    };
  }

  private nodeLabel(nodeId: string): string {
    const id = nodeId.split(':').pop() ?? nodeId;
    return LABELS[id] ?? id;
  }
}
