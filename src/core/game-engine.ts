import { COMMUNITY_BOOTSTRAP, COMMUNITY_FEATURES } from './community';
import { ExperienceAccrualService } from './experience';
import { FeatureDefinition, FeatureDevelopmentTask, FrameworkDefinition, FrameworkId } from './feature';
import { FinanceAccount, MonthlyEconomyLedger, RevenuePolicy } from './finance';
import { GrowthEvent, GrowthPolicy, RandomSource } from './growth';
import { IncidentCandidate, IncidentGenerator, IncidentManager } from './incident-manager';
import { DatabaseId, InfrastructureState, LoadCalculator, LoadSnapshot, ServerSize, TechnologyId } from './infrastructure';
import { DeveloperProfile, FundamentalSkillId, LearningRules, LearningSlot, SkillRef, skillRef, TechnologySkillId } from './learning';
import { CommunityFeatureId, CommunityProgression } from './progression';
import { SeededRandomSource } from './random';
import { BuildableTechnologyId, TECHNOLOGIES, TechnologyBuildSlot } from './technology';

export type GameStatus = 'RUNNING' | 'BANKRUPT' | 'WON';

export interface GameEngineConfig {
  frameworkId: FrameworkId;
  databaseId: DatabaseId;
  seed: number;
  startingCash?: number;
  random?: RandomSource;
}

export interface GameSnapshot {
  day: number;
  status: GameStatus;
  launched: boolean;
  dau: number;
  cash: number;
  completedFeatures: readonly string[];
  currentFeature: null | { id: string; progress: number; requiredWork: number };
  currentLearning: null | { id: string; targetLevel: number; studyDays: number };
  currentTechnologyBuild: null | { id: string; progress: number; requiredWork: number };
  load: LoadSnapshot;
  incidents: readonly { id: string; nodeId: string; severity: string; remainingResponseDays: number | null }[];
  lastMonthlyRevenue: number;
}

const DB_INCIDENT: Record<DatabaseId, { risk: 1 | 2 | 3 | 4 | 5; difficulty: number }> = {
  POSTGRESQL: { risk: 2, difficulty: 5 },
  MYSQL: { risk: 2, difficulty: 4 },
  MONGODB: { risk: 3, difficulty: 4 },
};

