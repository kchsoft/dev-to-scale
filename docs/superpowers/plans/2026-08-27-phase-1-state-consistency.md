# Phase 1 State Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every game snapshot and technology preview is calculated from the same current domain state, without changing V1 game balance.

**Architecture:** Keep `GameEngine` as the Phase 1 aggregate but centralize deterministic load calculation behind one helper and refresh it after every load-relevant mutation. Move hypothetical technology deployment into the domain so both live state and preview reuse the same features, proficiency, incidents, and traffic context.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, Next.js 16, React 19

**Spec:** `docs/superpowers/specs/2026-08-26-infrastructure-ecosystem-topology-design.md`

## Global Constraints

- Preserve the current V1 queue replacement policy and seeded game progression.
- Do not change revenue, growth, load coefficients, incident probabilities, build work, or infrastructure costs.
- Do not expose new Core objects to React; Phase 2 will close the existing View/Core boundary.
- Do not implement persistence; remove only the inaccurate README autosave statement.
- Preserve the user's existing changes in `next-env.d.ts`, `next.config.ts`, `tsconfig.json`, and untracked `package-lock.json`.
- Prefix shell commands with `rtk` as required by the repository instruction.
- Use `apply_patch` for every source, test, and documentation edit.
- Stage and commit only files owned by the current task.

## Preflight

The current working installation is missing the declared `vitest` dev dependency. Before the first RED run:

1. Run `rtk npm list vitest --depth=0` and confirm it reports an unmet or empty dependency.
2. Request network/sandbox approval and run `rtk npm install --include=dev --no-package-lock` so the user-owned untracked lockfile is not rewritten.
3. Run `rtk npm test -- --run src/core/__tests__/game-engine.spec.ts` and confirm the existing suite passes before editing.

---

### Task 1: Make live load snapshots consistent with current state

**Files:**
- Modify: `src/core/__tests__/game-engine.spec.ts`
- Modify: `src/core/game-engine.ts`

**Interfaces:**
- Consumes: existing `GameEngine.snapshot`, `GameEngine.advanceDay()`, infrastructure mutation commands, `Incident`, and `ServerSize`.
- Produces: private `GameEngine.calculateCurrentLoad()` and `GameEngine.refreshLoad()` helpers; all load-relevant public commands return with a fresh snapshot.

- [ ] **Step 0: Add the exact test imports used by this task**

Add these imports without routing tests through the Core barrel:

```ts
import { Incident } from '../incident-manager';
import { ServerSize } from '../infrastructure';
import { skillRef } from '../learning';
```

- [ ] **Step 1: Add a shared test fixture for a launched game**

Add this helper below `SafePositiveRandom`:

```ts
function launchedGame(seed = 10): GameEngine {
  const game = new GameEngine({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed,
    random: new SafePositiveRandom(),
  });
  while (!game.launched) game.advanceDay();
  return game;
}
```

The helper uses only public behavior and does not add production test hooks.

- [ ] **Step 2: Write the failing launch consistency test**

Add to `game engine orchestration`:

```ts
it('publishes the launched service load and request flow in the launch snapshot', () => {
  const game = launchedGame();
  const snapshot = game.snapshot;

  expect(snapshot.dau).toBe(80);
  expect(snapshot.load.appDemand).toBeGreaterThan(0);
  expect(snapshot.load.dbDemand).toBeGreaterThan(0);
  expect(snapshot.load.requestFlows.map((flow) => flow.featureId)).toContain('COMMUNITY_MVP');
});
```

This catches the mutation where launch changes `_launched` and `_dau` but leaves the pre-launch `_load` cached.

- [ ] **Step 3: Run the launch test and verify RED**

Run:

```bash
rtk npm test -- --run src/core/__tests__/game-engine.spec.ts -t "publishes the launched service load"
```

Expected: FAIL because `appDemand` and `dbDemand` are `0`, and `requestFlows` is empty.

- [ ] **Step 4: Write the failing immediate scale consistency test**

Update the test import list to include `ServerSize`, then add:

```ts
it('refreshes capacity and load immediately after infrastructure scaling', () => {
  const game = launchedGame(11);
  const smallAppCapacity = game.snapshot.load.rawAppCapacity;
  const smallDbCapacity = game.snapshot.load.rawDbCapacity;

  game.scaleApplication(ServerSize.XLARGE);
  expect(game.snapshot.load.rawAppCapacity).toBeCloseTo(game.infrastructure.app.capacity);
  expect(game.snapshot.load.rawAppCapacity).toBeGreaterThan(smallAppCapacity);

  game.scaleDatabase(ServerSize.XLARGE);
  expect(game.snapshot.load.rawDbCapacity).toBeCloseTo(game.infrastructure.database.capacity);
  expect(game.snapshot.load.rawDbCapacity).toBeGreaterThan(smallDbCapacity);

  const dbCapacityBeforeReplica = game.snapshot.load.rawDbCapacity;
  game.addDatabaseReplica();
  expect(game.snapshot.load.rawDbCapacity).toBeCloseTo(game.infrastructure.database.capacity);
  expect(game.snapshot.load.rawDbCapacity).toBeGreaterThan(dbCapacityBeforeReplica);
});
```

