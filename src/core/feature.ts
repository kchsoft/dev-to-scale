import type { RequestRouteStep } from './request-route';

export type FeatureComplexity = 'SIMPLE' | 'NORMAL' | 'COMPLEX';
export type FeatureTag =
  | 'AI'
  | 'ASYNC'
  | 'CONTENT'
  | 'CORE'
  | 'EVENT_HEAVY'
  | 'MONETIZATION'
  | 'READ_HEAVY'
  | 'SEARCH'
  | 'STORAGE'
  | 'TRANSACTIONAL'
  | 'WRITE_HEAVY';

/**
 * Legacy traffic weights are retained because Queue / Storage are still modeled
 * as single-axis resources in V1.5 and old custom features/tests can keep using
 * the compact A/D/Q/S shape.
 */
export interface LoadWeights {
  app: number;
  db: number;
  async: number;
  storage: number;
}

export interface CpuIoLoadWeight {
  cpu: number;
  io: number;
}

export interface ResourceLoadWeights {
  app: CpuIoLoadWeight;
  db: CpuIoLoadWeight;
}

export interface FeatureDefinitionProps {
  id: string;
  name: string;
  baseWork: number;
  complexity: FeatureComplexity;
  load: LoadWeights;
  /**
   * CPU / I/O pressure per request. If omitted, the legacy APP/DB weight is
   * applied equally to both axes for backwards-compatible custom features.
   */
  resourceLoad?: Partial<{
    app: Partial<CpuIoLoadWeight>;
    db: Partial<CpuIoLoadWeight>;
  }>;
  requestRoute?: RequestRouteStep[];
  tags?: FeatureTag[];
  growthBonus?: number;
  revenueModifier?: number;
}

function defaultRequestRoute(load: LoadWeights): RequestRouteStep[] {
  const route: RequestRouteStep[] = [];
  if (load.app > 0) route.push({ node: 'APP' });
  if (load.db > 0) route.push({ node: 'DB' });
  if (load.async > 0) route.push({ node: 'QUEUE', requirement: 'OPTIONAL' });
  if (load.storage > 0) route.push({ node: 'STORAGE' });
  return route;
}

function normalizeResourceLoad(load: LoadWeights, resourceLoad?: FeatureDefinitionProps['resourceLoad']): ResourceLoadWeights {
  return {
    app: {
      cpu: resourceLoad?.app?.cpu ?? load.app,
      io: resourceLoad?.app?.io ?? load.app,
    },
    db: {
      cpu: resourceLoad?.db?.cpu ?? load.db,
      io: resourceLoad?.db?.io ?? load.db,
    },
  };
}

export class FeatureDefinition {
  readonly id: string;
  readonly name: string;
  readonly baseWork: number;
  readonly complexity: FeatureComplexity;
  readonly load: LoadWeights;
  readonly resourceLoad: ResourceLoadWeights;
  readonly requestRoute: readonly RequestRouteStep[];
  readonly tags: ReadonlySet<FeatureTag>;
  readonly growthBonus: number;
  readonly revenueModifier: number;

  constructor(props: FeatureDefinitionProps) {
    this.id = props.id;
    this.name = props.name;
    this.baseWork = props.baseWork;
    this.complexity = props.complexity;
    this.load = { ...props.load };
    this.resourceLoad = normalizeResourceLoad(props.load, props.resourceLoad);
    this.requestRoute = (props.requestRoute ?? defaultRequestRoute(props.load)).map((step) => ({ ...step }));
    this.tags = new Set(props.tags ?? []);
    this.growthBonus = props.growthBonus ?? 0.005;
    this.revenueModifier = props.revenueModifier ?? 0;
  }
}

export type FrameworkId = 'SPRING_BOOT' | 'NESTJS' | 'GIN' | 'FASTAPI' | 'ASPNET_CORE';

const COMPLEXITY_FACTOR: Record<FeatureComplexity, number> = {
  SIMPLE: 0.05,
  NORMAL: 0.08,
  COMPLEX: 0.12,
};

