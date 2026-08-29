# Deterministic Balance Simulation Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, measurement-only simulation harness that runs the real `GameEngine` across 5 frameworks × 3 databases × 30 seeds × 6 operating strategies and produces reproducible balance reports without tuning core game constants.

**Architecture:** Keep `GameEngine` as the sole game-rule authority. Add only two narrow core capabilities required by the harness—optional incident RNG isolation and read-only capacity previews—then build a separate `src/simulation` package that converts real game state into observation-limited immutable inputs, asks deterministic strategies for one operating decision per day, executes only public engine commands, collects metrics, and aggregates reports. A `tsx` CLI runs the full or filtered matrix and writes CSV/JSON artifacts outside normal CI.

**Tech Stack:** TypeScript 5.9+, Vitest 3.2+, Node.js filesystem APIs, `tsx` for the TypeScript CLI, existing Next.js 16.3.2 project tooling.

**Spec:** `docs/superpowers/specs/2026-08-29-deterministic-balance-simulation-harness-design.md`

## Global Constraints

- Measurement-only: do not change game balance constants, economy constants, capacity constants, growth formulas, incident probabilities, or feature requirements.
- Full matrix is exactly 5 frameworks × 3 databases × 30 seeds × 6 strategies = 2,700 games.
- Each simulation stops at `WON`, `BANKRUPT`, or after exactly 1,080 successful `advanceDay()` calls; running games then become `TIMEOUT`.
- Strategies are deterministic and must never own or consume a random source.
- Feature order remains the real seeded `CommunityProgression`; strategies do not select features.
- Learning follows one shared baseline policy; strategies do not choose learning order.
- At most one normal operating investment action may execute per simulated day; incident response and viral response are separate control slots.
- Non-oracle strategies must not receive `GameEngine`, `DeveloperProfile`, `InfrastructureState`, raw `GameSnapshot.load`, or any object that exposes information above their observation ceiling.
- `ORACLE` means a full-information local heuristic benchmark, not a proven optimum and not a multi-day search.
- Same-seed balance runs must isolate organic-growth RNG consumption from topology-dependent incident RNG consumption.
- Full 2,700-game execution is not added to normal CI.
- Generated `artifacts/balance/` outputs are not committed by default.

---

## File Map

### Core changes

- Modify `src/core/game-engine.ts` — accept optional `incidentRandom`, preserve shared-stream compatibility, and add read-only resize/scale-out load previews.
- Test `src/core/__tests__/game-engine.spec.ts` — compatibility and preview non-mutation.
- Test `src/core/__tests__/game-engine-operational-growth.spec.ts` — independent incident RNG cannot perturb the growth stream.

### Simulation package

- Create `src/simulation/balance-scenario.ts` — framework/database/seed/strategy matrix and seed-derived engine factory.
- Create `src/simulation/balance-action.ts` — explicit strategy action union and stable action IDs.
- Create `src/simulation/balance-observation.ts` — BASIC/METRICS/APM/ORACLE immutable observations and structural information ceilings.
- Create `src/simulation/balance-strategy.ts` — strategy interface, IDs, affordability/runway helpers, deterministic tie-breaking.
- Create `src/simulation/baseline-learning-controller.ts` — shared nine-step learning policy and protected learning reserve.
- Create `src/simulation/simulation-executor.ts` — public-command-only execution, incident/viral/investment slots, cost accounting hooks.
- Create `src/simulation/strategy-helpers.ts` — node/action candidate helpers shared by deterministic strategies.
- Create `src/simulation/strategies/oracle.ts`.
- Create `src/simulation/strategies/apm-aware.ts`.
- Create `src/simulation/strategies/metrics-aware.ts`.
- Create `src/simulation/strategies/reactive-basic.ts`.
- Create `src/simulation/strategies/yolo-scale.ts`.
- Create `src/simulation/strategies/cheapskate.ts`.
- Create `src/simulation/strategy-registry.ts` — stable strategy ordering and lookup.
- Create `src/simulation/simulation-metrics.ts` — run-level accumulator and result schema.
- Create `src/simulation/simulation-runner.ts` — deterministic daily loop and trace collection.
- Create `src/simulation/balance-report.ts` — percentile summaries, grouping, paired comparisons, CSV/JSON serialization.
- Create `src/simulation/index.ts` — CLI-facing exports only.

### Simulation tests

- Create `src/simulation/__tests__/balance-scenario.spec.ts`.
- Create `src/simulation/__tests__/balance-observation.spec.ts`.
- Create `src/simulation/__tests__/baseline-learning-controller.spec.ts`.
- Create `src/simulation/__tests__/simulation-executor.spec.ts`.
- Create `src/simulation/__tests__/strategies.spec.ts`.
- Create `src/simulation/__tests__/simulation-metrics.spec.ts`.
- Create `src/simulation/__tests__/simulation-runner.spec.ts`.
- Create `src/simulation/__tests__/balance-report.spec.ts`.

### CLI/tooling

- Create `scripts/run-balance.ts` — argument parsing, filtered/full execution, safe artifact write, concise console summary.
- Modify `package.json` — add `tsx` dev dependency and `balance` script.
- Modify `.gitignore` — ignore `artifacts/balance/`.
- Test `src/simulation/__tests__/balance-cli.spec.ts` — pure CLI parser/filter behavior without spawning the 2,700-run batch.

---

### Task 1: Isolate Incident RNG Without Breaking Existing Callers

**Files:**
- Modify: `src/core/game-engine.ts`
- Modify: `src/core/__tests__/game-engine.spec.ts`
- Modify: `src/core/__tests__/game-engine-operational-growth.spec.ts`

**Interfaces:**
- Consumes: existing `RandomSource`, `SeededRandomSource`, `GameEngineConfig.random`.
- Produces: `GameEngineConfig.incidentRandom?: RandomSource`; private `incidentRandom: RandomSource`; growth continues using the existing `random` source.

