# Workload-aware Database Fit Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PostgreSQL, MySQL, and MongoDB change DB CPU/I/O demand according to generic feature workload tags while preserving Redis, replica, sizing, and request-flow responsibilities.

**Architecture:** `DatabaseDefinition` owns a pure tag-driven runtime demand policy with independent CPU/I/O multipliers and a `[0.80, 1.25]` clamp. `LoadCalculator` computes raw DB demand, derives Redis traffic/offload from raw logical reads, applies database fit only to residual DB work, then applies request-trace arrival. No database-specific workload table belongs outside `database.ts`.

**Tech Stack:** TypeScript, Vitest, Next.js 16.3.2.

**Spec:** `docs/superpowers/specs/2026-08-29-workload-aware-database-fit-design.md`

## Global Constraints

- Feature tags, never feature IDs, drive runtime fit.
- Runtime fit changes DB demand only; it does not change capacity, prices, replica coefficients, APP, queue, storage, or Redis capacity.
- Matching modifiers multiply per axis, then clamp to `[0.80, 1.25]`.
- Redis demand is database-independent for equal logical read traffic; offload stays 12% CPU / 40% I/O.
- Existing development-work modifiers remain separate.
- PostgreSQL: `TRANSACTIONAL 0.90/0.88`, `WRITE_HEAVY 0.95/0.90`, `SEARCH 0.95/0.95`.
- MySQL: `READ_HEAVY 0.94/0.90`, `CONTENT 0.97/0.95`, `TRANSACTIONAL 1.03/1.05`.
- MongoDB: `CONTENT 0.90/0.88`, `READ_HEAVY 0.96/0.94`, `TRANSACTIONAL 1.15/1.20`, `SEARCH 1.05/1.08`.
- Full tests, typecheck, and production build must remain green.

---

### Task 1: Pure database runtime-fit policy

**Files:**
- Modify: `src/core/database.ts`
- Modify: `src/core/__tests__/database.spec.ts`

**Produces:**

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

Add `FeatureDefinition`/`FeatureTag` imports and this helper:

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
```

Add tests for neutral and profile behavior:

```ts
it('returns neutral runtime modifiers for unmatched workload tags', () => {
  const feature = taggedFeature('NEUTRAL', ['AI']);
  expect(DatabaseDefinition.postgresql().resourceDemandModifierFor(feature)).toEqual({ cpu: 1, io: 1 });
  expect(DatabaseDefinition.mysql().resourceDemandModifierFor(feature)).toEqual({ cpu: 1, io: 1 });
  expect(DatabaseDefinition.mongodb().resourceDemandModifierFor(feature)).toEqual({ cpu: 1, io: 1 });
});

it('gives each database its intended workload signature', () => {
  const tx = taggedFeature('TX', ['TRANSACTIONAL']);
  const readContent = taggedFeature('READ_CONTENT', ['READ_HEAVY', 'CONTENT']);

  expect(DatabaseDefinition.postgresql().resourceDemandModifierFor(tx)).toEqual({ cpu: 0.90, io: 0.88 });
  expect(DatabaseDefinition.mysql().resourceDemandModifierFor(readContent)).toEqual({
    cpu: 0.94 * 0.97,
    io: 0.90 * 0.95,
  });
  expect(DatabaseDefinition.mongodb().resourceDemandModifierFor(tx)).toEqual({ cpu: 1.15, io: 1.20 });
});
```

Add explicit current clamp cases:

```ts
it('multiplies matching tags and clamps the result per axis', () => {
  const postgresDense = taggedFeature('PG_DENSE', ['TRANSACTIONAL', 'WRITE_HEAVY', 'SEARCH']);
  const mongoHostile = taggedFeature('MONGO_HOSTILE', ['TRANSACTIONAL', 'SEARCH']);

  expect(DatabaseDefinition.postgresql().resourceDemandModifierFor(postgresDense)).toEqual({
    cpu: 0.90 * 0.95 * 0.95,
    io: 0.80, // 0.88 * 0.90 * 0.95 = 0.7524 -> clamp
  });
  expect(DatabaseDefinition.mongodb().resourceDemandModifierFor(mongoHostile)).toEqual({
    cpu: 1.15 * 1.05,
    io: 1.25, // 1.20 * 1.08 = 1.296 -> clamp
  });
});
```

- [ ] **Step 2: Run focused test and verify RED**

```bash
npm test -- src/core/__tests__/database.spec.ts
```

Expected: FAIL because `resourceDemandModifierFor` does not exist.

- [ ] **Step 3: Implement minimal policy**

In `database.ts` add:

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

Give `DatabaseDefinition` a separate `runtimeTagDemandModifiers` constructor argument. Populate the exact Global Constraint tables and add:

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
  return { cpu: clampRuntimeModifier(cpu), io: clampRuntimeModifier(io) };
}
```

