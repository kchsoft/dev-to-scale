# Deterministic Balance Simulation Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, measurement-only balance harness that runs the real `GameEngine` across 5 frameworks × 3 databases × 30 seeds × 6 strategies and produces reproducible run-level and aggregate reports.

**Architecture:** `GameEngine` remains the sole game-rule authority. Core receives only two narrow capabilities required by the harness: optional incident RNG isolation and read-only capacity previews. Everything else lives under `src/simulation`: immutable observation adapters, deterministic strategies, shared learning/runway policy, a public-command executor, metrics, runner, reporting, and a `tsx` CLI.

**Tech Stack:** TypeScript 5.9+, Vitest 3.2+, Node.js filesystem APIs, `tsx`, existing Next.js 16.3.2 tooling.

**Spec:** `docs/superpowers/specs/2026-08-29-deterministic-balance-simulation-harness-design.md`

## Global Constraints

- Do not change game balance constants, economy constants, capacity constants, growth formulas, incident probabilities, or progression thresholds.
- Full default matrix is exactly 2,700 games: 5 frameworks × 3 databases × 30 seeds × 6 strategies.
- A run terminates at `WON`, `BANKRUPT`, or after exactly 1,080 successful `advanceDay()` calls; a still-running game then reports `TIMEOUT` without mutating engine status.
- Strategies are deterministic and never own or consume randomness.
- Feature order remains real `CommunityProgression`; strategies do not select features.
- Learning uses one shared nine-step baseline; strategies do not choose learning order.
- At most one normal operating investment action executes per simulated day. Incident response and viral response are separate control slots.
- Non-oracle strategies never receive `GameEngine`, `DeveloperProfile`, `InfrastructureState`, raw `GameSnapshot.load`, or other privileged live objects.
- `ORACLE` is a full-information local heuristic, not a proven optimum and not a multi-day search.
- Same-seed balance runs isolate organic-growth RNG consumption from topology-dependent incident RNG consumption.
- The full 2,700-run batch is not added to normal CI.
- `artifacts/balance/` is generated analysis output and remains uncommitted.

---

## File Structure

### Modify core

- `src/core/game-engine.ts` — optional `incidentRandom`, capacity preview APIs.
- `src/core/__tests__/game-engine.spec.ts` — preview non-mutation and config compatibility.
- `src/core/__tests__/game-engine-operational-growth.spec.ts` — RNG isolation.

### Create simulation package

- `src/simulation/balance-scenario.ts` — matrix, filters, seed-derived engine factory.
- `src/simulation/balance-action.ts` — explicit action union and stable action ID.
- `src/simulation/balance-observation.ts` — BASIC/METRICS/APM/ORACLE immutable views.
- `src/simulation/balance-strategy.ts` — strategy contracts, affordability policy, runway multipliers.
- `src/simulation/baseline-learning-controller.ts` — shared learning policy and protected reserve.
- `src/simulation/simulation-executor.ts` — public-command-only action execution and daily action slots.
- `src/simulation/strategy-helpers.ts` — candidate construction and stable ordering helpers.
- `src/simulation/strategies/oracle.ts`
- `src/simulation/strategies/apm-aware.ts`
- `src/simulation/strategies/metrics-aware.ts`
- `src/simulation/strategies/reactive-basic.ts`
- `src/simulation/strategies/yolo-scale.ts`
- `src/simulation/strategies/cheapskate.ts`
- `src/simulation/strategy-registry.ts` — fixed strategy registry/order.
- `src/simulation/simulation-metrics.ts` — accumulator and `BalanceRunResult`.
- `src/simulation/simulation-runner.ts` — deterministic daily loop and optional trace.
- `src/simulation/balance-report.ts` — statistics, groups, paired comparisons, CSV/JSON.
- `src/simulation/balance-cli.ts` — pure CLI argument parsing/filter validation.
- `src/simulation/index.ts` — CLI-facing exports.
- `scripts/run-balance.ts` — process I/O, execution, safe artifact writes.

### Create simulation tests

- `src/simulation/__tests__/balance-scenario.spec.ts`
- `src/simulation/__tests__/balance-observation.spec.ts`
- `src/simulation/__tests__/baseline-learning-controller.spec.ts`
- `src/simulation/__tests__/simulation-executor.spec.ts`
- `src/simulation/__tests__/strategies.spec.ts`
- `src/simulation/__tests__/simulation-metrics.spec.ts`
- `src/simulation/__tests__/simulation-runner.spec.ts`
- `src/simulation/__tests__/balance-report.spec.ts`
- `src/simulation/__tests__/balance-cli.spec.ts`