- [ ] **Step 1: Write a failing compatibility test for shared-stream fallback**

Add a small scripted random source in `src/core/__tests__/game-engine.spec.ts` and verify that when only `random` is supplied, both growth and incident generation consume that same object just as before.

```ts
class CountingRandom implements RandomSource {
  calls = 0;
  constructor(private readonly value = 0.99) {}
  next(): number {
    this.calls += 1;
    return this.value;
  }
}

it('keeps legacy shared RNG semantics when incidentRandom is omitted', () => {
  const random = new CountingRandom();
  const engine = new GameEngine({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 1,
    random,
  });

  while (!engine.launched) engine.advanceDay();
  const before = random.calls;
  engine.advanceDay();
  expect(random.calls).toBeGreaterThan(before);
});
```

- [ ] **Step 2: Run the focused test and verify the new config contract does not yet exist**

Run:

```bash
npm test -- src/core/__tests__/game-engine.spec.ts
```

Expected: the new independent-RNG test added in Step 3 will fail before implementation; all existing tests remain green.

- [ ] **Step 3: Write the failing independent-stream test**

In `src/core/__tests__/game-engine-operational-growth.spec.ts`, create distinct counting sources and assert incident generation consumes `incidentRandom` while the main source count matches the growth-only path.

```ts
it('uses an independent incident RNG when configured', () => {
  const growth = new CountingRandom(0.99);
  const incidents = new CountingRandom(0.99);
  const engine = new GameEngine({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 7,
    random: growth,
    incidentRandom: incidents,
  });

  while (!engine.launched) engine.advanceDay();
  const incidentCallsBefore = incidents.calls;
  engine.advanceDay();

  expect(incidents.calls).toBeGreaterThan(incidentCallsBefore);
  expect(growth).not.toBe(incidents);
});
```

- [ ] **Step 4: Implement the minimal compatibility-preserving split**

Change the config and constructor in `src/core/game-engine.ts`:

```ts
export interface GameEngineConfig {
  frameworkId: FrameworkId;
  databaseId: DatabaseId;
  seed: number;
  startingCash?: number;
  random?: RandomSource;
  incidentRandom?: RandomSource;
}

private readonly random: RandomSource;
private readonly incidentRandom: RandomSource;

constructor(readonly config: GameEngineConfig) {
  this.random = config.random ?? new SeededRandomSource(config.seed ^ 0x9e3779b9);
  this.incidentRandom = config.incidentRandom ?? this.random;
  // existing initialization unchanged
}
```

Then change only the incident generator call:

```ts
const incident = this.incidentGenerator.tryGenerate(
  IncidentTopology.candidates(this.incidentTopologyContext()),
  this.incidents.activeNodeIds,
  this.incidentRandom,
  this.techDebt.incidentRiskMultiplier,
);
```

- [ ] **Step 5: Run focused and full core tests**

Run:

```bash
npm test -- src/core/__tests__/game-engine.spec.ts src/core/__tests__/game-engine-operational-growth.spec.ts
npm run typecheck
```

Expected: PASS; existing callers without `incidentRandom` retain shared-stream behavior.

- [ ] **Step 6: Commit**

```bash
git add src/core/game-engine.ts src/core/__tests__/game-engine.spec.ts src/core/__tests__/game-engine-operational-growth.spec.ts
git commit -m "refactor: isolate incident random source"
```

---

### Task 2: Add Read-Only Capacity Preview Commands for ORACLE

**Files:**
- Modify: `src/core/game-engine.ts`
- Modify: `src/core/__tests__/game-engine.spec.ts`

**Interfaces:**
- Consumes: `InfrastructureState.clone()`, `resizeNode()`, `scaleOutNode()`, existing `calculateCurrentLoad()`.
- Produces:
  - `previewLoadWithNodeResize(nodeId: InfrastructureNodeId, size: ServerSize): LoadSnapshot`
  - `previewLoadWithNodeScaleOut(nodeId: InfrastructureNodeId): LoadSnapshot`

- [ ] **Step 1: Write failing preview non-mutation tests**

Add tests that capture live size/count/replicas, call a preview, and verify the live infrastructure remains unchanged while the returned load differs when the preview action is meaningful.

```ts
it('previews APP resize without mutating live infrastructure', () => {
  const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 1 });
  const appNodeId = V1_NODE_IDS.app('SPRING_BOOT');
  const beforeSize = engine.infrastructure.app.size;

  const preview = engine.previewLoadWithNodeResize(appNodeId, ServerSize.MEDIUM);

  expect(engine.infrastructure.app.size).toBe(beforeSize);
  expect(preview).not.toBe(engine.snapshot.load);
});
```

Add corresponding DB replica/APP scale-out coverage after deploying ALB in the test fixture.

- [ ] **Step 2: Run the focused test to verify missing-method failure**

```bash
npm test -- src/core/__tests__/game-engine.spec.ts
```

Expected: FAIL because the two preview methods do not exist.

- [ ] **Step 3: Implement resize preview using cloned infrastructure**

```ts
previewLoadWithNodeResize(nodeId: InfrastructureNodeId, size: ServerSize): LoadSnapshot {
  const infrastructure = this.infrastructure.clone();
  infrastructure.resizeNode(nodeId, size);
  return this.calculateCurrentLoad(infrastructure);
}
```

- [ ] **Step 4: Implement scale-out preview using cloned infrastructure**

```ts
previewLoadWithNodeScaleOut(nodeId: InfrastructureNodeId): LoadSnapshot {
  const infrastructure = this.infrastructure.clone();
  infrastructure.scaleOutNode(nodeId);
  return this.calculateCurrentLoad(infrastructure);
}
```

Do not catch invalid scale-out errors; the preview must preserve real infrastructure validation such as ALB requirement and replica/server limits.

