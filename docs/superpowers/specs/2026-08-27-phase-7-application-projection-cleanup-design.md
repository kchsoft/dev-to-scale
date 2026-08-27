# Phase 7 Application Projection Cleanup Design

## 1. Purpose

Phase 7은 UI가 더 이상 사용하지 않는 Application 호환 계약을 제거하고, 커진 `GameViewProjector`를 책임별 projector로 분리한다. 목적은 MSA 진입 모듈 라우팅을 추가하기 전에 Application의 출력 모델과 projection 경계를 작고 명확하게 만드는 것이다.

이번 단계는 플레이 동작이나 화면을 바꾸지 않는다. 현재 `TopologyView`가 Service Map의 canonical 출력이며, 제거 대상인 `GameView.nodes`와 `GameView.requestFlows`는 production UI에서 사용되지 않는다.

## 2. Scope

### 2.1 In scope

- `GameView.nodes`와 `GameView.requestFlows` 제거
- `ServiceNodeView`와 `RequestFlowView` 제거
- 두 legacy View를 만드는 Application projection 코드 제거
- `GameViewProjector`를 overview, service, progression projector로 분리
- `GameEventProjector`의 기능 출시 영향 계산 의존성을 service projector로 이동
- 제거된 타입과 관련된 `GameController` re-export 및 presentation icon mapping 정리
- 기존 UI 출력, 게임 규칙, 경제 및 성장 밸런스 보존

### 2.2 Out of scope

- Core `LoadSnapshot`의 `appRatio`, `dbRatio`, `asyncRatio`, `storageRatio` 제거
- Core `LoadSnapshot.requestFlows`와 `LegacyRequestFlowProjector` 제거
- `FeatureCardView.route`의 `RequestNodeViewKind` 제거
- `OperationalViewProjector`를 Node-only 계산으로 전환
- MSA module 생성, workload assignment 명령 또는 관련 UI 추가
- 내부 Route Blueprint 편집 기능
- 화면 디자인, 카피 또는 애니메이션 변경

Core 호환 필드는 성장 압력, 장애 진단, 기술 preview와 기존 Domain 회귀 테스트에서 사용된다. 이를 한 번에 제거하면 밸런스 계산 변경과 Application 구조 변경이 섞이므로 별도 단계로 남긴다.

## 3. Architectural invariants

- React View는 Application 계약만 import하고 Core를 직접 참조하지 않는다.
- `GameController`는 mutable `GameEngine`을 외부에 노출하지 않는다.
- `GameViewProjector.project()`는 하나의 현재 `GameSnapshot`을 캡처하고 모든 하위 projector에 같은 snapshot을 전달한다.
- 하위 projector는 Application DTO만 반환하며 React나 브라우저 API를 알지 못한다.
- `TopologyView`가 node, edge, trace의 유일한 Service Map 계약이다.
- 명령 성공 후 Controller는 현재 `GameView`를 정확히 한 번 emit한다.
- `GameEventProjector`는 현재 engine transition만 처리하며 stale snapshot을 허용하지 않는다.
- Server, Database, Queue, Cache, Storage는 계속 독립 Core node로 유지된다.
- Workload 내부 경로는 Blueprint가 소유하고 플레이어가 편집하지 않는다.

## 4. Current problems

### 4.1 Duplicate Application service contracts

`GameView`에는 두 종류의 서비스 표현이 함께 존재한다.

- canonical: `topology.nodes`, `topology.edges`, `topology.traces`
- legacy: `nodes`, `requestFlows`

UI는 canonical topology만 사용하지만 `GameViewProjector`는 매 projection마다 legacy 배열도 생성한다. 이 중복은 향후 multi-module topology에서 어떤 출력이 진실인지 모호하게 만들고, 새로운 node kind나 trace semantics를 두 계약에 동시에 반영하게 만든다.

### 4.2 Oversized projection responsibility

`GameViewProjector`는 다음 책임을 한 클래스에서 수행한다.

- HUD와 월 비용
- 작업 슬롯과 현재 작업 상태
- service health, alert, topology
- 기술 선택지와 preview
- 학습 트리
- 기능 로드맵
- 인프라 비용 preview
- 기능 출시 영향 분석

