import type {
  BuildableTechnologyId,
  CommunityFeatureId,
  DatabaseId,
  FrameworkId,
  FundamentalSkillId,
  InfrastructureNodeKind,
  LanguageId,
  TechnologySkillId,
} from '../core';
import type { RequestNodeViewKind } from './game-view';

const WORKLOAD_LABELS = {
  COMMUNITY_MVP: '게시글',
} satisfies Readonly<Record<'COMMUNITY_MVP', string>>;

const FEATURE_LABELS = {
  COMMENT: '댓글',
  LIKE: '좋아요',
  IMAGE_UPLOAD: '이미지 업로드',
  SEARCH: '검색',
  NOTIFICATION: '알림',
  AI_RECOMMENDATION: 'AI 개인화 추천',
  POPULAR_POSTS: '인기글',
  FOLLOW_FEED: '팔로우 피드',
  ADS: '광고',
  PREMIUM: 'Premium',
} satisfies Readonly<Record<CommunityFeatureId, string>>;

const FUNDAMENTAL_LABELS = {
  NETWORK: 'Network',
  OS_RUNTIME: 'OS & Runtime',
  DATABASE: 'Database',
  DSA: 'DS&A',
  SECURITY: 'Security',
  SOFTWARE_DESIGN: 'Software Design',
} satisfies Readonly<Record<FundamentalSkillId, string>>;

const LANGUAGE_LABELS = {
  JAVA: 'Java',
  TYPESCRIPT: 'TypeScript',
  GO: 'Go',
  PYTHON: 'Python',
  CSHARP: 'C#',
} satisfies Readonly<Record<LanguageId, string>>;

const FRAMEWORK_LABELS = {
  SPRING_BOOT: 'Spring Boot',
  NESTJS: 'NestJS',
  GIN: 'Gin',
  FASTAPI: 'FastAPI',
  ASPNET_CORE: 'ASP.NET Core',
} satisfies Readonly<Record<FrameworkId, string>>;

const DATABASE_LABELS = {
  POSTGRESQL: 'PostgreSQL',
  MYSQL: 'MySQL',
  MONGODB: 'MongoDB',
} satisfies Readonly<Record<DatabaseId, string>>;

const TECHNOLOGY_LABELS = {
  POSTGRESQL: 'PostgreSQL',
  MYSQL: 'MySQL',
  MONGODB: 'MongoDB',
  REDIS: 'Redis',
  SQS: 'SQS',
  RABBITMQ: 'RabbitMQ',
  KAFKA: 'Kafka',
  ALB: 'ALB',
  OBJECT_STORAGE: 'Object Storage',
} satisfies Readonly<Record<TechnologySkillId, string>>;

const PRODUCT_LABELS = {
  LOCAL_STORAGE: 'Local Storage',
  EXTERNAL_AI: 'AI Provider',
} satisfies Readonly<Record<'LOCAL_STORAGE' | 'EXTERNAL_AI', string>>;

const FUNDAMENTAL_ICONS = {
  NETWORK: '⌁',
  OS_RUNTIME: '▤',
  DATABASE: '◉',
  DSA: '⌘',
  SECURITY: '◇',
  SOFTWARE_DESIGN: '⬡',
} satisfies Readonly<Record<FundamentalSkillId, string>>;

const LANGUAGE_ICONS = {
  JAVA: 'J',
  TYPESCRIPT: 'TS',
  GO: 'GO',
  PYTHON: 'PY',
  CSHARP: 'C#',
} satisfies Readonly<Record<LanguageId, string>>;

const FRAMEWORK_ICONS = {
  SPRING_BOOT: 'S',
  NESTJS: 'N',
  GIN: 'G',
  FASTAPI: 'F',
  ASPNET_CORE: '.N',
} satisfies Readonly<Record<FrameworkId, string>>;

const TECHNOLOGY_SKILL_ICONS = {
  POSTGRESQL: 'PG',
  MYSQL: 'MY',
  MONGODB: 'MO',
  REDIS: 'R',
  SQS: 'Q',
  RABBITMQ: 'RM',
  KAFKA: 'K',
  ALB: 'LB',
  OBJECT_STORAGE: 'OS',
} satisfies Readonly<Record<TechnologySkillId, string>>;

const TECHNOLOGY_ICONS = {
  REDIS: '◆',
  SQS: '⇢',
  RABBITMQ: '⇄',
  KAFKA: '≋',
  ALB: '⎇',
  OBJECT_STORAGE: '▣',
} satisfies Readonly<Record<BuildableTechnologyId, string>>;

const TOPOLOGY_ICONS = {
  LOAD_BALANCER: '⎇',
  SERVER_GROUP: '◈',
  DATABASE: '◉',
  CACHE: '◆',
  QUEUE: '⇢',
  OBJECT_STORAGE: '▣',
  WORKER: '◇',
  EXTERNAL_SERVICE: '◎',
} satisfies Readonly<Record<InfrastructureNodeKind, string>>;

const REQUEST_NODE_LABELS = {
  ALB: 'ALB',
  APP: 'APP',
  DB: 'DB',
  CACHE: 'REDIS',
  QUEUE: 'MQ',
  STORAGE: 'STORAGE',
  AI: 'AI',
} satisfies Readonly<Record<RequestNodeViewKind, string>>;

const LABELS: Readonly<Record<string, string>> = Object.freeze({
  ...WORKLOAD_LABELS,
  ...FEATURE_LABELS,
  ...FUNDAMENTAL_LABELS,
  ...LANGUAGE_LABELS,
  ...FRAMEWORK_LABELS,
  ...DATABASE_LABELS,
  ...TECHNOLOGY_LABELS,
  ...PRODUCT_LABELS,
});

const ICONS: Readonly<Record<string, string>> = Object.freeze({
  ...FUNDAMENTAL_ICONS,
  ...LANGUAGE_ICONS,
  ...FRAMEWORK_ICONS,
  ...TECHNOLOGY_SKILL_ICONS,
});

export const presentationCatalog = Object.freeze({
  label(id: string): string {
    return LABELS[id] ?? id;
  },
  icon(id: string): string {
    return ICONS[id] ?? '•';
  },
  technologyIcon(id: BuildableTechnologyId): string {
    return TECHNOLOGY_ICONS[id];
  },
  topologyIcon(kind: InfrastructureNodeKind): string {
    return TOPOLOGY_ICONS[kind];
  },
  requestNodeLabel(kind: RequestNodeViewKind): string {
    return REQUEST_NODE_LABELS[kind];
  },
});
