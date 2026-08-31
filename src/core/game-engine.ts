import { COMMUNITY_BOOTSTRAP, COMMUNITY_FEATURES } from './community';
import { DatabaseDefinition, DatabaseId } from './database';
import { ExperienceAccrualService } from './experience';
import { FeatureDefinition, FeatureDevelopmentTask, FrameworkDefinition, FrameworkId } from './feature';
import { FinanceAccount, MonthlyEconomyLedger, RevenuePolicy } from './finance';
import { GrowthEvent, GrowthPolicy, RandomSource, TrafficSpikeResponse } from './growth';
import { IncidentGenerator, IncidentManager } from './incident-manager';
import { IncidentTopology } from './incident-topology';
import {
  InfrastructureState,
  LoadCalculationContext,
  LoadCalculator,
  LoadSnapshot,
  ServerSize,
  TechnologyId,
} from './infrastructure';
import { DeveloperProfile, LearningRules, LearningSlot, SkillRef, skillRef } from './learning';
import { operationalPressures, primaryOperationalPressure } from './operational-pressure';
import { OperationalSloWindow, type OperationalSloStatus } from './operational-slo';
import { CommunityProgression } from './progression';
import { SeededRandomSource } from './random';
import { trafficHealthForSeverity } from './request-trace';
import { TechDebtState } from './tech-debt';
import { BuildableTechnologyId, TECHNOLOGIES, TechnologyBuildSlot } from './technology';
import type { InfrastructureNodeId } from './topology';
import { V1ServiceTopologyFactory, v1NodeIdForTechnology } from './v1-topology';

export type GameStatus = 'RUNNING' | 'BANKRUPT' | 'WON';

export interface GameEngineConfig {
  frameworkId: FrameworkId;
  databaseId: DatabaseId;
  seed: number;
  startingCash?: number;
  random?: RandomSource;
  incidentRandom?: RandomSource;
}

export interface LastMonthlySettlement {
  month: number;
  revenue: number;
  infrastructureCost: number;
  aiCost: number;
  totalCost: number;
  profit: number;
  cashAfter: number;
}

export interface GameSnapshot {
  day: number;
  status: GameStatus;
  launched: boolean;
  dau: number;
  cash: number;
  completedFeatures: readonly string[];
  currentFeature: null | {
    id: string;
    progress: number;
    requiredWork: number;
    elapsedDays: number;
    estimatedRemainingDays: number;
  };
  currentLearning: null | { id: string; targetLevel: number; studyDays: number };
  currentTechnologyBuild: null | {
    id: string;
    progress: number;
    requiredWork: number;
    elapsedDays: number;
    estimatedRemainingDays: number;
  };
  growthEvent: null | {
    type: GrowthEvent['type'];
    remainingDays: number;
    trafficMultiplier: number;
    loadMultiplier: number;
    growthModifier: number;
    response: GrowthEvent['response'];
    burstCost: number;
  };
  techDebt: {
    value: number;
    refactoring: boolean;
    remainingRefactorDays: number;
    developmentModifier: number;
    incidentRiskMultiplier: number;
    canFastTrack: boolean;
  };
  load: LoadSnapshot;
  incidents: readonly {
    id: string;
    nodeId: string;
    severity: string;
    remainingResponseDays: number | null;
    totalResponseDays: number | null;
    elapsedResponseDays: number | null;
  }[];
  lastMonthlyRevenue: number;
  lastSettlement: LastMonthlySettlement | null;
  exitReadiness: {
    monthlyRevenueTarget: number;
    lastSettledMonthlyRevenue: number;
    progressionComplete: boolean;
    slo: OperationalSloStatus;
    qualified: boolean;
  };
}

export class GameEngine {
  readonly developer = new DeveloperProfile();
  readonly infrastructure: InfrastructureState;
  readonly progression: CommunityProgression;
  readonly learning = new LearningSlot();
  readonly technologyBuild = new TechnologyBuildSlot();
  readonly incidents = new IncidentManager();
  readonly techDebt = new TechDebtState();
  readonly operationalSlo = new OperationalSloWindow();
  readonly finance: FinanceAccount;

