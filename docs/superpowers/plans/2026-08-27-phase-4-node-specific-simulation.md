# Phase 4 Node-Specific Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 Topology Node ID를 따라 Request health·Incident·Load를 계산하고, Phase 5 UI가 사용할 immutable RequestTrace와 NodeLoadSnapshot을 제공한다.

**Architecture:** strict `RouteResolver.resolve`는 구성 오류를 계속 fail-fast 처리한다. 별도의 runtime trace resolution은 V1 게임에서 아직 배치되지 않은 필수 자원을 `MISSING` 단계로 보존하고, `RequestTraceSimulator`가 actual Node ID health를 적용한다. `LoadCalculator`는 Trace 도착률로 Node별 demand를 합산하고 기존 aggregate `LoadSnapshot` 및 `RequestFlowResult`는 같은 결과에서 호환 projection한다.

**Tech Stack:** TypeScript 5, Vitest 3

**Spec:** `docs/superpowers/specs/2026-08-26-infrastructure-ecosystem-topology-design.md`

## Global Constraints

- Incident와 Request health의 식별자는 `RequestNodeKind`가 아니라 actual `InfrastructureNodeId`다.
- 동일 kind의 다른 Node 장애는 해당 Node를 지나지 않는 Trace에 영향을 주지 않는다.
- strict topology 구성 검증은 필수 Binding 누락과 끊긴 Edge를 계속 거부한다.
- runtime missing-step 허용은 V1 request simulation 전용이며 플레이어 편집 API로 노출하지 않는다.
- 기존 app/db/async/storage aggregate load, CPU/I/O 세부 필드, `failureRate`, `requestFlows`는 호환 projection으로 유지한다.
- 기존 V1 경제·성장·Queue 교체·Redis 최적화·traffic spike 수치를 의도적으로 변경하지 않는다.
- React는 Core Trace, TopologyGraph, NodeLoadSnapshot을 직접 계산하거나 import하지 않는다.
- Phase 5 Service Map ViewModel과 애니메이션은 이번 계획 범위가 아니다.

---

### Task 1: Runtime route resolution and RequestTrace

**Files:**
- Modify: `src/core/service-topology.ts`
- Modify: `src/core/v1-topology.ts`
- Create: `src/core/request-trace.ts`
- Create: `src/core/__tests__/request-trace.spec.ts`
- Modify: `src/core/__tests__/service-topology.spec.ts`
- Modify: `src/core/__tests__/v1-topology.spec.ts`
- Modify: `src/core/index.ts`

**Interfaces:**
- Produces: `RouteResolver.resolveForTrace(blueprint, deployment, graph): ResolvedRoute`
- Produces: `SingleServiceTopology.resolveForTrace(workloadId): ResolvedRoute`
- Produces: `RequestTraceSimulator.simulate(route, nodeHealth?): RequestTrace`
- Produces: `RequestTrace`, `RequestTraceNode`, `RequestTraceEdge`, `RequestTraceNodeStatus`

- [ ] **Step 1: exact Node ID health 격리의 실패 테스트 작성**

두 Queue Node 중 `queue-a`만 지나는 route를 만들고 `queue-b: 0` health는 성공률을 바꾸지 않지만 `queue-a: 0`은 `failureNodeId === 'queue-a'`와 `successRatio === 0`을 만드는지 검증한다. 이 테스트는 kind 기반 health로 회귀하면 실패해야 한다.

```ts
const healthy = RequestTraceSimulator.simulate(route, { 'queue-b': 0 });
const failed = RequestTraceSimulator.simulate(route, { 'queue-a': 0 });

expect(healthy.successRatio).toBe(1);
expect(failed.failureNodeId).toBe('queue-a');
expect(failed.nodes.at(-1)?.status).toBe('FAILED');
```

- [ ] **Step 2: RequestTrace 모듈 부재로 RED 확인**

Run: `npm test -- --run src/core/__tests__/request-trace.spec.ts`

Expected: FAIL because `request-trace.ts` and `resolveForTrace` do not exist.

- [ ] **Step 3: strict resolver와 runtime resolver의 경계 테스트 작성**

필수 `EVENT_BUS` Binding이 없을 때 `RouteResolver.resolve`는 기존처럼 `MISSING_REQUIRED_BINDING`을 던지고 `resolveForTrace`는 다음 단계를 보존해야 한다.

```ts
expect(() => RouteResolver.resolve(blueprint, deployment, graph)).toThrowError(
  expect.objectContaining({ code: 'MISSING_REQUIRED_BINDING' }),
);
expect(RouteResolver.resolveForTrace(blueprint, deployment, graph).steps.at(-1)).toEqual(
  expect.objectContaining({ role: 'EVENT_BUS', requirement: 'REQUIRED', nodeId: null }),
);
```

