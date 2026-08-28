# Generic Infrastructure Node Scaling Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every player-owned infrastructure node independently sizeable (SMALL/MEDIUM/LARGE/XLARGE), with truthful per-node capacity/cost/load and a generic Node Inspector scaling workflow.

**Architecture:** Introduce a product-specific node sizing catalog and make `InfrastructureState` the single source of truth for current owned-node sizes. Keep APP/DB horizontal scaling rules, but expose resize/scale-out through node-oriented Core/Application commands and node-local scaling projections. Refactor load calculation so ALB, Redis, queues, and storage use their own capacity instead of borrowing APP/DB capacity.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, React 19, Next.js 16

**Spec:** `docs/superpowers/specs/2026-08-28-generic-node-scaling-engine-design.md`

## Global Constraints

- Player-owned sizeable nodes: APP, DB, ALB, Redis, SQS, RabbitMQ, Kafka, Local Storage, Object Storage.
- External services are never resizeable.
- Sizes are exactly `SMALL`, `MEDIUM`, `LARGE`, `XLARGE`.
- Technology deployment starts the new owned node at `SMALL`.
- Queue replacement does not inherit the previous queue size.
- Object Storage replacement starts at `SMALL` instead of inheriting Local Storage size.
- APP horizontal scale remains instance count 1..10 and requires ALB above one instance.
- DB horizontal scale remains read replicas 0..3 and increases I/O more than CPU.
- Resize is immediate, supports downsizing, has no one-time resize charge, and changes monthly infrastructure cost only.
- Preserve existing feature, learning, incident, tech-debt, growth, revenue, topology, and request-trace behavior unless this spec explicitly changes capacity semantics.
- Use strict TDD: failing behavior test before production code.
- Final gate: `npm test`, `npm run typecheck`, `npm run build`.

---

### Task 1: Generic Node Size Catalog and Infrastructure State

**Files:**
- Create: `src/core/infrastructure-sizing.ts`
- Create: `src/core/__tests__/infrastructure-sizing.spec.ts`
- Modify: `src/core/infrastructure.ts`
- Modify: `src/core/v1-topology.ts`
- Modify: `src/core/index.ts`
- Test: `src/core/__tests__/infrastructure-load.spec.ts`

**Interfaces:**
- Produces: `SERVER_SIZE_VALUES`, `NodeSizeProfile`, `nodeSizeProfile(productId, size)`, `InfrastructureState.nodeSize(nodeId)`, `InfrastructureState.resizeNode(nodeId, size)`, `InfrastructureState.nodeCapacity(nodeId)`, `InfrastructureState.nodeMonthlyCost(nodeId)`.
- Preserves: `AppCluster` / `DatabaseCluster` public capacity, cost, count/replica behavior while moving base tier data behind the catalog.

- [ ] **Step 1: Write failing catalog/state tests** proving ALB, Redis, queue, Local/Object Storage have four tiers, deployed technologies start SMALL, replacements reset to SMALL, resizing changes only the chosen node profile, and unknown/external IDs cannot resize.
- [ ] **Step 2: Run PR CI and verify RED** from missing generic sizing APIs.
- [ ] **Step 3: Implement `infrastructure-sizing.ts`** with product-specific tier profiles. Preserve APP base capacities 100/180/320/520 and costs 100k/200k/400k/800k before framework modifiers; preserve DB 80/150/270/450 and 120k/250k/500k/1m before database modifiers. Use the approved non-APP/DB capacity anchors and monotonic costs with current technology monthly cost as SMALL baseline.
- [ ] **Step 4: Move InfrastructureState technology node sizes into state** and implement clone/deploy/resize/cost semantics.
- [ ] **Step 5: Update V1 topology nodes** so every owned node publishes its actual independent capacity/monthly cost.
- [ ] **Step 6: Run CI and verify GREEN** before moving on.

### Task 2: Independent Node Load Semantics

**Files:**
- Modify: `src/core/infrastructure.ts`
- Test: `src/core/__tests__/infrastructure-load.spec.ts`
- Test: `src/core/__tests__/game-engine.spec.ts`

**Interfaces:**
- Consumes: `InfrastructureState.nodeCapacity(nodeId)` and current node sizes from Task 1.
- Produces: load snapshots whose ALB/Redis/Queue/Storage capacities are resolved from their own nodes.

- [ ] **Step 1: Write failing independence tests** for ALB S->M, Redis S->M, Queue S->M, Storage S->M and cross-node capacity invariance.
- [ ] **Step 2: Run CI and verify RED** because ALB/Redis still borrow APP/DB semantics.
- [ ] **Step 3: Refactor demand/capacity resolution** so APP/DB keep CPU/I/O, queue uses active queue throughput, storage uses storage tier, ALB uses its own throughput tier, and Redis throughput demand is based on read-heavy traffic routed through cache rather than DB capacity inversion.
- [ ] **Step 4: Keep Redis READ_HEAVY DB demand reduction and Kafka EVENT_HEAVY efficiency policies explicit.**
- [ ] **Step 5: Update maximum-prepared-infrastructure fixture** to explicitly size non-APP/DB nodes to XLARGE when testing maximum capacity.
- [ ] **Step 6: Run CI and verify GREEN.**

