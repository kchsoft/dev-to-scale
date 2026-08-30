# Balance Pass 2 — Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make informed strategies prevent pending-feature dependency and capacity failures before release, then prove the behavior with deterministic prevention metrics and the balance matrix.

**Architecture:** Extend `balance-observation` with pending-feature metadata and level-specific read-only release previews. Reuse `GameEngine`'s live load calculator and add exact combined pending-feature + infrastructure-action previews for ORACLE. Tag preventative simulation actions explicitly and measure seven-day post-release health in the existing runner.

**Tech Stack:** TypeScript, Vitest, deterministic balance runner, GitHub Actions one-off evidence workflows.

**Spec:** `docs/superpowers/specs/2026-08-30-balance-pass-2-release-readiness-design.md`

## Global Constraints

- Freeze Balance Pass 1 constants: progression final `3_000_000`, phase-3 probability `0.58`, exit target `143_000_000`, ALB XLARGE throughput `1_800`.
- Do not change the 1,080-day horizon, starting cash, feature workloads/revenue, incident or viral probabilities, prices, framework/database modifiers, build costs/durations, learning rules/order, or automatic release timing.
- Keep post-release REQUIRED dependency recovery for all strategies.
- BASIC gets no projected resource load; METRICS gets no diagnosis/exact internals; APM gets no exact internals.
- Preview paths must be read-only, consume no RNG, and use the same load calculator as live state.
- Every behavior slice starts with a failing test and is committed only after the focused test is green.
- The 450-run pilot and 2,700-run full matrix remain temporary workflows outside normal PR CI.

## File Responsibilities

- `src/core/game-engine.ts`: exact combined pending-feature + technology/resize/scale-out previews.
- `src/core/__tests__/game-engine.spec.ts`: preview correctness, state immutability, RNG non-consumption.
- `src/simulation/balance-action.ts`: preventative action intent metadata.
- `src/simulation/balance-observation.ts`: pending feature, upcoming dependency gaps, METRICS/APM/ORACLE release previews.
- `src/simulation/__tests__/balance-observation.spec.ts`: observation boundaries and projection contracts.
- `src/simulation/release-readiness.ts`: shared preventative dependency selection and intent tagging.
- `src/simulation/__tests__/release-readiness.spec.ts`: shared readiness helper contracts.
- `src/simulation/simulation-metrics.ts`: preventative and post-release health metrics.
- `src/simulation/simulation-runner.ts`: release-window detection and successful preventative-action accounting.
- `src/simulation/strategies/{metrics-aware,apm-aware,oracle}.ts`: strategy-specific projected readiness decisions.
- `src/simulation/__tests__/{simulation-metrics,simulation-runner,strategies}.spec.ts`: metrics/runner/strategy regressions.

---

### Task 1: Pending Feature and Upcoming Dependency Observation

**Files:**
- Modify: `src/simulation/balance-observation.ts`
- Test: `src/simulation/__tests__/balance-observation.spec.ts`

**Interfaces:**

```ts
export interface PendingFeatureObservation {
  readonly id: CommunityFeatureId;
  readonly estimatedRemainingDays: number;
  readonly requiredResourceRoles: readonly ResourceRole[];
}
```

`CommonBalanceObservation` gains:

```ts
readonly pendingFeature: PendingFeatureObservation | null;
readonly upcomingRequiredDependencyGaps: readonly RequiredDependencyGapObservation[];
```

- [ ] **Step 1: Write the failing observation test**

Use the existing deterministic engine helpers in `balance-observation.spec.ts` to reach a queue-required pending feature. Assert:

```ts
expect(observation.pendingFeature).toMatchObject({
  requiredResourceRoles: ['EVENT_BUS'],
});
expect(observation.pendingFeature?.estimatedRemainingDays).toBeGreaterThan(0);
expect(observation.upcomingRequiredDependencyGaps[0]).toMatchObject({
  role: 'EVENT_BUS',
  candidateTechnologyIds: ['SQS', 'RABBITMQ', 'KAFKA'],
});
expect('releasePreview' in observation).toBe(false);
```

- [ ] **Step 2: Run RED**

```bash
npm test -- src/simulation/__tests__/balance-observation.spec.ts
```

