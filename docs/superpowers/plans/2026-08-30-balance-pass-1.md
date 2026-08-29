# Balance Pass 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retune late-game progression, phase-3 organic growth, and the exit monthly-revenue target so skilled 1080-day runs become winnable while strategy quality remains meaningful.

**Architecture:** Keep the deterministic harness and strategy policies fixed as the measuring instrument. Change only three late-game constants, one TDD cycle at a time, and use a fixed deterministic calibration set before one final 2,700-scenario matrix. Normal PR CI must remain fast; temporary calibration/full-matrix workflows are removed after evidence collection.

**Tech Stack:** TypeScript, Vitest, GitHub Actions, existing deterministic balance CLI.

**Spec:** `docs/superpowers/specs/2026-08-30-balance-pass-1-design.md`

## Global Constraints

- Keep the simulation horizon at exactly 1,080 successful days.
- Do not change starting cash, infrastructure prices, framework/database load profiles, incidents, viral-event frequency/modifiers, feature workloads, feature revenue modifiers, or strategy heuristics.
- Preserve deterministic scenario generation and RNG isolation.
- Candidate progression thresholds: `100, 400, 1_500, 8_000, 30_000, 100_000, 300_000, 900_000, 2_000_000, 5_000_000`.
- Candidate phase-3 positive organic-day probability: `0.58`.
- Candidate exit monthly-revenue target: `200_000_000`.
- Full-matrix acceptance target: overall win 15%-45%, bankruptcy 10%-35%, timeout non-zero, at least four strategies with wins, no strategy above 80% wins.
- Informed cohort (`APM_AWARE`, `METRICS_AWARE`, `ORACLE`) should beat the flawed/riskier cohort (`REACTIVE_BASIC`, `YOLO_SCALE`, `CHEAPSKATE`) by at least 10 percentage points aggregate win rate.
- Winning-day median target: 500-1,000; wins before day 365 should be rare.

---

### Task 1: Lock the late-game progression curve

**Files:**
- Modify: `src/core/__tests__/progression.spec.ts`
- Modify: `src/core/progression.ts`

**Interfaces:**
- Consumes: `COMMUNITY_REQUIREMENT_THRESHOLDS`, `CommunityProgression.currentRequirement`.
- Produces: the approved threshold tuple used by the game engine and simulation harness.

- [ ] **Step 1: Write the failing threshold-contract test**

Add an import for `COMMUNITY_REQUIREMENT_THRESHOLDS` and a test that asserts the exact approved tuple:

```ts
it('uses the Balance Pass 1 late-game DAU curve', () => {
  expect(COMMUNITY_REQUIREMENT_THRESHOLDS).toEqual([
    100,
    400,
    1_500,
    8_000,
    30_000,
    100_000,
    300_000,
    900_000,
    2_000_000,
    5_000_000,
  ]);
});
```

- [ ] **Step 2: Verify RED**

Run in CI: `npm test -- src/core/__tests__/progression.spec.ts`

Expected: FAIL because slots 8-10 are still `1_000_000`, `3_000_000`, `10_000_000`.

- [ ] **Step 3: Apply the minimal progression change**

Change only the final three values in `COMMUNITY_REQUIREMENT_THRESHOLDS`:

```ts
300_000,
900_000,
2_000_000,
5_000_000,
```

- [ ] **Step 4: Verify GREEN and regression suite**

Run: `npm test`, `npm run typecheck`, `npm run build`.

- [ ] **Step 5: Commit**

Commit message: `balance: smooth late-game progression thresholds`.

---

### Task 2: Align the exit revenue target with the final operating scale

**Files:**
- Modify: `src/core/__tests__/incident-finance.spec.ts`
- Modify: `src/core/finance.ts`

**Interfaces:**
- Consumes: `RevenuePolicy.BASE_REVENUE_PER_AVG_DAU`, additive monetization modifier `0.9`.
- Produces: `RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET = 200_000_000`.

- [ ] **Step 1: Write the failing economy-contract test**

Add this finance test:

```ts
it('requires about 5.26M fully monetized average DAU for the Balance Pass 1 exit', () => {
  expect(RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET).toBe(200_000_000);
  expect(RevenuePolicy.monthlyRevenue(5_000_000, 0.9)).toBe(190_000_000);
  expect(RevenuePolicy.monthlyRevenue(5_263_158, 0.9)).toBeGreaterThanOrEqual(
    RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET,
  );
});
```

- [ ] **Step 2: Verify RED**

Run in CI: `npm test -- src/core/__tests__/incident-finance.spec.ts`.

Expected: FAIL because the exit target is still `900_000_000`.

- [ ] **Step 3: Apply the minimal economy change**

Change only:

```ts
static readonly EXIT_MONTHLY_REVENUE_TARGET = 200_000_000;
```

- [ ] **Step 4: Verify GREEN and regression suite**

Run: `npm test`, `npm run typecheck`, `npm run build`.

- [ ] **Step 5: Commit**

Commit message: `balance: align exit revenue with final scale`.

---

### Task 3: Modestly improve phase-3 organic growth

**Files:**
- Modify: `src/core/__tests__/growth.spec.ts`
- Modify: `src/core/growth.ts`

**Interfaces:**
- Consumes: `GrowthPolicy.calculate` and its deterministic `RandomSource`.
- Produces: phase-3 positive-day probability `0.58`, leaving phases 1 and 2 unchanged.

- [ ] **Step 1: Write a boundary test that distinguishes 0.55 from 0.58**

Use the existing `SequenceRandom`. The first random value controls magnitude and the second controls the positive/negative branch:

```ts
it('uses 58% positive organic probability in phase 3', () => {
  const result = GrowthPolicy.calculate({
    phase: 3,
    completedFeatureGrowthBonus: 0,
    event: null,
    incidents: [],
    random: new SequenceRandom([0, 0.56]),
  });

  expect(result.baseModifier).toBe(0.01);
});
```

- [ ] **Step 2: Verify RED**

Run in CI: `npm test -- src/core/__tests__/growth.spec.ts`.

Expected: FAIL with `baseModifier === -0.01` under the old `0.55` probability.

- [ ] **Step 3: Apply the minimal growth change**

Change only:

```ts
3: 0.58,
```

inside `POSITIVE_PROBABILITY`.

- [ ] **Step 4: Verify GREEN and regression suite**

Run: `npm test`, `npm run typecheck`, `npm run build`.

- [ ] **Step 5: Commit**

Commit message: `balance: modestly lift phase three organic growth`.

---

### Task 4: Run a fixed deterministic calibration subset

**Files:**
- Temporarily create: `.github/workflows/balance-pass-1-calibration.yml`
- Delete the workflow after evidence is collected.

**Interfaces:**
- Consumes: existing `npm run balance` CLI filters (`--framework`, `--db`, `--seed`) and all six registered strategies.
- Produces: deterministic evidence for exactly 30 runs across five fixed framework/database/seed tuples.

- [ ] **Step 1: Create the temporary calibration workflow**

Use these fixed tuples, each resolving to six strategy runs:

```text
SPRING_BOOT / POSTGRESQL / 5
SPRING_BOOT / POSTGRESQL / 17
SPRING_BOOT / POSTGRESQL / 29
NESTJS / MYSQL / 23
GIN / MONGODB / 8
```

For each tuple run:

```bash
mkdir -p artifacts/balance
npm run balance -- --framework "$FRAMEWORK" --db "$DATABASE" --seed "$SEED"
```

Assert `runs.csv` contains exactly six data rows and `summary.json.runCount === 6`, then upload the artifact.

- [ ] **Step 2: Verify the calibration jobs all succeed**

Required: 5/5 jobs success, 30 total scenario rows, no duplicate `(framework,database,seed,strategy)` keys.

- [ ] **Step 3: Evaluate plausibility before the full matrix**

Review per-run terminal state, winning day, peak DAU, completed features, peak monthly revenue, failure burden, bankruptcy, and strategy differences.

Reject the candidate before a full matrix if the subset shows obvious pathologies such as universal early wins, universal bankruptcy, or no run completing the final feature.

- [ ] **Step 4: Remove the temporary calibration workflow**

Commit message: `ci: remove balance pass 1 calibration workflow`.

---

### Task 5: Run and analyze the final 2,700-scenario matrix

**Files:**
- Temporarily create: `.github/workflows/balance-pass-1-full.yml`
- Delete the workflow after evidence is collected.
- Update: PR #19 body with final Balance Pass 1 evidence.

**Interfaces:**
- Consumes: the final candidate constants and existing deterministic harness.
- Produces: 15 framework/database shards × 180 rows = exactly 2,700 scenario rows.

- [ ] **Step 1: Create the one-off 15-shard workflow**

Matrix:

```text
framework: SPRING_BOOT, NESTJS, GIN, FASTAPI, ASPNET_CORE
database: POSTGRESQL, MYSQL, MONGODB
```

Each job runs `npm run balance -- --framework <framework> --db <database>`, asserts exactly 180 rows and `summary.runCount === 180`, and uploads one artifact.

- [ ] **Step 2: Verify all 15 shards**

Required: 15/15 success and exactly 15 artifacts.

- [ ] **Step 3: Merge and validate matrix integrity**

Required:

```text
2,700 rows total
15 framework/database combinations × 180
450 rows per strategy
seeds 1-30 present
0 duplicate scenario keys
```

- [ ] **Step 4: Evaluate acceptance bands**

Compute:

- overall WON/TIMEOUT/BANKRUPT rates;
- win rate by strategy;
- informed vs flawed/riskier cohort win-rate delta;
- winner-day median and early-win count (<365);
- win rate by framework/database stack;
- peak DAU, completed feature, peak revenue, failure burden distributions.

- [ ] **Step 5: If acceptance misses, change exactly one candidate value**

Use evidence to choose only one of:

```text
final threshold 5_000_000
phase-3 probability 0.58
exit target 200_000_000
```

Write a failing contract test for the revised value, verify RED, make the one-value production change, verify GREEN, rerun Task 4, then rerun Task 5. Do not change strategy behavior in Balance Pass 1.

- [ ] **Step 6: Remove the one-off full workflow**

Commit message: `ci: remove balance pass 1 full-matrix workflow`.

---

### Task 6: Final verification and PR handoff

**Files:**
- Update: PR #19 body.

**Interfaces:**
- Consumes: final branch HEAD and final matrix evidence.
- Produces: verified Balance Pass 1 result ready for human integration decision.

- [ ] **Step 1: Run fresh normal CI on the final HEAD**

Required successful steps:

```text
npm test
npm run typecheck
npm run build
Balance CLI smoke
same-seed deterministic rerun
representative traces
artifact-ignore check
artifact upload
```

- [ ] **Step 2: Update PR #19 with exact evidence**

Record final constants, CI run ID, test counts, matrix run ID, integrity counts, overall outcomes, strategy win rates, cohort delta, winner-day distribution, stack outliers, and whether every acceptance criterion passed.

- [ ] **Step 3: Keep PR #19 draft until the user chooses integration**

Do not merge or mark ready automatically.