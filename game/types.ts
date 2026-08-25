export type FundamentalSkill =
  | "algorithms"
  | "systems"
  | "network"
  | "database"
  | "design"
  | "infra"
  | "security";

export type SkillMap = Record<FundamentalSkill, number>;

export type LanguageId = "java" | "typescript" | "python" | "go" | "php" | "ruby" | "csharp";
export type FrameworkId =
  | "spring"
  | "quarkus"
  | "nestjs"
  | "fastify"
  | "django"
  | "fastapi"
  | "gin"
  | "echo"
  | "laravel"
  | "symfony"
  | "rails"
  | "aspnet";

export type HostingId = "vm" | "serverless" | "container";
export type DatabaseId = "postgresql" | "mysql" | "mongodb";
export type TechId =
  | "redis"
  | "object-storage"
  | "cdn"
  | "load-balancer"
  | "autoscaling"
  | "sqs"
  | "kafka"
  | "cicd"
  | "ai-assistant";

export type FeatureId =
  | "images"
  | "likes"
  | "search"
  | "notifications"
  | "popular"
  | "recommendations"
  | "ads"
  | "premium";

export type ProjectMode = "fast" | "stable";

export type ActiveProject = {
  kind: "feature" | "technology";
  id: FeatureId | TechId;
  name: string;
  totalWeeks: number;
  remainingWeeks: number;
  mode?: ProjectMode;
};

export type EventChoice = {
  id: string;
  label: string;
  description: string;
  cashDelta?: number;
  trustDelta?: number;
  reliabilityDelta?: number;
  dauMultiplier?: number;
  techDebtDelta?: number;
  fatigueDelta?: number;
};

export type PendingEvent = {
  id: string;
  tone: "danger" | "warning" | "good";
  title: string;
  description: string;
  choices: EventChoice[];
};

export type GameLog = {
  week: number;
  tone: "neutral" | "good" | "warning" | "danger";
  text: string;
};

export type GameState = {
  started: boolean;
  gameOver: boolean;
  week: number;
  cash: number;
  dau: number;
  mrr: number;
  trust: number;
  reliability: number;
  techDebt: number;
  fatigue: number;
  skills: SkillMap;
  language: LanguageId;
  framework: FrameworkId;
  languageSkills: Partial<Record<LanguageId, number>>;
  frameworkSkills: Partial<Record<FrameworkId, number>>;
  hosting: HostingId;
  database: DatabaseId;
  installedTechs: TechId[];
  completedFeatures: FeatureId[];
  activeProject: ActiveProject | null;
  pendingEvent: PendingEvent | null;
  logs: GameLog[];
  highestDau: number;
};