- [ ] **Step 5: Run tests and typecheck**

```bash
npm test -- src/core/__tests__/game-engine.spec.ts src/core/__tests__/generic-scaling-commands.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/game-engine.ts src/core/__tests__/game-engine.spec.ts
git commit -m "feat: add infrastructure load previews"
```

---

### Task 3: Define Deterministic Scenarios, Actions, and Engine Factory

**Files:**
- Create: `src/simulation/balance-scenario.ts`
- Create: `src/simulation/balance-action.ts`
- Create: `src/simulation/__tests__/balance-scenario.spec.ts`

**Interfaces:**
- Produces:
  - `BalanceStrategyId = 'ORACLE' | 'APM_AWARE' | 'METRICS_AWARE' | 'REACTIVE_BASIC' | 'YOLO_SCALE' | 'CHEAPSKATE'`
  - `BalanceScenario { frameworkId; databaseId; seed; strategyId }`
  - `FULL_BALANCE_SEEDS = [1..30]`
  - `buildBalanceScenarios(filters?): BalanceScenario[]`
  - `createBalanceEngine(scenario): GameEngine`
  - `SimulationAction` discriminated union.

- [ ] **Step 1: Write the failing 2,700-cardinality and stable-order tests**

```ts
it('builds the complete 2700-game matrix', () => {
  const scenarios = buildBalanceScenarios();
  expect(scenarios).toHaveLength(2700);
  expect(scenarios[0]).toEqual({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 1,
    strategyId: 'ORACLE',
  });
});

it('filters without changing deterministic ordering', () => {
  const scenarios = buildBalanceScenarios({ seed: 17, frameworkId: 'GIN' });
  expect(scenarios).toHaveLength(18); // 3 DB × 6 strategies
  expect(new Set(scenarios.map((s) => s.seed))).toEqual(new Set([17]));
});
```

- [ ] **Step 2: Run the test and verify module-not-found failure**

```bash
npm test -- src/simulation/__tests__/balance-scenario.spec.ts
```

Expected: FAIL because the simulation modules do not exist.

- [ ] **Step 3: Implement stable constants and filters**

Use literal stable arrays:

```ts
export const BALANCE_FRAMEWORK_IDS = [
  'SPRING_BOOT', 'NESTJS', 'GIN', 'FASTAPI', 'ASPNET_CORE',
] as const;

export const BALANCE_DATABASE_IDS = ['POSTGRESQL', 'MYSQL', 'MONGODB'] as const;
export const FULL_BALANCE_SEEDS = Array.from({ length: 30 }, (_, index) => index + 1);
export const BALANCE_STRATEGY_IDS = [
  'ORACLE', 'APM_AWARE', 'METRICS_AWARE', 'REACTIVE_BASIC', 'YOLO_SCALE', 'CHEAPSKATE',
] as const;
```

Generate scenarios with nested loops in exactly framework → database → seed → strategy order.

- [ ] **Step 4: Implement two stable seed-derived RNG channels**

```ts
const GROWTH_STREAM_XOR = 0x51f15e5d;
const INCIDENT_STREAM_XOR = 0x2c9277b5;

export function createBalanceEngine(scenario: BalanceScenario): GameEngine {
  return new GameEngine({
    frameworkId: scenario.frameworkId,
    databaseId: scenario.databaseId,
    seed: scenario.seed,
    random: new SeededRandomSource(scenario.seed ^ GROWTH_STREAM_XOR),
    incidentRandom: new SeededRandomSource(scenario.seed ^ INCIDENT_STREAM_XOR),
  });
}
```

Lock the constants in tests by comparing the first several `next()` outputs for a known seed; do not later change them casually.

- [ ] **Step 5: Define the explicit action union and stable IDs**

```ts
export type SimulationAction =
  | { type: 'NO_OP'; reason: string }
  | { type: 'RESIZE_NODE'; nodeId: InfrastructureNodeId; size: ServerSize; reason: string }
  | { type: 'SCALE_OUT_NODE'; nodeId: InfrastructureNodeId; reason: string }
  | { type: 'START_TECHNOLOGY_BUILD'; technologyId: BuildableTechnologyId; reason: string }
  | { type: 'RESPOND_TRAFFIC_SPIKE'; response: TrafficSpikeResponse; reason: string };

export function simulationActionId(action: SimulationAction): string {
  switch (action.type) {
    case 'NO_OP': return 'NO_OP';
    case 'RESIZE_NODE': return `RESIZE_NODE:${action.nodeId}:${action.size}`;
    case 'SCALE_OUT_NODE': return `SCALE_OUT_NODE:${action.nodeId}`;
    case 'START_TECHNOLOGY_BUILD': return `START_TECHNOLOGY_BUILD:${action.technologyId}`;
    case 'RESPOND_TRAFFIC_SPIKE': return `RESPOND_TRAFFIC_SPIKE:${action.response}`;
  }
}
```

- [ ] **Step 6: Run tests and typecheck**

```bash
npm test -- src/simulation/__tests__/balance-scenario.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/simulation/balance-scenario.ts src/simulation/balance-action.ts src/simulation/__tests__/balance-scenario.spec.ts
git commit -m "feat: define deterministic balance scenarios"
```

---

### Task 4: Build Structural Observation Ceilings

**Files:**
- Create: `src/simulation/balance-observation.ts`
- Create: `src/simulation/__tests__/balance-observation.spec.ts`
- Read/Reuse: `src/application/operational-view-projector.ts`
- Read/Reuse: `src/application/operational-pressure-presenter.ts`

**Interfaces:**
- Consumes: `GameEngine`, `OperationalViewProjector`, `V1ServiceTopologyFactory`, public infrastructure getters.
- Produces immutable observation types that do not carry privileged objects:
  - `BasicBalanceObservation`
  - `MetricsBalanceObservation`
  - `ApmBalanceObservation`
  - `OracleBalanceObservation`
  - `observeForStrategy(engine, ceiling)`