runtime resolution은 missing required step을 우회하지 않는다. missing optional 중간 step은 기존처럼 실제 predecessor→successor Edge를 검증한다.

- [ ] **Step 4: runtime resolution 최소 구현**

공유 `resolveSteps`가 bound Node 존재와 Role-kind 호환을 검증한다. strict mode만 required null을 거부하고, trace mode는 required null을 보존한다. `activeBlueprintConnections`는 null step의 requirement가 `OPTIONAL`일 때만 통과한다.

- [ ] **Step 5: immutable RequestTrace 모델과 simulator 구현**

```ts
export type RequestTraceNodeStatus = 'HEALTHY' | 'SLOW' | 'FAILED' | 'MISSING';

export interface RequestTraceNode {
  readonly stepId: string;
  readonly role: ResourceRole;
  readonly nodeId: InfrastructureNodeId | null;
  readonly arrivalRatio: number;
  readonly passThroughRatio: number;
  readonly status: RequestTraceNodeStatus;
}

export interface RequestTraceEdge {
  readonly edgeId: string;
  readonly trafficRatio: number;
}

export interface RequestTrace {
  readonly workloadId: string;
  readonly nodes: readonly RequestTraceNode[];
  readonly edges: readonly RequestTraceEdge[];
  readonly successRatio: number;
  readonly failureNodeId: InfrastructureNodeId | null;
}
```

health는 `[0, 1]`로 clamp한다. `1`은 `HEALTHY`, `(0, 1)`은 `SLOW`, `0`은 `FAILED`다. missing optional은 current ratio를 유지하고, missing required는 `MISSING`을 기록한 뒤 success를 0으로 만들고 downstream 처리를 중단한다. Edge traffic은 downstream actual Node의 arrival ratio다.

- [ ] **Step 6: ALB ingress와 missing Queue V1 테스트 작성**

ALB가 배치되면 `SingleServiceTopology.resolveForTrace`의 첫 Node가 `V1_NODE_IDS.gateway`이고 gateway→app Edge가 포함되는지 검증한다. 필수 Queue가 없으면 trace 마지막 step은 `nodeId: null`, `status: MISSING`, `successRatio: 0`이어야 한다.

- [ ] **Step 7: SingleServiceTopology runtime route composition 구현**

내부 Blueprint는 변경하지 않는다. `resolveForTrace`만 `ENTRY_GATEWAY` Binding이 있으면 synthetic gateway step과 실제 gateway→app topology Edge를 내부 route 앞에 합성한다. 따라서 ALB 배포 전후에도 Module Blueprint 구조는 동일하다. `v1-topology.ts`의 `InfrastructureState`와 `QueueTechnologyId` import는 type-only로 바꿔 `infrastructure.ts → v1-topology.ts` 계산 의존성이 runtime cycle을 만들지 않게 한다.

- [ ] **Step 8: 집중 테스트 GREEN 및 typecheck 확인**

Run: `npm test -- --run src/core/__tests__/request-trace.spec.ts src/core/__tests__/service-topology.spec.ts src/core/__tests__/v1-topology.spec.ts`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 9: 커밋**

```bash
git add src/core/request-trace.ts src/core/service-topology.ts src/core/v1-topology.ts src/core/index.ts src/core/__tests__/request-trace.spec.ts src/core/__tests__/service-topology.spec.ts src/core/__tests__/v1-topology.spec.ts
git commit -m "feat: trace requests by topology node"
```

### Task 2: Node-specific load and compatibility projection

**Files:**
- Modify: `src/core/infrastructure.ts`
- Create: `src/core/__tests__/node-load.spec.ts`
- Modify: `src/core/__tests__/infrastructure-load.spec.ts`
- Modify: `src/core/__tests__/request-flow.spec.ts`

**Interfaces:**
- Modify: `LoadCalculationContext.nodeHealth?: Readonly<Partial<Record<InfrastructureNodeId, number>>>`
- Add: `LoadSnapshot.nodeLoads: readonly NodeLoadSnapshot[]`
- Add: `LoadSnapshot.requestTraces: readonly RequestTrace[]`
- Preserve: `LoadSnapshot.requestFlows: readonly RequestFlowResult[]`
- Produce: `LegacyRequestFlowProjector.fromTrace(trace): RequestFlowResult`

- [ ] **Step 1: NodeLoadSnapshot과 Trace 기반 downstream demand 실패 테스트 작성**

APP Node health가 0이면 APP node demand는 존재하지만 DB node CPU/I/O demand는 0이어야 한다. literal V1 Node ID로 조회해 aggregate 필드와 같은 값을 검증한다.

