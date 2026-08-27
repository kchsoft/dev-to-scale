import type { DatabaseOptionId, FrameworkOptionId } from './game-view';
import { presentationCatalog } from './presentation-catalog';

interface FrameworkSetupDefinition {
  readonly languageId: 'JAVA' | 'TYPESCRIPT' | 'GO' | 'PYTHON' | 'CSHARP';
  readonly trait: string;
  readonly detail: string;
}

interface DatabaseSetupDefinition {
  readonly trait: string;
  readonly detail: string;
}

const FRAMEWORK_SETUP = {
  SPRING_BOOT: { languageId: 'JAVA', trait: 'CPU STRONG', detail: 'CPU +18% · I/O -4% · Cost +5%' },
  NESTJS: { languageId: 'TYPESCRIPT', trait: 'I/O STRONG', detail: 'CPU -8% · I/O +18% · Work -10%' },
  GIN: { languageId: 'GO', trait: 'CPU EFFICIENT', detail: 'CPU +25% · I/O +8% · Cost -10%' },
  FASTAPI: { languageId: 'PYTHON', trait: 'I/O / AI', detail: 'CPU -5% · I/O +12% · AI Work -25%' },
  ASPNET_CORE: { languageId: 'CSHARP', trait: 'BALANCED', detail: 'CPU +8% · I/O +8% · 균형형' },
} satisfies Readonly<Record<FrameworkOptionId, FrameworkSetupDefinition>>;

const DATABASE_SETUP = {
  POSTGRESQL: { trait: 'TRANSACTIONAL', detail: '복잡한 Transaction 기능에 유리' },
  MYSQL: { trait: 'CHEAP', detail: '월 비용 -5%' },
  MONGODB: { trait: 'FLEXIBLE', detail: 'Capacity +5% · 유연한 데이터에 유리' },
} satisfies Readonly<Record<DatabaseOptionId, DatabaseSetupDefinition>>;

export const GAME_FRAMEWORK_OPTIONS = Object.freeze(
  (Object.entries(FRAMEWORK_SETUP) as Array<[FrameworkOptionId, FrameworkSetupDefinition]>).map(([id, option]) => Object.freeze({
    id,
    language: presentationCatalog.label(option.languageId),
    name: presentationCatalog.label(id),
    mark: presentationCatalog.icon(id),
    trait: option.trait,
    detail: option.detail,
  })),
);

export const GAME_DATABASE_OPTIONS = Object.freeze(
  (Object.entries(DATABASE_SETUP) as Array<[DatabaseOptionId, DatabaseSetupDefinition]>).map(([id, option]) => Object.freeze({
    id,
    name: presentationCatalog.label(id),
    mark: presentationCatalog.icon(id),
    trait: option.trait,
    detail: option.detail,
  })),
);