export class FrameworkDefinition {
  private constructor(
    readonly id: FrameworkId,
    /** Legacy aggregate modifier kept for cost previews and backwards compatibility. */
    readonly capacityModifier: number,
    readonly cpuCapacityModifier: number,
    readonly ioCapacityModifier: number,
    readonly costModifier: number,
    private readonly baseWorkModifier: number,
    private readonly tagWorkModifiers: Partial<Record<FeatureTag, number>> = {},
    private readonly complexityWorkModifiers: Partial<Record<FeatureComplexity, number>> = {},
  ) {}

  static springBoot(): FrameworkDefinition {
    return new FrameworkDefinition('SPRING_BOOT', 1.1, 1.18, 0.96, 1.05, 1);
  }

  static nestJs(): FrameworkDefinition {
    return new FrameworkDefinition('NESTJS', 1, 0.92, 1.18, 1.05, 0.9);
  }

  static gin(): FrameworkDefinition {
    return new FrameworkDefinition('GIN', 1, 1.25, 1.08, 0.9, 1, {}, { COMPLEX: 1.15 });
  }

  static fastApi(): FrameworkDefinition {
    return new FrameworkDefinition('FASTAPI', 1, 0.95, 1.12, 1.1, 1, { AI: 0.75 });
  }

  static aspNetCore(): FrameworkDefinition {
    return new FrameworkDefinition('ASPNET_CORE', 1, 1.08, 1.08, 1, 1);
  }

  static byId(id: FrameworkId): FrameworkDefinition {
    switch (id) {
      case 'SPRING_BOOT': return FrameworkDefinition.springBoot();
      case 'NESTJS': return FrameworkDefinition.nestJs();
      case 'GIN': return FrameworkDefinition.gin();
      case 'FASTAPI': return FrameworkDefinition.fastApi();
      case 'ASPNET_CORE': return FrameworkDefinition.aspNetCore();
    }
  }

  requiredWorkFor(feature: FeatureDefinition): number {
    let modifier = this.baseWorkModifier;
    modifier *= this.complexityWorkModifiers[feature.complexity] ?? 1;
    for (const tag of feature.tags) modifier *= this.tagWorkModifiers[tag] ?? 1;
    return feature.baseWork * modifier;
  }

  productivity(level: number, complexity: FeatureComplexity): number {
    const raw = 1 + (level - 5) * COMPLEXITY_FACTOR[complexity];
    return Math.max(0.25, raw);
  }
}

export interface FeatureDevelopmentProgressContext {
  frameworkLevel: number;
  incidentModifier: number;
}

export class FeatureDevelopmentTask {
  private _completedWork = 0;
  private _elapsedDays = 0;

  private constructor(
    readonly feature: FeatureDefinition,
    readonly framework: FrameworkDefinition,
    readonly requiredWork: number,
  ) {}

  static start(
    feature: FeatureDefinition,
    framework: FrameworkDefinition,
    stackWorkModifier = 1,
  ): FeatureDevelopmentTask {
    return new FeatureDevelopmentTask(
      feature,
      framework,
      framework.requiredWorkFor(feature) * stackWorkModifier,
    );
  }

  get completedWork(): number { return this._completedWork; }
  get elapsedDays(): number { return this._elapsedDays; }
  get progressRatio(): number { return Math.min(1, this._completedWork / this.requiredWork); }
  get completed(): boolean { return this._completedWork >= this.requiredWork; }

  accelerate(work: number): number {
    if (this.completed || work <= 0) return 0;
    const before = this._completedWork;
    this._completedWork = Math.min(this.requiredWork, this._completedWork + work);
    return this._completedWork - before;
  }

  advanceDay(context: FeatureDevelopmentProgressContext): number {
    if (this.completed) return 0;
    const progress = this.framework.productivity(context.frameworkLevel, this.feature.complexity)
      * context.incidentModifier;
    this._completedWork = Math.min(this.requiredWork, this._completedWork + progress);
    this._elapsedDays += 1;
    return progress;
  }
}