  private readonly random: RandomSource;
  private readonly incidentRandom: RandomSource;
  private readonly incidentGenerator = new IncidentGenerator();
  private readonly monthlyLedger = new MonthlyEconomyLedger();
  private readonly completedFeatureDefinitions: FeatureDefinition[] = [];
  private featureTask: FeatureDevelopmentTask | null;
  private growthEvent: GrowthEvent | null = null;
  private _day = 1;
  private _dau = 0;
  private _launched = false;
  private _status: GameStatus = 'RUNNING';
  private _lastMonthlyRevenue = 0;
  private _lastSettlement: LastMonthlySettlement | null = null;
  private _load: LoadSnapshot;
  private _growthReferenceLoad: LoadSnapshot;

  constructor(readonly config: GameEngineConfig) {
    this.random = config.random ?? new SeededRandomSource(config.seed ^ 0x9e3779b9);
    this.incidentRandom = config.incidentRandom ?? this.random;
    this.infrastructure = InfrastructureState.initial(config.frameworkId, config.databaseId);
    this.progression = new CommunityProgression(config.seed);
    this.finance = new FinanceAccount(config.startingCash ?? 3_000_000);
    this.featureTask = this.createFeatureTask(COMMUNITY_BOOTSTRAP);
    this._load = this.calculateCurrentLoad();
    this._growthReferenceLoad = this._load;
  }

  get day(): number { return this._day; }
  get dau(): number { return this._dau; }
  get launched(): boolean { return this._launched; }
  get status(): GameStatus { return this._status; }
  get lastMonthlyRevenue(): number { return this._lastMonthlyRevenue; }
  get trafficSpikeBurstCost(): number {
    // Expensive enough to remain a choice at scale, but not so punitive that a
    // healthy cash buffer becomes meaningless. Rounded for game-readable UI.
    const raw = Math.max(150_000, this.infrastructure.monthlyCost * 0.75);
    return Math.ceil(raw / 10_000) * 10_000;
  }

  get snapshot(): GameSnapshot {
    const learningTask = this.learning.current;
    const buildTask = this.technologyBuild.current;
    const buildTechnologyLevel = buildTask
      ? this.developer.get(skillRef.technology(buildTask.definition.id)).level
      : 1;
    const featureCanFastTrack = Boolean(
      this._launched
      && this.featureTask
      && this.featureTask.feature.id !== COMMUNITY_BOOTSTRAP.id
      && this.techDebt.canFastTrack(this.featureTask.feature.id),
    );
    const slo = this.operationalSlo.status;
    const progressionComplete = this.progression.finished;
    const lastSettledMonthlyRevenue = this._lastSettlement?.revenue ?? 0;
    const qualified = progressionComplete
      && lastSettledMonthlyRevenue >= RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET
      && slo.passes;

    return {
      day: this._day,
      status: this._status,
      launched: this._launched,
      dau: this._dau,
      cash: this.finance.cash,
      completedFeatures: this.completedFeatureDefinitions.map((feature) => feature.id),
      currentFeature: this.featureTask
        ? {
            id: this.featureTask.feature.id,
            progress: this.featureTask.completedWork,
            requiredWork: this.featureTask.requiredWork,
            elapsedDays: this.featureTask.elapsedDays,
            estimatedRemainingDays: this.estimatedFeatureRemainingDays(this.featureTask),
          }
        : null,
      currentLearning: learningTask
        ? { id: learningTask.skill.id, targetLevel: learningTask.targetLevel, studyDays: learningTask.requiredStudyDays }
        : null,
      currentTechnologyBuild: buildTask
        ? {
            id: buildTask.definition.id,
            progress: buildTask.completedWork,
            requiredWork: buildTask.definition.buildWork,
            elapsedDays: buildTask.elapsedDays,
            estimatedRemainingDays: buildTask.estimatedRemainingDays(buildTechnologyLevel, this.incidents.developmentModifier),
          }
        : null,
      growthEvent: this.growthEvent?.active
        ? {
            type: this.growthEvent.type,
            remainingDays: this.growthEvent.remainingDays,
            trafficMultiplier: this.growthEvent.trafficMultiplier,
            loadMultiplier: this.growthEvent.loadMultiplier,
            growthModifier: this.growthEvent.modifier,
            response: this.growthEvent.response,
            burstCost: this.growthEvent.type === 'VIRAL' ? this.trafficSpikeBurstCost : 0,
          }
        : null,
      techDebt: {
        value: this.techDebt.value,
        refactoring: this.techDebt.refactoring,
        remainingRefactorDays: this.techDebt.remainingRefactorDays,
        developmentModifier: this.techDebt.developmentModifier,
        incidentRiskMultiplier: this.techDebt.incidentRiskMultiplier,
        canFastTrack: featureCanFastTrack,
      },
      load: this._load,
      incidents: this.incidents.incidents.map((incident) => ({
        id: incident.id,
        nodeId: incident.nodeId,
        severity: incident.severity,
        remainingResponseDays: incident.remainingResponseDays,
        totalResponseDays: incident.totalResponseDays,
        elapsedResponseDays: incident.elapsedResponseDays,
      })),
      lastMonthlyRevenue: this._lastMonthlyRevenue,
      lastSettlement: this._lastSettlement,
      exitReadiness: {
        monthlyRevenueTarget: RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET,
        lastSettledMonthlyRevenue,
        progressionComplete,
        slo,
        qualified,
      },
    };
  }