Do not change `workModifierFor()`.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- src/core/__tests__/database.spec.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/core/database.ts src/core/__tests__/database.spec.ts
git commit -m "feat: add database workload fit policy"
```

### Task 2: Apply runtime fit in LoadCalculator

**Files:**
- Modify: `src/core/infrastructure.ts`
- Modify: `src/core/__tests__/infrastructure-load.spec.ts`

- [ ] **Step 1: Write failing cross-database integration tests**

Add a transactional workload:

```ts
it('applies transactional database fit to residual DB demand', () => {
  const feature = new FeatureDefinition({
    id: 'CHECKOUT', name: 'Checkout', baseWork: 1, complexity: 'NORMAL',
    load: { app: 1, db: 2, async: 0, storage: 0 },
    resourceLoad: { db: { cpu: 1.2, io: 2.0 } },
    tags: ['TRANSACTIONAL'],
    requestRoute: [{ node: 'APP' }, { node: 'DB' }],
  });

  const pg = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'POSTGRESQL'));
  const mysql = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'MYSQL'));
  const mongo = LoadCalculator.calculate(100_000, [feature], InfrastructureState.initial('SPRING_BOOT', 'MONGODB'));

  expect(nodeResource(pg, 'DATABASE', 'CPU')!.demand).toBeLessThan(nodeResource(mysql, 'DATABASE', 'CPU')!.demand);
  expect(nodeResource(mysql, 'DATABASE', 'CPU')!.demand).toBeLessThan(nodeResource(mongo, 'DATABASE', 'CPU')!.demand);
  expect(nodeResource(pg, 'DATABASE', 'IO')!.demand).toBeLessThan(nodeResource(mysql, 'DATABASE', 'IO')!.demand);
  expect(nodeResource(mysql, 'DATABASE', 'IO')!.demand).toBeLessThan(nodeResource(mongo, 'DATABASE', 'IO')!.demand);
});
```

Add a read/content workload and assert MySQL/MongoDB residual DB I/O demand is lower than PostgreSQL.

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/core/__tests__/infrastructure-load.spec.ts
```

Expected: new cross-database demand assertions FAIL.

- [ ] **Step 3: Integrate after Redis offload, before trace arrival**

Import `DatabaseDefinition` alongside `DatabaseId` and resolve:

```ts
const database = DatabaseDefinition.byId(infrastructure.database.databaseId);
```

Keep the existing raw base demand and Redis branch. After Redis has adjusted residual `dbCpuBase` / `dbIoBase`, add:

```ts
const databaseFit = database.resourceDemandModifierFor(feature);
dbCpuBase *= databaseFit.cpu;
dbIoBase *= databaseFit.io;
```

Then retain existing arrival accumulation:

```ts
dbCpuDemand += dbCpuBase * traceArrival(trace, databaseNodeId);
dbIoDemand += dbIoBase * traceArrival(trace, databaseNodeId);
```

Do not apply the multiplier to `cacheDemand`, APP, queue, or storage.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- src/core/__tests__/database.spec.ts src/core/__tests__/infrastructure-load.spec.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/core/infrastructure.ts src/core/__tests__/infrastructure-load.spec.ts
git commit -m "feat: apply database fit to runtime demand"
```

### Task 3: Lock Redis, capacity, and flow invariants

**Files:**
- Modify: `src/core/__tests__/infrastructure-load.spec.ts`
- Modify production only if a regression test exposes a real violation.

- [ ] **Step 1: Add Redis-demand invariance test**

Use the same `READ_HEAVY + CONTENT` feature with Redis deployed in all three database infrastructures. Assert cache throughput `demand` is equal with `toBeCloseTo`, while residual DB I/O demand differs.

- [ ] **Step 2: Add DB-only isolation test**

For equal logical traffic, assert APP CPU/I/O demand is equal across database choices. For a fixed database choice, compare neutral vs tagged workload snapshots and assert `nominalCapacity` and `effectiveCapacity` do not change when only workload tags change.

- [ ] **Step 3: Lock flow masking**

Keep the existing APP-incident downstream masking test green and add one overload-path case if needed: constrained upstream arrival must reduce DB demand before database-fit pressure is counted. Do not create a second flow algorithm.

- [ ] **Step 4: Run focused regression**

```bash
npm test -- src/core/__tests__/database.spec.ts src/core/__tests__/infrastructure-load.spec.ts src/core/__tests__/overload-request-flow.spec.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/core/__tests__/infrastructure-load.spec.ts src/core/database.ts src/core/infrastructure.ts
git commit -m "test: lock database fit invariants"
```

### Task 4: Full verification and integration

**Files:**
- Review: `src/core/database.ts`
- Review: `src/core/infrastructure.ts`
- Review: touched tests

- [ ] **Step 1: Ambiguity scan**

Search the final diff and ensure product-specific workload multipliers live only in `database.ts`; `LoadCalculator` may select `DatabaseDefinition.byId(...)` but must not branch on product IDs or duplicate tag tables.

- [ ] **Step 2: Capacity-side leak scan**

Confirm this feature did not change `DB_BASE`, existing database `capacityModifier`, replica `0.55/0.75/0.60`, Redis `0.12/0.40`, APP/framework capacity modifiers, or prices.

- [ ] **Step 3: Full verification**

```bash
npm test
npm run typecheck
npm run build
```

Expected: all tests PASS, typecheck PASS, Next.js production build PASS.

- [ ] **Step 4: Create PR and verify synthetic merge CI**

Open `feature/workload-aware-database-fit` → `feature/playable-mvp`. Verify the PR-triggered CI checks out the PR synthetic merge ref and passes tests/typecheck/build.

- [ ] **Step 5: Squash merge with head protection**

Merge only while PR is mergeable and its head SHA equals the verified head SHA. After merge, verify `feature/playable-mvp` points at the returned squash commit. When available, compare tested synthetic-merge tree SHA with landed squash tree SHA.
