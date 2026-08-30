# Balance Pass 2 — Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make informed strategies prevent pending-feature dependency and capacity failures before release, then prove the behavior with deterministic prevention metrics and the balance matrix.

**Architecture:** Extend the existing balance-observation projector with a pending-feature contract and level-specific read-only release previews. Reuse the existing engine load calculator, add exact combined feature+action previews for ORACLE, tag preventative simulation actions explicitly, and record seven-day post-release health metrics in the runner. Strategy code remains isolated by observability ceiling and all actions still execute through the existing public engine commands.

**Tech Stack:** TypeScript, Vitest, deterministic balance runner, GitHub Actions one-off evidence workflows.

**Spec:** `docs/superpowers/specs/2026-08-30-balance-pass-2-release-readiness-design.md`

## Global Constraints

- Keep Balance Pass 1 constants fixed: final progression `3_000_000`, phase-3 positive probability `0.58`, exit target `143_000_000`, ALB XLARGE throughput `1_800`.
- Do not change the 1,080-day horizon, starting cash, workloads, revenue modifiers, incident/viral probabilities, infrastructure prices, framework/database modifiers, build costs/durations, learning costs/order, or automatic feature-release timing.
- Preserve post-release REQUIRED-dependency recovery for all strategies as a correctness fallback.
- BASIC must never receive projected resource loads; METRICS must never receive APM diagnosis or ORACLE exact internals; APM must never receive ORACLE exact demand/capacity internals.
- All preview APIs are read-only, consume no RNG, and use the same load-calculation path as live state.
- Use TDD: every behavior task starts RED, production changes follow only after the intended failure is observed.
- Normal PR CI remains fast; 450-run pilot and 2,700-run matrix are temporary one-off workflows and are removed after evidence is captured.

## File Structure

- `src/core/game-engine.ts` — exact read-only pending-feature + infrastructure-action preview methods.
- `src/core/__tests__/game-engine.spec.ts` — combined-preview correctness and non-mutation/RNG regression tests.
- `src/simulation/balance-action.ts` — explicit release-readiness action intent metadata.
- `src/simulation/balance-observation.ts` — pending feature, upcoming dependency gaps, level-specific projected release views, ORACLE release-action port.
- `src/simulation/__tests__/balance-observation.spec.ts` — observation-boundary and preview contract tests.
- `src/simulation/release-readiness.ts` — shared preventative dependency selection and intent tagging; no strategy-specific capacity ranking.
- `src/simulation/__tests__/release-readiness.spec.ts` — shared dependency readiness tests.
- `src/simulation/simulation-metrics.ts` — preventative-action and seven-day post-release metrics.
- `src/simulation/simulation-runner.ts` — release-window detection and successful preventative-action recording.
- `src/simulation/__tests__/simulation-metrics.spec.ts` — metric unit tests.
- `src/simulation/__tests__/simulation-runner.spec.ts` — runner integration / trace identity tests.
- `src/simulation/strategies/metrics-aware.ts` — projected resource readiness.
- `src/simulation/strategies/apm-aware.ts` — projected diagnosis readiness.
- `src/simulation/strategies/oracle.ts` — exact combined-preview readiness ranking.
- `src/simulation/__tests__/strategies.spec.ts` — strategy-level preventative behavior contracts.
- `.github/workflows/balance-pass-2-pilot.yml` — temporary 450-run evidence.
- `.github/workflows/balance-pass-2-full.yml` — temporary final 2,700-run evidence, created only after pilot acceptance.

---

### Task 1: Pending Feature and Upcoming Dependency Observation

**Files:**
- Modify: `src/simulation/balance-observation.ts`
- Test: `src/simulation/__tests__/balance-observation.spec.ts`

**Interfaces:**
- Produces `PendingFeatureObservation`.
- Produces `CommonBalanceObservation.pendingFeature`.
- Produces `CommonBalanceObservation.upcomingRequiredDependencyGaps`.
- Reuses existing `RequiredDependencyGapObservation` and `requiredDependencyGaps(load)` semantics.

- [ ] **Step 1: Write failing observation tests**

Add representative tests that advance a deterministic engine until NOTIFICATION or another queue-required feature is under development, then assert:

```ts
expect(observation.pendingFeature).toMatchObject({
  id: 'NOTIFICATION',
  requiredResourceRoles: ['EVENT_BUS'],
});
expect(observation.pendingFeature?.estimatedRemainingDays).toBeGreaterThan(0);
expect(observation.upcomingRequiredDependencyGaps).toEqual([
  expect.objectContaining({
    role: 'EVENT_BUS',
    candidateTechnologyIds: ['SQS', 'RABBITMQ', 'KAFKA'],
  }),
]);
```

Also assert a BASIC observation has no `releasePreview` property.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/simulation/__tests__/balance-observation.spec.ts
```

Expected: FAIL because `pendingFeature` / `upcomingRequiredDependencyGaps` do not exist.

- [ ] **Step 3: Implement the minimal common observation**

In `balance-observation.ts`, add:

```ts
export interface PendingFeatureObservation {
  readonly id: CommunityFeatureId;
  readonly estimatedRemainingDays: number;
  readonly requiredResourceRoles: readonly ResourceRole[];
}
```

Resolve the feature from `engine.snapshot.currentFeature?.id` through `COMMUNITY_FEATURES`; return `null` for bootstrap/no task. Derive `requiredResourceRoles` from request-route entries marked `REQUIRED`.

For upcoming gaps, call `engine.previewLoadWithFeature(feature)` and reuse the existing `requiredDependencyGaps(previewLoad)` projector so the candidate technology mapping remains single-sourced.

- [ ] **Step 4: Re-run focused tests**

Expected: PASS and BASIC still contains no projected load.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/balance-observation.ts src/simulation/__tests__/balance-observation.spec.ts
git commit -m "feat: expose pending release dependency readiness"
```

---

### Task 2: METRICS and APM Release Preview Projection

**Files:**
- Modify: `src/simulation/balance-observation.ts`
- Test: `src/simulation/__tests__/balance-observation.spec.ts`

**Interfaces:**
- Produces `MetricsReleasePreview` and `ApmReleasePreview`.
- `MetricsBalanceObservation.releasePreview` is metrics-only.
- `ApmBalanceObservation.releasePreview` includes diagnosis.
- ORACLE later extends the same preview shape.

- [ ] **Step 1: Write failing ceiling tests**

For the same pending feature, assert:

```ts
const metrics = observeForStrategy(engine, 'METRICS');
expect(metrics.level).toBe('METRICS');
if (metrics.level !== 'METRICS') throw new Error('expected METRICS');
expect(metrics.releasePreview?.resourceLoads.length).toBeGreaterThan(0);
expect(metrics.releasePreview?.maxEffectivePercent).toBeGreaterThanOrEqual(0);
expect('diagnosis' in (metrics.releasePreview ?? {})).toBe(false);

const apm = observeForStrategy(engine, 'APM');
expect(apm.level).toBe('APM');
if (apm.level !== 'APM') throw new Error('expected APM');
expect(apm.releasePreview?.diagnosis.topBottleneck).not.toBeUndefined();
expect('exactPressures' in (apm.releasePreview ?? {})).toBe(false);
```

Also compare the release preview with `operationalPressures(engine.previewLoadWithFeature(feature))` for a known scenario.

- [ ] **Step 2: Run focused tests and verify RED**

Expected: FAIL because release preview types/projection do not exist.

- [ ] **Step 3: Refactor load projectors to accept arbitrary load**

Extract helpers such as:

```ts
function resourceObservationsFromLoad(load: LoadSnapshot): readonly BalanceResourceLoadObservation[] { ... }

function projectedDiagnosis(
  engine: GameEngine,
  feature: FeatureDefinition,
  load: LoadSnapshot,
): BalanceDiagnosisObservation { ... }
```

For projected diagnosis, build the projected topology with current active features plus the pending feature, copy `engine.snapshot` with `load` replaced by the preview and completed feature ids including the pending feature, then call `OperationalViewProjector.project(...)` / `diagnosisText(...)` using that projected snapshot and topology.

- [ ] **Step 4: Attach preview only at allowed ceilings**

- BASIC: no `releasePreview`.
- METRICS: resource loads + max effective percent.
- APM: same + diagnosis.
- ORACLE: temporarily same APM preview until Task 3 adds exact fields.

- [ ] **Step 5: Re-run observation tests and commit**

