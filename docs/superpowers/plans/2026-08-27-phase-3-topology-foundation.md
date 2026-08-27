# Phase 3 Topology Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버·DB·MQ·캐시·스토리지를 서비스와 독립된 노드로 표현하고, ServiceModule의 고정 Blueprint를 Deployment Binding으로 실제 노드 경로에 해석하는 V1 호환 토폴로지 기반을 만든다.

**Architecture:** `TopologyGraph`는 독립 인프라 노드와 통신 가능한 Edge만 소유한다. `ServiceModule`은 Workload와 논리적 Role 기반 Blueprint만 소유하고, `ModuleDeployment`가 Role을 실제 Node ID에 연결한다. `RouteResolver`는 Blueprint와 Deployment를 TopologyGraph 위의 경로로 검증·해석하며, `SingleServiceTopology`는 현재 `InfrastructureState`를 이 새 모델로 투영한다. 기존 `RequestFlowSimulator`와 부하·장애 계산은 Phase 4까지 유지한다.

**Tech Stack:** TypeScript 5, Vitest 3

**Spec:** `docs/superpowers/specs/2026-08-26-infrastructure-ecosystem-topology-design.md`

## Global Constraints

- Node는 ServiceModule을 소유하지 않고 ServiceModule도 Node를 소유하지 않는다.
- Module과 Node는 안정적인 ID와 `ModuleDeployment` Binding으로만 연결한다.
- 플레이어가 내부 경로 또는 물리 Node를 편집하는 API는 추가하지 않는다.
- Blueprint의 필수/선택 단계 순서와 현재 V1 Queue 교체 정책을 보존한다.
- `TopologyGraph`는 연결 가능 관계이고, 해석된 Route는 특정 Workload가 사용하는 경로다.
- 구성 오류는 안정적인 code를 가진 `TopologyValidationError`로 fail-fast 처리한다.
- 기존 `RequestFlowSimulator`, `LoadCalculator`, 게임 밸런스, View 계약은 이번 단계에서 변경하지 않는다.

---

### Task 1: Independent topology nodes and edges

**Files:**
- Create: `src/core/topology.ts`
- Create: `src/core/__tests__/topology.spec.ts`
- Modify: `src/core/index.ts`

**Interfaces:**
- `InfrastructureNodeId`, `InfrastructureNodeKind`, `ResourceCapacity`, `InfrastructureNode`
- `TopologyEdgeMode`, `TopologyEdge`
- `TopologyValidationErrorCode`, `TopologyValidationError`
- `TopologyGraph`

- [ ] **Step 1: 독립 Node 생성과 Graph 검증 실패 테스트 작성**

테스트는 Server, Database, Queue가 Module 없이 생성 가능함을 보이고 다음 오류 code를 검증한다.

- `DUPLICATE_NODE_ID`
- `DUPLICATE_EDGE_ID`
- `MISSING_EDGE_ENDPOINT`

- [ ] **Step 2: 집중 테스트를 실행해 모듈 부재로 RED 확인**

Run: `npm test -- --run src/core/__tests__/topology.spec.ts`

Expected: FAIL because `topology.ts` does not exist.

- [ ] **Step 3: immutable value types와 fail-fast Graph 구현**

`InfrastructureNode`는 `id`, `kind`, `productId`, `capacity`, `monthlyCost`만 가진다. 모든 입력 객체와 배열은 생성 시 복제·동결하고, lookup은 원본을 변경할 수 없는 값을 반환한다. `TopologyGraph.hasEdge(from, to)`와 `node(id)`를 제공하되 Module 개념은 알지 못한다.

- [ ] **Step 4: 집중 테스트 GREEN 및 typecheck 확인**

Run: `npm test -- --run src/core/__tests__/topology.spec.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/core/topology.ts src/core/__tests__/topology.spec.ts src/core/index.ts
git commit -m "feat: add independent topology graph"
```

### Task 2: Service modules, deployments, and route resolution

**Files:**
- Create: `src/core/service-topology.ts`
- Create: `src/core/__tests__/service-topology.spec.ts`
- Modify: `src/core/index.ts`