- [ ] **Step 1: Write failing shape tests for BASIC/METRICS/APM**

Test with plain-object property assertions, not TypeScript-only assumptions:

```ts
it('does not expose resource signatures to BASIC', () => {
  const observation = observeForStrategy(engine, 'BASIC');
  expect(observation.level).toBe('BASIC');
  expect('resourceLoads' in observation).toBe(false);
  expect('diagnosis' in observation).toBe(false);
  expect('engine' in observation).toBe(false);
  expect('rawLoad' in observation).toBe(false);
});
```

Add METRICS resource-load presence and absence of APM diagnosis; add APM diagnosis only when the real developer state has unlocked APM.

- [ ] **Step 2: Run the failing test**

```bash
npm test -- src/simulation/__tests__/balance-observation.spec.ts
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Define immutable common fields**

Use primitives/read-only arrays only:

```ts
interface CommonBalanceObservation {
  readonly day: number;
  readonly dau: number;
  readonly cash: number;
  readonly monthlyInfrastructureCost: number;
  readonly failureRate: number;
  readonly growthEvent: null | {
    readonly type: 'VIRAL' | 'NEGATIVE_BUZZ';
    readonly response: TrafficSpikeResponseState;
    readonly loadMultiplier: number;
    readonly burstCost: number;
  };
  readonly currentTechnologyBuildId: BuildableTechnologyId | null;
  readonly nodes: readonly {
    readonly nodeId: InfrastructureNodeId;
    readonly kind: InfrastructureNodeKind;
    readonly size: ServerSize;
    readonly aggregatePercent: number;
    readonly status: 'NORMAL' | 'WARNING' | 'OVERLOAD';
  }[];
}
```

Do not return the live topology graph or live infrastructure object.

- [ ] **Step 4: Reuse `OperationalViewProjector` for the real unlock state**

Create topology from the current public state and call the real projector. Clamp the resulting view to the strategy ceiling rather than recomputing unlock thresholds in simulation code.

- [ ] **Step 5: Add METRICS and APM-only fields**

METRICS includes copied resource pressure records with node/resource/percent/effectivePercent/hardLimitPercent. APM adds copied bottleneck/diagnosis strings or structured diagnosis values derived from existing application presentation. Do not expose raw request traces to APM unless the current player-facing projector already exposes the required causal signal.

- [ ] **Step 6: Add a dedicated ORACLE adapter**

The oracle observation may include copied exact effective pressures, workload tags for active features, deployed technologies, horizontal scale state, current sizes/counts/replicas, and enough identifiers for local preview evaluation. It may hold a narrow `OraclePreviewPort` of pure functions, but must not expose the live engine object:

```ts
export interface OraclePreviewPort {
  previewTechnology(id: BuildableTechnologyId): LoadSnapshot;
  previewResize(nodeId: InfrastructureNodeId, size: ServerSize): LoadSnapshot;
  previewScaleOut(nodeId: InfrastructureNodeId): LoadSnapshot;
  projectedMonthlyCost(action: SimulationAction): number;
}
```

The port delegates to real clone/preview APIs.

- [ ] **Step 7: Test strategy ceilings remain enforced after APM unlock**

Force the developer proficiency in the test fixture through normal test setup helpers, then verify `REACTIVE_BASIC` still receives BASIC and `METRICS_AWARE` never receives diagnosis.

- [ ] **Step 8: Run tests and typecheck**

```bash
npm test -- src/simulation/__tests__/balance-observation.spec.ts src/application/__tests__/operational-view-projector.spec.ts
npm run typecheck
```

If the existing application test path has a different exact filename, use the repository's current `operational-view-projector` test filename discovered before editing; do not create a duplicate application test suite.

- [ ] **Step 9: Commit**

```bash
git add src/simulation/balance-observation.ts src/simulation/__tests__/balance-observation.spec.ts
git commit -m "feat: add balance observation ceilings"
```

---

### Task 5: Implement Shared Learning, Affordability, and Public Command Executor

**Files:**
- Create: `src/simulation/baseline-learning-controller.ts`
- Create: `src/simulation/balance-strategy.ts`
- Create: `src/simulation/simulation-executor.ts`
- Create: `src/simulation/__tests__/baseline-learning-controller.spec.ts`
- Create: `src/simulation/__tests__/simulation-executor.spec.ts`

**Interfaces:**
- Produces:
  - `BASELINE_LEARNING_STEPS`
  - `BaselineLearningController.nextReserve(engine): number`
  - `BaselineLearningController.maybeStart(engine): LearningStartResult`
  - `RUNWAY_MULTIPLIER` keyed by strategy ID.
  - `isAffordableCandidate(...)` using projected monthly cost.
  - `SimulationExecutor.executeDayControls(...)`.

- [ ] **Step 1: Write the failing nine-step learning-order test**

Lock this exact order:

```ts
const ids = BASELINE_LEARNING_STEPS.map(({ skill, targetLevel }) => `${skill.id}:${targetLevel}`);
expect(ids).toEqual([
  'OS_RUNTIME:2',
  'NETWORK:2',
  'SOFTWARE_DESIGN:2',
  'OS_RUNTIME:3',
  'DATABASE:2',
  'NETWORK:3',
  'SOFTWARE_DESIGN:3',
  'NETWORK:4',
  'OS_RUNTIME:4',
]);
```

- [ ] **Step 2: Write failing reserve and eligibility tests**

Verify the reserve equals the real `LearningRules.requirement()` cost for the next unfinished step, is zero after all steps, and `maybeStart()` never mutates level directly.

- [ ] **Step 3: Implement the controller using real learning rules**

`maybeStart()` returns without action while a task is already active, while experience/prerequisites are missing, or while real cash is below learning cost. When eligible it calls only:

```ts
engine.startLearning(step.skill);
```

- [ ] **Step 4: Define runway multipliers exactly as spec**

```ts
export const RUNWAY_MULTIPLIER: Readonly<Record<BalanceStrategyId, number>> = {
  ORACLE: 1,
  APM_AWARE: 1,
  METRICS_AWARE: 0.5,
  REACTIVE_BASIC: 0.25,
  YOLO_SCALE: 0,
  CHEAPSKATE: 2,
};
```

Implement:

```ts
export function isAffordableCandidate(input: {
  cash: number;
  immediateCost: number;
  protectedLearningReserve: number;
  projectedMonthlyInfrastructureCost: number;
  strategyId: BalanceStrategyId;
}): boolean {
  const cashAfterImmediateCost = input.cash - input.immediateCost;
  const requiredCashFloor = input.protectedLearningReserve
    + RUNWAY_MULTIPLIER[input.strategyId] * input.projectedMonthlyInfrastructureCost;
  return cashAfterImmediateCost >= requiredCashFloor;
}
```

- [ ] **Step 5: Write failing executor action-budget tests**

Test these invariants:

```ts
expect(executor.normalInvestmentActionsToday).toBeLessThanOrEqual(1);
```

Also verify an incident response and a viral response may occur on the same day without consuming the investment slot, and invalid scale-out/duplicate build errors are surfaced with context instead of skipped.

- [ ] **Step 6: Implement public-command-only execution**

Map actions exactly:

```ts
switch (action.type) {
  case 'RESIZE_NODE':
    engine.resizeInfrastructureNode(action.nodeId, action.size);
    break;
  case 'SCALE_OUT_NODE':
    engine.scaleOutInfrastructureNode(action.nodeId);
    break;
  case 'START_TECHNOLOGY_BUILD':
    engine.startTechnologyBuild(action.technologyId);
    break;
  case 'RESPOND_TRAFFIC_SPIKE':
    engine.respondToTrafficSpike(action.response);
    break;
  case 'NO_OP':
    break;
}
```

Incident response scans snapshot incidents for the first unresolved incident with `remainingResponseDays === null`; call `startIncidentResponse()` only when no response is already in progress.

- [ ] **Step 7: Run tests and typecheck**

```bash
npm test -- src/simulation/__tests__/baseline-learning-controller.spec.ts src/simulation/__tests__/simulation-executor.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/simulation/baseline-learning-controller.ts src/simulation/balance-strategy.ts src/simulation/simulation-executor.ts src/simulation/__tests__/baseline-learning-controller.spec.ts src/simulation/__tests__/simulation-executor.spec.ts
git commit -m "feat: add balance simulation control policies"
```

---

### Task 6: Implement the Six Deterministic Operating Strategies

**Files:**
- Create: `src/simulation/strategy-helpers.ts`
- Create: `src/simulation/strategies/oracle.ts`
- Create: `src/simulation/strategies/apm-aware.ts`
- Create: `src/simulation/strategies/metrics-aware.ts`
- Create: `src/simulation/strategies/reactive-basic.ts`
- Create: `src/simulation/strategies/yolo-scale.ts`
- Create: `src/simulation/strategies/cheapskate.ts`
- Create: `src/simulation/strategy-registry.ts`
- Create: `src/simulation/__tests__/strategies.spec.ts`

**Interfaces:**
- Consumes: observation types, affordability helper, protected reserve, `SimulationAction`.
- Produces:

```ts
export interface BalanceStrategy<TObservation extends BalanceObservation = BalanceObservation> {
  readonly id: BalanceStrategyId;
  readonly ceiling: 'BASIC' | 'METRICS' | 'APM' | 'ORACLE';
  decide(observation: TObservation, context: StrategyDecisionContext): SimulationAction;
  decideViral(observation: TObservation, context: StrategyDecisionContext): TrafficSpikeResponse;
}
```

- [ ] **Step 1: Build focused fixture builders before strategy tests**

In `strategies.spec.ts`, define plain immutable observations with explicit node/resource pressure and candidate affordability. Do not mutate a live engine just to construct every strategy unit test.

- [ ] **Step 2: Write the six representative failing behavior tests**

Lock at least these cases from the spec:

```ts
it('ORACLE chooses affordable Redis before DB resize for read-heavy DB I/O when local ranking favors it');
it('APM fixes an upstream ALB bottleneck before speculative APP/DB capacity');
it('METRICS chooses the ordered DB I/O remedy without APM diagnosis');
it('REACTIVE_BASIC resizes the hottest aggregate node at 100%');
it('YOLO_SCALE expands at the 70% threshold');
it('CHEAPSKATE waits while effective load is at or below 1.0');
```

Add deterministic tie-break coverage and verify each strategy returns `NO_OP` when its build slot/cash/preconditions make all candidates invalid.

- [ ] **Step 3: Implement common candidate helpers**

Provide helpers for next size, APP/DB node identification, scale-out availability, technology immediate cost, candidate projected monthly cost, and ordered candidate filtering. All cost/capacity values must come from real `InfrastructureState`/technology definitions, never duplicated constants.

- [ ] **Step 4: Implement `REACTIVE_BASIC` and `YOLO_SCALE` first**

`REACTIVE_BASIC`:

```text
highest aggregate load < 100% -> NO_OP
otherwise resize one step
APP at XLARGE -> ALB if absent, then scale-out
DB at XLARGE -> read replica
```

`YOLO_SCALE`:

```text
highest aggregate load < 70% -> NO_OP
otherwise raw resize/scale path before specialized technology
BURST when affordable under runway multiplier 0
```

Keep stable node ordering for exact ties.

- [ ] **Step 5: Implement `METRICS_AWARE`**

Use visible resource pressure only and ordered rules:

```text
DB IO -> Redis, replica, DB resize
DB CPU -> replica, DB resize
APP CPU -> ALB enablement, scale-out, APP resize
APP IO -> queue, scale-out, APP resize
Storage -> Object Storage, resize
```

Take the first valid affordable action; do not call oracle preview functions.

- [ ] **Step 6: Implement `APM_AWARE`**

Use only APM-visible top bottleneck/diagnosis. Create the diagnosis-supported remedy list, filter valid/affordable candidates, rank by lowest projected one-month infrastructure cost, and never inspect hidden downstream pressure.

- [ ] **Step 7: Implement `CHEAPSKATE`**

Return `NO_OP` unless the visible effective hard-limit condition is actually exceeded. Choose the cheapest plausible valid corrective action under the `2.0` runway multiplier. Viral behavior is `RIDE` while healthy and `THROTTLE` when visible risk is over the hard limit; do not choose `BURST` in V1.

- [ ] **Step 8: Implement `ORACLE` local candidate ranking**

For exact bottleneck-specific candidates calculate:

```ts
const relief = Math.max(0, currentMax - previewMax);
const oneMonthCost = immediateCost + Math.max(0, projectedMonthlyCost - currentMonthlyCost);
```

Ranking:

1. candidates with `previewMax <= 0.85`: cheapest `oneMonthCost`;
2. otherwise highest `relief / Math.max(1, oneMonthCost)`;
3. reject `< 0.02` relief unless enabling ALB;
4. exact ties: candidate order then `simulationActionId()`.

Technology preview may model fully deployed load but choosing it still invokes the real delayed `startTechnologyBuild()` command.

- [ ] **Step 9: Implement stable registry**

```ts
export const BALANCE_STRATEGIES: Readonly<Record<BalanceStrategyId, BalanceStrategy>> = {
  ORACLE: oracleStrategy,
  APM_AWARE: apmAwareStrategy,
  METRICS_AWARE: metricsAwareStrategy,
  REACTIVE_BASIC: reactiveBasicStrategy,
  YOLO_SCALE: yoloScaleStrategy,
  CHEAPSKATE: cheapskateStrategy,
};
```

- [ ] **Step 10: Run strategy tests and typecheck**

```bash
npm test -- src/simulation/__tests__/strategies.spec.ts
npm run typecheck
```

Expected: PASS with no randomized strategy decisions.

- [ ] **Step 11: Commit**

```bash
git add src/simulation/strategy-helpers.ts src/simulation/strategies src/simulation/strategy-registry.ts src/simulation/__tests__/strategies.spec.ts
git commit -m "feat: add deterministic balance strategies"
```

---

### Task 7: Add Run Metrics and the Deterministic Daily Runner

**Files:**
- Create: `src/simulation/simulation-metrics.ts`
- Create: `src/simulation/simulation-runner.ts`
- Create: `src/simulation/__tests__/simulation-metrics.spec.ts`
- Create: `src/simulation/__tests__/simulation-runner.spec.ts`

**Interfaces:**
- Produces `BalanceRunResult`, `SimulationTraceEntry`, `SimulationMetricsCollector`, and `runBalanceScenario(scenario, options?)`.

- [ ] **Step 1: Define the run result schema in a failing compile/test fixture**

The result must contain all spec metrics:

```ts
export interface BalanceRunResult {
  frameworkId: FrameworkId;
  databaseId: DatabaseId;
  seed: number;
  strategyId: BalanceStrategyId;
  terminalStatus: 'WON' | 'BANKRUPT' | 'TIMEOUT';
  daysPlayed: number;
  finalDau: number;
  endingCash: number;
  minimumCash: number;
  failureDays: number;
  severeFailureDays: number;
  cumulativeFailureBurden: number;
  overloadDays: number;
  incidentCount: number;
  technologyBuildSpend: number;
  learningSpend: number;
  burstSpend: number;
  settledInfrastructureSpend: number;
  infrastructureCostExposure: number;
  resizeCount: number;
  appScaleOutCount: number;
  dbReplicaActionCount: number;
  prematureCapacityActions: number;
  lowUtilizationExpandedNodeDays: number;
  viralRideCount: number;
  viralThrottleCount: number;
  viralBurstCount: number;
}
```

- [ ] **Step 2: Write threshold-specific failing metric tests**

Cover:

```ts
failureRate > 0              -> failureDays +1
failureRate >= 0.10          -> severeFailureDays +1
sum(failureRate)             -> cumulativeFailureBurden
max effective pressure > 1.0 -> overloadDays +1
pre-action target ratio < .70 and no VIRAL -> prematureCapacityActions +1
expanded node ratio < .50    -> one node-day of low utilization
```

Also test infrastructure exposure:

```ts
collector.recordDay({ monthlyInfrastructureCost: 300_000 });
expect(collector.infrastructureCostExposure).toBe(10_000);
```

- [ ] **Step 3: Implement action-cost accounting from deltas and real definitions**

Record learning/build/burst immediate spending when those commands execute. `settledInfrastructureSpend` is accumulated only from new monthly settlement snapshots; `infrastructureCostExposure` is `engine.infrastructure.monthlyCost / 30` each simulated day.

Track incident IDs ever observed in a `Set` so `incidentCount` counts generated incidents once, not incident-days.

- [ ] **Step 4: Write failing runner determinism and timeout tests**

```ts
it('repeats the same scenario identically', () => {
  const first = runBalanceScenario(scenario);
  const second = runBalanceScenario(scenario);
  expect(second).toEqual(first);
});

