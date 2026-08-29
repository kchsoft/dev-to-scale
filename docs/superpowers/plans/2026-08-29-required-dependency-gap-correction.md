# Required Dependency Gap Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the balance harness so deterministic strategies can detect and repair missing REQUIRED topology dependencies before game-balance constants are tuned.

**Architecture:** Derive immutable dependency-gap observations from request traces, wrap all registered strategies with one shared hard-dependency recovery guard, and extend simulation metrics with progression/topology diagnostics. Preserve all existing core game balance constants.

**Tech Stack:** TypeScript, Vitest, Next.js, deterministic simulation CLI, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-29-required-dependency-gap-correction-design.md`

## Global Constraints

- No progression, growth, revenue, or exit-target constant changes in this plan.
- Missing dependency data must be copied/immutable and must not leak `GameEngine` or live infrastructure state.
- Existing per-strategy runway affordability remains authoritative.
- Normal CI must remain fast; full 2,700-run matrix is one-off verification evidence, not a normal PR step.

---

### Task 1: Expose required dependency gaps

**Files:**
- Modify: `src/simulation/__tests__/balance-observation.spec.ts`
- Modify: `src/simulation/balance-observation.ts`

**Interfaces:**
- Produces: `RequiredDependencyGapObservation` and `CommonBalanceObservation.requiredDependencyGaps`.

- [ ] **Step 1: Write a failing observation test**
  - Build a deterministic launched game far enough to complete a queue-required feature, or use a deterministic setup that produces a REQUIRED missing `EVENT_BUS` request step.
  - Assert observation contains an `EVENT_BUS` gap with `candidateTechnologyIds: ['SQS', 'RABBITMQ', 'KAFKA']`.
  - Deploy SQS and assert the gap disappears.
- [ ] **Step 2: Run CI/test and verify RED**
  - Expected failure: `requiredDependencyGaps` is absent.
- [ ] **Step 3: Implement minimal gap derivation**
  - Scan `snapshot.load.requestTraces` for REQUIRED + MISSING steps.
  - Group by role, sort workload IDs, map only `EVENT_BUS` to queue candidates.
- [ ] **Step 4: Verify observation tests GREEN**

### Task 2: Prioritize hard dependency recovery in all strategies

**Files:**
- Modify: `src/simulation/__tests__/strategies.spec.ts`
- Modify: `src/simulation/strategy-helpers.ts`
- Modify: `src/simulation/strategy-registry.ts`

**Interfaces:**
- Produces: shared dependency-recovery guard applied to all `BALANCE_STRATEGIES`.

- [ ] **Step 1: Write failing strategy tests**
  - For every strategy ID, provide an observation with both a missing `EVENT_BUS` dependency and an ordinary overload signal; assert the action is `START_TECHNOLOGY_BUILD/SQS` when affordable.
  - Provide a hard gap whose candidates are unavailable and assert the guarded strategy returns `NO_OP` rather than unrelated resize/scale-out.
- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Implement minimal shared guard**
  - Resolve first deterministic gap.
  - Use existing `technologyAction`, `affordable`, and strategy ID/runway rules.
  - Choose cheapest affordable candidate deterministically.
  - Return NO_OP if a hard gap cannot currently be repaired.
  - Wrap registered strategies instead of duplicating policy in six files.
- [ ] **Step 4: Verify strategy tests GREEN**

### Task 3: Add diagnostic metrics

**Files:**
- Modify: `src/simulation/__tests__/simulation-metrics.spec.ts`
- Modify: `src/simulation/simulation-metrics.ts`
- Modify: `src/simulation/simulation-runner.ts`
- Modify: `src/simulation/balance-report.ts`
- Modify tests if CSV fixtures require the new columns.

**Interfaces:**
- Adds `peakDau`, `completedFeatureCount`, `missingRequiredDependencyDays`, `peakMonthlyRevenue` to `BalanceRunResult`.

- [ ] **Step 1: Write failing metric tests**
  - Record multiple daily progression samples and assert maxima.
  - Record missing-dependency true/false days and assert exact day count.
- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Implement collector methods and runner recording**
  - Daily: DAU, completed feature count, required missing-step presence.
  - Settlement: peak monthly revenue.
  - Add fields to result and CSV columns.
- [ ] **Step 4: Verify metric/report tests GREEN**

### Task 4: Regression verification and balance evidence

**Files:**
- No game-balance production constants changed.
- Update PR description with evidence.

- [ ] **Step 1: Run full test suite, typecheck, build, deterministic smoke and representative traces**
- [ ] **Step 2: Run `SPRING_BOOT + POSTGRESQL + seed 17` for all six strategies and compare failure/gap/peak metrics with baseline**
- [ ] **Step 3: Run the full 2,700-run matrix as one-off evidence**
- [ ] **Step 4: Analyze wins/bankruptcies/timeouts plus new diagnostic metrics before proposing Balance Pass 1 constant changes**