Expected: missing pending/upcoming observation fields.

- [ ] **Step 3: Implement pending feature projection**

Resolve `engine.snapshot.currentFeature?.id` through `COMMUNITY_FEATURES`. Exclude bootstrap/no-task. Derive REQUIRED roles from `feature.requestRoute`.

For upcoming gaps, compute `engine.previewLoadWithFeature(feature)` and pass that load into the same `requiredDependencyGaps(load)` function used for live gaps.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm test -- src/simulation/__tests__/balance-observation.spec.ts
git add src/simulation/balance-observation.ts src/simulation/__tests__/balance-observation.spec.ts
git commit -m "feat: expose pending release dependencies"
```

---

### Task 2: METRICS and APM Release Preview

**Files:**
- Modify: `src/simulation/balance-observation.ts`
- Test: `src/simulation/__tests__/balance-observation.spec.ts`

**Interfaces:**

```ts
export interface MetricsReleasePreview {
  readonly resourceLoads: readonly BalanceResourceLoadObservation[];
  readonly maxEffectivePercent: number;
}

export interface ApmReleasePreview extends MetricsReleasePreview {
  readonly diagnosis: BalanceDiagnosisObservation;
}
```

- [ ] **Step 1: Write RED ceiling tests**

Assert a METRICS observation with a pending feature has resource preview but no diagnosis:

```ts
const metrics = observeForStrategy(engine, 'METRICS');
if (metrics.level !== 'METRICS') throw new Error('expected METRICS');
expect(metrics.releasePreview?.resourceLoads.length).toBeGreaterThan(0);
expect(metrics.releasePreview?.maxEffectivePercent).toBeGreaterThanOrEqual(0);
expect('diagnosis' in (metrics.releasePreview ?? {})).toBe(false);
```

Assert APM gains diagnosis but no exact pressures:

```ts
const apm = observeForStrategy(engine, 'APM');
if (apm.level !== 'APM') throw new Error('expected APM');
expect(apm.releasePreview).not.toBeNull();
expect('exactPressures' in (apm.releasePreview ?? {})).toBe(false);
```

- [ ] **Step 2: Run RED**

Expected: `releasePreview` does not exist.

- [ ] **Step 3: Extract projection helpers**

Refactor current live resource projection into:

```ts
function resourceObservationsFromLoad(
  load: LoadSnapshot,
): readonly BalanceResourceLoadObservation[];
```

For APM diagnosis, create a projected snapshot with `load` replaced by `engine.previewLoadWithFeature(feature)` and build projected topology from current active features plus the pending feature. Pass that projected snapshot/topology through `OperationalViewProjector` so diagnosis labels and thresholds remain consistent with live APM.

- [ ] **Step 4: Attach by ceiling only**

- BASIC: no `releasePreview` member.
- METRICS: `MetricsReleasePreview`.
- APM: `ApmReleasePreview`.
- ORACLE: temporarily uses the APM shape until Task 3 extends it.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm test -- src/simulation/__tests__/balance-observation.spec.ts
git add src/simulation/balance-observation.ts src/simulation/__tests__/balance-observation.spec.ts
git commit -m "feat: project pending release load"
```

---

### Task 3: Exact ORACLE Combined Preview

**Files:**
- Modify: `src/core/game-engine.ts`
- Modify: `src/simulation/balance-observation.ts`
- Test: `src/core/__tests__/game-engine.spec.ts`
- Test: `src/simulation/__tests__/balance-observation.spec.ts`

**Core interfaces:**

```ts
previewLoadWithFeatureAndTechnology(
  feature: FeatureDefinition,
  id: BuildableTechnologyId,
): LoadSnapshot;

previewLoadWithFeatureAndNodeResize(
  feature: FeatureDefinition,
  nodeId: InfrastructureNodeId,
  size: ServerSize,
): LoadSnapshot;

previewLoadWithFeatureAndNodeScaleOut(
  feature: FeatureDefinition,
  nodeId: InfrastructureNodeId,
): LoadSnapshot;
```

**Simulation interface:**

```ts
interface OraclePreviewPort {
  // existing methods remain
  previewReleaseAction(action: SimulationAction): LoadSnapshot;
}
```