**Interfaces:**
- `ResourceRole`: `ENTRY_GATEWAY | ENTRY_APP | PRIMARY_DATABASE | CACHE | EVENT_BUS | OBJECT_STORAGE | WORKER | EXTERNAL_SERVICE`
- `ServiceModule`, `ModuleDeployment`, `WorkloadAssignment`
- `RouteBlueprintStep`, `RouteBlueprint`, `ResolvedRouteStep`, `ResolvedRoute`
- `RouteResolver.resolve(blueprint, deployment, graph)`

- [ ] **Step 1: Binding과 Route 불변조건의 실패 테스트 작성**

다음을 검증한다.

- 하나의 Queue Node를 여러 `ModuleDeployment`가 공유할 수 있다.
- 서로 다른 Deployment를 사용하면 동일 Role Blueprint도 서로 다른 Server/DB 경로로 해석된다.
- 필수 Binding 누락은 `MISSING_REQUIRED_BINDING`이다.
- 존재하지 않는 Node Binding은 `MISSING_BOUND_NODE`다.
- Role과 Node kind 불일치는 `INCOMPATIBLE_BINDING`이다.
- 연속 Node 사이 Edge가 없으면 `DISCONNECTED_ROUTE`다.
- Blueprint가 같은 동기 Node를 반복하면 `SYNCHRONOUS_ROUTE_CYCLE`이다.
- Workload assignment의 entry module이 배포 목록에 없으면 `MISSING_ENTRY_MODULE`이다.

- [ ] **Step 2: 집중 테스트를 실행해 RED 확인**

Run: `npm test -- --run src/core/__tests__/service-topology.spec.ts`

Expected: FAIL because service topology contracts do not exist.

- [ ] **Step 3: ServiceModule과 defensive-copy Deployment 구현**

`ServiceModule`은 ID와 Blueprint 목록만 보유한다. `ModuleDeployment`는 생성자에서 Binding을 복제하고 `bindingFor(role)`로 조회한다. Node 객체를 내부에 보유하지 않는다. `WorkloadAssignment.validate`는 배포된 Module ID 집합을 받아 entry module 존재를 확인한다.

- [ ] **Step 4: 선형 V1 Blueprint를 그래프 확장 가능한 계약으로 구현**

`RouteBlueprint`가 step과 명시적 edge를 소유하도록 하여 이후 branch/fan-out을 추가할 수 있게 한다. 각 step은 고유 ID, Resource Role, `REQUIRED | OPTIONAL` 요구조건을 가진다. V1 adapter는 선형 route로 구성하지만 resolver는 blueprint edge를 기준으로 검증한다.

- [ ] **Step 5: RouteResolver 구현**

Resolver는 Deployment의 Binding을 actual Node ID로 해석한다. 선택 Binding이 없으면 해당 step을 `nodeId: null`로 보존하고 연결 검증에서 건너뛴다. 필수 Binding, Node 존재, Role-kind 호환, 동기 순환, Topology Edge 존재를 검증한 뒤 immutable `ResolvedRoute`를 반환한다.

- [ ] **Step 6: 집중 테스트 GREEN 및 typecheck 확인**

Run: `npm test -- --run src/core/__tests__/service-topology.spec.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add src/core/service-topology.ts src/core/__tests__/service-topology.spec.ts src/core/index.ts
git commit -m "feat: resolve module blueprints through deployments"
```

### Task 3: V1 route blueprint adapter

**Files:**
- Create: `src/core/v1-topology.ts`
- Create: `src/core/__tests__/v1-topology.spec.ts`
- Modify: `src/core/index.ts`

**Interfaces:**
- `V1RouteBlueprintAdapter.fromFeature(feature)`
- `SingleServiceTopology.from(infrastructure, features)`
- deterministic V1 Node ID helpers

- [ ] **Step 1: 현재 기능 경로 호환성 실패 테스트 작성**

Community feature catalog를 변환해 기존 `requestRoute`의 Node 의미, 순서, `REQUIRED | OPTIONAL` 값이 Blueprint에 그대로 보존되는지 검증한다. `APP`, `DB`, `CACHE`, `QUEUE`, `STORAGE`, `AI`는 각각 `ENTRY_APP`, `PRIMARY_DATABASE`, `CACHE`, `EVENT_BUS`, `OBJECT_STORAGE`, `EXTERNAL_SERVICE`로 매핑한다.

