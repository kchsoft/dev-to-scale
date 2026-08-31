export const SERVER_SIZE_VALUES = ['SMALL', 'MEDIUM', 'LARGE', 'XLARGE'] as const;
export type ServerSizeView = typeof SERVER_SIZE_VALUES[number];
export type FrameworkOptionId = 'SPRING_BOOT' | 'NESTJS' | 'GIN' | 'FASTAPI' | 'ASPNET_CORE';
export type DatabaseOptionId = 'POSTGRESQL' | 'MYSQL' | 'MONGODB';
export type TechnologyIdView = 'REDIS' | 'SQS' | 'RABBITMQ' | 'KAFKA' | 'ALB' | 'OBJECT_STORAGE';
export type TrafficResponseChoice = 'RIDE' | 'THROTTLE' | 'BURST';
export type LoadTone = 'stable' | 'busy' | 'critical' | 'overload' | 'incident';
export type CapacityStatusView = 'NORMAL' | 'WARNING' | 'OVERLOAD';
export type GameEventKind = 'requirement' | 'incident' | 'traffic' | 'launch' | 'settlement' | 'bankrupt' | 'won';
export type GameStatusView = 'RUNNING' | 'BANKRUPT' | 'WON';
export type ObservabilityLevelView = 'BASIC' | 'METRICS' | 'APM';
export type ServiceHealthStatusView = 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
export type RequestNodeViewKind = 'ALB' | 'APP' | 'DB' | 'CACHE' | 'QUEUE' | 'STORAGE' | 'AI';

export interface GameStartConfig {
  readonly frameworkId: FrameworkOptionId;
  readonly databaseId: DatabaseOptionId;
  readonly seed: number;
  readonly startingCash?: number;
}

export interface SkillRefView {
  readonly category: 'fundamental' | 'language' | 'framework' | 'technology';
  readonly id: string;
}

export interface MonthlySettlementView {
  readonly month: number;
  readonly revenue: number;
  readonly infrastructureCost: number;
  readonly aiCost: number;
  readonly totalCost: number;
  readonly profit: number;
  readonly cashAfter: number;
}

export interface ExitReadinessView {
  readonly monthlyRevenueTarget: number;
  readonly lastSettledMonthlyRevenue: number;
  readonly progressionComplete: boolean;
  readonly slo: {
    readonly sampleCount: number;
    readonly healthyDays: number;
    readonly unhealthyDays: number;
    readonly averageFailureRate: number;
    readonly missingRequiredDependencyDays: number;
    readonly passes: boolean;
  };
  readonly qualified: boolean;
}

export interface GameEventView {
  readonly id: string;
  readonly kind: GameEventKind;
  readonly title: string;
  readonly message: string;
  readonly severity?: string;
  readonly nodeId?: string;
  readonly diagnosis?: string;
  readonly autoPause: boolean;
}

export interface HudView {
  readonly day: number;
  readonly month: number;
  readonly dayOfMonth: number;
  readonly daysUntilSettlement: number;
  readonly dau: number;
  readonly cash: number;
  readonly monthlyRevenue: number;
  readonly monthlyCost: number;
  readonly monthlyProfit: number;
  readonly lastSettlement: MonthlySettlementView | null;
  readonly status: GameStatusView;
  readonly launched: boolean;
  readonly exitReadiness: ExitReadinessView;
}

export interface WorkSlotView {
  readonly id: 'feature' | 'technology' | 'learning' | 'incident';
  readonly label: string;
  readonly title: string;
  readonly progress: number | null;
  readonly meta: string;
  readonly active: boolean;
}

export interface AlertView {
  readonly id: string;
  readonly tone: 'info' | 'warning' | 'danger' | 'good';
  readonly title: string;
  readonly detail: string;
  readonly nodeId?: string;
}

export interface TechnologyOptionView {
  readonly id: TechnologyIdView;
  readonly name: string;
  readonly icon: string;
  readonly buildCost: number;
  readonly monthlyCost: number;
  readonly buildWork: number;
  readonly deployed: boolean;
  readonly available: boolean;
  readonly reason: string | null;
  readonly preview: string;
  readonly benefits: readonly string[];
  readonly tradeoffs: readonly string[];
}

export interface SkillNodeView {
  readonly key: string;
  readonly ref: SkillRefView;
  readonly name: string;
  readonly icon: string;
  readonly level: number;
  readonly experienceDays: number;
  readonly targetLevel: number | null;
  readonly requiredExperience: number | null;
  readonly studyDays: number | null;
  readonly cost: number | null;
  readonly canStudy: boolean;
  readonly studying: boolean;
  readonly studyProgress: number | null;
  readonly elapsedStudyDays: number | null;
  readonly reason: string | null;
  readonly category: SkillRefView['category'];
}

export interface FeatureCardView {
  readonly id: string;
  readonly name: string;
  readonly phase: 1 | 2 | 3;
  readonly threshold: number;
  readonly state: 'completed' | 'developing' | 'revealed' | 'hidden';
  readonly load: { readonly app: number; readonly db: number; readonly async: number; readonly storage: number } | null;
  readonly route: readonly RequestNodeViewKind[] | null;
}