```bash
git add src/simulation/balance-observation.ts src/simulation/__tests__/balance-observation.spec.ts
git commit -m "feat: project pending feature release load"
```

---

### Task 3: Exact ORACLE Combined Feature + Action Preview

**Files:**
- Modify: `src/core/game-engine.ts`
- Modify: `src/simulation/balance-observation.ts`
- Test: `src/core/__tests__/game-engine.spec.ts`
- Test: `src/simulation/__tests__/balance-observation.spec.ts`

**Interfaces:**
- Core produces:
  - `previewLoadWithFeatureAndTechnology(feature, id)`
  - `previewLoadWithFeatureAndNodeResize(feature, nodeId, size)`
  - `previewLoadWithFeatureAndNodeScaleOut(feature, nodeId)`
- `OraclePreviewPort.previewReleaseAction(action): LoadSnapshot` maps simulation actions onto those core methods.
- `OracleReleasePreview.exactPressures` contains exact projected pressures before an action.

- [ ] **Step 1: Write failing core preview tests**

Use a deterministic launched engine with a pending feature. Capture serialized snapshot/infrastructure state, call each new preview method, and assert live state is unchanged.

Add RNG non-consumption coverage using two identical engines:

```ts
const left = createTestEngine(seed);
const right = createTestEngine(seed);
prepareSamePendingFeature(left, right);
left.previewLoadWithFeatureAndNodeResize(feature, 'app', ServerSize.XLARGE);
for (let i = 0; i < 10; i += 1) {
  expect(left.advanceDay()).toEqual(right.advanceDay());
}
```

Use an actual node id from the test topology rather than a guessed literal if existing helpers expose it.

- [ ] **Step 2: Verify RED**

Expected: methods are undefined.

- [ ] **Step 3: Implement one internal projected-feature helper**

Add a private helper equivalent to:

```ts
private activeFeaturesIncluding(feature: FeatureDefinition): FeatureDefinition[] {
  const active = this.activeFeaturesForLoad();
  return active.some((candidate) => candidate.id === feature.id)
    ? active
    : [...active, feature];
}
```

Implement the three public previews by cloning infrastructure, applying the action, and calling `calculateCurrentLoad(clone, this.activeFeaturesIncluding(feature), ignoredIncidents)`.

Queue technology replacement must preserve the same retired-node incident ignore behavior as `previewLoadWithTechnology`.

- [ ] **Step 4: Add ORACLE port tests**

Assert ORACLE observation exposes exact projected pressures and:

```ts
const result = oracle.previewPort.previewReleaseAction({
  type: 'RESIZE_NODE', nodeId, size: ServerSize.XLARGE, reason: 'test',
});
expect(maxEffectiveRatioFromLoad(result)).toBeLessThanOrEqual(
  maxEffectiveRatioFromLoad(oracle.releasePreview!.loadEquivalentForTest),
);
```

Do not expose a raw `LoadSnapshot` in the public observation solely for testing; compare through pressure helpers or the port result.

- [ ] **Step 5: Commit after focused tests pass**

```bash
git add src/core/game-engine.ts src/core/__tests__/game-engine.spec.ts src/simulation/balance-observation.ts src/simulation/__tests__/balance-observation.spec.ts
git commit -m "feat: add exact pending release action previews"
```

---

### Task 4: Explicit Preventative Action Intent

**Files:**
- Modify: `src/simulation/balance-action.ts`
- Create: `src/simulation/release-readiness.ts`
- Create: `src/simulation/__tests__/release-readiness.spec.ts`

**Interfaces:**
- Produces:

```ts
export type SimulationActionIntent =
  | 'RELEASE_READINESS_DEPENDENCY'
  | 'RELEASE_READINESS_CAPACITY';
```

- Every `SimulationAction` may carry optional `intent`.
- Produces `preventativeDependencyAction(observation, context, strategyId)`.
- Produces `withReleaseReadinessIntent(action, intent)`.

- [ ] **Step 1: Write RED tests for dependency readiness**

Construct an observation with an upcoming EVENT_BUS gap and available SQS/RabbitMQ/Kafka. Assert the helper chooses the cheapest affordable valid technology and tags it:

```ts
expect(action).toMatchObject({
  type: 'START_TECHNOLOGY_BUILD',
  technologyId: 'SQS',
  intent: 'RELEASE_READINESS_DEPENDENCY',
});
```

