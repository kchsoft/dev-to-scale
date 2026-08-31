# Post-Release Stability Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a seven-day live-load stability watch for informed strategies without changing the existing 85% projected pre-release readiness policy.

**Architecture:** Reuse `SimulationMetricsCollector` as the canonical release-window clock, expose a read-only active-window query, and propagate that boolean through `StrategyDecisionContext`. Add live-load stability decision helpers in `release-readiness.ts`, call them before existing pre-release readiness in METRICS/APM/ORACLE, then validate with targeted traces and a paired 450-scenario pilot.

**Tech Stack:** TypeScript, Vitest, Node 22, GitHub Actions balance CLI.

**Spec:** `docs/superpowers/specs/2026-08-30-post-release-stability-watch-design.md`

## Global Constraints

- Existing projected pre-release readiness threshold remains 85%.
- Post-release watch is active only during the existing seven-day release window.
- Post-release capacity consideration starts at actual live effective pressure >=70% and never below 70%.
- No growth, pricing, workload, release-timing, progression, framework/database modifier or learning changes.
- Informed strategies only: METRICS_AWARE, APM_AWARE, ORACLE.
- Full 2,700-scenario matrix is run only if the paired pilot does not reproduce premature-investment regressions.

---

### Task 1: Propagate Active Release-Window State

**Files:**
- Modify: `src/simulation/simulation-metrics.ts`
- Modify: `src/simulation/balance-strategy.ts`
- Modify: `src/simulation/simulation-runner.ts`
- Test: `src/simulation/__tests__/simulation-metrics.spec.ts`

**Interfaces:**
- Produces: `SimulationMetricsCollector.hasActiveReleaseWindow(): boolean`
- Produces: `StrategyDecisionContext.postReleaseStabilityWindowActive?: boolean`

- [ ] **Step 1: Write the failing collector lifecycle test**

Add a test that constructs `SimulationMetricsCollector`, asserts the window is initially inactive, calls `beginFeatureReleaseWindow()`, then records seven operational days and verifies the query remains aligned with the seven counted days before becoming inactive.

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `npm test -- --run src/simulation/__tests__/simulation-metrics.spec.ts`
Expected: FAIL because `hasActiveReleaseWindow` does not exist.

- [ ] **Step 3: Implement the query and context propagation**

Add:

```ts
hasActiveReleaseWindow(): boolean {
  return this.releaseWindows.length > 0;
}
```

Extend strategy context:

```ts
readonly postReleaseStabilityWindowActive?: boolean;
```

In the runner, capture active-window state before `observeDailyOperationalMetrics()` decrements the window, then include it in `decisionContext`.

- [ ] **Step 4: Run the targeted test and typecheck**

Run: `npm test -- --run src/simulation/__tests__/simulation-metrics.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: expose post-release stability window`

---

### Task 2: Add METRICS Live Stability Decision

**Files:**
- Modify: `src/simulation/balance-action.ts`
- Modify: `src/simulation/release-readiness.ts`
- Modify: `src/simulation/strategies/metrics-aware.ts`
- Modify: `src/simulation/simulation-metrics.ts`
- Test: `src/simulation/__tests__/release-readiness.spec.ts`

**Interfaces:**
- Produces: `decideMetricsPostReleaseStability(observation, context, strategyId)`
- Produces: action intent `POST_RELEASE_STABILITY_CAPACITY`

- [ ] **Step 1: Write failing boundary tests**

Add tests proving:

```text
window=false, live=90% -> null
window=true, live=69% -> null
window=true, live=70% -> affordable live-resource remedy tagged POST_RELEASE_STABILITY_CAPACITY
```

Use live `resourceLoads`; release preview may be below 85% to prove the helper does not use projected pressure.

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `npm test -- --run src/simulation/__tests__/release-readiness.spec.ts`
Expected: FAIL because the helper/intent is absent.

- [ ] **Step 3: Implement minimal METRICS helper and ordering**

Use `hottestResource`, `nodeFor`, `resourceRemedyCandidates`, `firstAffordable` and the 70% live boundary. In `metrics-aware.ts`, call the post-release helper before `decideMetricsReleaseReadiness`.

- [ ] **Step 4: Count the new intent as preventative capacity**

Update `recordPreventativeAction()` so both `RELEASE_READINESS_CAPACITY` and `POST_RELEASE_STABILITY_CAPACITY` increment `preventativeCapacityActionCount`.

- [ ] **Step 5: Run targeted tests and commit**

Run: `npm test -- --run src/simulation/__tests__/release-readiness.spec.ts`
Expected: PASS.
Commit message: `feat: stabilize metrics releases from live load`

---

### Task 3: Add APM Live Stability Decision

**Files:**
- Modify: `src/simulation/release-readiness.ts`
- Modify: `src/simulation/strategies/apm-aware.ts`
- Test: `src/simulation/__tests__/apm-release-readiness.spec.ts`

**Interfaces:**
- Produces: `decideApmPostReleaseStability(observation, context)`

- [ ] **Step 1: Write failing APM tests**