it('never advances more than 1080 days', () => {
  const result = runBalanceScenario(timeoutScenario);
  expect(result.daysPlayed).toBeLessThanOrEqual(1080);
});
```

For timeout testing, allow the runner factory to accept an injected engine/strategy fixture in tests rather than modifying game constants.

- [ ] **Step 5: Implement the daily loop in one explicit order**

```ts
while (engine.status === 'RUNNING' && daysPlayed < 1080) {
  metrics.observeStartOfDay(engine);
  executor.maybeStartIncidentResponse(engine);
  learningController.maybeStart(engine);

  const observation = observeForStrategy(engine, strategy.ceiling);
  executor.maybeRespondToViral(engine, strategy, observation);

  const refreshedObservation = observeForStrategy(engine, strategy.ceiling);
  const action = strategy.decide(refreshedObservation, decisionContext);
  executor.executeNormalInvestment(engine, action);

  metrics.observeBeforeAdvance(engine, action);
  engine.advanceDay();
  daysPlayed += 1;
  metrics.observeAfterAdvance(engine);
}
```

If still running at 1,080 advances, return `TIMEOUT` without mutating `GameEngine.status`.

- [ ] **Step 6: Wrap thrown errors with full scenario context**

```ts
throw new Error(
  `[balance] ${scenario.frameworkId}/${scenario.databaseId}/seed=${scenario.seed}/strategy=${scenario.strategyId}/day=${engine.day}: ${message}`,
  { cause: error },
);
```

- [ ] **Step 7: Add optional deterministic trace entries**

Record day, observability level, selected action ID, reason, cash, DAU, hottest visible signal, and viral/incident controls. Do not enable trace collection by default for the full matrix.

- [ ] **Step 8: Run focused tests and typecheck**

```bash
npm test -- src/simulation/__tests__/simulation-metrics.spec.ts src/simulation/__tests__/simulation-runner.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/simulation/simulation-metrics.ts src/simulation/simulation-runner.ts src/simulation/__tests__/simulation-metrics.spec.ts src/simulation/__tests__/simulation-runner.spec.ts
git commit -m "feat: add deterministic balance simulation runner"
```

---

### Task 8: Aggregate Reports and Same-Seed Paired Comparisons

**Files:**
- Create: `src/simulation/balance-report.ts`
- Create: `src/simulation/__tests__/balance-report.spec.ts`

**Interfaces:**
- Produces:
  - `summarizeBalanceRuns(runs): BalanceSummary`
  - `serializeRunsCsv(runs): string`
  - `buildPairedComparisons(runs): PairedComparisonSummary[]`

- [ ] **Step 1: Write failing percentile tests with an exact sample**

Use a sorted sample where quartiles are unambiguous and define the percentile algorithm explicitly as nearest-rank interpolation-free selection:

```ts
function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}
```

Test mean, median, P25, and P75 from the same sample.

- [ ] **Step 2: Write failing grouping tests**

Given a tiny synthetic result set, require groups for:

```text
all
strategy
framework
database
framework × database
strategy × framework × database
```

Terminal outcome summaries contain counts and rates for `WON`, `BANKRUPT`, and `TIMEOUT`.

- [ ] **Step 3: Write failing same-seed pairing tests**

Ensure comparisons only pair runs with identical framework/database/seed. Primary pairs:

```ts
const PRIMARY_PAIRS = [
  ['APM_AWARE', 'YOLO_SCALE'],
  ['APM_AWARE', 'METRICS_AWARE'],
  ['METRICS_AWARE', 'REACTIVE_BASIC'],
  ['ORACLE', 'APM_AWARE'],
  ['CHEAPSKATE', 'APM_AWARE'],
] as const;
```

Calculate direction/delta for outcome, comparable win days, infrastructure exposure, failure burden, premature actions, and low-utilization node-days.

- [ ] **Step 4: Implement RFC-4180-safe-enough CSV escaping without a dependency**

```ts
function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
```

Use one stable column order matching `BalanceRunResult`. A full unfiltered serialization has 2,701 lines when every row is one physical line.

- [ ] **Step 5: Implement JSON-friendly summary objects**

Avoid class instances and Maps in returned report data; convert grouped summaries into plain arrays/objects so `JSON.stringify(summary, null, 2)` is stable.

- [ ] **Step 6: Run report tests and typecheck**

```bash
npm test -- src/simulation/__tests__/balance-report.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/simulation/balance-report.ts src/simulation/__tests__/balance-report.spec.ts
git commit -m "feat: add balance simulation reports"
```

---

### Task 9: Add CLI, Artifact Safety, and Tooling

**Files:**
- Create: `scripts/run-balance.ts`
- Create: `src/simulation/index.ts`
- Create: `src/simulation/__tests__/balance-cli.spec.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- CLI flags:
  - `--seed <1..30>`
  - `--framework <supported-id>`
  - `--db <supported-id>`
  - `--strategy <supported-id>`
  - `--trace`