- [ ] **Step 2: V1 InfrastructureState 투영 실패 테스트 작성**

다음을 검증한다.

- 초기 상태는 독립 App, Database, External AI Node를 가진다.
- ALB, Redis, Queue, Object Storage 배포 후 각각 독립 Node와 Binding이 생긴다.
- 기술 월 비용과 현재 cluster capacity가 Node 값에 반영된다.
- Queue를 SQS에서 Kafka로 교체하면 `EVENT_BUS` Binding은 새 Queue Node를 가리키고 retired Queue Node는 Graph에 남지 않는다.
- Queue 교체 전후 Module Blueprint 객체의 구조는 동일하다.
- 생성한 feature Blueprint가 실제 Graph 위에서 해석된다.

- [ ] **Step 3: 집중 테스트를 실행해 RED 확인**

Run: `npm test -- --run src/core/__tests__/v1-topology.spec.ts`

Expected: FAIL because V1 adapters do not exist.

- [ ] **Step 4: V1RouteBlueprintAdapter 구현**

Feature ID를 workload ID로, legacy route index를 안정적인 step ID로 사용한다. requirement 기본값은 `REQUIRED`로 명시화한다. adapter는 feature와 Role만 알며 InfrastructureState나 실제 Node ID는 알지 못한다.

- [ ] **Step 5: SingleServiceTopology 구현**

고정 module ID `community`의 Blueprint와 현재 인프라를 deterministic Node ID로 투영한다. Queue Node ID는 제품별로 만들어 교체 시 Binding 변경과 retired Node 제거를 자연스럽게 표현한다. Graph에는 현재 Blueprint가 사용하는 실제 연속 경로에 필요한 Edge를 생성하고, ALB가 있으면 gateway→app Edge도 추가한다.

V1 Node ID 규칙:

- `v1:gateway:ALB`
- `v1:app:<frameworkId>`
- `v1:database:<databaseId>`
- `v1:cache:REDIS`
- `v1:queue:<queueTechnologyId>`
- `v1:storage:OBJECT_STORAGE`
- `external:ai`

- [ ] **Step 6: Queue replacement와 adapter 집중 테스트 GREEN 확인**

Run: `npm test -- --run src/core/__tests__/v1-topology.spec.ts src/core/__tests__/infrastructure.spec.ts`

Expected: PASS with the existing single-active-queue policy unchanged.

- [ ] **Step 7: 커밋**

```bash
git add src/core/v1-topology.ts src/core/__tests__/v1-topology.spec.ts src/core/index.ts
git commit -m "feat: adapt v1 infrastructure to service topology"
```

### Task 4: Regression verification and review

**Files:**
- Modify only if verification exposes a Phase 3 defect.

- [ ] **Step 1: topology-focused tests 실행**

Run: `npm test -- --run src/core/__tests__/topology.spec.ts src/core/__tests__/service-topology.spec.ts src/core/__tests__/v1-topology.spec.ts`

- [ ] **Step 2: full automated verification 실행**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run build`

- [ ] **Step 3: architecture boundary 자체 검토**

다음을 검색·확인한다.

- Topology Node가 ServiceModule을 참조하지 않는다.
- ServiceModule/Blueprint가 actual Node ID나 InfrastructureState를 참조하지 않는다.
- V1 adapter 외부에 legacy `RequestNodeKind`→`ResourceRole` mapping이 중복되지 않는다.
- React/Application 파일은 새 Core topology 객체를 직접 노출하거나 계산하지 않는다.
- 기존 Queue 교체 구현과 aggregate simulation 파일에는 비의도적 변경이 없다.

- [ ] **Step 4: diff hygiene 확인**

Run: `git diff --check`

Run: `git status --short`

- [ ] **Step 5: 검증 결과를 근거와 함께 인계**

완료 주장 전에 실행 시점의 테스트 수, typecheck, production build 결과를 기록한다. 원 checkout의 사용자 변경 파일은 건드리지 않는다.