- [ ] **Step 1: Write RED core tests using existing test fixtures**

Use `launchedGame()`, `V1_NODE_IDS.app('SPRING_BOOT')`, `ServerSize.XLARGE`, and a concrete `COMMUNITY_FEATURES` value.

Capture:

```ts
const before = game.snapshot;
const cashBefore = game.snapshot.cash;
const sizeBefore = game.infrastructure.nodeSize(appNodeId);
```

Call each combined preview and assert the returned load changes where expected while:

```ts
expect(game.snapshot).toEqual(before);
expect(game.snapshot.cash).toBe(cashBefore);
expect(game.infrastructure.nodeSize(appNodeId)).toBe(sizeBefore);
```

- [ ] **Step 2: Add an RNG non-consumption test**

Use the existing `CountingRandom` fixture:

```ts
const random = new CountingRandom();
const game = launchedGame(31, random);
const callsBefore = random.calls;
game.previewLoadWithFeatureAndNodeResize(
  COMMUNITY_FEATURES.SEARCH,
  V1_NODE_IDS.app('SPRING_BOOT'),
  ServerSize.XLARGE,
);
expect(random.calls).toBe(callsBefore);
```

- [ ] **Step 3: Run RED**

Expected: combined preview methods are undefined.

- [ ] **Step 4: Implement through one feature-list helper**

Add:

```ts
private activeFeaturesIncluding(feature: FeatureDefinition): FeatureDefinition[] {
  const active = this.activeFeaturesForLoad();
  return active.some((candidate) => candidate.id === feature.id)
    ? active
    : [...active, feature];
}
```

Each combined method clones infrastructure, applies exactly one change, then calls `calculateCurrentLoad(clone, this.activeFeaturesIncluding(feature), ignoredIncidentNodeIds)`.

For technology replacement, preserve retired queue-node incident ignoring exactly as `previewLoadWithTechnology()` does.

- [ ] **Step 5: Add ORACLE release port RED/GREEN test**

Extend ORACLE release preview with `exactPressures`. For an actual candidate action:

```ts
const projectedAfter = oracle.previewPort.previewReleaseAction(action);
const afterMax = Math.max(
  0,
  ...operationalPressures(projectedAfter).map(({ effectiveRatio }) => effectiveRatio),
);
const beforeMax = Math.max(
  0,
  ...(oracle.releasePreview?.exactPressures ?? []).map(({ effectiveRatio }) => effectiveRatio),
);
expect(afterMax).toBeLessThan(beforeMax);
```

This uses only public preview-port output and `operationalPressures`; no test-only observation field is added.

- [ ] **Step 6: Run focused suites and commit**

```bash
npm test -- src/core/__tests__/game-engine.spec.ts src/simulation/__tests__/balance-observation.spec.ts
git add src/core/game-engine.ts src/core/__tests__/game-engine.spec.ts src/simulation/balance-observation.ts src/simulation/__tests__/balance-observation.spec.ts
git commit -m "feat: preview exact pending release actions"
```

---

### Task 4: Explicit Preventative Action Intent and Shared Dependency Readiness

**Files:**
- Modify: `src/simulation/balance-action.ts`
- Create: `src/simulation/release-readiness.ts`
- Create: `src/simulation/__tests__/release-readiness.spec.ts`

**Interfaces:**

```ts
export type SimulationActionIntent =
  | 'RELEASE_READINESS_DEPENDENCY'
  | 'RELEASE_READINESS_CAPACITY';
```

Every `SimulationAction` variant gains optional `readonly intent?: SimulationActionIntent`.

```ts
export function withReleaseReadinessIntent(
  action: SimulationAction,
  intent: SimulationActionIntent,
): SimulationAction;

export function preventativeDependencyAction(
  observation: BalanceObservation,
  context: StrategyDecisionContext,
  strategyId: BalanceStrategyId,
): SimulationAction | null;
```

- [ ] **Step 1: Write RED helper tests**

Given an upcoming EVENT_BUS gap and affordable options, assert:

```ts
expect(preventativeDependencyAction(observation, context, 'METRICS_AWARE')).toMatchObject({
  type: 'START_TECHNOLOGY_BUILD',
  technologyId: 'SQS',
  intent: 'RELEASE_READINESS_DEPENDENCY',
});
```

