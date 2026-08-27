# Phase 6 Responsibility Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the architecture remediation by using feature-specific growth values, centralizing presentation IDs, and separating Application and React responsibilities without changing current gameplay or visual behavior.

**Architecture:** Core consumes explicit feature growth contributions rather than inferring them from a count. Application owns one typed presentation catalog plus dedicated View and Event projectors, while `GameController` remains the command/subscription facade. React keeps orchestration in `GameApp` and moves each screen responsibility into focused components that consume Application DTOs and callbacks only.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16, Vitest 3

**Spec:** `docs/superpowers/specs/2026-08-26-infrastructure-ecosystem-topology-design.md`

## Global Constraints

- Preserve existing V1 balance: ten default community features still contribute `0.005` growth each unless their definition explicitly says otherwise.
- React View imports Application contracts only; no file under `src/ui` may import Core.
- `GameController` must not expose `GameEngine` or mutable Domain state.
- Commands emit exactly one current View after each successful mutation.
- Application projectors may depend on Core, but Core must not depend on Application labels, icons, or display strings.
- Internal routes and topology remain game-owned and are not made editable.
- README already contains no LocalStorage autosave claim; do not add or remove unrelated README content.

---

### Task 1: Use feature-specific growth bonuses

**Files:**
- Modify: `src/core/growth.ts`
- Modify: `src/core/game-engine.ts`
- Modify: `src/core/__tests__/growth.spec.ts`
- Modify: `src/core/__tests__/game-engine.spec.ts`

**Interfaces:**
- Consumes: `FeatureDefinition.growthBonus` from completed feature definitions.
- Produces: `GrowthCalculationInput.completedFeatureGrowthBonus: number`, used directly in `GrowthPolicy.calculate`.

- [ ] **Step 1: Write the failing policy test**

Add a table-driven test with literal expected modifiers for `completedFeatureGrowthBonus: 0.002` and `0.020`, while all random, incident, event, load, and phase inputs remain identical. The production mutation this catches is replacing the supplied bonus with a fixed bonus per feature.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/core/__tests__/growth.spec.ts`

Expected: FAIL because `GrowthPolicy.calculate` still derives its feature modifier from `completedFeatureCount * 0.005`.

- [ ] **Step 3: Replace count-derived growth with the explicit sum**

Change the input contract to:

```ts
interface GrowthCalculationInput {
  readonly phase: 1 | 2 | 3;
  readonly completedFeatureGrowthBonus: number;
  readonly event: GrowthEvent | null;
  readonly incidents: readonly IncidentSeverity[];
  readonly failureRate?: number;
  readonly maxLoadRatio?: number;
  readonly random: RandomSource;
}
```

Clamp only at the existing overall growth bounds; do not silently replace zero or negative explicit values. Update existing test fixtures from `completedFeatureCount: N` to `completedFeatureGrowthBonus: N * 0.005` so their previous balance expectations remain literal and unchanged.

- [ ] **Step 4: Wire `GameEngine` to the canonical feature definitions**

Pass:

```ts
completedFeatureGrowthBonus: this.completedFeatureDefinitions.reduce(
  (sum, feature) => sum + feature.growthBonus,
  0,
)
```

Add a GameEngine regression assertion showing that the currently completed feature's `growthBonus` is the value supplied to growth behavior rather than recomputing by feature count.

- [ ] **Step 5: Run Core regression tests**

Run: `npm test -- src/core/__tests__/growth.spec.ts src/core/__tests__/game-engine.spec.ts`

Expected: both files PASS with existing default game balance intact.

- [ ] **Step 6: Commit**

```bash
git add src/core/growth.ts src/core/game-engine.ts src/core/__tests__/growth.spec.ts src/core/__tests__/game-engine.spec.ts
git commit -m "fix: use feature growth bonuses"
```

### Task 2: Typed Application presentation catalog

**Files:**
- Create: `src/application/presentation-catalog.ts`
- Create: `src/application/__tests__/presentation-catalog.spec.ts`
- Modify: `src/application/game-controller.ts`
- Modify: `src/application/topology-view-projector.ts`
- Modify: `src/ui/GameApp.tsx`

**Interfaces:**
- Consumes: Core ID unions such as `CommunityFeatureId`, `FrameworkId`, `DatabaseId`, `TechnologyId`, skill IDs, infrastructure kinds, and legacy `RequestNodeViewKind`.
- Produces: `presentationCatalog.label(id: string): string`, `presentationCatalog.icon(id: string): string`, `presentationCatalog.topologyIcon(kind)`, and `presentationCatalog.requestNodeLabel(kind)`.

- [ ] **Step 1: Write the failing catalog test**

Assert literal Korean/player-facing labels for every community feature ID, every framework/database/technology ID, and literal icons for all infrastructure kinds. Assert an unknown future ID falls back to the original ID and an unknown icon falls back to `•`. The production mutation this catches is a missing typed mapping silently becoming `undefined`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/application/__tests__/presentation-catalog.spec.ts`