### Tooling

- Modify `package.json` — install `tsx`, add `balance` script.
- Modify `.gitignore` — add `artifacts/balance/`.

---

### Task 1: Add Compatibility-Preserving Incident RNG Isolation

**Files:**
- Modify: `src/core/game-engine.ts`
- Modify: `src/core/__tests__/game-engine.spec.ts`
- Modify: `src/core/__tests__/game-engine-operational-growth.spec.ts`

**Interfaces:**
- Consumes: `RandomSource`, existing `GameEngineConfig.random`.
- Produces: `GameEngineConfig.incidentRandom?: RandomSource` and a private incident RNG source.

- [ ] **Step 1: Write the failing independent-stream test**

Add this helper and test to `src/core/__tests__/game-engine-operational-growth.spec.ts`:

```ts
class CountingRandom implements RandomSource {
  calls = 0;
  constructor(private readonly value = 0.99) {}
  next(): number {
    this.calls += 1;
    return this.value;
  }
}

it('uses incidentRandom for incident rolls when configured', () => {
  const growth = new CountingRandom();
  const incidents = new CountingRandom();
  const engine = new GameEngine({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 7,
    random: growth,
    incidentRandom: incidents,
  });

  while (!engine.launched) engine.advanceDay();
  const before = incidents.calls;
  engine.advanceDay();

  expect(incidents.calls).toBeGreaterThan(before);
});
```

- [ ] **Step 2: Run the focused test**

```bash
npm test -- src/core/__tests__/game-engine-operational-growth.spec.ts
```

Expected: FAIL because `incidentRandom` is not part of `GameEngineConfig` yet.

- [ ] **Step 3: Implement the split with legacy fallback**

In `src/core/game-engine.ts`:

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
  // retain all existing initialization below
}
```

Change only incident generation to use `this.incidentRandom`:

```ts
const incident = this.incidentGenerator.tryGenerate(
  IncidentTopology.candidates(this.incidentTopologyContext()),
  this.incidents.activeNodeIds,
  this.incidentRandom,
  this.techDebt.incidentRiskMultiplier,
);
```

- [ ] **Step 4: Add a legacy-fallback regression test**

In `src/core/__tests__/game-engine.spec.ts`, construct an engine with only `random` and assert advancing a launched day consumes that object; do not require any caller to supply `incidentRandom`.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
npm test -- src/core/__tests__/game-engine.spec.ts src/core/__tests__/game-engine-operational-growth.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/game-engine.ts src/core/__tests__/game-engine.spec.ts src/core/__tests__/game-engine-operational-growth.spec.ts
git commit -m "refactor: isolate incident random source"
```

---

### Task 2: Add Read-Only Capacity Load Previews

**Files:**
- Modify: `src/core/game-engine.ts`
- Modify: `src/core/__tests__/game-engine.spec.ts`

**Interfaces:**
- Produces:
  - `previewLoadWithNodeResize(nodeId: InfrastructureNodeId, size: ServerSize): LoadSnapshot`
  - `previewLoadWithNodeScaleOut(nodeId: InfrastructureNodeId): LoadSnapshot`

- [ ] **Step 1: Write failing resize and scale-out non-mutation tests**

Add to `src/core/__tests__/game-engine.spec.ts`:

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

Also test DB scale-out keeps `replicaCount` unchanged and APP scale-out preview still throws when ALB is absent.

- [ ] **Step 2: Run the failing tests**

```bash
npm test -- src/core/__tests__/game-engine.spec.ts
```

Expected: FAIL because the preview methods do not exist.

- [ ] **Step 3: Implement clone-based previews**

```ts
previewLoadWithNodeResize(nodeId: InfrastructureNodeId, size: ServerSize): LoadSnapshot {
  const infrastructure = this.infrastructure.clone();
  infrastructure.resizeNode(nodeId, size);
  return this.calculateCurrentLoad(infrastructure);
}

previewLoadWithNodeScaleOut(nodeId: InfrastructureNodeId): LoadSnapshot {
  const infrastructure = this.infrastructure.clone();
  infrastructure.scaleOutNode(nodeId);
  return this.calculateCurrentLoad(infrastructure);
}
```

Do not catch validation errors from the cloned infrastructure.

- [ ] **Step 4: Run regression tests and typecheck**

```bash
npm test -- src/core/__tests__/game-engine.spec.ts src/core/__tests__/generic-scaling-commands.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/game-engine.ts src/core/__tests__/game-engine.spec.ts
git commit -m "feat: add infrastructure load previews"
```