This catches any scale command that mutates `InfrastructureState` without invalidating derived load.

- [ ] **Step 5: Run the scale test and verify RED**

Run:

```bash
rtk npm test -- --run src/core/__tests__/game-engine.spec.ts -t "refreshes capacity and load immediately"
```

Expected: FAIL because the snapshot still reports SMALL capacity after the aggregate has XLARGE capacity.

- [ ] **Step 6: Write the failing technology-completion consistency test**

Update imports to include `skillRef`, then add:

```ts
it('publishes deployed queue capacity in the same snapshot that completes the build', () => {
  const game = new GameEngine({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 12,
    random: new SafePositiveRandom(),
  });
  game.developer.get(skillRef.fundamental('NETWORK')).setLevel(2);
  game.developer.get(skillRef.fundamental('SOFTWARE_DESIGN')).setLevel(2);
  game.startTechnologyBuild('SQS');

  while (game.snapshot.currentTechnologyBuild) game.advanceDay();

  expect(game.infrastructure.hasTechnology('SQS')).toBe(true);
  expect(game.snapshot.load.rawAsyncCapacity).toBe(game.infrastructure.asyncCapacity);
  expect(game.snapshot.load.rawAsyncCapacity).toBeGreaterThan(0);
});
```

This catches the mutation where technology deployment happens after the day's load calculation.

- [ ] **Step 7: Run the technology-completion test and verify RED**

Run:

```bash
rtk npm test -- --run src/core/__tests__/game-engine.spec.ts -t "publishes deployed queue capacity"
```

Expected: FAIL because `rawAsyncCapacity` remains `0` in the completion snapshot.

- [ ] **Step 8: Write the failing incident-recovery consistency test**

Update imports to include `Incident`, then add:

```ts
it('publishes a healthy request flow in the same snapshot that completes incident recovery', () => {
  const game = launchedGame(13);
  const incident = new Incident('db-outage', 'database:POSTGRESQL', 'CRITICAL', 1);
  game.incidents.add(incident);
  game.scaleApplication(game.infrastructure.app.size);
  expect(game.snapshot.load.failureRate).toBe(1);

  game.startIncidentResponse(incident.id);
  while (game.snapshot.incidents.length > 0) game.advanceDay();

  expect(game.snapshot.load.failureRate).toBe(0);
  expect(game.snapshot.load.requestFlows[0]?.successRatio).toBe(1);
});
```

The same-size scale call is an existing public mutation used to request a current projection; do not add a production refresh method for tests.

- [ ] **Step 9: Run the incident-recovery test and verify RED**

Run:

```bash
rtk npm test -- --run src/core/__tests__/game-engine.spec.ts -t "publishes a healthy request flow"
```

Expected: FAIL because the incident is removed after the cached load was calculated.

- [ ] **Step 10: Implement one deterministic load calculation path**

In `GameEngine`, replace repeated `LoadCalculator.calculate(...)` blocks with:

```ts
private calculateCurrentLoad(
  infrastructure = this.infrastructure,
  features = this.activeFeaturesForLoad(),
  ignoredIncidentNodeIds: ReadonlySet<string> = new Set(),
): LoadSnapshot {
  return LoadCalculator.calculate(
    this._dau,
    features,
    infrastructure,
    this.loadCalculationContext(infrastructure, ignoredIncidentNodeIds),
  );
}

private refreshLoad(): void {
  this._load = this.calculateCurrentLoad();
}
```

Use `calculateCurrentLoad()` for constructor initialization and the pre-incident daily calculation. Call `refreshLoad()`:

- after incident generation and before an early terminal-state return;
- after learning/build/recovery/feature/event advancement and before returning the daily snapshot;
- after `scaleApplication`, `addApplicationServer`, `scaleDatabase`, and `addDatabaseReplica`;
- after `fastTrackCurrentFeature` because it can release a feature;
- in `respondToTrafficSpike` instead of its duplicate calculation block.

Change `loadCalculationContext` to accept the infrastructure being calculated and an optional set of ignored incident node IDs:

```ts
private loadCalculationContext(
  infrastructure = this.infrastructure,
  ignoredIncidentNodeIds: ReadonlySet<string> = new Set(),
): LoadCalculationContext {
  const technologyProficiencyLevels: Partial<Record<TechnologyId, number>> = {};
  for (const technology of infrastructure.deployedTechnologies) {
    technologyProficiencyLevels[technology] = this.developer.get(skillRef.technology(technology)).level;
  }

  const nodeHealth: Partial<Record<RequestNodeKind, number>> = {};
  for (const incident of this.incidents.incidents) {
    if (ignoredIncidentNodeIds.has(incident.nodeId)) continue;
    const node = requestNodeForIncident(incident.nodeId);
    if (!node) continue;
    nodeHealth[node] = trafficHealthForSeverity(incident.severity);
  }

  return {
    appProficiencyLevel: this.developer.get(skillRef.framework(this.config.frameworkId)).level,
    databaseProficiencyLevel: this.developer.get(skillRef.technology(this.config.databaseId)).level,
    technologyProficiencyLevels,
    nodeHealth,
    trafficMultiplier: this.growthEvent?.active ? this.growthEvent.loadMultiplier : 1,
  };
}
```

Keep the existing framework/database proficiency, health conversion, and traffic multiplier formulas unchanged. This parameterization is required so Task 2 previews a hypothetical deployment without silently reverting technology proficiency or retaining an incident from a retired Queue.

Do not change the order of growth, economy recording, settlement, work progress, or day increment.

- [ ] **Step 11: Run the focused regression suite and verify GREEN**

Run:

```bash
rtk npm test -- --run src/core/__tests__/game-engine.spec.ts
```

Expected: every existing and newly added `game-engine` test passes.

- [ ] **Step 12: Run all tests before refactoring**

Run:

```bash
rtk npm test
```

Expected: all tests pass with no warnings or unhandled errors.

- [ ] **Step 13: Commit the consistent snapshot change**

```bash
rtk git add src/core/game-engine.ts src/core/__tests__/game-engine.spec.ts
rtk git diff --cached --check
rtk git commit -m "fix: keep load snapshots consistent"
```

---

### Task 2: Make technology previews reuse the live domain context

**Files:**
- Modify: `src/core/__tests__/game-engine.spec.ts`
- Modify: `src/core/infrastructure.ts`
- Modify: `src/core/game-engine.ts`
- Modify: `src/application/__tests__/game-controller.spec.ts`
- Modify: `src/application/game-controller.ts`

**Interfaces:**
- Consumes: `InfrastructureState`, active feature definitions, `GameEngine.loadCalculationContext()`, and existing technology option projection.
- Produces: `InfrastructureState.clone(): InfrastructureState` and `GameEngine.previewLoadWithTechnology(id: BuildableTechnologyId): LoadSnapshot`.

- [ ] **Step 1: Write the failing domain preview-context test**

Add to `game-engine.spec.ts`:

```ts
it('preserves proficiency and incident health when previewing a technology', () => {
  const game = launchedGame(14);
  game.developer.get(skillRef.technology('POSTGRESQL')).setLevel(10);
  const incident = new Incident('preview-db-outage', 'database:POSTGRESQL', 'CRITICAL', 1);
  game.incidents.add(incident);
  game.scaleApplication(game.infrastructure.app.size);
  const current = game.snapshot.load;

  const preview = game.previewLoadWithTechnology('REDIS');

  expect(preview.dbCapacity).toBeCloseTo(current.dbCapacity);
  expect(preview.failureRate).toBe(current.failureRate);
});
```

The intended production change is a domain-owned preview API that cannot omit current calculation context.

- [ ] **Step 2: Run the domain preview test and verify RED**

Run:

```bash
rtk npm test -- --run src/core/__tests__/game-engine.spec.ts -t "preserves proficiency and incident health"
```

Expected: FAIL because `previewLoadWithTechnology` does not exist.

- [ ] **Step 3: Add an infrastructure clone with independent mutable state**

Add to `InfrastructureState`:

```ts
clone(): InfrastructureState {
  const clone = new InfrastructureState(
    new AppCluster(this.app.frameworkId, this.app.size, this.app.count, this.hasTechnology('ALB')),
    new DatabaseCluster(this.database.databaseId, this.database.size, this.database.replicaCount),
  );
  for (const technology of this.deployedTechnologies) clone.deployTechnology(technology);
  return clone;
}
```

This clone copies deployment state but does not share mutable clusters or the technology Set.

- [ ] **Step 4: Implement the domain-owned technology preview**

Add next to `previewLoadWithFeature`:

```ts
previewLoadWithTechnology(id: BuildableTechnologyId): LoadSnapshot {
  const infrastructure = this.infrastructure.clone();
  const retired = infrastructure.deployTechnology(id);
  const ignoredIncidentNodeIds = new Set(
    retired.map((technology) => `technology:${technology}`),
  );
  return this.calculateCurrentLoad(
    infrastructure,
    this.activeFeaturesForLoad(),
    ignoredIncidentNodeIds,
  );
}
```

