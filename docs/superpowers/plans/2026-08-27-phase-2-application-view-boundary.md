# Phase 2 Application/View Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** React가 Core Domain을 직접 참조하거나 계산하지 않고 Application이 제공하는 불변 ViewModel과 Command만 사용하도록 경계를 닫는다.

**Architecture:** Application이 `game-view.ts`에서 UI 전용 계약을 소유하고, `OperationalViewProjector`가 Observability·ServiceHealth·IncidentDiagnosis와 표시 가능한 부하 정보를 투영한다. `GameController`는 Core `GameEngine`을 private field로 감추고 기존 명령 facade를 유지하며, React는 raw `GameSnapshot`, Core policy, Core catalog를 전혀 import하지 않는다.

**Tech Stack:** TypeScript 5, React 19, Next.js 16, Vitest 3

**Spec:** `docs/superpowers/specs/2026-08-26-infrastructure-ecosystem-topology-design.md`

## Global Constraints

- 의존성 방향은 `React View → Application Contracts/Commands → Core Domain` 한 방향만 허용한다.
- React View는 `GameEngine`, Domain Entity, Domain Policy, `GameSnapshot`을 import하거나 받지 않는다.
- React View는 Load, Observability, Incident diagnosis, route를 계산하지 않는다.
- Application은 UI 전용 문자열, tone, progress, node, trace를 투영한다.
- 기존 V1 게임 밸런스, Queue 교체 정책, Seed 진행, 경제 및 성장 흐름은 변경하지 않는다.
- 플레이어가 내부 요청 경로나 물리 인프라 연결을 편집하는 기능은 추가하지 않는다.

---

### Task 1: Application-owned view contracts

**Files:**
- Create: `src/application/game-view.ts`
- Create: `src/application/operational-view-projector.ts`
- Modify: `src/application/game-controller.ts`
- Modify: `src/application/__tests__/game-controller.spec.ts`

**Interfaces:**
- Consumes: Core의 현재 `GameSnapshot`, `ServerSize`, `SkillRef`, technology/framework/database ID를 Controller 내부에서만 사용한다.
- Produces: `GameStartConfig`, `ServerSizeView`, `SkillRefView`, `TechnologyIdView`, `ObservabilityView`, `LoadMetricView`, `ServiceHealthView`, `FeatureOperationsView`, `TrafficSpikeView`, `GameView`.

- [ ] **Step 1: raw snapshot 노출을 금지하는 실패 테스트 작성**

```ts
it('exposes an application-owned immutable view instead of a raw domain snapshot', () => {
  const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 21 });
  const view = controller.getView();

  expect(Object.hasOwn(view, 'snapshot')).toBe(false);
  expect(view.operations.currentFeature?.id).toBe('COMMUNITY_MVP');
  expect(view.service.visibleLoads.map((metric) => metric.label)).toEqual(['APP', 'DB', 'ASYNC', 'STORAGE']);
});
```

- [ ] **Step 2: 테스트가 현재 `snapshot` 노출 및 `operations` 부재로 실패하는지 확인**

Run: `npm test -- --run src/application/__tests__/game-controller.spec.ts -t "application-owned immutable view"`

Expected: FAIL because `snapshot` exists and `operations`/`service` do not.

- [ ] **Step 3: UI 계약 파일 작성**

```ts
export const SERVER_SIZE_VALUES = ['SMALL', 'MEDIUM', 'LARGE', 'XLARGE'] as const;
export type ServerSizeView = typeof SERVER_SIZE_VALUES[number];
export type FrameworkOptionId = 'SPRING_BOOT' | 'NESTJS' | 'GIN' | 'FASTAPI' | 'ASPNET_CORE';
export type DatabaseOptionId = 'POSTGRESQL' | 'MYSQL' | 'MONGODB';
export type TechnologyIdView = 'REDIS' | 'SQS' | 'RABBITMQ' | 'KAFKA' | 'ALB' | 'OBJECT_STORAGE';
export type TrafficResponseChoice = 'RIDE' | 'THROTTLE' | 'BURST';

export interface GameStartConfig {
  frameworkId: FrameworkOptionId;
  databaseId: DatabaseOptionId;
  seed: number;
  startingCash?: number;
}

export interface LoadMetricView {
  readonly label: string;
  readonly percent: number;
  readonly tone: LoadTone;
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
```

`GameView`의 모든 배열과 필드를 `readonly`로 선언하고 `snapshot` 대신 `service`와 `operations`를 둔다. `lastSettlement`도 Application 소유 `MonthlySettlementView`로 정의하고, 기존 View 인터페이스는 `game-controller.ts`에서 이 파일로 이동한다.

- [ ] **Step 4: Controller가 새 계약을 채우도록 최소 projection 추가**

