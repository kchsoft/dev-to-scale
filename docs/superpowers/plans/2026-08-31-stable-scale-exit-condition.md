# Stable-Scale Exit Condition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the revenue-only late-game exit cliff with a transparent `progression complete + 143M monthly revenue + trailing 30-day production SLO` victory contract, while raising ALB XLARGE throughput from 1,800 to 2,250 so the revenue target no longer requires mandatory gateway overload.

**Architecture:** Add a deterministic core-domain `OperationalSloWindow` that owns the rolling 30-day reliability window. `GameEngine` records one SLO sample from the frozen `_growthReferenceLoad` at the start of each launched `advanceDay()`, exposes exit readiness in `GameSnapshot`, and checks the SLO at the existing monthly settlement checkpoint. The simulation harness reports SLO qualification diagnostics but does not own SLO truth. The application HUD projects the core exit-readiness state without duplicating its rules.

**Tech Stack:** TypeScript, Vitest, existing `GameEngine`, existing balance simulation harness, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-31-stable-scale-exit-condition-design.md`

## Global Constraints

- Keep the 1,080-day simulation horizon unchanged.
- Keep starting cash, progression thresholds, phase-3 growth probabilities, feature load/growth/revenue modifiers, and the 143,000,000 monthly revenue target unchanged.
- Keep infrastructure prices unchanged; ALB XLARGE monthly cost remains 550,000.
- Change ALB XLARGE throughput exactly from 1,800 to 2,250.
- Keep release-readiness threshold/action ordering unchanged.
- Record SLO samples from the frozen pre-action observed state (`_growthReferenceLoad`), so same-day capacity corrections cannot rewrite the already-observed day.
- SLO window length is exactly 30 launched operational days.
- SLO passes only with at least 27 healthy days, average failure rate <= 0.02, and zero REQUIRED-dependency-missing days in the trailing window.
- A healthy day requires failure rate < 0.10, no player-owned effective resource ratio > 1.0, and no missing REQUIRED dependency.
- Bankruptcy retains precedence over victory.
- Victory remains a monthly settlement event; do not add mid-month instant victory.
- Do not sweep ALB capacity or SLO thresholds to force the +10pp cohort acceptance gate.

---

### Task 1: Add the rolling operational SLO domain object

**Files:**
- Create: `src/core/operational-slo.ts`
- Create: `src/core/__tests__/operational-slo.spec.ts`
- Modify: `src/core/index.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface OperationalSloSample {
    readonly failureRate: number;
    readonly overloaded: boolean;
    readonly missingRequiredDependency: boolean;
  }

  export interface OperationalSloStatus {
    readonly sampleCount: number;
    readonly healthyDays: number;
    readonly unhealthyDays: number;
    readonly averageFailureRate: number;
    readonly missingRequiredDependencyDays: number;
    readonly passes: boolean;
  }

  export class OperationalSloWindow {
    record(sample: OperationalSloSample): void;
    get status(): OperationalSloStatus;
  }
  ```

- [ ] **Step 1: Write failing unit tests for the complete rolling-window contract**

Create `src/core/__tests__/operational-slo.spec.ts` with tests equivalent to:

```ts
import { describe, expect, it } from 'vitest';
import { OperationalSloWindow } from '../operational-slo';

const healthy = { failureRate: 0, overloaded: false, missingRequiredDependency: false } as const;

function record(window: OperationalSloWindow, count: number, sample = healthy): void {
  for (let i = 0; i < count; i += 1) window.record(sample);
}