---

### Task 3: Define Scenario Matrix, Stable RNG Streams, and Actions

**Files:**
- Create: `src/simulation/balance-scenario.ts`
- Create: `src/simulation/balance-action.ts`
- Create: `src/simulation/__tests__/balance-scenario.spec.ts`

**Interfaces:**

```ts
export type BalanceStrategyId =
  | 'ORACLE'
  | 'APM_AWARE'
  | 'METRICS_AWARE'
  | 'REACTIVE_BASIC'
  | 'YOLO_SCALE'
  | 'CHEAPSKATE';

export interface BalanceScenario {
  frameworkId: FrameworkId;
  databaseId: DatabaseId;
  seed: number;
  strategyId: BalanceStrategyId;
}
```

- [ ] **Step 1: Write failing matrix tests**

```ts
it('builds exactly 2700 default scenarios', () => {
  expect(buildBalanceScenarios()).toHaveLength(2700);
});

it('keeps stable framework -> database -> seed -> strategy ordering', () => {
  expect(buildBalanceScenarios()[0]).toEqual({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 1,
    strategyId: 'ORACLE',
  });
});
```

Add a filter test: `{ seed: 17, frameworkId: 'GIN' }` produces 18 scenarios.

- [ ] **Step 2: Run the failing test**

```bash
npm test -- src/simulation/__tests__/balance-scenario.spec.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement stable literal IDs and seed list**

```ts
export const BALANCE_FRAMEWORK_IDS = [
  'SPRING_BOOT', 'NESTJS', 'GIN', 'FASTAPI', 'ASPNET_CORE',
] as const;
export const BALANCE_DATABASE_IDS = ['POSTGRESQL', 'MYSQL', 'MONGODB'] as const;
export const FULL_BALANCE_SEEDS = Array.from({ length: 30 }, (_, index) => index + 1);
export const BALANCE_STRATEGY_IDS: readonly BalanceStrategyId[] = [
  'ORACLE', 'APM_AWARE', 'METRICS_AWARE', 'REACTIVE_BASIC', 'YOLO_SCALE', 'CHEAPSKATE',
];
```

Use nested loops in that exact order.

- [ ] **Step 4: Implement isolated deterministic engine construction**

```ts
export const GROWTH_STREAM_XOR = 0x51f15e5d;
export const INCIDENT_STREAM_XOR = 0x2c9277b5;

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

Add a test that locks the first three `next()` values of both streams for seed `17` using `SeededRandomSource`; once committed, those XOR constants become harness compatibility constants.

- [ ] **Step 5: Define the action union and stable IDs**

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

### Task 4: Enforce BASIC, METRICS, APM, and ORACLE Observation Boundaries

**Files:**
- Create: `src/simulation/balance-observation.ts`
- Create: `src/simulation/__tests__/balance-observation.spec.ts`
- Read/reuse: `src/application/operational-view-projector.ts`
- Regression test: `src/application/__tests__/generic-operational-view.spec.ts`

**Interfaces:**
- Produces: `BasicBalanceObservation`, `MetricsBalanceObservation`, `ApmBalanceObservation`, `OracleBalanceObservation`, `BalanceObservation`, `observeForStrategy()`.

- [ ] **Step 1: Write failing structural-boundary tests**

```ts
it('BASIC exposes neither resource loads nor diagnosis', () => {
  const observation = observeForStrategy(engine, 'BASIC');
  expect(observation.level).toBe('BASIC');
  expect('resourceLoads' in observation).toBe(false);
  expect('diagnosis' in observation).toBe(false);
  expect('engine' in observation).toBe(false);
  expect('rawLoad' in observation).toBe(false);
});
```

Add equivalent tests that METRICS exposes resource-level pressure but no diagnosis and APM exposes diagnosis only after the real skill unlock.

- [ ] **Step 2: Run the failing tests**

```bash
npm test -- src/simulation/__tests__/balance-observation.spec.ts
```

Expected: FAIL because the observation package does not exist.

- [ ] **Step 3: Define copied immutable common data**

Use primitives and read-only copied arrays only:

```ts
interface CommonBalanceObservation {
  readonly day: number;
  readonly dau: number;
  readonly cash: number;
  readonly monthlyInfrastructureCost: number;
  readonly failureRate: number;
  readonly currentTechnologyBuildId: BuildableTechnologyId | null;
  readonly growthEvent: null | {
    readonly type: 'VIRAL' | 'NEGATIVE_BUZZ';
    readonly response: TrafficSpikeResponseState;
    readonly loadMultiplier: number;
    readonly burstCost: number;
  };
  readonly nodes: readonly {
    readonly nodeId: InfrastructureNodeId;
    readonly kind: InfrastructureNodeKind;
    readonly size: ServerSize;
    readonly aggregatePercent: number;
  }[];
}
```