`OperationalViewProjector`의 최초 구현은 초기 BASIC View에 필요한 observability와 aggregate load projection을 제공한다. `getView()`에서 `snapshot`을 반환하지 않고 다음 구조를 반환한다.

```ts
service: OperationalViewProjector.project(snapshot, this.#engine.developer),
operations: {
  currentFeature: snapshot.currentFeature,
  currentTechnologyBuild: snapshot.currentTechnologyBuild as FeatureOperationsView['currentTechnologyBuild'],
  techDebt: snapshot.techDebt,
  trafficSpike: snapshot.growthEvent?.type === 'VIRAL'
    ? { burstCost: snapshot.growthEvent.burstCost }
    : null,
},
```

- [ ] **Step 5: 집중 테스트와 전체 Application 테스트 실행**

Run: `npm test -- --run src/application/__tests__/game-controller.spec.ts`

Expected: PASS after existing snapshot-based assertions are rewritten against `operations` and `service`.

- [ ] **Step 6: 커밋**

```bash
git add src/application/game-view.ts src/application/operational-view-projector.ts src/application/game-controller.ts src/application/__tests__/game-controller.spec.ts
git commit -m "refactor: define application view contracts"
```

### Task 2: Operational view projector

**Files:**
- Modify: `src/application/operational-view-projector.ts`
- Create: `src/application/__tests__/operational-view-projector.spec.ts`
- Delete: `src/core/observability.ts`
- Delete: `src/core/service-health.ts`
- Delete: `src/core/incident-diagnosis.ts`
- Delete: `src/core/__tests__/observability.spec.ts`
- Delete: `src/core/__tests__/service-health.spec.ts`
- Delete: `src/core/__tests__/incident-diagnosis.spec.ts`
- Modify: `src/core/index.ts`
- Modify: `src/application/game-controller.ts`

**Interfaces:**
- Consumes: `GameSnapshot`, `DeveloperProfile`, incident node ID.
- Produces: `OperationalViewProjector.project(snapshot, developer): ServiceOperationsView` and `OperationalViewProjector.diagnosisText(nodeId, snapshot, developer): string`.

- [ ] **Step 1: Application projector의 세 동작을 검증하는 실패 테스트 작성**

```ts
function snapshot(loadOverrides: Partial<LoadSnapshot>): GameSnapshot {
  const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 22 });
  return {
    ...engine.snapshot,
    load: { ...engine.snapshot.load, ...loadOverrides },
  };
}

it('projects BASIC observability without leaking detailed resource metrics', () => {
  const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 22 });
  const service = OperationalViewProjector.project(engine.snapshot, engine.developer);

  expect(service.observability).toEqual({
    level: 'BASIC',
    label: 'BASIC HEALTH',
    nextUnlock: 'Metrics: OS & Runtime Lv.2',
    showsResourceSignature: false,
    tracesRequests: false,
  });
  expect(service.visibleLoads.map((metric) => metric.label)).toEqual(['APP', 'DB', 'ASYNC', 'STORAGE']);
});

it('projects the hottest resource into service health', () => {
  const service = OperationalViewProjector.project(snapshot({
    appCpuRatio: 0.42,
    appIoRatio: 1.12,
    failureRate: 0,
  }), new DeveloperProfile());

  expect(service.health.bottleneck).toBe('APP_IO');
  expect(service.health.bottleneckPercent).toBe(112);
  expect(service.health.status).toBe('CRITICAL');
});

it('formats incident diagnosis according to the current observability level', () => {
  const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 23 });
  const text = OperationalViewProjector.diagnosisText(
    'framework:SPRING_BOOT',
    snapshot({ appCpuRatio: 1.1, appIoRatio: 0.5 }),
    engine.developer,
  );

  expect(text).toBe('DIAGNOSIS LOCKED · METRICS에서 CPU/I/O 자원 신호를 확인할 수 있습니다.');
});
```

- [ ] **Step 2: projector 모듈 부재로 RED 확인**

Run: `npm test -- --run src/application/__tests__/operational-view-projector.spec.ts`

Expected: FAIL because the initial projector does not yet calculate detailed health and diagnosis.

- [ ] **Step 3: Core 정책을 Application projector로 이동**

`OperationalViewProjector.project`는 기존 Observability level 조건과 latency/bottleneck 계산을 그대로 사용한다. ratio를 View에서 계산하지 않도록 `visibleLoads`는 이미 반올림한 percent와 tone을 반환한다.