This reuses the same DAU, active features, proficiency levels, node health, and traffic multiplier as the live calculation.

- [ ] **Step 5: Run the domain preview test and verify GREEN**

Run:

```bash
rtk npm test -- --run src/core/__tests__/game-engine.spec.ts -t "preserves proficiency and incident health"
```

Expected: PASS.

- [ ] **Step 6: Write the failing Application preview projection test**

Add to `game-controller.spec.ts`:

```ts
it('projects a technology preview calculated with the current game context', () => {
  const controller = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 15 });
  while (!controller.getView().hud.launched) controller.advanceDay();
  controller.engine.developer.get(skillRef.technology('POSTGRESQL')).setLevel(10);
  controller.scaleApplication(controller.getView().appSize);

  const preview = controller.getView().technologies.find((technology) => technology.id === 'REDIS')?.preview;
  const match = preview?.match(/^DB (\d+)% → (\d+)%$/);

  expect(match).not.toBeNull();
  expect(match?.[2]).toBe(match?.[1]);
});
```

Redis does not affect the non-`READ_HEAVY` bootstrap workload, so a correct same-context preview keeps its DB ratio unchanged. The old Controller calculation drops the Lv.10 DB tuning context and reports different percentages.

- [ ] **Step 7: Run the Application preview test and verify RED**

Run:

```bash
rtk npm test -- --run src/application/__tests__/game-controller.spec.ts -t "projects a technology preview calculated"
```

Expected: FAIL because the second percentage is calculated with default proficiency rather than the current Lv.10 context.

- [ ] **Step 8: Delegate preview calculation to the domain**

In `GameController.previewTechnology`, replace the cloned-infrastructure feature reconstruction and direct `LoadCalculator.calculate` call with:

```ts
const after = this.engine.previewLoadWithTechnology(id);
```

Delete the now-unused `cloneInfrastructure` function and remove the now-unused `InfrastructureState` and `LoadCalculator` imports. Retain `AppCluster` and `DatabaseCluster`; `infrastructureCostView()` still uses them to project recurring costs. Keep only UI string formatting in the Controller preview method.

- [ ] **Step 9: Run focused and full tests**

Run:

```bash
rtk npm test -- --run src/core/__tests__/game-engine.spec.ts src/application/__tests__/game-controller.spec.ts
rtk npm test
```

Expected: all focused and full-suite tests pass.

- [ ] **Step 10: Commit the preview alignment change**

```bash
rtk git add src/core/infrastructure.ts src/core/game-engine.ts src/core/__tests__/game-engine.spec.ts src/application/game-controller.ts src/application/__tests__/game-controller.spec.ts
rtk git diff --cached --check
rtk git commit -m "fix: align technology previews with game state"
```

---

### Task 3: Remove the unsupported autosave claim

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the approved non-goal that persistence is out of scope.
- Produces: README capability list that no longer advertises LocalStorage autosave.

- [ ] **Step 1: Remove only the inaccurate capability bullet**

Delete this line from the current MVP list:

```markdown
- LocalStorage 자동 저장
```

Do not alter unrelated README claims in this phase.

- [ ] **Step 2: Verify the documentation change**

Run:

```bash
rtk rg -n "LocalStorage|localStorage" README.md src app
```

Expected: no matches. Human prose does not receive a source-text unit test.

- [ ] **Step 3: Commit the README correction**

```bash
rtk git add README.md
rtk git diff --cached --check
rtk git commit -m "docs: remove unsupported autosave claim"
```

---

### Task 4: Verify Phase 1 end to end

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: evidence that Phase 1 is complete without unrelated workspace changes.

- [ ] **Step 1: Run the complete automated verification**

```bash
rtk npm test
rtk npm run typecheck
rtk npm run build
```

Expected: all commands exit `0` with no test failures or type errors.

- [ ] **Step 2: Reproduce the original stale-load scenario**

Run the game-engine regression test names together:

```bash
rtk npm test -- --run src/core/__tests__/game-engine.spec.ts -t "publishes the launched|immediately after infrastructure scaling|same snapshot that completes"
```

Expected: all matching regression tests pass.

- [ ] **Step 3: Audit the final diff and workspace ownership**

```bash
rtk git diff --check
rtk git status --short
rtk git log -4 --oneline
```

Expected: no Phase 1 source changes remain uncommitted. The pre-existing user changes in Next/TypeScript configuration and the untracked lockfile remain untouched.

- [ ] **Step 4: Review Phase 1 against the design spec**

Confirm all four Phase 1 requirements in the spec have direct evidence:

- centralized load refresh;
- immediate launch/scale consistency;
- lifecycle completion/recovery consistency;
- technology preview context equivalence.

Record any deviation as a blocker instead of proceeding to Phase 2.