```ts
const app = load.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.app('SPRING_BOOT'))!;
const db = load.nodeLoads.find(({ nodeId }) => nodeId === V1_NODE_IDS.database('POSTGRESQL'))!;

expect(app.cpuDemand).toBeCloseTo(load.appCpuDemand);
expect(db.cpuDemand).toBe(0);
expect(load.requestTraces[0].failureNodeId).toBe(V1_NODE_IDS.app('SPRING_BOOT'));
```

- [ ] **Step 2: 새 Load fields 부재로 RED 확인**

Run: `npm test -- --run src/core/__tests__/node-load.spec.ts`

Expected: FAIL because `nodeLoads` and `requestTraces` do not exist and health still uses `RequestNodeKind`.

- [ ] **Step 3: NodeLoadSnapshot 계약 구현**

```ts
export interface NodeLoadSnapshot {
  readonly nodeId: InfrastructureNodeId;
  readonly cpuDemand?: number;
  readonly ioDemand?: number;
  readonly throughputDemand?: number;
  readonly storageDemand?: number;
  readonly capacity: number;
  readonly loadRatio: number;
}
```

APP/DB의 `capacity`는 더 높은 ratio를 만든 bottleneck axis의 effective capacity다. Queue는 effective async capacity, Storage는 storage capacity를 사용한다. ALB는 APP aggregate pressure, Redis는 현재 V1 DB pressure의 호환 projection을 사용한다. External AI는 demand/capacity가 정의되지 않아 `capacity: 0`, `loadRatio: 0`이다.

- [ ] **Step 4: LoadCalculator를 topology trace 도착률로 전환**

`SingleServiceTopology.from(infrastructure, features)`를 계산당 한 번 생성하고, 각 feature의 `resolveForTrace`와 `RequestTraceSimulator` 결과를 사용한다. APP/DB/Queue/Storage demand multiplier는 `trace.nodes`의 exact Node ID arrival ratio로 계산한다. Redis의 기존 Read-heavy CPU 12%/I/O 40% 감소와 optional Queue fallback 수치는 유지한다.

- [ ] **Step 5: legacy RequestFlow compatibility projector 구현**

Role mapping은 `ENTRY_GATEWAY→ALB`, `ENTRY_APP→APP`, `PRIMARY_DATABASE→DB`, `CACHE→CACHE`, `EVENT_BUS→QUEUE`, `OBJECT_STORAGE→STORAGE`, `EXTERNAL_SERVICE→AI`다. `MISSING` node는 `available: false`, missing/failed 첫 단계는 legacy `failureNode`로 투영한다. `LoadCalculator`는 더 이상 `RequestFlowSimulator.simulate`를 호출하지 않는다.

- [ ] **Step 6: aggregate 수치 회귀 테스트 GREEN 확인**

기존 infrastructure load 테스트 전체를 실행해 proficiency, Redis, Queue fallback, traffic spike, 25M DAU balance가 동일하게 통과하는지 확인한다.

Run: `npm test -- --run src/core/__tests__/node-load.spec.ts src/core/__tests__/infrastructure-load.spec.ts src/core/__tests__/request-flow.spec.ts`

Expected: PASS.

- [ ] **Step 7: typecheck 후 커밋**

Run: `npm run typecheck`

```bash
git add src/core/infrastructure.ts src/core/request-trace.ts src/core/__tests__/node-load.spec.ts src/core/__tests__/infrastructure-load.spec.ts src/core/__tests__/request-flow.spec.ts
git commit -m "feat: calculate load per topology node"
```

### Task 3: Node-ID incidents and same-snapshot consistency

**Files:**
- Modify: `src/core/incident-topology.ts`
- Modify: `src/core/game-engine.ts`
- Modify: `src/core/request-flow.ts`
- Modify: `src/core/__tests__/incident-finance.spec.ts`
- Create: `src/core/__tests__/incident-topology.spec.ts`
- Modify: `src/core/__tests__/game-engine.spec.ts`
- Modify: `src/application/game-controller.ts`
- Modify: `src/application/operational-view-projector.ts`
- Modify: `src/application/__tests__/game-controller.spec.ts`
- Modify: `src/application/__tests__/operational-view-projector.spec.ts`

**Interfaces:**
- Consume: `LoadSnapshot.nodeLoads`, `V1_NODE_IDS`, `TopologyGraph`
- Remove from active calculation: `requestNodeForIncident(nodeId)` and kind-keyed health aggregation
- Preserve: existing incident command and Application View contracts

- [ ] **Step 1: actual topology Node ID candidate 실패 테스트 작성**

`IncidentTopology.candidates`가 App, DB, deployed Queue에 각각 `V1_NODE_IDS.app`, `V1_NODE_IDS.database`, `V1_NODE_IDS.queue`를 사용하고 각 candidate load ratio가 동일 Node의 `NodeLoadSnapshot.loadRatio`인지 검증한다.

- [ ] **Step 2: legacy incident ID 때문에 RED 확인**