```ts
export class OperationalViewProjector {
  static project(snapshot: GameSnapshot, developer: DeveloperProfile): ServiceOperationsView {
    const observability = projectObservability(developer);
    const health = projectHealth(snapshot.load);
    const ratios = observability.level === 'BASIC'
      ? [['APP', snapshot.load.appRatio], ['DB', snapshot.load.dbRatio], ['ASYNC', snapshot.load.asyncRatio], ['STORAGE', snapshot.load.storageRatio]] as const
      : [['APP CPU', snapshot.load.appCpuRatio], ['APP I/O', snapshot.load.appIoRatio], ['DB CPU', snapshot.load.dbCpuRatio], ['DB I/O', snapshot.load.dbIoRatio], ['ASYNC', snapshot.load.asyncRatio], ['STORAGE', snapshot.load.storageRatio]] as const;

    return {
      observability,
      health,
      visibleLoads: ratios.map(([label, ratio]) => ({ label, percent: percent(ratio), tone: loadTone(ratio) })),
      failurePercent: percent(snapshot.load.failureRate),
    };
  }
}
```

- [ ] **Step 4: feature-impact alert masking과 incident diagnosis 문구를 Controller projection 시점으로 이동**

`alerts()`는 `ObservabilityView`를 받아 BASIC/METRICS에서 기존과 같은 축약 문구를 반환한다. `detectEvents()`는 incident event 생성 시 `diagnosis`를 채운다.

```ts
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
```

- [ ] **Step 5: Core export와 이전 Core 정책 테스트 제거 후 Application 테스트 GREEN 확인**

Run: `npm test -- --run src/application/__tests__/operational-view-projector.spec.ts src/application/__tests__/game-controller.spec.ts`

Expected: PASS.

- [ ] **Step 6: 전체 테스트로 계산 결과 회귀 확인**

Run: `npm test`

Expected: 12 Core test files plus 2 Application test files pass; removed Core policy tests are represented by Application projector tests.

- [ ] **Step 7: 커밋**

```bash
git add src/application/operational-view-projector.ts src/application/__tests__/operational-view-projector.spec.ts src/application/game-controller.ts src/core/index.ts src/core/observability.ts src/core/service-health.ts src/core/incident-diagnosis.ts src/core/__tests__/observability.spec.ts src/core/__tests__/service-health.spec.ts src/core/__tests__/incident-diagnosis.spec.ts
git commit -m "refactor: project operational state in application"
```

### Task 3: Private engine and command-only controller

**Files:**
- Modify: `src/application/game-controller.ts`
- Modify: `src/application/__tests__/game-controller.spec.ts`

**Interfaces:**
- Consumes: `GameStartConfig` and Application command argument types.
- Produces: Controller public surface containing only `subscribe`, `getView`, `advanceDay`, technology/learning/incident/scale/refactor/traffic commands.

- [ ] **Step 1: public engine 노출을 잡는 실패 테스트 작성**

```ts
it('does not expose the mutable domain engine through the command facade', () => {
  const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 24 });

  expect(Object.hasOwn(controller, 'engine')).toBe(false);
  expect(Object.keys(controller)).not.toContain('engine');
});
```

- [ ] **Step 2: 현재 public `engine` field 때문에 RED 확인**

Run: `npm test -- --run src/application/__tests__/game-controller.spec.ts -t "mutable domain engine"`

Expected: FAIL with `true` for the `engine` property.

- [ ] **Step 3: `readonly engine`을 ECMAScript private field로 변경**

```ts
export class GameController {
  readonly #engine: GameEngine;

  constructor(config: GameStartConfig) {
    this.#engine = new GameEngine(config);
  }
}
```

Controller 내부의 모든 `this.engine` 참조를 `this.#engine`으로 바꾼다. 테스트 준비는 public engine 조작 대신 실제 command/day 진행 또는 `OperationalViewProjector` 단위 테스트에서 Core fixture를 사용한다.

- [ ] **Step 4: 기존 Application 테스트를 public command 기준으로 재작성**

Technology prerequisite와 learning progress 테스트는 다음 public 흐름을 사용한다.

```ts
function advance(controller: GameController, days: number): void {
  for (let day = 0; day < days; day += 1) controller.advanceDay();
}

advance(controller, 10);
controller.startLearning({ category: 'fundamental', id: 'NETWORK' });
advance(controller, 3);
controller.startLearning({ category: 'fundamental', id: 'DATABASE' });
advance(controller, 3);
expect(controller.getView().technologies.find((tech) => tech.id === 'REDIS')?.available).toBe(true);
```

내부 method spy 기반 technology preview test는 Core의 `previewLoadWithTechnology` 회귀 테스트와 실제 Controller View의 preview 문자열 assertion으로 대체한다.

- [ ] **Step 5: Application 테스트 GREEN 확인**