Expected: FAIL because the shared catalog module does not exist.

- [ ] **Step 3: Implement exhaustive category records**

Use category-specific `satisfies Readonly<Record<ExactIdUnion, string>>` records. Merge them only behind catalog methods accepting stable string IDs. Infrastructure kind and request-node methods use exhaustive `switch` or exact records; Core receives none of these display values.

- [ ] **Step 4: Replace duplicate mappings**

Make `GameController` and `TopologyViewProjector` consume the catalog. Replace `GameApp`'s local request-node labels with `presentationCatalog.requestNodeLabel` imported through Application. Preserve all current visible copy and fallback behavior.

- [ ] **Step 5: Run catalog, projector, Controller, and boundary tests**

Run: `npm test -- src/application/__tests__/presentation-catalog.spec.ts src/application/__tests__/topology-view-projector.spec.ts src/application/__tests__/game-controller.spec.ts src/application/__tests__/view-boundary.spec.ts`

Expected: all files PASS and no UI file imports Core.

- [ ] **Step 6: Commit**

```bash
git add src/application/presentation-catalog.ts src/application/__tests__/presentation-catalog.spec.ts src/application/game-controller.ts src/application/topology-view-projector.ts src/ui/GameApp.tsx
git commit -m "refactor: centralize presentation catalog"
```

### Task 3: Separate Game View and Event projection

**Files:**
- Create: `src/application/game-view-projector.ts`
- Create: `src/application/game-event-projector.ts`
- Create: `src/application/__tests__/game-view-projector.spec.ts`
- Create: `src/application/__tests__/game-event-projector.spec.ts`
- Modify: `src/application/game-controller.ts`
- Modify: `src/application/__tests__/game-controller.spec.ts`

**Interfaces:**
- Consumes: a private `GameEngine` reference inside Application and before/after immutable `GameSnapshot` values.
- Produces: `GameViewProjector.project(): GameView`, `GameViewProjector.featureImpact(snapshot, featureId): FeatureImpactPreview | null`, and `GameEventProjector.project(before, after): readonly GameEventView[]`.

- [ ] **Step 1: Write failing direct-projector tests**

Construct a real `GameEngine`. Assert `GameViewProjector.project()` returns literal initial HUD, work-slot, independent topology node, and observability values. Advance the real engine until launch and assert `GameEventProjector.project(before, after)` returns the literal launch event once. These tests catch projectors returning default/empty data and event projection inspecting the wrong snapshot.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/application/__tests__/game-view-projector.spec.ts src/application/__tests__/game-event-projector.spec.ts`

Expected: FAIL because both projector modules do not exist.

- [ ] **Step 3: Move View construction without behavior changes**

Move calendar, service nodes, work slots, alerts, feature impact, technology options/previews, skills, feature cards, request-flow compatibility views, infrastructure costs, and topology projection into `GameViewProjector`. Keep its engine field private and return Application DTOs only.

- [ ] **Step 4: Move Event construction without behavior changes**

Move requirement, launch, traffic, settlement, incident, bankruptcy, and win detection into `GameEventProjector`. Resolve labels through `presentationCatalog`; use `GameViewProjector.featureImpact` only for the requirement impact summary.

- [ ] **Step 5: Reduce `GameController` to orchestration**

Keep only constructor wiring, subscribe/unsubscribe, `getView`, commands, one `emit`, and `advanceDay`. Each command delegates once to `GameEngine` and calls `emit` once after success. `advanceDay` captures before/after snapshots and delegates event projection.

- [ ] **Step 6: Run all Application tests and typecheck**

Run: `npm test -- src/application`

Run: `npm run typecheck`

Expected: Application tests and typecheck PASS; `Object.hasOwn(controller, 'engine')` remains false.

- [ ] **Step 7: Commit**

```bash
git add src/application/game-view-projector.ts src/application/game-event-projector.ts src/application/game-controller.ts src/application/__tests__/game-view-projector.spec.ts src/application/__tests__/game-event-projector.spec.ts src/application/__tests__/game-controller.spec.ts
git commit -m "refactor: separate game application projectors"
```

### Task 4: Split the React screen by responsibility

**Files:**
- Create: `src/ui/game-format.ts`
- Create: `src/ui/GameSetup.tsx`
- Create: `src/ui/Hud.tsx`
- Create: `src/ui/ServiceDashboard.tsx`
- Create: `src/ui/TechnologyPanel.tsx`
- Create: `src/ui/LearningPanel.tsx`
- Create: `src/ui/FeatureBoard.tsx`
- Create: `src/ui/ReportPanel.tsx`
- Create: `src/ui/NodeInspector.tsx`
- Create: `src/ui/EventOverlay.tsx`
- Create: `src/ui/__tests__/game-screens.spec.tsx`
- Modify: `src/ui/GameApp.tsx`
- Modify: `src/application/__tests__/view-boundary.spec.ts`

**Interfaces:**
- Consumes: Application `GameView`, event/option DTOs, and explicit command callbacks.
- Produces: focused screen components; `GameApp` owns only controller/clock lifecycle, navigation, selected node/event/toast state, and callback composition.

- [ ] **Step 1: Write failing real-render tests**

Use `renderToStaticMarkup` without mocks. Render `GameSetup` and assert the framework/database choices plus boot action are visible. Render `ServiceDashboard` with `new GameController(...).getView()` and assert Work Queue, Service Map, independent Local Storage node, and alert rail are visible. The production mutation this catches is a split component dropping a required screen region or receiving Domain objects instead of `GameView`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/ui/__tests__/game-screens.spec.tsx`