  advanceDay(): GameSnapshot {
    if (this._status !== 'RUNNING') return this.snapshot;

    ExperienceAccrualService.recordDay(this.developer, {
      frameworkId: this.config.frameworkId,
      databaseId: this.config.databaseId,
      technologies: this.infrastructure.deployedTechnologies,
    });

    // Growth and SLO qualification use the previous day's observed availability and capacity.
    if (this._launched) {
      this.recordOperationalSloSample(this._growthReferenceLoad);
      this.advanceGrowth();
    }
    this.refreshLoad();
    if (this._launched) this.maybeGenerateIncident();

    // Record the current day's economy before completing new work so newly
    // released features/technologies begin affecting the following day.
    this.recordMonthlyEconomy();

    // The cash settlement happens as D30 finishes. The next snapshot therefore
    // enters the next month at D1 with the cash change already visible.
    this.settleMonthIfEnding();
    if (this._status !== 'RUNNING') {
      this.refreshLoad();
      this._growthReferenceLoad = this._load;
      this._day += 1;
      return this.snapshot;
    }

    const incidentDevelopmentModifier = this.incidents.developmentModifier;
    this.learning.advanceDay(this.developer);

    const builtTechnology = this.technologyBuild.advanceDay(this.developer, incidentDevelopmentModifier);
    if (builtTechnology) {
      const retiredTechnologies = this.infrastructure.deployTechnology(builtTechnology);
      for (const retiredTechnology of retiredTechnologies) {
        this.incidents.removeForNode(v1NodeIdForTechnology(retiredTechnology));
      }
    }

    this.incidents.advanceResponseDay();
    const refactoringToday = this.techDebt.refactoring;
    this.techDebt.advanceDay();
    if (!refactoringToday) {
      this.advanceFeatureDevelopment(incidentDevelopmentModifier * this.techDebt.developmentModifier);
    }
    this.autoStartRequirementIfEligible();

    if (this.growthEvent?.active) this.growthEvent.advanceDay();
    this.refreshLoad();
    this._growthReferenceLoad = this._load;
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
    const context = IncidentTopology.skillContext(incident.nodeId, this.incidentTopologyContext());
    this.incidents.startResponse(incidentId, context.proficiencyLevel, context.fundamentalAverage);
  }

  resizeInfrastructureNode(nodeId: InfrastructureNodeId, size: ServerSize): void {
    this.ensureRunning();
    this.infrastructure.resizeNode(nodeId, size);
    this.refreshLoad();
  }

  scaleOutInfrastructureNode(nodeId: InfrastructureNodeId): void {
    this.ensureRunning();
    this.infrastructure.scaleOutNode(nodeId);
    this.refreshLoad();
  }

