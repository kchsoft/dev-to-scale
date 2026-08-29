# Workload-aware Database Fit Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PostgreSQL, MySQL, and MongoDB change DB CPU/I/O demand according to generic feature workload tags while preserving Redis, replica, sizing, and request-flow responsibilities.

**Architecture:** `DatabaseDefinition` owns a pure tag-driven runtime demand policy that returns independent CPU/I/O multipliers with a V1 clamp. `LoadCalculator` computes raw DB demand, derives Redis traffic/offload from that raw logical workload, applies the selected database fit only to the residual DB workload, then applies request-trace arrival before producing node loads. No database-specific branching belongs in the calculator or UI.

**Tech Stack:** TypeScript, Vitest, Next.js 16.3.2, existing Core `FeatureDefinition` / `DatabaseDefinition` / `LoadCalculator` models.

**Spec:** `docs/superpowers/specs/2026-08-29-workload-aware-database-fit-design.md`

## Global Constraints

- Generic feature tags, never feature IDs, drive database runtime fit.
- Runtime fit changes DB demand only; it does not change nominal/effective capacity, prices, replica coefficients, APP, queue, storage, or Redis capacity.
- CPU and I/O multipliers are independent.
- Matching tag modifiers multiply, then clamp each axis to `[0.80, 1.25]`.
- Redis throughput demand must remain identical for the same logical read-heavy traffic regardless of database choice.
- Redis offload remains 12% DB CPU and 40% DB I/O.
- Existing development-work modifiers remain separate from runtime demand modifiers.
- PostgreSQL V1 runtime profile: `TRANSACTIONAL 0.90/0.88`, `WRITE_HEAVY 0.95/0.90`, `SEARCH 0.95/0.95`.
- MySQL V1 runtime profile: `READ_HEAVY 0.94/0.90`, `CONTENT 0.97/0.95`, `TRANSACTIONAL 1.03/1.05`.
- MongoDB V1 runtime profile: `CONTENT 0.90/0.88`, `READ_HEAVY 0.96/0.94`, `TRANSACTIONAL 1.15/1.20`, `SEARCH 1.05/1.08`.
- Full test suite, typecheck, and production build must remain green.

---

## File Structure

- `src/core/database.ts` — owns `DatabaseResourceDemandModifier`, per-database tag tables, multiplicative composition, and `[0.80, 1.25]` clamp.
- `src/core/infrastructure.ts` — `LoadCalculator` orchestrates raw demand → Redis offload → DB fit → trace arrival; contains no product-specific DB fit values.
- `src/core/__tests__/database.spec.ts` — pure policy tests for neutral, positive/negative fit, composition, and clamp behavior.
- `src/core/__tests__/infrastructure-load.spec.ts` — integration tests for cross-database pressure, Redis invariance, isolation of DB-only demand changes, unchanged capacity, and upstream masking.

### Task 1: Pure Database Runtime Fit Policy

**Files:**
- Modify: `src/core/database.ts`
- Modify: `src/core/__tests__/database.spec.ts`

**Interfaces:**
- Consumes: `FeatureDefinition`, `FeatureTag` from `src/core/feature.ts`.
- Produces:
  ```ts
  export interface DatabaseResourceDemandModifier {
    readonly cpu: number;
    readonly io: number;
  }

  DatabaseDefinition.resourceDemandModifierFor(
    feature: FeatureDefinition,
  ): DatabaseResourceDemandModifier
  ```

- [ ] **Step 1: Write failing policy tests**

Extend `database.spec.ts` with direct tests that construct small tagged features and call `resourceDemandModifierFor()`:

```ts
function taggedFeature(id: string, tags: FeatureTag[]): FeatureDefinition {
  return new FeatureDefinition({
    id,
    name: id,
    baseWork: 1,
    complexity: 'NORMAL',
    load: { app: 0, db: 1, async: 0, storage: 0 },
    tags,
  });
}

it('returns neutral runtime demand modifiers for an unmatched workload', () => {
  const feature = taggedFeature('NEUTRAL', ['AI']);
  expect(DatabaseDefinition.postgresql().resourceDemandModifierFor(feature)).toEqual({ cpu: 1, io: 1 });
  expect(DatabaseDefinition.mysql().resourceDemandModifierFor(feature)).toEqual({ cpu: 1, io: 1 });
  expect(DatabaseDefinition.mongodb().resourceDemandModifierFor(feature)).toEqual({ cpu: 1, io: 1 });
});

it('gives each database its intended workload signature', () => {
  const transactional = taggedFeature('TX', ['TRANSACTIONAL']);
  const readContent = taggedFeature('READ_CONTENT', ['READ_HEAVY', 'CONTENT']);

  expect(DatabaseDefinition.postgresql().resourceDemandModifierFor(transactional)).toEqual({ cpu: 0.9, io: 0.88 });
  expect(DatabaseDefinition.mysql().resourceDemandModifierFor(readContent)).toEqual({ cpu: 0.94 * 0.97, io: 0.90 * 0.95 });
  expect(DatabaseDefinition.mongodb().resourceDemandModifierFor(transactional)).toEqual({ cpu: 1.15, io: 1.20 });
});

it('multiplies matching tags and clamps each runtime demand axis', () => {
  const mongoFriendly = taggedFeature('DOC_READ', ['CONTENT', 'READ_HEAVY']);
  const mongoHostile = taggedFeature('TX_SEARCH', ['TRANSACTIONAL', 'SEARCH']);

  expect(DatabaseDefinition.mongodb().resourceDemandModifierFor(mongoFriendly)).toEqual({
    cpu: 0.9 * 0.96,
    io: 0.88 * 0.94,
  });
  expect(DatabaseDefinition.mongodb().resourceDemandModifierFor(mongoHostile)).toEqual({
    cpu: 1.15 * 1.05,
    io: 1.20 * 1.08 > 1.25 ? 1.25 : 1.20 * 1.08,
  });
});
```

Also add one PostgreSQL multi-tag case that crosses below `0.80` if a future table change would allow it, by testing the exported policy helper only if needed. Prefer keeping the clamp private and covering the actual current combinations through product methods; do not export an internal helper solely for tests.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- src/core/__tests__/database.spec.ts
```

Expected: FAIL because `resourceDemandModifierFor` and `DatabaseResourceDemandModifier` do not exist.

- [ ] **Step 3: Implement the minimal pure policy**

In `database.ts`, extend the constructor with a runtime table separate from `tagWorkModifiers`:

```ts
export interface DatabaseResourceDemandModifier {
  readonly cpu: number;
  readonly io: number;
}

type DatabaseRuntimeTagModifiers = Partial<Record<FeatureTag, DatabaseResourceDemandModifier>>;

const MIN_RUNTIME_DEMAND_MODIFIER = 0.80;
const MAX_RUNTIME_DEMAND_MODIFIER = 1.25;

function clampRuntimeModifier(value: number): number {
  return Math.min(MAX_RUNTIME_DEMAND_MODIFIER, Math.max(MIN_RUNTIME_DEMAND_MODIFIER, value));
}
```

Use the exact V1 tables from Global Constraints when constructing PostgreSQL/MySQL/MongoDB. Add:

```ts
resourceDemandModifierFor(feature: FeatureDefinition): DatabaseResourceDemandModifier {
  let cpu = 1;
  let io = 1;
  for (const tag of feature.tags) {
    const modifier = this.runtimeTagDemandModifiers[tag];
    if (!modifier) continue;
    cpu *= modifier.cpu;
    io *= modifier.io;
  }
  return {
    cpu: clampRuntimeModifier(cpu),
    io: clampRuntimeModifier(io),
  };
}
```

Keep `workModifierFor()` untouched and do not reuse its table.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
npm test -- src/core/__tests__/database.spec.ts
npm run typecheck
```

Expected: database tests PASS and typecheck PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/core/database.ts src/core/__tests__/database.spec.ts
git commit -m "feat: add database workload fit policy"
```

### Task 2: Integrate Database Fit into LoadCalculator

**Files:**
- Modify: `src/core/infrastructure.ts`
- Modify: `src/core/__tests__/infrastructure-load.spec.ts`

**Interfaces:**
- Consumes: `DatabaseDefinition.byId(databaseId).resourceDemandModifierFor(feature)` from Task 1.
- Produces: database-specific actual CPU/I/O `demand` values in existing `NodeResourceLoad`; no new `LoadSnapshot` fields.

- [ ] **Step 1: Write failing cross-database demand tests**

Add a helper that reads an exact DB resource by node kind/resource kind from the existing `nodeResource` helper, then add:

```ts
it('applies transactional database fit to residual DB CPU and IO demand', () => {
  const feature = new FeatureDefinition({
    id: 'CHECKOUT',
    name: 'Checkout',
    baseWork: 1,
    complexity: 'NORMAL',
    load: { app: 1, db: 2, async: 0, storage: 0 },
    resourceLoad: { db: { cpu: 1.2, io: 2.0 } },
    tags: ['TRANSACTIONAL'],
    requestRoute: [{ node: 'APP' }, { node: 'DB' }],
  });

  const postgres = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL'));
  const mysql = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'MYSQL'));
  const mongo = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'MONGODB'));

  expect(nodeResource(postgres, 'DATABASE', 'CPU')!.demand).toBeLessThan(nodeResource(mysql, 'DATABASE', 'CPU')!.demand);
  expect(nodeResource(mysql, 'DATABASE', 'CPU')!.demand).toBeLessThan(nodeResource(mongo, 'DATABASE', 'CPU')!.demand);
  expect(nodeResource(postgres, 'DATABASE', 'IO')!.demand).toBeLessThan(nodeResource(mysql, 'DATABASE', 'IO')!.demand);
  expect(nodeResource(mysql, 'DATABASE', 'IO')!.demand).toBeLessThan(nodeResource(mongo, 'DATABASE', 'IO')!.demand);
});