Run: `npm test -- --run src/core/__tests__/incident-topology.spec.ts -t "topology node IDs"`

Expected: FAIL because candidates still use `framework:`, `database:`, `technology:` IDs.

- [ ] **Step 3: IncidentTopology를 graph/nodeLoads 기준으로 구현**

Context에 current `TopologyGraph`를 제공한다. Candidate는 App, DB와 실제 배치 기술 Node를 순회하며 external AI와 implicit local storage는 기존 정책대로 제외한다. skill context는 Node kind와 `productId`로 framework/database/technology 숙련도와 fundamentals를 선택한다.

- [ ] **Step 4: GameEngine health와 retired incident cleanup 전환**

`loadCalculationContext`는 active incident의 exact `nodeId`를 `nodeHealth`에 기록한다. Queue 교체 preview와 실제 배포는 `V1_NODE_IDS.queue(retiredTechnology)`를 제거 대상으로 사용한다. 같은 kind의 다른 Node health를 합치지 않는다.

- [ ] **Step 5: same-snapshot 장애/복구 통합 테스트 작성**

DB actual Node ID에 CRITICAL incident를 추가하고 refresh mutation 직후 해당 Node를 지나는 trace가 실패하는지, 복구 완료 snapshot에서 같은 trace와 `failureRate`가 즉시 건강해지는지 검증한다. Queue 교체 후 retired Queue incident가 제거되고 새 Queue Node trace는 건강해야 한다.

- [ ] **Step 6: Application incident lookup과 diagnosis ID 전환**

`serviceNodes`는 `V1_NODE_IDS.app/database/cache/gateway/storage/queue`로 incident를 조회한다. Diagnosis 분기는 `v1:app:`, `v1:database:`, `v1:cache:`, `v1:queue:`, `v1:storage:`, `v1:gateway:` prefix를 사용한다. View는 Core route/load를 새로 계산하지 않는다.

- [ ] **Step 7: 집중 테스트 GREEN 및 typecheck 확인**

Run: `npm test -- --run src/core/__tests__/incident-topology.spec.ts src/core/__tests__/incident-finance.spec.ts src/core/__tests__/game-engine.spec.ts src/application/__tests__/operational-view-projector.spec.ts src/application/__tests__/game-controller.spec.ts`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 8: 커밋**

```bash
git add src/core/incident-topology.ts src/core/game-engine.ts src/core/request-flow.ts src/core/__tests__/incident-topology.spec.ts src/core/__tests__/incident-finance.spec.ts src/core/__tests__/game-engine.spec.ts src/application/game-controller.ts src/application/operational-view-projector.ts src/application/__tests__/game-controller.spec.ts src/application/__tests__/operational-view-projector.spec.ts
git commit -m "refactor: target incidents by topology node"
```

### Task 4: Regression verification and architecture review

**Files:**
- Modify only if verification exposes a Phase 4 defect.

- [ ] **Step 1: node simulation 집중 테스트 실행**

Run: `npm test -- --run src/core/__tests__/request-trace.spec.ts src/core/__tests__/node-load.spec.ts src/core/__tests__/service-topology.spec.ts src/core/__tests__/v1-topology.spec.ts src/core/__tests__/infrastructure-load.spec.ts src/core/__tests__/game-engine.spec.ts`

- [ ] **Step 2: full automated verification 실행**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run build`

- [ ] **Step 3: architecture boundary 자체 검토**

다음을 확인한다.

- `LoadCalculator`가 `RequestFlowSimulator`를 호출하지 않고 `RequestTrace`를 단일 경로 결과로 사용한다.
- active incident health map에 `RequestNodeKind` key가 남아 있지 않다.
- `IncidentTopology` candidate ID는 현재 `TopologyGraph` Node ID에 실제로 존재한다.
- retired Queue Incident가 새 Queue Binding이나 Trace에 남지 않는다.
- aggregate `requestFlows`, load ratio, CPU/I/O capacity는 Trace/NodeLoad에서 파생되며 별도 health simulation을 하지 않는다.
- Application은 ID mapping과 표시만 수행하고 Core Trace/Load를 재계산하지 않는다.
- React source에는 새 Core topology/request-trace import가 없다.

- [ ] **Step 4: diff hygiene와 원 checkout 보존 확인**

Run: `git diff --check`

Run: `git status --short`

원 checkout의 `next-env.d.ts`, `next.config.ts`, `tsconfig.json`, `package-lock.json` 변경은 수정하지 않는다.

- [ ] **Step 5: 검증 근거와 다음 Phase 경계 기록**

완료 시 테스트 파일/테스트 수, typecheck, production build를 기록한다. Phase 5에서 Application이 `TopologyView`와 `RequestTraceView`를 투영하고 React Service Map을 교체하며, 이번 단계에서는 UI 구조를 변경하지 않는다.