  fastTrackCurrentFeature(): { addedWork: number; addedDebt: number } {
    this.ensureRunning();
    const task = this.featureTask;
    if (!this._launched || !task || task.feature.id === COMMUNITY_BOOTSTRAP.id) {
      throw new Error('No releasable feature to fast-track');
    }
    const addedDebt = this.techDebt.fastTrack(task.feature.id, task.feature.complexity);
    const addedWork = task.accelerate(task.requiredWork * 0.3);
    this.finishFeatureIfComplete();
    this.refreshLoad();
    return { addedWork, addedDebt };
  }

  startRefactor(): void {
    this.ensureRunning();
    if (!this._launched) throw new Error('Service must be online before refactoring');
    this.techDebt.startRefactor();
  }

  respondToTrafficSpike(response: TrafficSpikeResponse): { cost: number } {
    this.ensureRunning();
    const event = this.growthEvent;
    if (!event?.active || event.type !== 'VIRAL') throw new Error('No active viral traffic spike');
    if (!event.canRespond) throw new Error('Traffic spike response already selected');

    const cost = response === 'BURST' ? this.trafficSpikeBurstCost : 0;
    if (cost > 0 && this.finance.cash < cost) throw new Error('Insufficient cash for emergency burst');

    event.respond(response);
    if (cost > 0) this.finance.spendImmediately(cost);

    // The decision should be visible immediately instead of waiting for next day.
    this.refreshLoad();
    return { cost };
  }

  /**
   * Preview the load that would exist immediately after a not-yet-released feature ships.
   * The same proficiency, incidents, technologies and temporary traffic conditions are used.
   */
  previewLoadWithFeature(feature: FeatureDefinition): LoadSnapshot {
    return this.calculateCurrentLoad(this.infrastructure, this.activeFeaturesIncluding(feature));
  }

  /**
   * Preview a technology deployment without mutating the live infrastructure.
   * Queue replacement also retires incidents attached to the replaced queue.
   */
  previewLoadWithTechnology(id: BuildableTechnologyId): LoadSnapshot {
    const infrastructure = this.infrastructure.clone();
    const retired = infrastructure.deployTechnology(id);
    const ignoredIncidentNodeIds = new Set(
      retired.map((technology) => v1NodeIdForTechnology(technology)),
    );
    return this.calculateCurrentLoad(
      infrastructure,
      this.activeFeaturesForLoad(),
      ignoredIncidentNodeIds,
    );
  }

  /** Preview a feature release together with one technology deployment without mutating live state. */
  previewLoadWithFeatureAndTechnology(
    feature: FeatureDefinition,
    id: BuildableTechnologyId,
  ): LoadSnapshot {
    const infrastructure = this.infrastructure.clone();
    const retired = infrastructure.deployTechnology(id);
    const ignoredIncidentNodeIds = new Set(
      retired.map((technology) => v1NodeIdForTechnology(technology)),
    );
    return this.calculateCurrentLoad(
      infrastructure,
      this.activeFeaturesIncluding(feature),
      ignoredIncidentNodeIds,
    );
  }

  /** Preview a node resize through the same load calculation without mutating live infrastructure. */
  previewLoadWithNodeResize(nodeId: InfrastructureNodeId, size: ServerSize): LoadSnapshot {
    const infrastructure = this.infrastructure.clone();
    infrastructure.resizeNode(nodeId, size);
    return this.calculateCurrentLoad(infrastructure);
  }

  /** Preview a feature release together with one node resize without mutating live state. */
  previewLoadWithFeatureAndNodeResize(
    feature: FeatureDefinition,
    nodeId: InfrastructureNodeId,
    size: ServerSize,
  ): LoadSnapshot {
    const infrastructure = this.infrastructure.clone();
    infrastructure.resizeNode(nodeId, size);
    return this.calculateCurrentLoad(infrastructure, this.activeFeaturesIncluding(feature));
  }

  /** Preview an APP/DB horizontal scale action while preserving live validation and state. */
  previewLoadWithNodeScaleOut(nodeId: InfrastructureNodeId): LoadSnapshot {
    const infrastructure = this.infrastructure.clone();
    infrastructure.scaleOutNode(nodeId);
    return this.calculateCurrentLoad(infrastructure);
  }