- Default output:
  - `artifacts/balance/runs.csv`
  - `artifacts/balance/summary.json`

- [ ] **Step 1: Extract a pure argument parser and write failing tests**

Keep parsing importable from the script or move the pure parser into `src/simulation/balance-cli.ts` if importing `scripts/` from tests becomes awkward. Required behavior:

```ts
expect(parseBalanceArgs(['--seed', '17'])).toEqual({ seed: 17, trace: false });
expect(() => parseBalanceArgs(['--seed', '31'])).toThrow(/seed/i);
expect(() => parseBalanceArgs(['--framework', 'SPRING'])).toThrow(/SPRING/);
```

If `--trace` is requested without filters that resolve to exactly one scenario, reject it with a clear error instead of emitting thousands of trace lines.

- [ ] **Step 2: Install `tsx` and add the script**

Run:

```bash
npm install -D tsx
```

Then set:

```json
"balance": "tsx scripts/run-balance.ts"
```

Do not add CSV/statistics dependencies.

- [ ] **Step 3: Ignore generated balance artifacts**

Append exactly:

```gitignore
artifacts/balance/
```

- [ ] **Step 4: Implement filtered/full execution**

```ts
const scenarios = buildBalanceScenarios(filters);
const runs = scenarios.map((scenario) => runBalanceScenario(scenario, { trace }));
const summary = summarizeBalanceRuns(runs.map(({ result }) => result));
```