it('lets read/content workloads favor MySQL or MongoDB over PostgreSQL demand', () => {
  const feature = new FeatureDefinition({
    id: 'CONTENT_FEED',
    name: 'Content feed',
    baseWork: 1,
    complexity: 'NORMAL',
    load: { app: 1, db: 2, async: 0, storage: 0 },
    resourceLoad: { db: { cpu: 1.0, io: 2.5 } },
    tags: ['READ_HEAVY', 'CONTENT'],
    requestRoute: [{ node: 'APP' }, { node: 'DB' }],
  });

  const postgres = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL'));
  const mysql = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'MYSQL'));
  const mongo = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'MONGODB'));

  expect(nodeResource(mysql, 'DATABASE', 'IO')!.demand).toBeLessThan(nodeResource(postgres, 'DATABASE', 'IO')!.demand);
  expect(nodeResource(mongo, 'DATABASE', 'IO')!.demand).toBeLessThan(nodeResource(postgres, 'DATABASE', 'IO')!.demand);
});
```

- [ ] **Step 2: Run focused integration tests and verify RED**

```bash
npm test -- src/core/__tests__/infrastructure-load.spec.ts
```

Expected: the new cross-database demand assertions FAIL because DB runtime fit is not applied by `LoadCalculator` yet.

- [ ] **Step 3: Apply DB fit after Redis offload and before trace arrival**

Near the existing per-feature DB calculations in `LoadCalculator`, resolve the selected database definition once per projection or once per feature loop:

```ts
const database = DatabaseDefinition.byId(infrastructure.database.databaseId);
```

For each feature, preserve the current raw base values and Redis calculations. Immediately after the Redis branch mutates residual `dbCpuBase` / `dbIoBase`, apply:

```ts
const databaseFit = database.resourceDemandModifierFor(feature);
dbCpuBase *= databaseFit.cpu;
dbIoBase *= databaseFit.io;
```

Then keep the existing arrival code unchanged:

```ts
dbCpuDemand += dbCpuBase * traceArrival(trace, databaseNodeId);
dbIoDemand += dbIoBase * traceArrival(trace, databaseNodeId);
```

Do not multiply `cacheDemand`, APP demand, async demand, or storage demand by database fit.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
npm test -- src/core/__tests__/database.spec.ts src/core/__tests__/infrastructure-load.spec.ts
npm run typecheck
```

Expected: both suites PASS and typecheck PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/core/infrastructure.ts src/core/__tests__/infrastructure-load.spec.ts
git commit -m "feat: apply database fit to runtime demand"
```

### Task 3: Lock Redis, Capacity, and Flow Invariants

**Files:**
- Modify: `src/core/__tests__/infrastructure-load.spec.ts`
- Production changes only if a regression test reveals a real violation.

**Interfaces:**
- Consumes: existing `LoadCalculator.calculate`, `InfrastructureState`, `nominal/effective` node-resource load fields.
- Produces: regression coverage proving database fit does not leak into unrelated systems.

- [ ] **Step 1: Add Redis invariance test**

Use the same `READ_HEAVY` feature and deploy Redis in PostgreSQL/MySQL/MongoDB infrastructures:

```ts
it('keeps Redis throughput demand database-independent while residual DB demand differs', () => {
  const feature = new FeatureDefinition({
    id: 'READ_FEED',
    name: 'Read feed',
    baseWork: 1,
    complexity: 'NORMAL',
    load: { app: 1, db: 2, async: 0, storage: 0 },
    resourceLoad: { db: { cpu: 1.4, io: 3.0 } },
    tags: ['READ_HEAVY', 'CONTENT'],
    requestRoute: [{ node: 'APP' }, { node: 'DB' }],
  });

  const loads = (['POSTGRESQL', 'MYSQL', 'MONGODB'] as const).map((databaseId) => {
    const infra = InfrastructureState.initial('SPRING_BOOT', databaseId);
    infra.deployTechnology('REDIS');
    return LoadCalculator.calculate(100_000, [feature], infra);
  });

  const cacheDemand = loads.map((load) => load.nodeLoads.find(({ nodeKind }) => nodeKind === 'CACHE')!.resources[0].demand);
  expect(cacheDemand[1]).toBeCloseTo(cacheDemand[0]);
  expect(cacheDemand[2]).toBeCloseTo(cacheDemand[0]);

  expect(nodeResource(loads[1], 'DATABASE', 'IO')!.demand).not.toBeCloseTo(nodeResource(loads[0], 'DATABASE', 'IO')!.demand);
  expect(nodeResource(loads[2], 'DATABASE', 'IO')!.demand).not.toBeCloseTo(nodeResource(loads[0], 'DATABASE', 'IO')!.demand);
});
```

- [ ] **Step 2: Add DB-only isolation and capacity invariants**

Add one test using equal logical traffic that compares PostgreSQL/MySQL/MongoDB and asserts:

```ts
expect(nodeResource(mysqlLoad, 'SERVER_GROUP', 'CPU')!.demand)
  .toBeCloseTo(nodeResource(postgresLoad, 'SERVER_GROUP', 'CPU')!.demand);