  /** Preview a feature release together with one APP/DB scale-out without mutating live state. */
  previewLoadWithFeatureAndNodeScaleOut(
    feature: FeatureDefinition,
    nodeId: InfrastructureNodeId,
  ): LoadSnapshot {
    const infrastructure = this.infrastructure.clone();
    infrastructure.scaleOutNode(nodeId);
    return this.calculateCurrentLoad(infrastructure, this.activeFeaturesIncluding(feature));
  }

  private ensureRunning(): void {
    if (this._status !== 'RUNNING') throw new Error(`Game is ${this._status}`);
  }

  private recordOperationalSloSample(load: LoadSnapshot): void {
    const overloaded = operationalPressures(load).some(({ effectiveRatio }) => effectiveRatio > 1);
    const missingRequiredDependency = load.requestTraces.some((trace) => (
      trace.nodes.some((node) => node.requirement === 'REQUIRED' && node.status === 'MISSING')
    ));
    this.operationalSlo.record({
      failureRate: load.failureRate,
      overloaded,
      missingRequiredDependency,
    });
  }

  private advanceGrowth(): void {
    this.growthEvent = GrowthPolicy.maybeStartEvent(this.growthEvent, this.random);
    const phase = this.progression.finished ? 3 : this.progression.currentRequirement.phase;
    const maxLoadRatio = primaryOperationalPressure(this._growthReferenceLoad)?.ratio ?? 0;
    const result = GrowthPolicy.calculate({
      phase,
      completedFeatureGrowthBonus: this.progression.finished
        ? 0
        : this.completedFeatureDefinitions.reduce(
            (sum, feature) => sum + feature.growthBonus,
            0,
          ),
      event: this.growthEvent,
      incidents: this.incidents.severities,
      failureRate: this._growthReferenceLoad.failureRate,
      maxLoadRatio,
      random: this.random,
    });
    this._dau = GrowthPolicy.nextDau(this._dau, result.totalModifier);
  }

  private advanceFeatureDevelopment(developmentModifier: number): void {
    if (!this.featureTask) return;
    const frameworkLevel = this.developer.get(skillRef.framework(this.config.frameworkId)).level;
    this.featureTask.advanceDay({ frameworkLevel, incidentModifier: developmentModifier });
    this.finishFeatureIfComplete();
  }

  private estimatedFeatureRemainingDays(task: FeatureDevelopmentTask): number {
    const frameworkLevel = this.developer.get(skillRef.framework(this.config.frameworkId)).level;
    const currentDailyProgress = task.framework.productivity(frameworkLevel, task.feature.complexity)
      * this.incidents.developmentModifier
      * this.techDebt.developmentModifier;
    if (currentDailyProgress <= 0) return 0;
    const activeWorkDays = Math.max(0, Math.ceil((task.requiredWork - task.completedWork) / currentDailyProgress));
    return activeWorkDays + (this.techDebt.refactoring ? this.techDebt.remainingRefactorDays : 0);
  }

  private createFeatureTask(feature: FeatureDefinition): FeatureDevelopmentTask {
    const framework = FrameworkDefinition.byId(this.config.frameworkId);
    const database = DatabaseDefinition.byId(this.config.databaseId);
    return FeatureDevelopmentTask.start(feature, framework, database.workModifierFor(feature));
  }

  private activeFeaturesForLoad(): FeatureDefinition[] {
    return this._launched ? [COMMUNITY_BOOTSTRAP, ...this.completedFeatureDefinitions] : [];
  }

  private activeFeaturesIncluding(feature: FeatureDefinition): FeatureDefinition[] {
    const active = this.activeFeaturesForLoad();
    return active.some((candidate) => candidate.id === feature.id)
      ? active
      : [...active, feature];
  }

  private finishFeatureIfComplete(): void {
    const task = this.featureTask;
    if (!task?.completed) return;

    if (task.feature.id === COMMUNITY_BOOTSTRAP.id) {
      this._launched = true;
      this._dau = 80;
      this.featureTask = null;
      return;
    }

    this.completedFeatureDefinitions.push(task.feature);
    this.progression.completeCurrentFeature();
    this.featureTask = null;
  }