이 구조는 관련 없는 변경이 같은 파일과 테스트에 모이게 하고, `GameEventProjector`가 기능 영향 문구 하나를 위해 전체 View projector에 의존하게 한다.

## 5. Target components

### 5.1 GameViewProjector

`GameViewProjector`는 composition root다.

```ts
export class GameViewProjector {
  constructor(engine: GameEngine);
  project(): GameView;
}
```

`project()`는 engine에서 snapshot을 한 번 읽고 월 예상 매출·비용·순이익을 계산한다. 같은 snapshot과 파생 재무 값을 세 하위 projector에 전달하고 결과를 하나의 `GameView`로 조합한다. Framework ID, Database ID, 현재 App/DB size와 count 같은 최상위 primitive도 여기서 결합한다.

하위 projector가 서로를 호출하지 않도록 한다. 공유할 값은 명시적 입력 DTO로 전달한다.

### 5.2 GameOverviewProjector

```ts
export interface GameFinancialProjection {
  readonly monthlyRevenue: number;
  readonly monthlyCost: number;
  readonly monthlyProfit: number;
}

export interface GameOverviewProjection {
  readonly hud: HudView;
  readonly workSlots: readonly WorkSlotView[];
  readonly operations: FeatureOperationsView;
}

export class GameOverviewProjector {
  constructor(engine: GameEngine);
  project(snapshot: GameSnapshot, financials: GameFinancialProjection): GameOverviewProjection;
}
```

이 projector는 시간·재무 표시, feature/technology/learning/incident 작업 슬롯, 현재 작업 상태만 담당한다. Service topology나 기술 catalog를 만들지 않는다.

### 5.3 GameServiceProjector

```ts
export interface FeatureImpactPreview {
  readonly summary: string;
  readonly tone: AlertView['tone'];
  readonly nodeId?: string;
}

export interface GameServiceProjection {
  readonly alerts: readonly AlertView[];
  readonly topology: TopologyView;
  readonly infrastructureCosts: InfrastructureCostView;
  readonly service: ServiceOperationsView;
}

export class GameServiceProjector {
  constructor(engine: GameEngine);
  project(snapshot: GameSnapshot, financials: GameFinancialProjection): GameServiceProjection;
  featureImpact(featureId: string): FeatureImpactPreview | null;
}
```

이 projector는 canonical topology, operational health, observability, alert와 인프라 비용 preview를 담당한다. `featureImpact()`는 현재 engine snapshot만 사용한다.

`GameEventProjector`는 `GameViewProjector` 대신 `GameServiceProjector`를 주입받아 requirement event의 출시 영향 문구를 만든다. stale transition 검증은 그대로 유지한다.

### 5.4 GameProgressionProjector

```ts
export interface GameProgressionProjection {
  readonly technologies: readonly TechnologyOptionView[];
  readonly skills: readonly SkillNodeView[];
  readonly features: readonly FeatureCardView[];
}

export class GameProgressionProjector {
  constructor(engine: GameEngine);
  project(snapshot: GameSnapshot): GameProgressionProjection;
}
```

이 projector는 기술 구축 가능 여부와 preview, 학습 트리, 기능 로드맵만 담당한다. `FeatureCardView.route`는 로드맵에서 현재 경로 tag를 표시하므로 이번 단계에서 유지한다.

## 6. GameView contract after cleanup

```ts
export interface GameView {
  readonly hud: HudView;
  readonly workSlots: readonly WorkSlotView[];
  readonly alerts: readonly AlertView[];
  readonly technologies: readonly TechnologyOptionView[];
  readonly skills: readonly SkillNodeView[];
  readonly features: readonly FeatureCardView[];
  readonly topology: TopologyView;
  readonly infrastructureCosts: InfrastructureCostView;
  readonly service: ServiceOperationsView;
  readonly operations: FeatureOperationsView;
  readonly frameworkId: FrameworkOptionId;
  readonly databaseId: DatabaseOptionId;
  readonly appSize: ServerSizeView;
  readonly appCount: number;
  readonly dbSize: ServerSizeView;
  readonly dbReplicaCount: number;
}
```

`nodes`와 `requestFlows`는 존재하지 않는다. Topology node와 trace가 필요하면 각각 `view.topology.nodes`와 `view.topology.traces`를 사용한다.