Also assert no action when there is no upcoming gap or none are affordable.

- [ ] **Step 2: Implement intent metadata without changing action ids**

`simulationActionId()` must remain based only on executable action identity; intent is diagnostic/provenance metadata.

Implement:

```ts
export function withReleaseReadinessIntent(
  action: SimulationAction,
  intent: SimulationActionIntent,
): SimulationAction {
  return Object.freeze({ ...action, intent });
}
```

- [ ] **Step 3: Implement shared preventative dependency selection**

Use existing `technologyAction`, `cheapestAffordable`, and the first upcoming gap. Do not duplicate affordability math.

- [ ] **Step 4: Run tests and commit**

```bash
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

**Interfaces:**
- Adds to `BalanceRunResult`:
  - `preventativeDependencyBuildCount`
  - `preventativeCapacityActionCount`
  - `postReleaseOverloadDays`
  - `featuresReleasedIntoOverload`
- Collector produces:
  - `beginFeatureReleaseWindow()`
  - `recordPreventativeAction(intent)`
- Seven-day release windows are metrics-only.

- [ ] **Step 1: Write metric RED tests**

Create a collector, start a release window, feed seven operational days with known ratios, and assert overload day count and one feature-overload count.

Also test overlapping windows: one overloaded calendar day increments `postReleaseOverloadDays` once, while every active feature window becomes marked overloaded exactly once.

- [ ] **Step 2: Implement release-window state in collector**

Use internal windows:

```ts
private releaseWindows: { remainingDays: number; overloaded: boolean }[] = [];
```

In `recordOperationalDay`, when at least one window is active and any effective ratio is `> 1`:

- increment `postReleaseOverloadDays` once for the calendar day;
- for every active not-yet-overloaded window, mark it and increment `featuresReleasedIntoOverload`;
- decrement every active window and remove windows after seven recorded live days.

- [ ] **Step 3: Detect releases in the runner**

Before `engine.advanceDay()`, capture completed feature count. After advance, if the count increased, call `metrics.beginFeatureReleaseWindow()` once for each newly completed non-bootstrap feature.

Because the window begins after the release and operational metrics are recorded at the start of each subsequent loop, the next loop is the first live release day.

- [ ] **Step 4: Record successful preventative intent**

After an investment executes successfully:

```ts
if (action.intent) metrics.recordPreventativeAction(action.intent);
```

Dependency intent increments dependency-build count; capacity intent increments capacity-action count.

- [ ] **Step 5: Preserve trace identity**

Run existing trace-on/off identity tests plus the runner suite. No metric instrumentation may alter decisions, RNG, or engine state.

- [ ] **Step 6: Commit**

```bash
git add src/simulation/simulation-metrics.ts src/simulation/simulation-runner.ts src/simulation/__tests__/simulation-metrics.spec.ts src/simulation/__tests__/simulation-runner.spec.ts
git commit -m "feat: measure post release readiness outcomes"
```

---

### Task 6: METRICS Preventative Policy

**Files:**
- Modify: `src/simulation/strategies/metrics-aware.ts`
- Modify: `src/simulation/release-readiness.ts`
- Test: `src/simulation/__tests__/strategies.spec.ts`
- Test: `src/simulation/__tests__/release-readiness.spec.ts`

**Interfaces:**
- Produces `decideMetricsReleaseReadiness(observation, context, strategyId)`.
- Returns dependency action first, then projected capacity action, then `null` to allow live logic.

- [ ] **Step 1: Write RED strategy tests**

Representative tests:

1. pending queue-required feature + no queue -> SQS build **before** feature completion;
2. no dependency gap + projected DB IO >=85% -> resource-aware remedy with `RELEASE_READINESS_CAPACITY` intent;
3. projected max <85% -> no preventative capacity action and normal live decision remains unchanged.

- [ ] **Step 2: Implement METRICS release readiness**

At the top of `metricsAwareStrategy.decide`:

```ts
const readiness = decideMetricsReleaseReadiness(observation, context, 'METRICS_AWARE');
if (readiness) return readiness;
return decideFromMetrics(observation, context, 'METRICS_AWARE');
```

The helper must use projected `releasePreview.resourceLoads`, current owned node state, existing `resourceRemedyCandidates`, and `firstAffordable`; wrap the selected capacity action with `RELEASE_READINESS_CAPACITY`.

- [ ] **Step 3: Verify CHEAPSKATE and REACTIVE remain unchanged**

Run their existing strategy tests and add one explicit assertion that the presence of `pendingFeature` alone does not cause either to spend.

- [ ] **Step 4: Commit**

```bash
git add src/simulation/strategies/metrics-aware.ts src/simulation/release-readiness.ts src/simulation/__tests__/strategies.spec.ts src/simulation/__tests__/release-readiness.spec.ts
git commit -m "feat: prepare metric aware releases"
```

---

### Task 7: APM Preventative Policy

**Files:**
- Modify: `src/simulation/strategies/apm-aware.ts`
- Modify: `src/simulation/release-readiness.ts`
- Test: `src/simulation/__tests__/strategies.spec.ts`

**Interfaces:**
- Produces `decideApmReleaseReadiness(observation, context)`.

- [ ] **Step 1: Write RED APM tests**

Create a projected release where multiple resources are elevated but the APM diagnosis identifies DB IO as top bottleneck. Assert APM chooses the cheapest affordable diagnosis-supported DB IO remedy, not a generic APP resize.

Also assert it performs upcoming dependency readiness even when current live load is healthy.

- [ ] **Step 2: Implement APM readiness**

Ordering inside `apmAwareStrategy.decide`:

```text
upcoming dependency -> projected APM diagnosis -> existing live APM/METRICS fallback
```

Use `cheapestAffordable(resourceRemedyCandidates(...))` and mark the action `RELEASE_READINESS_CAPACITY`.

- [ ] **Step 3: Run strategy suites and commit**

```bash
git add src/simulation/strategies/apm-aware.ts src/simulation/release-readiness.ts src/simulation/__tests__/strategies.spec.ts
git commit -m "feat: prepare apm diagnosed releases"
```

---

### Task 8: ORACLE Exact Preventative Policy

**Files:**
- Modify: `src/simulation/strategies/oracle.ts`
- Modify: `src/simulation/release-readiness.ts`
- Test: `src/simulation/__tests__/strategies.spec.ts`

**Interfaces:**
- Produces `decideOracleReleaseReadiness(observation, context)`.
- Uses `observation.previewPort.previewReleaseAction(action)` for every ranked candidate.

- [ ] **Step 1: Write RED ORACLE ranking tests**

Build a scenario with at least two affordable remedies where:

- both reduce projected pressure;
- only one brings post-release max <=0.85;
- the satisfying action is not first in candidate order.

Assert ORACLE chooses the exact satisfying candidate based on combined preview.

Add a second case where no candidate reaches 0.85 and assert highest relief-per-one-month-cost wins.

- [ ] **Step 2: Implement exact projected ranking**

Use the existing live ORACLE ranking shape but compute:

```ts
const releaseCurrentMax = maxExactReleaseRatio(observation.releasePreview);
const nextMax = maxEffectiveRatioFromPreview(
  observation.previewPort.previewReleaseAction(action),
);
const relief = Math.max(0, releaseCurrentMax - nextMax);
```

Preserve affordability, one-month cost, negligible-relief rejection, deterministic tie-breaking, and required ALB enablement exception.

- [ ] **Step 3: Ensure normal ORACLE live policy remains fallback**

If no pending release or projected max <0.85, existing live ORACLE behavior must be byte-for-byte decision-equivalent for representative observations.

- [ ] **Step 4: Commit**

```bash
git add src/simulation/strategies/oracle.ts src/simulation/release-readiness.ts src/simulation/__tests__/strategies.spec.ts
git commit -m "feat: prepare oracle projected releases"
```

---

### Task 9: Full Fast Verification Before Balance Evidence

**Files:**
- No new production files unless a failing verification reveals a defect.

- [ ] **Step 1: Run unit/integration tests**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 2: Run static/build verification**

```bash
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run deterministic balance smoke**