export interface ResourceCapacityView {
  readonly cpu?: number;
  readonly io?: number;
  readonly throughput?: number;
  readonly storage?: number;
}

export interface NodeSizeOptionView {
  readonly size: ServerSizeView;
  readonly capacity: ResourceCapacityView;
  readonly monthlyCost: number;
}

export interface NodeScaleOutView {
  readonly kind: 'INSTANCE' | 'READ_REPLICA';
  readonly count: number;
  readonly maxCount: number;
  readonly monthlyCostDelta: number | null;
  readonly available: boolean;
  readonly reason: string | null;
}

export interface NodeScalingView {
  readonly currentSize: ServerSizeView;
  readonly sizeOptions: readonly NodeSizeOptionView[];
  readonly scaleOut: NodeScaleOutView | null;
}

export interface TopologyNodeView {
  readonly id: string;
  readonly kind: 'load-balancer' | 'server-group' | 'database' | 'cache' | 'queue' | 'object-storage' | 'worker' | 'external-service';
  readonly name: string;
  readonly icon: string;
  readonly loadPercent: number;
  readonly tone: LoadTone;
  readonly detail: string;
  readonly monthlyCost: number;
  readonly scaling: NodeScalingView | null;
  readonly incidentId?: string;
  readonly incidentSeverity?: string;
}

export interface BottleneckView {
  readonly nodeId: string;
  readonly nodeKind: TopologyNodeView['kind'];
  readonly resourceKind: 'CPU' | 'IO' | 'THROUGHPUT' | 'STORAGE';
  readonly nominalRatio: number;
  readonly effectiveRatio: number;
  readonly percent: number;
  readonly effectivePercent: number;
  readonly hardLimitPercent: number;
  readonly capacityFailurePercent: number;
  readonly status: CapacityStatusView;
  readonly label: string;
}

export interface TopologyEdgeView {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly mode: 'sync' | 'async';
}

export interface RequestTraceView {
  readonly id: string;
  readonly name: string;
  readonly nodes: readonly {
    readonly nodeId: string | null;
    readonly requirement: 'required' | 'optional';
    readonly arrivalPercent: number;
    readonly status: 'healthy' | 'slow' | 'failed' | 'missing';
  }[];
  readonly edges: readonly {
    readonly edgeId: string;
    readonly trafficPercent: number;
  }[];
  readonly successPercent: number;
  readonly failureNodeId: string | null;
  readonly particleCount: number;
  readonly trafficUnit: number;
}

export interface TopologyView {
  readonly nodes: readonly TopologyNodeView[];
  readonly edges: readonly TopologyEdgeView[];
  readonly traces: readonly RequestTraceView[];
}

export interface ObservabilityView {
  readonly level: ObservabilityLevelView;
  readonly label: string;
  readonly nextUnlock: string | null;
  readonly showsResourceSignature: boolean;
  readonly tracesRequests: boolean;
}

export interface LoadMetricView {
  readonly id: string;
  readonly nodeId: string | null;
  readonly label: string;
  readonly percent: number;
  readonly effectivePercent: number;
  readonly hardLimitPercent: number;
  readonly capacityFailurePercent: number;
  readonly status: CapacityStatusView;
  readonly tone: LoadTone;
}

export interface ServiceHealthView {
  readonly status: ServiceHealthStatusView;
  readonly p95LatencyMs: number;
  readonly bottleneck: BottleneckView | null;
}

export interface ServiceOperationsView {
  readonly observability: ObservabilityView;
  readonly health: ServiceHealthView;
  readonly summary: {
    readonly headline: string;
    readonly detail: string;
  };
  readonly visibleLoads: readonly LoadMetricView[];
  readonly failurePercent: number;
}

export interface FeatureOperationsView {
  readonly currentFeature: null | {
    readonly id: string;
    readonly progress: number;
    readonly requiredWork: number;
    readonly elapsedDays: number;
    readonly estimatedRemainingDays: number;
  };
  readonly currentTechnologyBuild: null | {
    readonly id: TechnologyIdView;
    readonly progress: number;
    readonly requiredWork: number;
    readonly elapsedDays: number;
    readonly estimatedRemainingDays: number;
  };
  readonly techDebt: {
    readonly value: number;
    readonly refactoring: boolean;
    readonly remainingRefactorDays: number;
    readonly developmentModifier: number;
    readonly incidentRiskMultiplier: number;
    readonly canFastTrack: boolean;
  };
  readonly trafficSpike: null | { readonly burstCost: number };
}

export interface GameView {
  readonly hud: HudView;
  readonly workSlots: readonly WorkSlotView[];
  readonly alerts: readonly AlertView[];
  readonly technologies: readonly TechnologyOptionView[];
  readonly skills: readonly SkillNodeView[];
  readonly features: readonly FeatureCardView[];
  readonly topology: TopologyView;
  readonly service: ServiceOperationsView;
  readonly operations: FeatureOperationsView;
  readonly frameworkId: FrameworkOptionId;
  readonly databaseId: DatabaseOptionId;
}