  private autoStartRequirementIfEligible(): void {
    if (this.featureTask || !this._launched || this.progression.finished || this.techDebt.refactoring) return;
    const requirement = this.progression.tryUnlock(this._dau);
    if (!requirement) return;
    this.featureTask = this.createFeatureTask(COMMUNITY_FEATURES[requirement.featureId]);
  }

  private recordMonthlyEconomy(): void {
    const revenueModifier = this.completedFeatureDefinitions.reduce((sum, feature) => sum + feature.revenueModifier, 0);
    const aiActive = this.completedFeatureDefinitions.some((feature) => feature.id === 'AI_RECOMMENDATION');
    this.monthlyLedger.recordDay(this._dau, revenueModifier, aiActive);
  }

  private settleMonthIfEnding(): void {
    if (this._day % 30 !== 0) return;
    const month = this.monthlyLedger.snapshot();
    const infrastructureCost = this.infrastructure.monthlyCost;
    const settlement = this.finance.settleMonth({
      revenue: month.revenue,
      infrastructureCost,
      aiCost: month.aiCost,
    });
    this._lastMonthlyRevenue = month.revenue;
    this._lastSettlement = {
      month: Math.floor((this._day - 1) / 30) + 1,
      revenue: settlement.revenue,
      infrastructureCost,
      aiCost: month.aiCost,
      totalCost: settlement.totalCost,
      profit: settlement.profit,
      cashAfter: settlement.cash,
    };
    this.monthlyLedger.reset();

    if (settlement.bankrupt) {
      this._status = 'BANKRUPT';
      return;
    }
    if (
      this.progression.finished
      && month.revenue >= RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET
      && this.operationalSlo.status.passes
    ) {
      this._status = 'WON';
    }
  }

  private maybeGenerateIncident(): void {
    const incident = this.incidentGenerator.tryGenerate(
      IncidentTopology.candidates(this.incidentTopologyContext()),
      this.incidents.activeNodeIds,
      this.incidentRandom,
      this.techDebt.incidentRiskMultiplier,
    );
    if (incident) this.incidents.add(incident);
  }

  private calculateCurrentLoad(
    infrastructure = this.infrastructure,
    features = this.activeFeaturesForLoad(),
    ignoredIncidentNodeIds: ReadonlySet<string> = new Set(),
  ): LoadSnapshot {
    return LoadCalculator.calculate(
      this._dau,
      features,
      infrastructure,
      this.loadCalculationContext(infrastructure, ignoredIncidentNodeIds),
    );
  }

  private refreshLoad(): void {
    this._load = this.calculateCurrentLoad();
  }

  private loadCalculationContext(
    infrastructure = this.infrastructure,
    ignoredIncidentNodeIds: ReadonlySet<string> = new Set(),
  ): LoadCalculationContext {
    const technologyProficiencyLevels: Partial<Record<TechnologyId, number>> = {};
    for (const technology of infrastructure.deployedTechnologies) {
      technologyProficiencyLevels[technology] = this.developer.get(skillRef.technology(technology)).level;
    }

    const nodeHealth: Record<string, number> = {};
    for (const incident of this.incidents.incidents) {
      if (ignoredIncidentNodeIds.has(incident.nodeId)) continue;
      nodeHealth[incident.nodeId] = trafficHealthForSeverity(incident.severity);
    }

    return {
      appProficiencyLevel: this.developer.get(skillRef.framework(this.config.frameworkId)).level,
      databaseProficiencyLevel: this.developer.get(skillRef.technology(this.config.databaseId)).level,
      technologyProficiencyLevels,
      nodeHealth,
      trafficMultiplier: this.growthEvent?.active ? this.growthEvent.loadMultiplier : 1,
    };
  }

  private incidentTopologyContext() {
    return {
      frameworkId: this.config.frameworkId,
      databaseId: this.config.databaseId,
      developer: this.developer,
      infrastructure: this.infrastructure,
      topology: V1ServiceTopologyFactory.create(
        this.infrastructure,
        this.activeFeaturesForLoad(),
      ).graph,
      load: this._load,
    };
  }
}