For non-trace runs return only `BalanceRunResult`; if the runner API uses a `{ result, trace }` wrapper, make the no-trace path avoid allocating trace arrays.

- [ ] **Step 5: Implement safe artifact writes**

Create `artifacts/balance`, write `.tmp` siblings first, then rename only after both serializations succeed:

```ts
await writeFile(`${runsPath}.tmp`, serializeRunsCsv(results), 'utf8');
await writeFile(`${summaryPath}.tmp`, JSON.stringify(summary, null, 2) + '\n', 'utf8');
await rename(`${runsPath}.tmp`, runsPath);
await rename(`${summaryPath}.tmp`, summaryPath);
```

On failure, set a non-zero exit code and print scenario/error context; do not silently emit partial final files.

- [ ] **Step 6: Add concise console summary and trace output**

Print requested run count, terminal rates, median win days for winners, and primary APM-vs-YOLO paired deltas. `--trace` prints one line per day with deterministic action IDs and reasons.

- [ ] **Step 7: Run CLI parser tests, typecheck, and a one-scenario smoke run**

```bash
npm test -- src/simulation/__tests__/balance-cli.spec.ts
npm run typecheck
npm run balance -- --seed 17 --framework SPRING_BOOT --db POSTGRESQL --strategy APM_AWARE --trace
```