expect(nodeResource(mongoLoad, 'SERVER_GROUP', 'IO')!.demand)
  .toBeCloseTo(nodeResource(postgresLoad, 'SERVER_GROUP', 'IO')!.demand);
```

Then compare `nominalCapacity` for same-size databases according to existing sizing rules and `effectiveCapacity` according to the pre-existing database capacity modifier. The test must verify workload tags do not mutate those capacity values inside a selected DB; do not incorrectly expect MongoDB's existing 1.05 capacity modifier to equal PostgreSQL.

- [ ] **Step 3: Add upstream masking invariant**

Create identical transactional workloads with a deliberately constrained upstream APP or ALB and assert that database-fit differences are applied only to traffic that reaches DB:

```ts
expect(constrainedDbDemand).toBeLessThan(unconstrainedDbDemand);
```

Keep the existing `removes downstream DB load when an APP incident blocks request flow` test green; do not create a parallel flow algorithm for DB fit.

- [ ] **Step 4: Run focused regression tests**

```bash
npm test -- src/core/__tests__/database.spec.ts src/core/__tests__/infrastructure-load.spec.ts src/core/__tests__/overload-request-flow.spec.ts
npm run typecheck
```

Expected: PASS. If any new invariant fails, fix the smallest production issue in `database.ts` or `infrastructure.ts`, then rerun these exact commands.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/core/__tests__/infrastructure-load.spec.ts src/core/database.ts src/core/infrastructure.ts
git commit -m "test: lock database fit integration invariants"
```

### Task 4: Full Regression, Review, and Merge Readiness

**Files:**
- Review: `src/core/database.ts`
- Review: `src/core/infrastructure.ts`
- Review: `src/core/__tests__/database.spec.ts`
- Review: `src/core/__tests__/infrastructure-load.spec.ts`
- No UI files unless full regression exposes an actual contract break.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a merge-ready branch with one authoritative database workload-fit model.

- [ ] **Step 1: Scan for product-specific workload logic outside `database.ts`**

Search for new/old direct runtime branching such as:

```text
POSTGRESQL
MYSQL
MONGODB
READ_HEAVY
TRANSACTIONAL
```

inside `LoadCalculator`. Product-specific workload-fit tables must exist only in `database.ts`; infrastructure code may only select `DatabaseDefinition.byId(...)`.

- [ ] **Step 2: Verify no capacity-side leakage**

Review diff to ensure this feature did not change:

- `DB_BASE`,
- database `capacityModifier`,
- replica `0.55 / 0.75 / 0.60` coefficients,
- Redis `0.12 / 0.40` offload constants,
- APP/framework capacity modifiers,
- infrastructure prices.

- [ ] **Step 3: Run complete verification**

```bash
npm test
npm run typecheck
npm run build
```

Expected: all test files PASS, all tests PASS, TypeScript emits no errors, and Next.js production build succeeds.

- [ ] **Step 4: Review the complete branch diff against the spec**

Confirm:

- neutral workloads stay `1/1`,
- runtime and development-work modifiers remain separate,
- Redis demand is DB-independent,
- DB fit changes residual DB demand only,
- no feature ID appears in database fit policy,
- no universal best DB is encoded across the provided representative workloads,
- application/UI business rules were not duplicated.

- [ ] **Step 5: Create/update PR and verify the PR synthetic merge**

Open a PR from `feature/workload-aware-database-fit` to `feature/playable-mvp`. Verify the PR-triggered CI checks out the synthetic merge ref and repeats `npm test`, `npm run typecheck`, and `npm run build` successfully before merge.

- [ ] **Step 6: Squash merge and verify landed tree**

Squash merge only if the PR remains mergeable and the head SHA matches the verified commit. Verify `feature/playable-mvp` points at the returned squash commit and, when available, confirm the landed tree SHA matches the tested synthetic-merge tree SHA.