Use one informed and one riskier scenario twice and diff generated rows/traces. Expected: same-scenario outputs are identical.

- [ ] **Step 4: Inspect a representative trace**

Choose a seed where a required dependency is upcoming. Confirm METRICS/APM/ORACLE show a readiness action before feature completion while REACTIVE does not.

- [ ] **Step 5: Commit only if verification required a fix**

No empty verification commit.

---

### Task 10: 450-Run Pilot Matrix

**Files:**
- Create temporarily: `.github/workflows/balance-pass-2-pilot.yml`
- Delete after artifacts/results are captured.

**Interfaces:**
- 15 framework/database jobs.
- Each job runs seeds `5 8 17 23 29` with all six strategies: 30 rows/job.
- Aggregate total: exactly 450 rows.

- [ ] **Step 1: Add one-off pilot workflow**

Matrix:

```yaml
framework: [SPRING_BOOT, NESTJS, GIN, FASTAPI, ASPNET_CORE]
database: [POSTGRESQL, MYSQL, MONGODB]
```

Inside each shard:

```bash
for seed in 5 8 17 23 29; do
  npm run balance -- --framework "$FRAMEWORK" --db "$DATABASE" --seed "$seed"
  # preserve each six-row runs.csv before the next seed
 done
```

Aggregate shard CSVs with one header and assert exactly 30 data rows.