Never return the live topology graph or infrastructure object.

- [ ] **Step 4: Reuse the real observability unlock through `OperationalViewProjector`**

Build the current V1 topology from public state, call `OperationalViewProjector.project()`, then clamp the returned information to the strategy ceiling. Do not copy the unlock thresholds into simulation code.

- [ ] **Step 5: Add METRICS/APM-only copied fields**

METRICS gets copied node/resource load metrics. APM gets copied bottleneck/diagnosis information available from the existing operational projector/presenter path. Do not add hidden raw request traces merely because APM is privileged relative to BASIC.

- [ ] **Step 6: Add a narrow ORACLE preview port instead of the engine**

```ts
export interface OraclePreviewPort {
  previewTechnology(id: BuildableTechnologyId): LoadSnapshot;
  previewResize(nodeId: InfrastructureNodeId, size: ServerSize): LoadSnapshot;
  previewScaleOut(nodeId: InfrastructureNodeId): LoadSnapshot;
  projectedMonthlyCost(action: SimulationAction): number;
}
```

The adapter may close over the live engine internally, but the strategy receives only this port plus copied exact pressures/workload tags/topology identifiers.

- [ ] **Step 7: Lock strategy ceilings after higher unlocks**

Use the normal test fixture to reach/force the existing developer skill state expected by application tests, then assert a BASIC ceiling stays BASIC and a METRICS ceiling never gets APM diagnosis even when the player has APM.

- [ ] **Step 8: Run focused and application regression tests**

```bash
npm test -- src/simulation/__tests__/balance-observation.spec.ts src/application/__tests__/generic-operational-view.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/simulation/balance-observation.ts src/simulation/__tests__/balance-observation.spec.ts
git commit -m "feat: add balance observation ceilings"
```

---

### Task 5: Add Shared Learning, Runway Affordability, and Executor

**Files:**
- Create: `src/simulation/baseline-learning-controller.ts`
- Create: `src/simulation/balance-strategy.ts`
- Create: `src/simulation/simulation-executor.ts`
- Create: `src/simulation/__tests__/baseline-learning-controller.spec.ts`
- Create: `src/simulation/__tests__/simulation-executor.spec.ts`

**Interfaces:**
- Produces `BASELINE_LEARNING_STEPS`, `BaselineLearningController`, `RUNWAY_MULTIPLIER`, `isAffordableCandidate()`, `BalanceStrategy`, `SimulationExecutor`.

- [ ] **Step 1: Write the exact nine-step learning-order test**

```ts
expect(BASELINE_LEARNING_STEPS.map(({ skill, targetLevel }) => `${skill.id}:${targetLevel}`)).toEqual([
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

- [ ] **Step 2: Write reserve/eligibility tests**

Verify reserve equals `LearningRules.requirement()` cost for the next unfinished step, is `0` after all nine steps, waits for real experience/prerequisites, and starts learning only through `engine.startLearning()`.

- [ ] **Step 3: Implement the baseline controller**

`maybeStart(engine)` returns without action if learning is already active, requirements are unmet, or cash cannot pay the real learning cost. It never calls `setLevel()`.

- [ ] **Step 4: Lock the exact runway multipliers**

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

- [ ] **Step 5: Implement the shared affordability formula**

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

- [ ] **Step 6: Define the strategy contract**

```ts
export type ObservationCeiling = 'BASIC' | 'METRICS' | 'APM' | 'ORACLE';

export interface StrategyDecisionContext {
  readonly protectedLearningReserve: number;
}