## 7. Data flow

```text
GameController.getView()
  → GameViewProjector.project()
      → capture current GameSnapshot once
      → calculate GameFinancialProjection
      → GameOverviewProjector.project(snapshot, financials)
      → GameServiceProjector.project(snapshot, financials)
      → GameProgressionProjector.project(snapshot)
      → compose immutable Application DTO shape
  → React View
```

Event 흐름은 다음과 같다.

```text
GameController.advanceDay()
  → capture before
  → GameEngine.advanceDay() returns after
  → GameEventProjector.project(before, after)
      → validate after is current transition
      → GameServiceProjector.featureImpact(featureId)
  → emit GameViewProjector.project() once
```

## 8. Migration sequence

1. 최종 `GameView`에 legacy 필드가 없어야 한다는 계약 테스트를 추가하고, 현재 구현에서 실패함을 확인한다.
2. `GameView`와 Controller re-export에서 legacy 타입을 제거한다.
3. `GameViewProjector`의 legacy service node/request flow projection을 제거한다.
4. overview projector를 추출하고 직접 테스트한다.
5. progression projector를 추출하고 직접 테스트한다.
6. service projector를 추출하고 topology, alert, feature impact를 직접 테스트한다.
7. `GameViewProjector`를 snapshot capture와 결과 조합만 하는 composition root로 축소한다.
8. `GameEventProjector` 의존성을 service projector로 변경한다.
9. 전체 Application/UI/Core 회귀 검증과 production build를 실행한다.

각 추출 단계는 visible copy, balance, command behavior를 변경하지 않는다.

## 9. Error handling

- Domain command 오류는 기존과 같이 `GameController` 호출자에게 전달되고 UI composition root가 toast로 변환한다.
- 내부 topology catalog 오류는 계속 fail-fast 한다.
- `GameEventProjector`가 현재 engine state와 다른 `after` snapshot을 받으면 명시적 오류를 발생시킨다.
- Projector는 누락된 표시 ID에 대해 기존 presentation catalog fallback을 사용한다.
- legacy View 제거를 임시 `undefined`나 빈 배열로 호환하지 않는다. 계약에서 완전히 삭제해 잘못된 소비자가 typecheck에서 실패하게 한다.

## 10. Testing strategy

### 10.1 Contract regression

- `GameController.getView()` 결과에 own property `nodes`가 없다.
- `GameController.getView()` 결과에 own property `requestFlows`가 없다.
- topology nodes와 traces는 기존 literal ID, 순서, 상태를 유지한다.
- UI source는 Core를 import하지 않는다.

### 10.2 Direct projector tests

- `GameOverviewProjector`는 초기 HUD, feature work slot, operations를 투영한다.
- `GameProgressionProjector`는 기술 6개, 전체 skill tree와 기능 10개를 투영한다.
- `GameServiceProjector`는 초기 독립 storage node, observability, alert와 infrastructure cost를 투영한다.
- 출시 후 `GameServiceProjector`는 canonical request trace를 보존한다.
- `GameEventProjector`는 requirement event에 service projector의 기능 영향 summary를 포함한다.

### 10.3 End-to-end verification

- `npm test`
- `npm run typecheck`
- `npm run build`
- setup과 service dashboard의 server rendering 테스트
- 독립 code review에서 Critical과 Important issue가 없어야 한다.

## 11. Success criteria

- `GameView`, production UI와 Controller export surface에 `ServiceNodeView`와 `RequestFlowView`가 없다.
- `GameView.nodes`와 `GameView.requestFlows`가 없다.
- Service Map은 `TopologyView`만으로 기존과 동일하게 렌더링된다.
- `GameViewProjector`가 snapshot capture, 재무 파생 값 계산, 하위 projection 조합만 담당한다.
- overview, service, progression projector는 직접 단위 테스트할 수 있다.
- `GameEventProjector`는 전체 `GameViewProjector`에 의존하지 않는다.
- 모든 명령은 성공 후 현재 View를 정확히 한 번 emit한다.
- Core aggregate load와 legacy request flow 계산은 이번 단계에서 변경되지 않는다.
- 기존 180개 테스트와 새 회귀 테스트, typecheck, production build가 통과한다.