- [ ] **Step 2: Run workflow and assert integrity**

Required:

- 15 successful artifacts;
- 30 rows each;
- 450 unique `(framework,database,seed,strategy)` keys;
- 75 rows per strategy;
- all five seeds present for all 15 stacks.

- [ ] **Step 3: Evaluate pilot criteria**

Report:

- WON/BANKRUPT/TIMEOUT;
- informed/riskier win rates and delta;
- `postReleaseOverloadDays` per run by cohort;
- `missingRequiredDependencyDays` per run by cohort;
- preventative action counts;
- median infrastructure exposure, ending cash, bankruptcy by cohort;
- winner-day median/range.

Proceed to Task 11 only if prevention metrics improve causally and strategy delta moves materially toward +10pp without breaking global difficulty.

- [ ] **Step 4: Remove pilot workflow after evidence is preserved**

Commit the workflow deletion so normal PR CI remains fast.

---

### Task 11: Final 2,700 Matrix and Integration

**Files:**
- Create temporarily: `.github/workflows/balance-pass-2-full.yml`
- Update: PR #19 body if Balance Pass 1 is ready to land.
- Create/update: Balance Pass 2 stacked PR metadata.
- Delete full workflow after evidence capture.

- [ ] **Step 1: Run exact full matrix**

15 framework/database shards, each invoking the existing full seed set for 180 rows:

```bash
npm run balance -- --framework "$FRAMEWORK" --db "$DATABASE"
```

Assert 180 rows and `summary.runCount === 180` per shard.

- [ ] **Step 2: Aggregate and validate integrity**

Required:

- 2,700 rows exactly;
- 450 per strategy;
- 180 per framework/database pair;
- seeds 1-30;
- zero duplicate scenario keys.

- [ ] **Step 3: Apply every hard acceptance criterion from the spec**

Accept only if all hold:

```text
overall win: 15%-45%
bankruptcy: 10%-35%
timeout: >0
>=4 strategies with wins
max strategy win rate <=80%
informed win rate - riskier win rate >=10pp
informed postReleaseOverloadDays/run <= 80% of riskier
informed missingRequiredDependencyDays/run <= 50% of riskier
winner median: 500-1000
early wins remain rare
```

Document spend sanity and per-stack fairness review.

- [ ] **Step 4: Remove one-off full workflow**

Do not leave 2,700-run CI on ordinary PR pushes.

- [ ] **Step 5: Run fresh normal CI on final tree**

Require tests, typecheck, build, smoke, determinism, representative traces, and artifact hygiene all green.

- [ ] **Step 6: Integrate in stack order only if accepted**

1. Merge PR #19 (playable Balance Pass 1 baseline) after fresh green CI and confirmed mergeability.
2. Rebase/update Balance Pass 2 against the newly merged `feature/playable-mvp` without force-pushing over unexpected remote work.
3. Run fresh normal CI on the rebased Balance Pass 2 tree.
4. Merge Balance Pass 2 only if CI is green and the final 2,700 evidence still corresponds to the production tree.

If any hard criterion fails, keep the balance PRs unmerged and diagnose the failed causal signal rather than weakening acceptance thresholds.