Run: `npm test -- --run src/application/__tests__/game-controller.spec.ts src/application/__tests__/operational-view-projector.spec.ts`

Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/application/game-controller.ts src/application/__tests__/game-controller.spec.ts
git commit -m "refactor: hide domain engine behind commands"
```

### Task 4: React consumes only Application contracts

**Files:**
- Modify: `src/ui/GameApp.tsx`
- Create: `src/application/__tests__/view-boundary.spec.ts`
- Modify: `src/application/game-view.ts`
- Modify: `src/application/game-controller.ts`

**Interfaces:**
- Consumes: `GameController`, `GameView`, Application-owned option/command/View types.
- Produces: React source with no direct `../core` import and no policy/load/diagnosis calculation.

- [ ] **Step 1: TypeScript AST로 UI import 경계를 검사하는 실패 테스트 작성**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

it('keeps React source dependent on Application instead of Core', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/ui/GameApp.tsx'), 'utf8');
  const file = ts.createSourceFile('GameApp.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = file.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text);

  expect(imports.filter((path) => path.includes('/core'))).toEqual([]);
});
```

- [ ] **Step 2: 현재 `../core` import 때문에 RED 확인**

Run: `npm test -- --run src/application/__tests__/view-boundary.spec.ts`

Expected: FAIL with `['../core']`.

- [ ] **Step 3: Technology display metadata와 setup/command 타입을 Application 계약에 포함**

`TechnologyOptionView`에 다음 필드를 추가하여 React의 `TECHNOLOGIES` lookup을 제거한다.

```ts
readonly benefits: readonly string[];
readonly tradeoffs: readonly string[];
```

`GameApp.tsx`는 `FrameworkOptionId`, `DatabaseOptionId`, `ServerSizeView`, `SERVER_SIZE_VALUES`, `SkillRefView`, `TrafficResponseChoice`를 `game-view.ts`에서 import한다.

- [ ] **Step 4: raw snapshot/policy 계산을 ViewModel 표시로 교체**

- `ObservabilityPolicy.evaluate` → `view.service.observability`
- `ServiceHealthAnalyzer.analyze` → `view.service.health`
- `view.snapshot.load.*` → `view.service.visibleLoads`, `ServiceNodeView.resourceDetail`, `failurePercent`
- `view.snapshot.currentTechnologyBuild` → `view.operations.currentTechnologyBuild`
- `view.snapshot.currentFeature/techDebt` → `view.operations.currentFeature/techDebt`
- `view.snapshot.growthEvent` → `view.operations.trafficSpike`
- `IncidentDiagnosisPolicy.diagnose` → `event.diagnosis`
- `TECHNOLOGIES[id]` → `TechnologyOptionView.benefits/tradeoffs`

`LoadMini`는 ratio가 아니라 Application이 계산한 `LoadMetricView`를 받는다.

```tsx
function LoadMini({ metric }: { metric: LoadMetricView }) {
  return <div className={`load-mini ${metric.tone}`}><span>{metric.label}</span><strong>{metric.percent}%</strong><i><b style={{ width: `${Math.min(100, metric.percent)}%` }} /></i></div>;
}
```

- [ ] **Step 5: 경계 테스트·타입 검사·전체 테스트 실행**

Run: `npm test -- --run src/application/__tests__/view-boundary.spec.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS with no `GameSnapshot`, Core policy, or Core catalog use in React.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/ui/GameApp.tsx src/application/game-view.ts src/application/game-controller.ts src/application/__tests__/view-boundary.spec.ts
git commit -m "refactor: render only application view models"
```

### Task 5: End-to-end boundary verification

**Files:**
- Modify only if verification reveals a defect in files already listed above.

**Interfaces:**
- Consumes: completed Phase 2 implementation.
- Produces: evidence that behavior and architecture remain valid.

- [ ] **Step 1: 전체 자동 검증**

Run: `npm test`

Expected: all test files pass with zero failures.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: optimized Next.js production build completes.

- [ ] **Step 2: 경계 및 변경 범위 감사**

Run: `rg -n "from ['\"]\.\./core|view\.snapshot|controller\.engine|ObservabilityPolicy|ServiceHealthAnalyzer|IncidentDiagnosisPolicy" src/ui src/application`

Expected: no React matches; Core policy class names absent from production Application/UI code.

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: clean after final commit.

- [ ] **Step 3: 대표 플레이 루프 회귀 테스트 확인**

Run: `npm test -- --run src/core/__tests__/game-engine.spec.ts src/application/__tests__/game-controller.spec.ts`

Expected: launch, scale, technology preview/build, incident recovery, learning, settlement flows pass.

- [ ] **Step 4: 최종 커밋이 필요한 경우에만 검증 수정 커밋**

```bash
git add src/application/game-view.ts src/application/operational-view-projector.ts src/application/game-controller.ts src/application/__tests__/game-controller.spec.ts src/application/__tests__/operational-view-projector.spec.ts src/application/__tests__/view-boundary.spec.ts src/ui/GameApp.tsx src/core/index.ts
git commit -m "fix: complete application view boundary"
```