Add tests proving an active window with a live diagnosed bottleneck at 70% chooses a diagnosis-supported remedy, below 70% does nothing, and no diagnosis falls back to live METRICS resource loads rather than release preview.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- --run src/simulation/__tests__/apm-release-readiness.spec.ts`
Expected: FAIL before implementation.

- [ ] **Step 3: Implement APM helper and ordering**

Use current `observation.diagnosis.topBottleneck`. If absent, delegate to `decideMetricsPostReleaseStability`. Call this helper before pre-release readiness in `apm-aware.ts`.

- [ ] **Step 4: Run targeted tests and commit**

Run: `npm test -- --run src/simulation/__tests__/apm-release-readiness.spec.ts`
Expected: PASS.
Commit message: `feat: stabilize apm releases from live diagnosis`

---

### Task 4: Add ORACLE Live Stability Decision

**Files:**
- Modify: `src/simulation/release-readiness.ts`
- Modify: `src/simulation/strategies/oracle.ts`
- Test: `src/simulation/__tests__/oracle-release-readiness.spec.ts`

**Interfaces:**
- Produces: `decideOraclePostReleaseStability(observation, context)`

- [ ] **Step 1: Write failing ORACLE tests**

Add tests proving inactive window returns null, exact live 0.69 returns null, exact live 0.70 evaluates current-live candidates, and candidate ranking uses normal preview methods rather than `previewReleaseAction`.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- --run src/simulation/__tests__/oracle-release-readiness.spec.ts`
Expected: FAIL before implementation.

- [ ] **Step 3: Implement current-live candidate ranking**

Reuse the current ORACLE candidate semantics: workload-aware remedies, 2% meaningful relief floor, one-month cost, deterministic tie-break. Prefer results with next max <=0.85. Tag the chosen action `POST_RELEASE_STABILITY_CAPACITY`.

- [ ] **Step 4: Call stability before readiness and normal ORACLE behavior**

Order in `oracle.ts`: post-release stability -> pre-release readiness -> normal ORACLE.

- [ ] **Step 5: Run targeted tests and commit**

Run: `npm test -- --run src/simulation/__tests__/oracle-release-readiness.spec.ts`
Expected: PASS.
Commit message: `feat: stabilize oracle releases from live pressure`

---

### Task 5: Verify Integration and Representative Traces

**Files:**
- Create temporarily: `.github/workflows/post-release-stability-trace.yml`
- Delete after evidence capture: `.github/workflows/post-release-stability-trace.yml`
- Update: `docs/superpowers/specs/2026-08-30-post-release-stability-watch-design.md`

**Interfaces:**
- Consumes production strategy behavior from Tasks 1-4.
- Produces diagnostic evidence that live action starts at >=70% and never because projected pressure alone crosses 70%.

- [ ] **Step 1: Run normal verification**

Run via CI: tests, typecheck, production build, balance CLI smoke, determinism and representative traces.
Expected: all green.

- [ ] **Step 2: Run paired representative traces**

Use the three previously diagnosed scenarios:

```text
ASPNET_CORE/MONGODB/seed=5/METRICS_AWARE
ASPNET_CORE/MYSQL/seed=5/APM_AWARE
ASPNET_CORE/MYSQL/seed=29/ORACLE
```

Compare restored-85 baseline against post-release-watch branch.

- [ ] **Step 3: Verify causal behavior**

Required trace assertions:

```text
no new action when current live hottest signal <70%
new stability action can occur during active release window at live >=70%
pre-release projected 70-84% remains NO_OP when no live window requires stabilization
```

- [ ] **Step 4: Remove temporary workflow and record evidence**

Commit message: `docs: record post-release stability trace evidence`

---

### Task 6: Paired 450-Scenario Pilot

**Files:**
- Create temporarily: `.github/workflows/post-release-stability-pilot.yml`
- Delete after evidence capture: `.github/workflows/post-release-stability-pilot.yml`
- Update: `docs/superpowers/specs/2026-08-30-post-release-stability-watch-design.md`

**Interfaces:**
- Produces paired baseline/watch aggregate metrics over 450 scenarios.

- [ ] **Step 1: Run all 15 stack combinations with seeds `[5,8,17,23,29]` and six strategies**

Expected total rows: 450 per policy.

- [ ] **Step 2: Compare hard diagnostic metrics**

Compare informed win rate, post-release overload days/run, features released into overload/run, premature capacity actions/run, low-utilization expanded-node days/run, failure/overload days, infrastructure exposure and cash outcomes.

- [ ] **Step 3: Apply pilot gate**

Reject without full matrix if premature capacity or low-utilization metrics reproduce the rejected 70% pre-release pattern, or if post-release overload worsens materially.

Proceed only if post-release overload improves and economy/investment diagnostics remain controlled.

- [ ] **Step 4: Remove temporary workflow and record results**

Commit message: `docs: record post-release stability pilot`

---

### Task 7: Full Matrix Only If Pilot Passes

**Files:**
- Reuse existing full Balance Pass 2 workflow shape.
- Update relevant Balance Pass 2 docs with final acceptance numbers.

**Interfaces:**
- Produces exact 2,700-scenario acceptance evidence.

- [ ] **Step 1: Run 5 frameworks × 3 databases × 30 seeds × 6 strategies**

Expected rows: exactly 2,700.

- [ ] **Step 2: Evaluate hard criteria**

The full matrix, not the favorable five-seed pilot, decides informed-vs-riskier win separation and post-release overload prevention.

- [ ] **Step 3: Keep PR #21 Draft unless hard criteria pass**

If criteria still fail, stop and diagnose the next causal gap rather than sweeping thresholds.