function average(values: number[]): number {
  return values.length === 0 ? 1 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export class GameEngine {
  readonly developer = new DeveloperProfile();
  readonly infrastructure: InfrastructureState;
  readonly progression: CommunityProgression;
  readonly learning = new LearningSlot();
  readonly technologyBuild = new TechnologyBuildSlot();
  readonly incidents = new IncidentManager();
  readonly finance: FinanceAccount;

  private readonly random: RandomSource;
  private readonly incidentGenerator = new IncidentGenerator();
  private readonly monthlyLedger = new MonthlyEconomyLedger();
  private readonly completedFeatureDefinitions: FeatureDefinition[] = [];
  private featureTask: FeatureDevelopmentTask;
  private growthEvent: GrowthEvent | null = null;
  private _day = 1;
  private _dau = 0;
  private _launched = false;
  private _status: GameStatus = 'RUNNING';
  private _lastMonthlyRevenue = 0;
  private _load: LoadSnapshot;

  constructor(readonly config: GameEngineConfig) {
    this.random = config.random ?? new SeededRandomSource(config.seed ^ 0x9e3779b9);
    this.infrastructure = InfrastructureState.initial(config.frameworkId, config.databaseId);
    this.progression = new CommunityProgression(config.seed);
    this.finance = new FinanceAccount(config.startingCash ?? 3_000_000);
    this.featureTask = FeatureDevelopmentTask.start(COMMUNITY_BOOTSTRAP, FrameworkDefinition.byId(config.frameworkId));
    this._load = LoadCalculator.calculate(0, [], this.infrastructure);
  }

  get day(): number { return this._day; }
  get dau(): number { return this._dau; }
  get launched(): boolean { return this._launched; }
  get status(): GameStatus { return this._status; }
  get lastMonthlyRevenue(): number { return this._lastMonthlyRevenue; }

  get snapshot(): GameSnapshot {
    const learningTask = this.learning.current;
    const buildTask = this.technologyBuild.current;
    return {
      day: this._day,
      status: this._status,
      launched: this._launched,
      dau: this._dau,
      cash: this.finance.cash,
      completedFeatures: this.completedFeatureDefinitions.map((feature) => feature.id),
      currentFeature: this.featureTask
        ? { id: this.featureTask.feature.id, progress: this.featureTask.completedWork, requiredWork: this.featureTask.requiredWork }
        : null,
      currentLearning: learningTask
        ? { id: learningTask.skill.id, targetLevel: learningTask.targetLevel, studyDays: learningTask.requiredStudyDays }
        : null,
      currentTechnologyBuild: buildTask
        ? { id: buildTask.definition.id, progress: buildTask.completedWork, requiredWork: buildTask.definition.buildWork }
        : null,
      load: this._load,
      incidents: this.incidents.incidents.map((incident) => ({
        id: incident.id,
        nodeId: incident.nodeId,
        severity: incident.severity,
        remainingResponseDays: incident.remainingResponseDays,
      })),
      lastMonthlyRevenue: this._lastMonthlyRevenue,
    };
  }

  advanceDay(): GameSnapshot {
    if (this._status !== 'RUNNING') return this.snapshot;

    this.settlePreviousMonthIfNeeded();
    if (this._status !== 'RUNNING') return this.snapshot;

    ExperienceAccrualService.recordDay(this.developer, {
      frameworkId: this.config.frameworkId,
      databaseId: this.config.databaseId,
      technologies: this.infrastructure.deployedTechnologies,
    });

    if (this._launched) this.advanceGrowth();
    this._load = LoadCalculator.calculate(this._dau, this.activeFeaturesForLoad(), this.infrastructure);

    if (this._launched) this.maybeGenerateIncident();
    const incidentDevelopmentModifier = this.incidents.developmentModifier;

    this.learning.advanceDay(this.developer);
    const builtTechnology = this.technologyBuild.advanceDay(this.developer, incidentDevelopmentModifier);
    if (builtTechnology) this.infrastructure.deployTechnology(builtTechnology);
    this.incidents.advanceResponseDay();

    const frameworkLevel = this.developer.get(skillRef.framework(this.config.frameworkId)).level;
    this.featureTask.advanceDay({ frameworkLevel, incidentModifier: incidentDevelopmentModifier });
    this.finishFeatureIfComplete();
    this.autoStartRequirementIfEligible();

    const revenueModifier = this.completedFeatureDefinitions.reduce((sum, feature) => sum + feature.revenueModifier, 0);
    const aiActive = this.completedFeatureDefinitions.some((feature) => feature.id === 'AI_RECOMMENDATION');
    this.monthlyLedger.recordDay(this._dau, revenueModifier, aiActive);

    if (this.growthEvent?.active) this.growthEvent.advanceDay();
    this._day += 1;
    return this.snapshot;
  }

  startLearning(skill: SkillRef): void {
    this.ensureRunning();
    const proficiency = this.developer.get(skill);
    const requirement = LearningRules.requirement(skill, proficiency.level);
    if (this.finance.cash < requirement.cost) throw new Error('Insufficient cash for learning');
    this.learning.start(skill, this.developer);
    this.finance.spendImmediately(requirement.cost);
  }

  startTechnologyBuild(id: BuildableTechnologyId): void {
    this.ensureRunning();
    if (this.infrastructure.hasTechnology(id)) throw new Error(`${id} is already deployed`);
    const definition = TECHNOLOGIES[id];
    if (this.finance.cash < definition.buildCost) throw new Error('Insufficient cash for technology build');
    this.technologyBuild.start(id, this.developer);
    this.finance.spendImmediately(definition.buildCost);
  }

  startIncidentResponse(incidentId: string): void {
    this.ensureRunning();
    const incident = this.incidents.incidents.find((candidate) => candidate.id === incidentId);
    if (!incident) throw new Error('Incident not found');
    const context = this.nodeSkillContext(incident.nodeId);
    this.incidents.startResponse(incidentId, context.proficiencyLevel, context.fundamentalAverage);
  }

  scaleApplication(size: ServerSize): void {
    this.ensureRunning();
    this.infrastructure.app.scaleUp(size);
  }

  addApplicationServer(): void {
    this.ensureRunning();
    this.infrastructure.app.addServer();
  }

  scaleDatabase(size: ServerSize): void {
    this.ensureRunning();
    this.infrastructure.database.scaleUp(size);
  }

  addDatabaseReplica(): void {
    this.ensureRunning();
    this.infrastructure.database.addReplica();
  }

  private ensureRunning(): void {
    if (this._status !== 'RUNNING') throw new Error(`Game is ${this._status}`);
  }

  private advanceGrowth(): void {
    this.growthEvent = GrowthPolicy.maybeStartEvent(this.growthEvent, this.random);
    const phase = this.progression.finished ? 3 : this.progression.currentRequirement.phase;
    const result = GrowthPolicy.calculate({
      phase,
      completedFeatureCount: this.completedFeatureDefinitions.length,
      event: this.growthEvent,
      incidents: this.incidents.severities,
      random: this.random,
    });
    this._dau = GrowthPolicy.nextDau(this._dau, result.totalModifier);
  }

  private activeFeaturesForLoad(): FeatureDefinition[] {
    return this._launched ? [COMMUNITY_BOOTSTRAP, ...this.completedFeatureDefinitions] : [];
  }

  private finishFeatureIfComplete(): void {
    if (!this.featureTask.completed) return;

    if (this.featureTask.feature.id === COMMUNITY_BOOTSTRAP.id) {
      this._launched = true;
      this._dau = 80;
      this.featureTask = null as unknown as FeatureDevelopmentTask;
      return;
    }

    this.completedFeatureDefinitions.push(this.featureTask.feature);
    this.progression.completeCurrentFeature();
    this.featureTask = null as unknown as FeatureDevelopmentTask;
  }

  private autoStartRequirementIfEligible(): void {
    if (this.featureTask || !this._launched || this.progression.finished) return;
    const requirement = this.progression.tryUnlock(this._dau);
    if (!requirement) return;
    this.featureTask = FeatureDevelopmentTask.start(
      COMMUNITY_FEATURES[requirement.featureId],
      FrameworkDefinition.byId(this.config.frameworkId),
    );
  }

  private settlePreviousMonthIfNeeded(): void {
    if (this._day <= 1 || (this._day - 1) % 30 !== 0) return;
    const month = this.monthlyLedger.snapshot();
    const settlement = this.finance.settleMonth({
      revenue: month.revenue,
      infrastructureCost: this.infrastructure.monthlyCost,
      aiCost: month.aiCost,
    });
    this._lastMonthlyRevenue = month.revenue;
    this.monthlyLedger.reset();

    if (settlement.bankrupt) {
      this._status = 'BANKRUPT';
      return;
    }
    if (this.progression.finished && month.revenue >= RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET) {
      this._status = 'WON';
    }
  }

  private maybeGenerateIncident(): void {
    const incident = this.incidentGenerator.tryGenerate(
      this.incidentCandidates(),
      this.incidents.activeNodeIds,
      this.random,
    );
    if (incident) this.incidents.add(incident);
  }

  private incidentCandidates(): IncidentCandidate[] {
    const candidates: IncidentCandidate[] = [];
    const frameworkContext = this.nodeSkillContext(`framework:${this.config.frameworkId}`);
    candidates.push({
      nodeId: `framework:${this.config.frameworkId}`,
      baseRisk: 2,
      difficulty: 4,
      loadRatio: this._load.appRatio,
      ...frameworkContext,
    });

    const dbContext = this.nodeSkillContext(`database:${this.config.databaseId}`);
    const dbIncident = DB_INCIDENT[this.config.databaseId];
    candidates.push({
      nodeId: `database:${this.config.databaseId}`,
      baseRisk: dbIncident.risk,
      difficulty: dbIncident.difficulty,
      loadRatio: this._load.dbRatio,
      ...dbContext,
    });

    for (const technologyId of this.infrastructure.deployedTechnologies) {
      const definition = TECHNOLOGIES[technologyId];
      const context = this.nodeSkillContext(`technology:${technologyId}`);
      const loadRatio = this.technologyLoadRatio(technologyId);
      candidates.push({
        nodeId: `technology:${technologyId}`,
        baseRisk: definition.incidentRisk,
        difficulty: definition.incidentDifficulty,
        loadRatio,
        ...context,
      });
    }
    return candidates;
  }

  private technologyLoadRatio(id: TechnologyId): number {
    switch (id) {
      case 'REDIS': return this._load.dbRatio;
      case 'SQS':
      case 'RABBITMQ':
      case 'KAFKA': return this._load.asyncRatio;
      case 'ALB': return this._load.appRatio;
      case 'OBJECT_STORAGE': return this._load.storageRatio;
    }
  }

  private nodeSkillContext(nodeId: string): { proficiencyLevel: number; fundamentalAverage: number } {
    if (nodeId.startsWith('framework:')) {
      const level = this.developer.get(skillRef.framework(this.config.frameworkId)).level;
      return {
        proficiencyLevel: level,
        fundamentalAverage: this.fundamentalAverage(['NETWORK', 'OS_RUNTIME', 'SOFTWARE_DESIGN']),
      };
    }
    if (nodeId.startsWith('database:')) {
      const databaseSkill = this.config.databaseId as TechnologySkillId;
      return {
        proficiencyLevel: this.developer.get(skillRef.technology(databaseSkill)).level,
        fundamentalAverage: this.fundamentalAverage(['DATABASE', 'OS_RUNTIME', 'SOFTWARE_DESIGN']),
      };
    }

    const technologyId = nodeId.split(':')[1] as BuildableTechnologyId;
    const fundamentals = Object.keys(TECHNOLOGIES[technologyId].prerequisites) as FundamentalSkillId[];
    return {
      proficiencyLevel: this.developer.get(skillRef.technology(technologyId)).level,
      fundamentalAverage: this.fundamentalAverage(fundamentals),
    };
  }

  private fundamentalAverage(ids: FundamentalSkillId[]): number {
    return average(ids.map((id) => this.developer.get(skillRef.fundamental(id)).level));
  }
}