export interface BalanceStrategy {
  readonly id: BalanceStrategyId;
  readonly ceiling: ObservationCeiling;
  decide(observation: BalanceObservation, context: StrategyDecisionContext): SimulationAction;
  decideViral(observation: BalanceObservation, context: StrategyDecisionContext): TrafficSpikeResponse;
}
```

- [ ] **Step 7: Write failing executor slot tests**

Verify one day may start one incident response, make one viral response, and execute one investment action, but a second normal investment action throws `Normal investment action already used for this day`.

- [ ] **Step 8: Implement public-command-only execution**

```ts
switch (action.type) {
  case 'RESIZE_NODE': engine.resizeInfrastructureNode(action.nodeId, action.size); break;
  case 'SCALE_OUT_NODE': engine.scaleOutInfrastructureNode(action.nodeId); break;
  case 'START_TECHNOLOGY_BUILD': engine.startTechnologyBuild(action.technologyId); break;
  case 'RESPOND_TRAFFIC_SPIKE': engine.respondToTrafficSpike(action.response); break;
  case 'NO_OP': break;
}
```

Do not swallow command errors. Incident response uses the first snapshot incident with `remainingResponseDays === null` only when no response is already active.

- [ ] **Step 9: Run tests and typecheck**

```bash
npm test -- src/simulation/__tests__/baseline-learning-controller.spec.ts src/simulation/__tests__/simulation-executor.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/simulation/baseline-learning-controller.ts src/simulation/balance-strategy.ts src/simulation/simulation-executor.ts src/simulation/__tests__/baseline-learning-controller.spec.ts src/simulation/__tests__/simulation-executor.spec.ts
git commit -m "feat: add balance simulation control policies"
```

---

### Task 6: Implement All Six Deterministic Strategies

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
- Consumes observation unions, affordability helper, action union.
- Produces one deterministic strategy object per ID and `BALANCE_STRATEGIES`.

- [ ] **Step 1: Build immutable observation fixture builders in the test file**

Create builders for BASIC, METRICS, APM, and ORACLE observations with stable node IDs, pressure values, affordability values, and no live engine references.

- [ ] **Step 2: Write six representative failing tests**

```ts
it('ORACLE chooses Redis for affordable read-heavy DB IO when ranking favors it');
it('APM fixes upstream ALB before speculative downstream scaling');
it('METRICS applies the ordered DB IO remedy without diagnosis');
it('REACTIVE_BASIC resizes the hottest aggregate node at 100 percent');
it('YOLO_SCALE expands at the 70 percent threshold');
it('CHEAPSKATE waits at or below the hard limit');
```

Add exact tie-break tests and all-candidates-invalid => `NO_OP` tests.

- [ ] **Step 3: Implement shared candidate helpers**

Helpers determine next size, node identity, scale-out availability, technology immediate cost, candidate projected monthly cost, and stable action ordering by calling real definitions/state exposed through observation/preview ports. Do not duplicate capacity or monthly-cost constants.

- [ ] **Step 4: Implement `REACTIVE_BASIC`**

Rules:

```text
highest aggregate load < 100% -> NO_OP
otherwise resize one step
APP at XLARGE -> ALB if absent, then APP scale-out
DB at XLARGE -> read replica
```

Use stable node ID as final tie-break.

- [ ] **Step 5: Implement `YOLO_SCALE`**

Rules:

```text
highest aggregate load < 70% -> NO_OP
otherwise raw resize/scale before specialized technology
prefer ALB + APP scale-out at medium pressure when affordable
prefer DB replica at medium pressure when affordable
viral -> BURST whenever runway=0 affordability allows it
```

- [ ] **Step 6: Implement `METRICS_AWARE`**

Ordered visible-resource remedies:

```text
DB IO -> Redis, replica, DB resize
DB CPU -> replica, DB resize
APP CPU -> ALB enablement, scale-out, APP resize
APP IO -> queue, scale-out, APP resize
Storage -> Object Storage, resize
```

Pick the first valid affordable action. Never call oracle previews.

- [ ] **Step 7: Implement `APM_AWARE`**

Use only APM-visible bottleneck/diagnosis. Construct diagnosis-supported remedies, filter valid/affordable candidates, then choose lowest projected one-month infrastructure cost. Do not inspect hidden downstream pressure.

- [ ] **Step 8: Implement `CHEAPSKATE`**

Return `NO_OP` until visible effective pressure exceeds `1.0`. Then choose the cheapest plausible valid correction under runway multiplier `2.0`. Viral policy: `RIDE` while healthy, `THROTTLE` when visible hard-limit risk exists, never `BURST` in V1.

- [ ] **Step 9: Implement `ORACLE` local preview ranking**

For bottleneck-specific candidates:

```ts
const relief = Math.max(0, currentMax - previewMax);
const oneMonthCost = immediateCost + Math.max(0, projectedMonthlyCost - currentMonthlyCost);
```

Ranking is exactly:

1. if any candidate yields `previewMax <= 0.85`, choose lowest `oneMonthCost`;
2. otherwise choose highest `relief / Math.max(1, oneMonthCost)`;
3. reject relief `< 0.02` unless the action is required ALB enablement;
4. exact ties use candidate order then `simulationActionId()`.

Technology preview represents fully deployed load effect, but the chosen action still calls the real delayed technology build.

- [ ] **Step 10: Implement fixed strategy registry**

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

- [ ] **Step 11: Run strategy tests and typecheck**

```bash
npm test -- src/simulation/__tests__/strategies.spec.ts
npm run typecheck
```

Expected: PASS and no strategy imports/uses a random source.

- [ ] **Step 12: Commit**

```bash
git add src/simulation/strategy-helpers.ts src/simulation/strategies src/simulation/strategy-registry.ts src/simulation/__tests__/strategies.spec.ts
git commit -m "feat: add deterministic balance strategies"
```

---

### Task 7: Implement Run Metrics and the Daily Simulation Loop

**Files:**
- Create: `src/simulation/simulation-metrics.ts`
- Create: `src/simulation/simulation-runner.ts`
- Create: `src/simulation/__tests__/simulation-metrics.spec.ts`
- Create: `src/simulation/__tests__/simulation-runner.spec.ts`

**Interfaces:**

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

- [ ] **Step 1: Write exact metric threshold tests**

Lock:

```text
failureRate > 0 -> failureDays
failureRate >= 0.10 -> severeFailureDays
sum(daily failureRate) -> cumulativeFailureBurden
any player-owned effective ratio > 1.0 -> overloadDays
pre-action target effective ratio < 0.70 and no active VIRAL -> prematureCapacityActions
expanded-node effective ratio < 0.50 -> lowUtilizationExpandedNodeDays node-day
```

Infrastructure exposure test:

```ts
collector.recordInfrastructureExposure(300_000);
expect(collector.infrastructureCostExposure).toBe(10_000);
```

- [ ] **Step 2: Implement metrics using real observed values**

Track incident IDs in a `Set<string>` so `incidentCount` counts generated incidents once. `settledInfrastructureSpend` adds each new `lastSettlement.infrastructureCost` once. `minimumCash` is observed after every command and after `advanceDay()`.

- [ ] **Step 3: Write failing determinism and 1,080-day-cap runner tests**

```ts
it('repeats the same scenario identically', () => {
  expect(runBalanceScenario(scenario)).toEqual(runBalanceScenario(scenario));
});