### Task 3: Generic Core/Application Scaling Commands

**Files:**
- Modify: `src/core/game-engine.ts`
- Modify: `src/application/game-controller.ts`
- Modify: `src/application/game-view.ts`
- Modify: `src/application/game-view-projector.ts`
- Modify: `src/application/game-service-projector.ts`
- Modify: `src/application/topology-view-projector.ts`
- Test: `src/core/__tests__/game-engine.spec.ts`
- Test: `src/application/__tests__/game-controller.spec.ts`
- Test: `src/application/__tests__/game-service-projector.spec.ts`
- Test: `src/application/__tests__/topology-view-projector.spec.ts`

**Interfaces:**
- Produces Core/Application commands: `resizeInfrastructureNode(nodeId, size)` and `scaleOutInfrastructureNode(nodeId)`.
- Produces `NodeScalingView` attached to `TopologyNodeView`, including current size, all tier options, monthly cost/capacity, and optional horizontal scale capability.
- Removes UI dependence on `appSize`, `appCount`, `dbSize`, `dbReplicaCount`, and `InfrastructureCostView` app/db-specific fields.

- [ ] **Step 1: Write failing Core/Application tests** for generic node-ID resize, exactly-one emitted view, node-local scaling projection on APP/DB/storage, and `scaling: null` for external service.
- [ ] **Step 2: Run CI and verify RED.**
- [ ] **Step 3: Implement generic GameEngine commands** delegating validation/mutation to `InfrastructureState` and refreshing load immediately.
- [ ] **Step 4: Implement generic GameController commands** and remove obsolete APP/DB-specific command call sites.
- [ ] **Step 5: Add `NodeScalingView`** to topology projection. Calculate size-option capacities/costs from cloned infrastructure so horizontal counts/replicas are reflected accurately without duplicating Core formulas.
- [ ] **Step 6: Remove the APP/DB-only infrastructure cost projection and legacy root view sizing fields once tests/call sites are migrated.**
- [ ] **Step 7: Run CI and verify GREEN.**

### Task 4: Generic Node Inspector Scaling UI

**Files:**
- Modify: `src/ui/NodeInspector.tsx`
- Modify: `src/ui/GameApp.tsx`
- Modify: `src/ui/__tests__/game-screens.spec.tsx`
- Create: `src/ui/__tests__/node-inspector.spec.tsx`

**Interfaces:**
- Consumes: `TopologyNodeView.scaling` only; no APP/DB size/cost rules in React.
- Produces callbacks: `onResizeNode(nodeId, size)` and `onScaleOutNode(nodeId)`.

- [ ] **Step 1: Write failing render tests** proving ALB/Redis/Queue/Storage inspectors render S/M/L/XL choices from generic scaling data, external service renders no sizing controls, and horizontal controls appear only when `scaleOut` exists.
- [ ] **Step 2: Run CI and verify RED.**
- [ ] **Step 3: Rewrite NodeInspector** to render generic tier cards from `node.scaling.sizeOptions`, display capacity/cost, and render generic INSTANCE/READ_REPLICA horizontal action from capability data.
- [ ] **Step 4: Rewire GameApp** to generic controller commands and preserve existing error/toast behavior.
- [ ] **Step 5: Run CI and verify GREEN.**

### Task 5: Cleanup, Regression, and Merge Gate

**Files:**
- Modify tests/docs only as required by verified behavior.
- Review all changed Core/Application/UI files from Tasks 1-4.

**Interfaces:**
- Final public operational path: `Service topology -> node -> Node Inspector -> resize/scale-out -> GameController -> GameEngine -> InfrastructureState`.

- [ ] **Step 1: Search for legacy public scaling APIs/fields** (`scaleApplication`, `scaleDatabase`, `addApplicationServer`, `addDatabaseReplica`, `appSize`, `dbSize`, `infrastructureCosts`) and remove stale production dependencies.
- [ ] **Step 2: Re-read the design spec and verify every Definition of Done item has a test or direct structural check.**
- [ ] **Step 3: Run fresh full validation:** `npm test`, `npm run typecheck`, `npm run build`.
- [ ] **Step 4: Compare `feature/playable-mvp...feature/node-scaling-engine`** and confirm changes are limited to the approved scaling engine/application/UI scope.
- [ ] **Step 5: Complete the development branch through PR review/CI and merge into `feature/playable-mvp` only after fresh green evidence.**