describe('OperationalSloWindow', () => {
  it('does not pass before 30 launched operational samples', () => {
    const window = new OperationalSloWindow();
    record(window, 29);
    expect(window.status.sampleCount).toBe(29);
    expect(window.status.passes).toBe(false);
  });

  it('passes with 27 healthy and 3 overload-only unhealthy days when budgets remain valid', () => {
    const window = new OperationalSloWindow();
    record(window, 27);
    record(window, 3, { failureRate: 0, overloaded: true, missingRequiredDependency: false });
    expect(window.status.healthyDays).toBe(27);
    expect(window.status.unhealthyDays).toBe(3);
    expect(window.status.passes).toBe(true);
  });

  it('fails with 26 healthy and 4 unhealthy days', () => {
    const window = new OperationalSloWindow();
    record(window, 26);
    record(window, 4, { failureRate: 0, overloaded: true, missingRequiredDependency: false });
    expect(window.status.passes).toBe(false);
  });

  it('fails when average failure rate exceeds 2 percent even without a severe day', () => {
    const window = new OperationalSloWindow();
    record(window, 30, { failureRate: 0.021, overloaded: false, missingRequiredDependency: false });
    expect(window.status.averageFailureRate).toBeCloseTo(0.021);
    expect(window.status.passes).toBe(false);
  });

  it('fails when any REQUIRED dependency is missing in the trailing window', () => {
    const window = new OperationalSloWindow();
    record(window, 29);
    window.record({ failureRate: 0, overloaded: false, missingRequiredDependency: true });
    expect(window.status.missingRequiredDependencyDays).toBe(1);
    expect(window.status.passes).toBe(false);
  });

  it('evicts the oldest sample when day 31 is recorded', () => {
    const window = new OperationalSloWindow();
    window.record({ failureRate: 1, overloaded: true, missingRequiredDependency: true });
    record(window, 29);
    expect(window.status.missingRequiredDependencyDays).toBe(1);
    window.record(healthy);
    expect(window.status.sampleCount).toBe(30);
    expect(window.status.missingRequiredDependencyDays).toBe(0);
    expect(window.status.averageFailureRate).toBe(0);
    expect(window.status.passes).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run through the normal CI/test command:

```bash
npm test -- --run src/core/__tests__/operational-slo.spec.ts
```

Expected: FAIL because `../operational-slo` does not exist.

- [ ] **Step 3: Implement the minimal deterministic rolling window**

Create `src/core/operational-slo.ts` with exactly one responsibility: retain at most 30 normalized samples and derive status.

Core implementation shape:

```ts
const WINDOW_DAYS = 30;
const REQUIRED_HEALTHY_DAYS = 27;
const MAX_AVERAGE_FAILURE_RATE = 0.02;
const SEVERE_FAILURE_RATE = 0.10;

export class OperationalSloWindow {
  private readonly samples: OperationalSloSample[] = [];

  record(sample: OperationalSloSample): void {
    this.samples.push(Object.freeze({
      failureRate: Math.max(0, Math.min(1, sample.failureRate)),
      overloaded: sample.overloaded,
      missingRequiredDependency: sample.missingRequiredDependency,
    }));
    if (this.samples.length > WINDOW_DAYS) this.samples.shift();
  }

  get status(): OperationalSloStatus {
    const sampleCount = this.samples.length;
    const healthyDays = this.samples.filter((sample) => (
      sample.failureRate < SEVERE_FAILURE_RATE
      && !sample.overloaded
      && !sample.missingRequiredDependency
    )).length;
    const missingRequiredDependencyDays = this.samples.filter(({ missingRequiredDependency }) => missingRequiredDependency).length;
    const averageFailureRate = sampleCount === 0
      ? 0
      : this.samples.reduce((sum, sample) => sum + sample.failureRate, 0) / sampleCount;
    return Object.freeze({
      sampleCount,
      healthyDays,
      unhealthyDays: sampleCount - healthyDays,
      averageFailureRate,
      missingRequiredDependencyDays,
      passes: sampleCount >= WINDOW_DAYS
        && healthyDays >= REQUIRED_HEALTHY_DAYS
        && averageFailureRate <= MAX_AVERAGE_FAILURE_RATE
        && missingRequiredDependencyDays === 0,
    });
  }
}
```

Export it from `src/core/index.ts`.

- [ ] **Step 4: Run focused tests and full core test suite**

```bash
npm test -- --run src/core/__tests__/operational-slo.spec.ts
npm test -- --run src/core/__tests__
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/operational-slo.ts src/core/__tests__/operational-slo.spec.ts src/core/index.ts
git commit -m "feat: add operational SLO window"
```

---

### Task 2: Record frozen observed-day SLO samples in GameEngine

**Files:**
- Modify: `src/core/game-engine.ts`
- Modify: `src/core/__tests__/game-engine-operational-growth.spec.ts`

**Interfaces:**
- Consumes: `OperationalSloWindow` from Task 1.
- Produces: `GameEngine` owns `operationalSlo` and records one launched-day sample before growth from `_growthReferenceLoad`.

- [ ] **Step 1: Add a failing causality regression test**

Extend `game-engine-operational-growth.spec.ts` so `engineWithLoad()` can inspect the SLO status, then add:

```ts
it('does not let a same-day capacity correction erase the previously observed SLO overload', () => {
  const corrected = engineWithLoad(operationalLoad({ alb: 1.2 }));
  corrected.resizeInfrastructureNode('v1:app:SPRING_BOOT', ServerSize.MEDIUM);
  corrected.advanceDay();
  const status = corrected.snapshot.exitReadiness.slo;
  expect(status.sampleCount).toBe(1);
  expect(status.healthyDays).toBe(0);
});
```

Expected RED reason: `exitReadiness` / SLO state is not yet present.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npm test -- --run src/core/__tests__/game-engine-operational-growth.spec.ts
```

Expected: exactly the new assertion fails while existing growth causality tests remain green.

- [ ] **Step 3: Integrate the SLO window into GameEngine without changing victory yet**

In `game-engine.ts`:

- import `OperationalSloWindow` and `OperationalSloStatus`;
- add `readonly operationalSlo = new OperationalSloWindow();`;
- add a private helper that derives from a `LoadSnapshot`:

```ts
private recordOperationalSloSample(load: LoadSnapshot): void {
  const overloaded = operationalPressures(load).some(({ effectiveRatio }) => effectiveRatio > 1);
  const missingRequiredDependency = load.requestTraces.some((trace) => (
    trace.nodes.some((node) => node.requirement === 'REQUIRED' && node.status === 'MISSING')
  ));
  this.operationalSlo.record({
    failureRate: load.failureRate,
    overloaded,
    missingRequiredDependency,
  });
}
```

- at the beginning of launched `advanceDay()`, before `advanceGrowth()`, call `recordOperationalSloSample(this._growthReferenceLoad)`;
- do not record pre-launch days.

Do not change settlement victory in this task.

- [ ] **Step 4: Run focused and core tests**

```bash
npm test -- --run src/core/__tests__/game-engine-operational-growth.spec.ts
npm test -- --run src/core/__tests__
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/game-engine.ts src/core/__tests__/game-engine-operational-growth.spec.ts
git commit -m "feat: record frozen operational SLO samples"
```

---

### Task 3: Make stable-scale readiness part of the monthly victory contract and snapshot

**Files:**
- Modify: `src/core/game-engine.ts`
- Create: `src/core/__tests__/game-engine-exit-readiness.spec.ts`

**Interfaces:**
- Produces `GameSnapshot.exitReadiness`:
  ```ts
  exitReadiness: {
    readonly monthlyRevenueTarget: number;
    readonly lastSettledMonthlyRevenue: number;
    readonly progressionComplete: boolean;
    readonly slo: OperationalSloStatus;
    readonly qualified: boolean;
  }
  ```

- [ ] **Step 1: Write failing snapshot and victory tests**

Use direct state setup only for fields that existing tests already treat as private test seams. Tests must cover:

1. snapshot exposes target, last settled revenue, progression state, and SLO;
2. `progression.finished && revenue >= 143M` with failed SLO stays `RUNNING`;
3. the same revenue/progression with passing 30-day SLO becomes `WON` at settlement;
4. bankruptcy still wins precedence over exit qualification.

Use a small helper to seed 30 SLO samples rather than waiting 30 live days in every case:

```ts
function fillHealthySlo(game: GameEngine): void {
  for (let i = 0; i < 30; i += 1) {
    game.operationalSlo.record({ failureRate: 0, overloaded: false, missingRequiredDependency: false });
  }
}
```

For settlement-focused tests, invoke the existing private `settleMonthIfEnding` seam after setting `_day = 30` and monthly ledger data, or follow the established engine-test pattern if an equivalent helper exists. Do not alter production APIs solely for tests.

- [ ] **Step 2: Run the new test file and verify RED**

```bash
npm test -- --run src/core/__tests__/game-engine-exit-readiness.spec.ts
```

Expected: FAIL because exit readiness is not yet part of `GameSnapshot` and settlement ignores SLO.

- [ ] **Step 3: Implement snapshot projection and monthly SLO gate**

In `GameSnapshot`, add the exact `exitReadiness` shape above.

In `snapshot`, compute:

```ts
const slo = this.operationalSlo.status;
const progressionComplete = this.progression.finished;
const lastSettledMonthlyRevenue = this._lastSettlement?.revenue ?? 0;
const qualified = progressionComplete
  && lastSettledMonthlyRevenue >= RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET
  && slo.passes;
```

In `settleMonthIfEnding()` retain the current bankruptcy block first, then replace the old revenue-only win condition with:

```ts
if (
  this.progression.finished
  && month.revenue >= RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET
  && this.operationalSlo.status.passes
) {
  this._status = 'WON';
}
```

- [ ] **Step 4: Run new tests plus full core suite**

```bash
npm test -- --run src/core/__tests__/game-engine-exit-readiness.spec.ts
npm test -- --run src/core/__tests__
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/game-engine.ts src/core/__tests__/game-engine-exit-readiness.spec.ts
git commit -m "feat: require stable operations for exit"
```

---

### Task 4: Remove the mandatory ALB overload cliff

**Files:**
- Modify: `src/core/infrastructure-sizing.ts`
- Modify: `src/core/__tests__/infrastructure-sizing.spec.ts`

**Interfaces:**
- Changes only `nodeSizeProfile('ALB', ServerSize.XLARGE).capacity.throughput` from `1_800` to `2_250`.
- Monthly cost remains `550_000`.

- [ ] **Step 1: Change the existing ALB XLARGE expectation to 2,250 and verify RED**

Update the existing test:

```ts
it('gives ALB XLARGE enough bounded headroom for stable-scale exit', () => {
  const profile = nodeSizeProfile('ALB', ServerSize.XLARGE);
  expect(profile.capacity.throughput).toBe(2_250);
  expect(profile.monthlyCost).toBe(550_000);
});
```

Run:

```bash
npm test -- --run src/core/__tests__/infrastructure-sizing.spec.ts
```

Expected: FAIL showing actual `1800` vs expected `2250`.

- [ ] **Step 2: Change the production tier exactly once**

In `FIXED_PRODUCT_PROFILES`:

```ts
ALB: throughputProfiles([180, 360, 700, 2_250], [TECHNOLOGIES.ALB.monthlyCost, 180_000, 320_000, 550_000]),
```

- [ ] **Step 3: Run infrastructure and core suites**

```bash
npm test -- --run src/core/__tests__/infrastructure-sizing.spec.ts
npm test -- --run src/core/__tests__
```

Expected: PASS, including the existing monotonic sizing checks.

- [ ] **Step 4: Commit**

```bash
git add src/core/infrastructure-sizing.ts src/core/__tests__/infrastructure-sizing.spec.ts
git commit -m "fix: align ALB headroom with stable-scale exit"
```

---

### Task 5: Surface exit readiness through the application projection

**Files:**
- Modify: `src/application/game-view.ts`
- Modify: `src/application/game-overview-projector.ts`
- Modify: the existing `src/application/__tests__/game-overview-projector.spec.ts` if present; otherwise add `src/application/__tests__/game-overview-exit-readiness.spec.ts`

**Interfaces:**
- Extend `HudView` with a read-only exit-readiness projection copied from `GameSnapshot.exitReadiness`.
- `GameOverviewProjector.hud()` does no SLO arithmetic; it forwards the core result.

- [ ] **Step 1: Write a failing projection test**

Project a snapshot and assert:

```ts
expect(view.hud.exitReadiness.monthlyRevenueTarget).toBe(143_000_000);
expect(view.hud.exitReadiness.slo.sampleCount).toBe(snapshot.exitReadiness.slo.sampleCount);
expect(view.hud.exitReadiness.qualified).toBe(snapshot.exitReadiness.qualified);
```

- [ ] **Step 2: Run the application test and verify RED**

```bash
npm test -- --run src/application/__tests__
```

Expected: FAIL because `HudView` does not yet expose exit readiness.

- [ ] **Step 3: Add the projection without duplicating domain rules**

In `game-view.ts`, add:

```ts
readonly exitReadiness: GameSnapshot['exitReadiness'];
```

(or an equivalent application-owned structural type if `GameSnapshot` import direction requires it).

In `GameOverviewProjector.hud()` add:

```ts
exitReadiness: snapshot.exitReadiness,
```

No UI-specific threshold calculations are allowed.

- [ ] **Step 4: Run application tests, typecheck, and build**

```bash
npm test -- --run src/application/__tests__
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/game-view.ts src/application/game-overview-projector.ts src/application/__tests__
git commit -m "feat: expose stable-scale exit readiness"
```

---

### Task 6: Add balance-run SLO qualification diagnostics

**Files:**
- Modify: `src/simulation/simulation-metrics.ts`
- Modify: `src/simulation/simulation-runner.ts`
- Modify: existing simulation metrics/runner tests under `src/simulation/__tests__/`

**Interfaces:**
- Extend `BalanceRunResult` with:
  ```ts
  revenueTargetMetButSloFailedSettlements: number;
  finalSloSampleCount: number;
  finalSloHealthyDays: number;
  finalSloAverageFailureRate: number;
  finalSloMissingRequiredDependencyDays: number;
  ```

- `SimulationMetricsCollector` may count revenue-qualified/SLO-failed settlements, but final SLO truth comes from `engine.snapshot.exitReadiness.slo`.

- [ ] **Step 1: Write failing metrics/runner tests**

Tests must prove:

- a settlement with revenue >= `RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET` and failed SLO increments `revenueTargetMetButSloFailedSettlements` once;
- the final result copies `sampleCount`, `healthyDays`, `averageFailureRate`, and missing dependency days from `engine.snapshot.exitReadiness.slo`;
- already-seen settlement months are not double counted.

- [ ] **Step 2: Run focused simulation tests and verify RED**

```bash
npm test -- --run src/simulation/__tests__
```

Expected: only new diagnostics assertions fail.

- [ ] **Step 3: Implement collector and runner wiring**

Add a collector method:

```ts
recordExitQualificationSettlement(input: { month: number; revenueTargetMet: boolean; sloPassed: boolean }): void
```

Reuse the existing seen-settlement semantics or maintain a dedicated set so one month increments at most once.

After each `engine.advanceDay()`, when a new settlement is observed, record whether revenue met the target while SLO failed.

Pass final SLO values into `metrics.result(...)` or allow `result()` to accept them explicitly. Do not recompute SLO in simulation code.

- [ ] **Step 4: Run simulation suite plus determinism/typecheck**

```bash
npm test -- --run src/simulation/__tests__
npm run typecheck
npm run balance -- --framework SPRING_BOOT --db POSTGRESQL --seed 5 --strategy METRICS_AWARE
```

Run the same scenario twice and confirm byte-identical result rows using the repository's existing determinism command/workflow.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/simulation-metrics.ts src/simulation/simulation-runner.ts src/simulation/__tests__
git commit -m "feat: report exit SLO diagnostics"
```

---

### Task 7: Verify representative revenue-vs-SLO traces

**Files:**
- Modify: `src/simulation/simulation-runner.ts` only if trace output needs exit-readiness fields.
- Modify/add: simulation trace regression tests.

**Interfaces:**
- Trace diagnostics should expose enough settlement/SLO state to explain `revenue target met but not yet WON` without changing simulation behavior.

- [ ] **Step 1: Add trace fields only if needed for diagnosis**

Prefer:

```ts
readonly sloPassed: boolean;
readonly sloHealthyDays: number;
readonly sloAverageFailureRate: number;
```

on `BalanceTraceEntry` at the existing trace sampling point.

- [ ] **Step 2: Add a trace on/off determinism regression**

For a representative scenario, assert traced and untraced `BalanceRunResult` remain exactly equal.

- [ ] **Step 3: Run representative traces**

At minimum run one informed and one reactive strategy on known late-game seeds from the prior bifurcation diagnosis, including `GIN/MYSQL seed 18`.

Verify manually from trace evidence that:

- revenue can meet/exceed target while failed SLO blocks `WON`;
- once a complete trailing window passes, the next qualifying monthly settlement can win;
- same-day scaling does not erase the already-observed SLO day.

- [ ] **Step 4: Run full normal CI before balance pilot**

Required checks:

```text
all unit/integration tests
TypeScript typecheck
production build
balance CLI smoke
same-seed deterministic rerun
representative traces
artifact hygiene
```

- [ ] **Step 5: Commit any trace-only additions**

```bash
git add src/simulation
git commit -m "test: cover stable-scale exit traces"
```

---

### Task 8: Run the 450-run all-stack stable-scale pilot

**Files:**
- Create temporarily: `.github/workflows/bp2-stable-scale-pilot.yml`
- Delete the workflow immediately after artifact capture.

**Interfaces:**
- Exact pilot matrix:
  ```text
  5 frameworks × 3 databases × 5 seeds × 6 strategies = 450 rows
  seeds = 5, 8, 17, 23, 29
  ```

- [ ] **Step 1: Create temporary matrix workflow**

Each of 15 stack shards must produce exactly 30 rows and validate unique `(seed,strategy)` keys.

Aggregate must validate:

```text
450 rows
450 unique framework/database/seed/strategy keys
75 rows per strategy
30 rows per stack
```

- [ ] **Step 2: Aggregate required pilot evidence**

Calculate:

- overall win/bankruptcy/timeout rates;
- per-strategy win rates;
- informed minus riskier win delta;
- post-release overload days/run cohort ratio;
- missing dependency days/run cohort ratio;
- winner-day median and wins before day 365;
- `revenueTargetMetButSloFailedSettlements` by strategy;
- final SLO healthy days/failure rate/dependency state;
- infrastructure exposure and bankruptcy sanity.

- [ ] **Step 3: Apply the design decision rule**

Proceed to the full matrix only if the pilot is plausible and causally points in the intended direction. Do not sweep SLO thresholds or ALB capacity.

- [ ] **Step 4: Delete the temporary pilot workflow**

Commit deletion so later code commits do not rerun the pilot.

---

### Task 9: Run the exact 2,700 hard-gate matrix and merge only on success

**Files:**
- Create temporarily: `.github/workflows/balance-pass-2-final-matrix.yml`
- Update after stable evidence: `docs/superpowers/specs/2026-08-31-stable-scale-exit-condition-design.md` and/or release-readiness evidence doc if needed.
- Delete the temporary matrix workflow after artifact capture.

**Interfaces:**
- Exact final matrix:
  ```text
  5 frameworks × 3 databases × 30 seeds × 6 strategies = 2,700 rows
  ```

- [ ] **Step 1: Run the exact final matrix on the frozen candidate commit**

Validate:

```text
2,700 rows
2,700 unique framework/database/seed/strategy keys
450 rows per strategy
180 rows per stack
```

- [ ] **Step 2: Evaluate every hard gate**

Must all pass:

```text
overall win rate 15%-45%
bankruptcy 10%-35%
timeout non-zero
>= 4 strategies win
no strategy > 80% win
informed win rate >= riskier + 10pp
informed post-release overload/run <= 80% of riskier
informed missing REQUIRED dependency days/run <= 50% of riskier
winner-day median 500-1000
wins before day 365 remain rare
```

Review but do not automatically reject on:

```text
informed median infra exposure > 1.5x riskier
informed bankruptcy > riskier
SLO gate being nearly decorative or nearly impossible
strong stack-direction reversals
```

- [ ] **Step 3: Delete the temporary final-matrix workflow and run one final normal CI**

Do not claim completion until the workflow deletion commit has passed the normal test/typecheck/build/determinism/trace suite.

- [ ] **Step 4: Update evidence documentation**

Record exact run IDs, aggregate counts, cohort metrics, SLO diagnostics, and final pass/fail decision.

- [ ] **Step 5: Merge PR #21 only if every hard gate passes**

If any hard gate fails, leave PR #21 open and return to causal diagnosis. Do not merge based on local/unit CI alone.