it('never performs more than 1080 advances', () => {
  expect(runBalanceScenario(timeoutFixture).daysPlayed).toBeLessThanOrEqual(1080);
});
```

Use injectable test factory dependencies for the timeout fixture instead of changing game constants.

- [ ] **Step 4: Implement the exact daily order**

```ts
while (engine.status === 'RUNNING' && daysPlayed < 1080) {
  metrics.observeStartOfDay(engine);
  executor.maybeStartIncidentResponse(engine);
  learningController.maybeStart(engine);

  const observation = observeForStrategy(engine, strategy.ceiling);
  executor.maybeRespondToViral(engine, strategy, observation, decisionContext);

  const refreshed = observeForStrategy(engine, strategy.ceiling);
  const action = strategy.decide(refreshed, decisionContext);
  executor.executeNormalInvestment(engine, action);

  metrics.observeBeforeAdvance(engine, action);
  engine.advanceDay();
  daysPlayed += 1;
  metrics.observeAfterAdvance(engine);
}
```

When the loop reaches 1,080 with engine status still `RUNNING`, report `TIMEOUT` only in the run result.

- [ ] **Step 5: Add scenario-rich failure context**

```ts
throw new Error(
  `[balance] ${scenario.frameworkId}/${scenario.databaseId}/seed=${scenario.seed}/strategy=${scenario.strategyId}/day=${engine.day}: ${message}`,
  { cause: error },
);
```

- [ ] **Step 6: Add optional trace collection**

Each trace entry copies: day, visible observability level, action ID, action reason, cash, DAU, hottest visible signal, incident control, viral control. Trace allocation is disabled by default.

- [ ] **Step 7: Run focused tests and typecheck**

```bash
npm test -- src/simulation/__tests__/simulation-metrics.spec.ts src/simulation/__tests__/simulation-runner.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/simulation/simulation-metrics.ts src/simulation/simulation-runner.ts src/simulation/__tests__/simulation-metrics.spec.ts src/simulation/__tests__/simulation-runner.spec.ts
git commit -m "feat: add deterministic balance simulation runner"
```

---

### Task 8: Implement Aggregation, Percentiles, Paired Comparisons, and CSV

**Files:**
- Create: `src/simulation/balance-report.ts`
- Create: `src/simulation/__tests__/balance-report.spec.ts`

**Interfaces:**
- Produces `summarizeBalanceRuns()`, `buildPairedComparisons()`, `serializeRunsCsv()`.

- [ ] **Step 1: Write percentile tests with a fixed nearest-rank definition**

```ts
function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}
```

Test mean, median, P25, P75 on `[1, 2, 3, 4, 5, 6, 7, 8]`.

- [ ] **Step 2: Write grouping tests**

A synthetic result set must produce summaries for:

```text
all
strategy
framework
database
framework × database
strategy × framework × database
```

Each group includes `WON`, `BANKRUPT`, `TIMEOUT` counts and rates.

- [ ] **Step 3: Write paired-comparison tests**

Primary pairs are exactly:

```ts
export const PRIMARY_STRATEGY_PAIRS = [
  ['APM_AWARE', 'YOLO_SCALE'],
  ['APM_AWARE', 'METRICS_AWARE'],
  ['METRICS_AWARE', 'REACTIVE_BASIC'],
  ['ORACLE', 'APM_AWARE'],
  ['CHEAPSKATE', 'APM_AWARE'],
] as const;
```

Pair only identical framework/database/seed groups. Compare terminal outcome, comparable win days, infrastructure exposure, failure burden, premature actions, and low-utilization node-days.

- [ ] **Step 4: Implement stable CSV escaping and column order**

```ts
function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
```

Use one explicit `BalanceRunResult` column array. No reporting dependency.

- [ ] **Step 5: Return JSON-serializable plain objects**

Convert grouping structures to arrays/records before returning. Do not expose `Map`, `Set`, or class instances in `summary.json` data.

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

### Task 9: Add CLI, Safe Artifact Writes, and `npm run balance`

**Files:**
- Create: `src/simulation/balance-cli.ts`
- Create: `src/simulation/index.ts`
- Create: `scripts/run-balance.ts`
- Create: `src/simulation/__tests__/balance-cli.spec.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**