Also assert `null` when there is no upcoming gap or no affordable candidate.

- [ ] **Step 2: Implement intent without changing executable identity**

`simulationActionId()` continues to ignore intent. Implement `withReleaseReadinessIntent()` as a frozen copy.

- [ ] **Step 3: Implement dependency helper**

Use the first upcoming gap, existing `technologyAction()`, and `cheapestAffordable()`. Do not duplicate cost/runway math.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm test -- src/simulation/__tests__/release-readiness.spec.ts
git add src/simulation/balance-action.ts src/simulation/release-readiness.ts src/simulation/__tests__/release-readiness.spec.ts
git commit -m "feat: classify release readiness actions"
```

---

### Task 5: Post-Release Prevention Metrics

**Files:**
- Modify: `src/simulation/simulation-metrics.ts`
- Modify: `src/simulation/simulation-runner.ts`
- Test: `src/simulation/__tests__/simulation-metrics.spec.ts`
- Test: `src/simulation/__tests__/simulation-runner.spec.ts`

**BalanceRunResult additions:**

```ts
preventativeDependencyBuildCount: number;
preventativeCapacityActionCount: number;
postReleaseOverloadDays: number;
featuresReleasedIntoOverload: number;
```

**Collector additions:**

```ts
beginFeatureReleaseWindow(): void;
recordPreventativeAction(intent: SimulationActionIntent): void;
```

- [ ] **Step 1: Write RED metric tests**

Start one release window, record seven operational days, make two days exceed effective ratio `1.0`, and assert:

```ts
expect(result.postReleaseOverloadDays).toBe(2);
expect(result.featuresReleasedIntoOverload).toBe(1);
```

Start two overlapping windows and verify one overloaded calendar day increments `postReleaseOverloadDays` once but marks both active features overloaded once.

- [ ] **Step 2: Implement metric windows**

Use:

```ts
private releaseWindows: { remainingDays: number; overloaded: boolean }[] = [];
```

`recordOperationalDay()`:

1. computes overload once;
2. if any release window is active and overloaded, increments `postReleaseOverloadDays` once;
3. marks each active unmarked window and increments `featuresReleasedIntoOverload` once per feature;
4. decrements remaining days and removes completed seven-day windows.

- [ ] **Step 3: Detect releases in runner**

Immediately before `engine.advanceDay()` capture completed feature count. Immediately after advance, compare counts; call `beginFeatureReleaseWindow()` once for every new completed non-bootstrap feature.

The next loop's `observeDailyOperationalMetrics()` becomes first live release day.

- [ ] **Step 4: Record successful preventative intent**

After successful normal investment execution:

```ts
if (action.intent) metrics.recordPreventativeAction(action.intent);
```

- [ ] **Step 5: Run metric/runner suites, including trace identity, and commit**

```bash
npm test -- src/simulation/__tests__/simulation-metrics.spec.ts src/simulation/__tests__/simulation-runner.spec.ts
git add src/simulation/simulation-metrics.ts src/simulation/simulation-runner.ts src/simulation/__tests__/simulation-metrics.spec.ts src/simulation/__tests__/simulation-runner.spec.ts
git commit -m "feat: measure release readiness outcomes"
```

---

### Task 6: METRICS Preventative Policy

**Files:**
- Modify: `src/simulation/release-readiness.ts`
- Modify: `src/simulation/strategies/metrics-aware.ts`
- Test: `src/simulation/__tests__/release-readiness.spec.ts`
- Test: `src/simulation/__tests__/strategies.spec.ts`

**Interface:**

```ts
export function decideMetricsReleaseReadiness(
  observation: BalanceObservation,
  context: StrategyDecisionContext,
  strategyId: 'METRICS_AWARE' | 'APM_AWARE',
): SimulationAction | null;
```

- [ ] **Step 1: Write RED tests**

Cover:

1. upcoming queue requirement -> SQS before feature completion;
2. no dependency gap + projected DB IO >=85% -> first affordable DB IO remedy with `RELEASE_READINESS_CAPACITY`;
3. projected max <85% -> `null` readiness and unchanged live decision.

Add explicit regressions that REACTIVE_BASIC and CHEAPSKATE do not spend merely because `pendingFeature` exists.

- [ ] **Step 2: Implement METRICS readiness**

`decideMetricsReleaseReadiness()`:

1. calls `preventativeDependencyAction()` first;
2. requires METRICS/APM/ORACLE observation with a non-null release preview;
3. exits when max projected effective percent <85;
4. selects hottest projected resource;
5. resolves current owned node with `nodeFor()`;
6. selects `firstAffordable(resourceRemedyCandidates(...))`;
7. wraps selected action with `RELEASE_READINESS_CAPACITY`.

At top of `metricsAwareStrategy.decide`, return readiness when non-null, otherwise call existing `decideFromMetrics()`.

- [ ] **Step 3: Run GREEN and commit**

```bash
npm test -- src/simulation/__tests__/release-readiness.spec.ts src/simulation/__tests__/strategies.spec.ts
git add src/simulation/release-readiness.ts src/simulation/strategies/metrics-aware.ts src/simulation/__tests__/release-readiness.spec.ts src/simulation/__tests__/strategies.spec.ts
git commit -m "feat: prepare metric aware releases"
```

---

### Task 7: APM Preventative Policy

**Files:**
- Modify: `src/simulation/release-readiness.ts`
- Modify: `src/simulation/strategies/apm-aware.ts`
- Test: `src/simulation/__tests__/strategies.spec.ts`

**Interface:**

```ts
export function decideApmReleaseReadiness(
  observation: BalanceObservation,
  context: StrategyDecisionContext,
): SimulationAction | null;
```

- [ ] **Step 1: Write RED APM diagnosis test**

Construct an APM observation where several projected resources are elevated and projected diagnosis points to DB IO. Assert readiness chooses the cheapest affordable diagnosis-supported DB IO remedy, tagged `RELEASE_READINESS_CAPACITY`.

Also assert upcoming dependency readiness occurs while live load is healthy.

- [ ] **Step 2: Implement APM ordering**

```text
upcoming dependency
-> projected APM diagnosis when >=85%
-> existing live APM decision
-> existing METRICS fallback when APM is not unlocked
```

Use `cheapestAffordable(resourceRemedyCandidates(...))` for diagnosed remedies.

- [ ] **Step 3: Run GREEN and commit**

```bash
npm test -- src/simulation/__tests__/strategies.spec.ts
git add src/simulation/release-readiness.ts src/simulation/strategies/apm-aware.ts src/simulation/__tests__/strategies.spec.ts
git commit -m "feat: prepare apm diagnosed releases"
```

---

### Task 8: ORACLE Exact Preventative Policy

**Files:**
- Modify: `src/simulation/release-readiness.ts`
- Modify: `src/simulation/strategies/oracle.ts`
- Test: `src/simulation/__tests__/strategies.spec.ts`

**Interface:**

```ts
export function decideOracleReleaseReadiness(
  observation: OracleBalanceObservation,
  context: StrategyDecisionContext,
): SimulationAction | null;
```

- [ ] **Step 1: Write RED exact-ranking test**

Create an ORACLE observation with two affordable candidates where only the second candidate's `previewReleaseAction()` brings projected max ratio to <=0.85. Assert the second candidate wins even when it is later in candidate order.

Add a second test where none reaches 0.85 and assert highest relief / one-month cost wins with deterministic tie-breaking.

- [ ] **Step 2: Implement projected ranking**

Use:

```ts
const currentMax = Math.max(
  0,
  ...observation.releasePreview.exactPressures.map(({ effectiveRatio }) => effectiveRatio),
);
const nextMax = maxEffectiveRatioFromPreview(
  observation.previewPort.previewReleaseAction(action),
);
const relief = Math.max(0, currentMax - nextMax);
```

Preserve existing affordability, monthly-cost ranking, negligible-relief filter, ALB-enablement exception, and `simulationActionId()` tie-break.

Wrap selected preventative action with `RELEASE_READINESS_CAPACITY`.

- [ ] **Step 3: Preserve live ORACLE fallback**

When no pending feature exists or projected max <0.85, representative existing ORACLE tests must produce the same live action as before this task.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm test -- src/simulation/__tests__/strategies.spec.ts
git add src/simulation/release-readiness.ts src/simulation/strategies/oracle.ts src/simulation/__tests__/strategies.spec.ts
git commit -m "feat: prepare oracle projected releases"
```