Expected: FAIL because the focused screen modules do not exist.

- [ ] **Step 3: Extract shared formatters and setup/HUD**

Move `money`, `number`, and `pct` to `game-format.ts`. Move setup catalog cards and launch console into `GameSetup`; move time controls and HUD metrics into `Hud`. Props contain primitives/Application IDs and callbacks only.

- [ ] **Step 4: Extract service and catalog screens**

Move `ServiceDashboard`, alert/load helpers, technology, learning, feature, and report components to their named files. Preserve topology selection and tab-navigation callbacks. Keep all observability gating sourced from `GameView`.

- [ ] **Step 5: Extract overlays and remove Controller props from children**

Move `NodeInspector` and `EventOverlay` to focused files. `NodeInspector` receives callbacks such as `onScaleApplication(size)` and `onAddDatabaseReplica()` rather than a `GameController`; `EventOverlay` receives response callbacks. No child component owns commands or domain rules.

- [ ] **Step 6: Leave `GameApp` as the composition root**

Keep controller creation, subscription, `GameClock`, automatic pause event queue, current tab, inspector selection, toast/error handling, and callback wiring. Remove duplicated component definitions and local presentation mappings.

- [ ] **Step 7: Strengthen and run UI boundary verification**

Keep the recursive AST import check for every `.ts`/`.tsx` file under `src/ui`. Run:

`npm test -- src/ui/__tests__/game-screens.spec.tsx src/ui/__tests__/topology-map.spec.tsx src/application/__tests__/view-boundary.spec.ts`

Expected: all focused UI behavior and boundary tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui src/application/__tests__/view-boundary.spec.ts
git commit -m "refactor: split game view components"
```

### Task 5: End-to-end regression verification

**Files:**
- Modify only files required by an observed regression; every fix must begin with a failing regression test.

**Interfaces:**
- Consumes: the complete Phase 6 branch.
- Produces: verified Core/Application/View boundaries with unchanged V1 gameplay and rendering contracts.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: every test file and test PASS with zero failures.

- [ ] **Step 2: Run static verification**

Run: `npm run typecheck`

Run: `git diff --check`

Expected: both commands exit with code 0.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: Next.js production build exits with code 0. Restore only Next-generated `next-env.d.ts` and `tsconfig.json` changes with `apply_patch` if it mutates them.

- [ ] **Step 4: Perform a separate diff review**

Compare the complete branch against its Phase 5 base. Confirm `GameController` has no projection policy, every UI file imports only Application, all default feature growth contributions preserve prior balance, README has no autosave claim, and no Core type crosses into React props.

- [ ] **Step 5: Commit any test-first review fixes**

If review exposes a behavior defect, add a failing regression test, apply the smallest fix, rerun the relevant suite, and commit the fix separately. If no defect exists, create no empty commit.