```ts
export interface BalanceCliOptions {
  seed?: number;
  frameworkId?: FrameworkId;
  databaseId?: DatabaseId;
  strategyId?: BalanceStrategyId;
  trace: boolean;
}
```

- [ ] **Step 1: Write pure parser tests**

```ts
expect(parseBalanceArgs(['--seed', '17'])).toEqual({ seed: 17, trace: false });
expect(() => parseBalanceArgs(['--seed', '31'])).toThrow(/seed/i);
expect(() => parseBalanceArgs(['--framework', 'SPRING'])).toThrow(/SPRING/);
expect(() => parseBalanceArgs(['--db', 'POSTGRES'])).toThrow(/POSTGRES/);
expect(() => parseBalanceArgs(['--strategy', 'APM'])).toThrow(/APM/);
```

`--trace` is valid only when filters resolve to exactly one scenario; otherwise parsing/validation throws a clear error.

- [ ] **Step 2: Run the failing parser test**

```bash
npm test -- src/simulation/__tests__/balance-cli.spec.ts
```

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement pure argument parsing and scenario validation**

Recognized flags are only:

```text
--seed <1..30>
--framework <SPRING_BOOT|NESTJS|GIN|FASTAPI|ASPNET_CORE>
--db <POSTGRESQL|MYSQL|MONGODB>
--strategy <ORACLE|APM_AWARE|METRICS_AWARE|REACTIVE_BASIC|YOLO_SCALE|CHEAPSKATE>
--trace
```

Unknown flags and missing values throw.

- [ ] **Step 4: Install `tsx` and add script**

```bash
npm install -D tsx
```

Add to `package.json` scripts:

```json
"balance": "tsx scripts/run-balance.ts"
```

- [ ] **Step 5: Ignore balance artifacts**

Append to `.gitignore`:

```gitignore
artifacts/balance/
```

- [ ] **Step 6: Implement CLI execution and safe writes**

`src/simulation/index.ts` exports only the scenario builder, runner, report serializer, parser types/functions needed by the CLI.

In `scripts/run-balance.ts`, build requested scenarios, run them sequentially in stable order, summarize, then write temporary siblings before rename:

```ts
await mkdir('artifacts/balance', { recursive: true });
await writeFile('artifacts/balance/runs.csv.tmp', serializeRunsCsv(results), 'utf8');
await writeFile('artifacts/balance/summary.json.tmp', JSON.stringify(summary, null, 2) + '\n', 'utf8');
await rename('artifacts/balance/runs.csv.tmp', 'artifacts/balance/runs.csv');
await rename('artifacts/balance/summary.json.tmp', 'artifacts/balance/summary.json');
```

On any error, print the error and set `process.exitCode = 1`; final report paths must not be overwritten by partially completed output.

- [ ] **Step 7: Add concise console and trace output**