---

### Task 9: Fast Branch Verification

**Files:** none unless verification exposes a defect.

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 2: Run static/build checks**

```bash
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run deterministic smoke twice**

Run the same fully-filtered informed scenario twice and diff result/trace artifacts. Repeat for REACTIVE_BASIC. Expected: byte-identical same-scenario output.

- [ ] **Step 4: Inspect one pre-release trace**

Confirm an informed strategy emits a readiness action while `completedFeatureCount` has not yet advanced; REACTIVE_BASIC on the same scenario must not emit that feature-specific readiness action.

- [ ] **Step 5: Commit only real fixes**

Do not create an empty verification commit.

---

### Task 10: 450-Run Pilot

**Files:**
- Create temporarily: `.github/workflows/balance-pass-2-pilot.yml`
- Delete after evidence capture.

**Matrix:**

```text
5 frameworks × 3 databases × seeds [5,8,17,23,29] × 6 strategies = 450
```

- [ ] **Step 1: Add 15-shard workflow**

Each framework/database shard loops the five seeds. Each `npm run balance -- --framework ... --db ... --seed ...` produces six rows. Preserve those five CSVs and aggregate them with exactly one header.

Assert per shard:

```text
30 data rows
6 rows per seed
all five fixed seeds present
```

- [ ] **Step 2: Run and validate global integrity**

Require:

```text
15 successful artifacts
450 rows
450 unique scenario keys
75 rows per strategy
30 rows per framework/database pair
```

- [ ] **Step 3: Evaluate pilot causality**

Report by cohort:

- win/bankrupt/timeout;
- win-rate delta;
- missingRequiredDependencyDays/run;
- postReleaseOverloadDays/run;
- preventative dependency/capacity actions;
- infrastructure exposure;
- ending cash;
- bankruptcy;
- winner-day median/range.

Proceed only if prevention metrics improve and the cohort gap moves materially toward +10pp without breaking the global difficulty/spend shape.

- [ ] **Step 4: Remove pilot workflow**

Commit removal after artifact evidence is preserved.

---

### Task 11: Final 2,700 Matrix and Merge

**Files:**
- Create temporarily: `.github/workflows/balance-pass-2-full.yml`
- Delete after evidence capture.
- Update PR #19 and Balance Pass 2 stacked PR metadata with final evidence.

- [ ] **Step 1: Run full 15-shard matrix**

Each framework/database shard runs:

```bash
npm run balance -- --framework "$FRAMEWORK" --db "$DATABASE"
```

Assert 180 rows and `summary.runCount === 180` per shard.

- [ ] **Step 2: Validate global integrity**

Require exactly:

```text
2700 rows
450 per strategy
180 per framework/database pair
seeds 1-30
0 duplicate (framework,database,seed,strategy) keys
```

- [ ] **Step 3: Apply every hard spec criterion**

```text
overall win 15%-45%
bankruptcy 10%-35%
timeout > 0
>=4 strategies with wins
max individual strategy win <=80%
informed - riskier win rate >=10pp
informed postReleaseOverloadDays/run <=80% of riskier
informed missingRequiredDependencyDays/run <=50% of riskier
winner median 500-1000
early wins remain rare
```

Also document spend sanity and all 15 stack comparisons.

- [ ] **Step 4: Remove full workflow and run fresh normal CI**

Require test, typecheck, build, CLI smoke, deterministic rerun, representative traces, and artifact hygiene green on the final tree.

- [ ] **Step 5: Merge in stack order only if accepted**

1. Merge PR #19 (Balance Pass 1 baseline) after fresh green CI and confirmed mergeability.
2. Update Balance Pass 2 onto the new `feature/playable-mvp` base without overwriting unexpected remote work.
3. Run fresh normal CI on the updated Balance Pass 2 tree.
4. Merge Balance Pass 2 only when CI is green and the final 2,700 evidence corresponds to the production tree.

If any hard criterion fails, leave the balance PRs unmerged and diagnose the causal failure instead of weakening thresholds.