Expected: one scenario completes without invalid actions; trace is emitted; final CSV/JSON files are valid and contain one run.

- [ ] **Step 8: Commit**

```bash
git add package.json .gitignore scripts/run-balance.ts src/simulation/index.ts src/simulation/__tests__/balance-cli.spec.ts src/simulation/balance-cli.ts
git commit -m "feat: add balance simulation CLI"
```

If the pure parser remains inside `scripts/run-balance.ts`, omit `src/simulation/balance-cli.ts` from the add list rather than creating an unnecessary file.

---

### Task 10: End-to-End Verification and Full Matrix Evidence

**Files:**
- Modify only if verification exposes a concrete bug in files from Tasks 1–9.
- Do not commit `artifacts/balance/`.

**Interfaces:**
- Validates the complete spec against the assembled implementation.

- [ ] **Step 1: Run the entire unit/integration suite**

```bash
npm test
```

Expected: all existing and new Vitest suites PASS.

- [ ] **Step 2: Run typecheck and production build**

```bash
npm run typecheck
npm run build
```

Expected: both PASS.

- [ ] **Step 3: Run the full 2,700-game matrix**

```bash
npm run balance
```

Expected:

- exactly 2,700 result rows,
- no aborted/invalid runs,
- `runs.csv` and `summary.json` written only after successful completion,
- all expected grouping dimensions present.

- [ ] **Step 4: Verify row count mechanically**

```bash
node -e "const fs=require('fs'); const n=fs.readFileSync('artifacts/balance/runs.csv','utf8').trimEnd().split('\n').length-1; if(n!==2700){throw new Error('expected 2700 rows, got '+n)} console.log(n)"
```

Expected output:

```text
2700
```

- [ ] **Step 5: Verify reproducibility on a representative run**

Run twice:

```bash
npm run balance -- --seed 17 --framework SPRING_BOOT --db POSTGRESQL --strategy APM_AWARE
cp artifacts/balance/runs.csv /tmp/balance-run-a.csv
npm run balance -- --seed 17 --framework SPRING_BOOT --db POSTGRESQL --strategy APM_AWARE
diff -u /tmp/balance-run-a.csv artifacts/balance/runs.csv
```

Expected: `diff` produces no output.

- [ ] **Step 6: Inspect representative traces**

Run:

```bash
npm run balance -- --seed 17 --framework SPRING_BOOT --db POSTGRESQL --strategy ORACLE --trace
npm run balance -- --seed 17 --framework SPRING_BOOT --db POSTGRESQL --strategy APM_AWARE --trace
npm run balance -- --seed 17 --framework SPRING_BOOT --db POSTGRESQL --strategy YOLO_SCALE --trace
npm run balance -- --seed 17 --framework SPRING_BOOT --db POSTGRESQL --strategy CHEAPSKATE --trace
```

Verify manually that:

- ORACLE reasons reference full-information bottlenecks/local previews;
- APM never reports hidden oracle-only data;
- YOLO expands at its aggressive threshold and preserves only the protected learning reserve;
- CHEAPSKATE does not spend before actual failure except required common controls.

- [ ] **Step 7: Inspect directional balance evidence without tuning**

Read `summary.json` and record observations for the PR description only. Specifically check the spec red flags:

```text
YOLO faster + cheaper + safer than APM across most stacks?
BASIC nearly identical to APM?
raw resize consistently beats workload-fit technologies?
one framework/database dominates nearly every strategy/seed?
widespread bankruptcy after ordinary mistakes?
nearly every strategy wins with growing cash?
```

Do **not** edit balance constants in response. Any red flag becomes a separate follow-up design.

- [ ] **Step 8: Check git cleanliness for generated artifacts**

```bash
git status --short
```

Expected: no `artifacts/balance/` files appear because they are ignored.

- [ ] **Step 9: If verification required fixes, rerun all gates and commit the fix**

After any concrete fix:

```bash
npm test && npm run typecheck && npm run build
```

Then rerun the affected balance smoke/full command and commit only the verified fix:

```bash
git add <changed-source-and-test-files>
git commit -m "fix: correct balance simulation verification issue"
```

- [ ] **Step 10: Final diff review against the spec**

Run:

```bash
git diff feature/playable-mvp...HEAD --stat
git diff feature/playable-mvp...HEAD -- src/core src/simulation scripts package.json .gitignore
```

Verify:

- no core balance constant changes,
- no player-facing UI changes,
- no strategy randomness,
- no full matrix in CI,
- only approved core interface additions plus simulation/tooling changes.