Normal mode prints requested run count, terminal rates, median winner days, and the primary APM-vs-YOLO paired deltas. Single-scenario `--trace` prints copied deterministic trace entries; it does not change simulation decisions.

- [ ] **Step 8: Run tests, typecheck, and one-scenario smoke run**

```bash
npm test -- src/simulation/__tests__/balance-cli.spec.ts
npm run typecheck
npm run balance -- --seed 17 --framework SPRING_BOOT --db POSTGRESQL --strategy APM_AWARE --trace
```

Expected: exactly one run, valid trace, one CSV row plus header, valid JSON summary.

- [ ] **Step 9: Commit**

```bash
git add package.json .gitignore scripts/run-balance.ts src/simulation/balance-cli.ts src/simulation/index.ts src/simulation/__tests__/balance-cli.spec.ts
git commit -m "feat: add balance simulation CLI"
```

---

### Task 10: Verify the Entire Harness and Produce Full-Matrix Evidence

**Files:**
- No planned source changes. If any verification gate fails, stop and return to the task that owns the failing behavior; fix it there with a failing regression test, rerun that task's gate, commit there, then restart Task 10 from Step 1.

**Interfaces:**
- Validates the complete implementation against the approved spec.

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all existing and new suites PASS.

- [ ] **Step 2: Run typecheck and production build**

```bash
npm run typecheck
npm run build
```

Expected: both PASS.

- [ ] **Step 3: Run the full matrix**

```bash
npm run balance
```

Expected: exactly 2,700 completed run results, no aborted/invalid run, final CSV/JSON created only after successful completion.

- [ ] **Step 4: Verify CSV row count mechanically**

```bash
node -e "const fs=require('fs');const n=fs.readFileSync('artifacts/balance/runs.csv','utf8').trimEnd().split('\n').length-1;if(n!==2700)throw new Error('expected 2700 rows, got '+n);console.log(n)"
```

Expected output:

```text
2700
```

- [ ] **Step 5: Verify deterministic rerun of one scenario**

```bash
npm run balance -- --seed 17 --framework SPRING_BOOT --db POSTGRESQL --strategy APM_AWARE
cp artifacts/balance/runs.csv /tmp/dev-to-scale-balance-run-a.csv
npm run balance -- --seed 17 --framework SPRING_BOOT --db POSTGRESQL --strategy APM_AWARE
diff -u /tmp/dev-to-scale-balance-run-a.csv artifacts/balance/runs.csv
```

Expected: `diff` prints nothing.

- [ ] **Step 6: Inspect four representative traces**

```bash
npm run balance -- --seed 17 --framework SPRING_BOOT --db POSTGRESQL --strategy ORACLE --trace
npm run balance -- --seed 17 --framework SPRING_BOOT --db POSTGRESQL --strategy APM_AWARE --trace
npm run balance -- --seed 17 --framework SPRING_BOOT --db POSTGRESQL --strategy YOLO_SCALE --trace
npm run balance -- --seed 17 --framework SPRING_BOOT --db POSTGRESQL --strategy CHEAPSKATE --trace
```

Confirm from trace output:

- ORACLE decisions cite full-information bottleneck/local-preview reasoning.
- APM never logs oracle-only hidden pressure.
- YOLO scales at its aggressive threshold and preserves only the protected learning reserve.
- CHEAPSKATE waits for hard-limit failure except shared incident/viral/learning controls.

- [ ] **Step 7: Inspect directional balance evidence without tuning**

Read `artifacts/balance/summary.json` and record findings for the PR description only. Check these six red flags exactly:

```text
1. YOLO faster + cheaper + safer than APM across most stack combinations.
2. BASIC and APM outcomes nearly indistinguishable.
3. Raw resize/scale-out consistently beats workload-fit technologies.
4. One framework or DB dominates nearly every strategy and seed.
5. Ordinary mistakes cause widespread bankruptcy.
6. Nearly every strategy wins comfortably with growing cash.
```

Do not edit balance values in this feature. Any red flag becomes a separate design/tuning task.

- [ ] **Step 8: Verify generated files stay out of git**

```bash
git status --short
```

Expected: no `artifacts/balance/` entry.

- [ ] **Step 9: Review the final code diff against scope**

```bash
git diff feature/playable-mvp...HEAD --stat
git diff feature/playable-mvp...HEAD -- src/core src/simulation scripts package.json .gitignore
```

Confirm:

- no core balance constant changes;
- no player-facing UI changes;
- no strategy randomness;
- no full-matrix CI workflow;
- only approved core interface additions plus simulation/tooling changes.
