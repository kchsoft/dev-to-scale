# Phase 7 Application Projection Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unused Application legacy service contracts and split `GameViewProjector` into overview, service, and progression projectors without changing gameplay or rendering.

**Architecture:** `GameViewProjector` captures one current snapshot, derives financial values, delegates to three focused projectors, and composes the final DTO. `TopologyView` becomes the only Application node/edge/trace contract, while Core aggregate load and legacy request-flow compatibility remain unchanged for current policies. `GameController` shares one `GameServiceProjector` with View and Event projection.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16, Vitest 3

**Spec:** `docs/superpowers/specs/2026-08-27-phase-7-application-projection-cleanup-design.md`

## Global Constraints

- React View imports Application contracts only; no production file under `src/ui` imports Core.
- Capture one `GameSnapshot` per `GameViewProjector.project()` call and pass that exact snapshot to every child projector.
- `GameProgressionProjector` accepts only that current engine snapshot and rejects stale input before applying live Core availability, preview, or skill policies through whole-snapshot equivalence plus load identity.
- `TopologyView` is the only Application node, edge, and request-trace contract.
- Do not remove Core `appRatio`, `dbRatio`, `asyncRatio`, `storageRatio`, or `LoadSnapshot.requestFlows` in this phase.
- Keep `FeatureCardView.route` and `RequestNodeViewKind`; the roadmap still displays route tags.
- Do not change player-visible copy, balance, command behavior, topology, or request animation.
- `GameController` keeps `GameEngine` private and emits one current View after each successful command.
- `GameEventProjector` continues to reject stale engine transitions.
- Use `apply_patch` for all source and document edits.
- Prefix every shell command with `rtk`.
- Preserve the main checkout's existing `next-env.d.ts`, `next.config.ts`, `tsconfig.json`, and `package-lock.json` changes; work only in the Phase 7 worktree.
- If `next build` rewrites generated TypeScript config files in the worktree, inspect the diff and restore only those generated changes with `apply_patch` before committing.

---

### Task 1: Remove unused Application legacy service contracts

**Files:**
- Modify: `src/application/game-view.ts`
- Modify: `src/application/game-controller.ts`
- Modify: `src/application/game-view-projector.ts`
- Modify: `src/application/presentation-catalog.ts`
- Modify: `src/application/__tests__/game-controller.spec.ts`
- Modify: `src/application/__tests__/presentation-catalog.spec.ts`

**Interfaces:**
- Removes: `ServiceNodeView`, `RequestFlowView`, `GameView.nodes`, `GameView.requestFlows`.
- Preserves: `TopologyView`, `TopologyNodeView`, `RequestTraceView`, `FeatureCardView.route`, and every Core compatibility field.

- [ ] **Step 1: Write the failing public-contract regression test**

Replace the old legacy-node assertion in `game-controller.spec.ts` and explicitly require both fields to be absent:

```ts
const view = controller.getView();

expect(Object.hasOwn(view, 'nodes')).toBe(false);
expect(Object.hasOwn(view, 'requestFlows')).toBe(false);
expect(view.topology.nodes.map((node) => node.id)).toEqual([
  'v1:app:SPRING_BOOT',
  'v1:database:POSTGRESQL',
  'v1:storage:OBJECT_STORAGE',
]);
```

The production mutation caught by this test is returning empty compatibility arrays instead of deleting the contract.

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
rtk npm test -- src/application/__tests__/game-controller.spec.ts
```

Expected: FAIL because current `GameView` owns `nodes` and `requestFlows`.

- [ ] **Step 3: Delete the legacy DTO surface and producers**

In `game-view.ts`, delete both interfaces and the two `GameView` properties. In `game-controller.ts`, delete their type imports and re-exports. In `game-view-projector.ts`, remove:

```ts
nodes: this.serviceNodes(snapshot, service.observability),
requestFlows: this.requestFlowViews(snapshot),
```

Delete `serviceNodes`, `requestFlowViews`, and helpers/imports used only by those methods. Do not delete `nodeIdForRequestNode`, which is still used by alert projection, and do not change Core `snapshot.load.requestFlows` consumption inside alerts.

- [ ] **Step 4: Remove the obsolete service-node icon catalog**

Delete `ServiceNodeView` from `presentation-catalog.ts`, delete `SERVICE_NODE_ICONS`, and remove:

```ts
serviceNodeIcon(kind: ServiceNodeView['kind']): string;
```

Keep topology, technology, skill, and request-node mappings unchanged. Add a catalog regression assertion that `topologyIcon('SERVER_GROUP')` remains `◈` so the canonical icon path is protected.

- [ ] **Step 5: Run contract, catalog, boundary, and type tests**

Run:

```bash
rtk npm test -- src/application/__tests__/game-controller.spec.ts src/application/__tests__/presentation-catalog.spec.ts src/application/__tests__/view-boundary.spec.ts src/ui/__tests__/game-screens.spec.tsx
rtk npm run typecheck
```

Expected: all tests PASS; no UI source changes are required.

- [ ] **Step 6: Commit**

```bash
rtk git add src/application/game-view.ts src/application/game-controller.ts src/application/game-view-projector.ts src/application/presentation-catalog.ts src/application/__tests__/game-controller.spec.ts src/application/__tests__/presentation-catalog.spec.ts
rtk git commit -m "refactor: remove legacy application service views"
```

### Task 2: Extract overview projection

**Files:**
- Create: `src/application/game-overview-projector.ts`
- Create: `src/application/__tests__/game-overview-projector.spec.ts`
- Modify: `src/application/game-view-projector.ts`

**Interfaces:**
- Produces: `GameFinancialProjection`, `GameOverviewProjection`, and `GameOverviewProjector.project(snapshot, financials)`.
- Consumes: one `GameEngine`, the exact snapshot captured by the composition root, and precomputed monthly financials.

- [ ] **Step 1: Write the failing direct-projector test**

Create `game-overview-projector.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../core';
import { GameOverviewProjector } from '../game-overview-projector';

describe('GameOverviewProjector', () => {
  it('projects initial HUD, work queue, and operations from one snapshot', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const snapshot = engine.snapshot;
    const result = new GameOverviewProjector(engine).project(snapshot, {
      monthlyRevenue: 0,
      monthlyCost: 225_000,
      monthlyProfit: -225_000,
    });

    expect(result.hud).toMatchObject({ day: 1, month: 1, dayOfMonth: 1, cash: 3_000_000 });
    expect(result.workSlots.find(({ id }) => id === 'feature')).toMatchObject({ title: '게시글', active: true });
    expect(result.operations.currentFeature?.id).toBe('COMMUNITY_MVP');
    expect(result.operations.currentTechnologyBuild).toBeNull();
  });
});
```

- [ ] **Step 2: Run the direct test and verify RED**

```bash
rtk npm test -- src/application/__tests__/game-overview-projector.spec.ts
```

Expected: FAIL because `game-overview-projector.ts` does not exist.

- [ ] **Step 3: Implement the overview projector**

Create the exact contracts and class:

```ts
export interface GameFinancialProjection {
  readonly monthlyRevenue: number;
  readonly monthlyCost: number;
  readonly monthlyProfit: number;
}

export interface GameOverviewProjection {
  readonly hud: HudView;
  readonly workSlots: readonly WorkSlotView[];
  readonly operations: FeatureOperationsView;
}

export class GameOverviewProjector {
  readonly #engine: GameEngine;

  constructor(engine: GameEngine) {
    this.#engine = engine;
  }

  project(snapshot: GameSnapshot, financials: GameFinancialProjection): GameOverviewProjection {
    const calendar = calendarForDay(snapshot.day);
    return {
      hud: this.hud(snapshot, calendar, financials),
      workSlots: this.workSlots(snapshot),
      operations: this.operations(snapshot),
    };
  }
}
```

Move `calendarForDay`, `workSlots`, and its catalog-based node label helper from `GameViewProjector`. Extract the existing HUD literal into private `hud(snapshot, calendar, financials)` and the existing operations literal into private `operations(snapshot)`. Preserve every field, title, progress calculation, and metadata string literally; the only value source change is reading the three monthly values from `financials`.

- [ ] **Step 4: Delegate overview construction from the composition root**

In `GameViewProjector`, construct `GameOverviewProjector` once. Compute financials once per `project()` call:

```ts
const financials: GameFinancialProjection = {
  monthlyRevenue,
  monthlyCost,
  monthlyProfit: monthlyRevenue - monthlyCost,
};
const overview = this.#overviewProjector.project(snapshot, financials);
```

Spread `overview` into the final View and remove the moved methods/imports from the root.

- [ ] **Step 5: Run overview and facade regressions**

```bash
rtk npm test -- src/application/__tests__/game-overview-projector.spec.ts src/application/__tests__/game-view-projector.spec.ts src/application/__tests__/game-controller.spec.ts
rtk npm run typecheck
```

Expected: all PASS with identical HUD and work-slot literals.

- [ ] **Step 6: Commit**

```bash
rtk git add src/application/game-overview-projector.ts src/application/__tests__/game-overview-projector.spec.ts src/application/game-view-projector.ts
rtk git commit -m "refactor: extract game overview projection"
```

### Task 3: Extract progression projection

**Files:**
- Create: `src/application/game-progression-projector.ts`
- Create: `src/application/__tests__/game-progression-projector.spec.ts`
- Modify: `src/application/game-view-projector.ts`

**Interfaces:**
- Produces: `GameProgressionProjection` and `GameProgressionProjector.project(snapshot)`.
- Owns: technology availability/preview, skill-tree projection, and feature-roadmap projection.
- Requires: the current engine snapshot; stale snapshots are rejected by whole `GameSnapshot` equivalence plus load identity because availability/preview/skill policies depend on live Core state.

- [ ] **Step 1: Write the failing direct-projector test**

```ts
import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../core';
import { GameProgressionProjector } from '../game-progression-projector';

describe('GameProgressionProjector', () => {
  it('projects the complete initial technology, skill, and feature catalogs', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const result = new GameProgressionProjector(engine).project(engine.snapshot);

    expect(result.technologies.map(({ id }) => id)).toEqual([
      'REDIS', 'SQS', 'RABBITMQ', 'KAFKA', 'ALB', 'OBJECT_STORAGE',
    ]);
    expect(result.technologies.find(({ id }) => id === 'REDIS')?.preview).toMatch(/^DB \d+% → \d+%$/);
    expect(result.skills.some(({ key }) => key === 'fundamental:NETWORK')).toBe(true);
    expect(result.features).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run the direct test and verify RED**

```bash
rtk npm test -- src/application/__tests__/game-progression-projector.spec.ts
```

Expected: FAIL because the progression projector module does not exist.

- [ ] **Step 3: Implement the progression projector**

Create:

```ts
export interface GameProgressionProjection {
  readonly technologies: readonly TechnologyOptionView[];
  readonly skills: readonly SkillNodeView[];
  readonly features: readonly FeatureCardView[];
}

export class GameProgressionProjector {
  readonly #engine: GameEngine;

  constructor(engine: GameEngine) {
    this.#engine = engine;
  }

  project(snapshot: GameSnapshot): GameProgressionProjection {
    return {
      technologies: this.technologyOptions(snapshot),
      skills: this.skillNodes(),
      features: this.featureCards(snapshot),
    };
  }
}
```

Move `FRAMEWORK_LANGUAGE`, `FUNDAMENTALS`, `TECHNOLOGY_SKILLS`, `phaseForSlot`, `sameSkill`, `technologyOptions`, `previewTechnology`, `skillNodes`, and `featureCards` without changing rules or copy.

- [ ] **Step 4: Delegate progression construction from the composition root**

Construct `GameProgressionProjector` once in `GameViewProjector`, call it with the captured snapshot, spread its result into `GameView`, and remove all moved imports and methods from the root.

- [ ] **Step 5: Run progression and gameplay regressions**

```bash
rtk npm test -- src/application/__tests__/game-progression-projector.spec.ts src/application/__tests__/game-view-projector.spec.ts src/application/__tests__/game-controller.spec.ts src/ui/__tests__/game-screens.spec.tsx
rtk npm run typecheck
```

Expected: all PASS; technology order, skill state, and ten roadmap cards remain identical.

- [ ] **Step 6: Commit**

```bash
rtk git add src/application/game-progression-projector.ts src/application/__tests__/game-progression-projector.spec.ts src/application/game-view-projector.ts
rtk git commit -m "refactor: extract game progression projection"
```

### Task 4: Extract service projection and finish composition

**Files:**
- Create: `src/application/game-service-projector.ts`
- Create: `src/application/__tests__/game-service-projector.spec.ts`
- Modify: `src/application/game-view-projector.ts`
- Modify: `src/application/game-event-projector.ts`
- Modify: `src/application/game-controller.ts`
- Modify: `src/application/__tests__/game-event-projector.spec.ts`
- Modify: `src/application/__tests__/game-view-projector.spec.ts`
- Modify: `src/application/__tests__/view-boundary.spec.ts`

**Interfaces:**
- Produces: `FeatureImpactPreview`, `GameServiceProjection`, `GameServiceProjector.project(snapshot, financials)`, and `featureImpact(featureId)`.
- Consumes: the exact root snapshot, shared `GameFinancialProjection`, and a private engine for current-state previews.
- Changes: `GameEventProjector(engine, serviceProjector)` replaces its dependency on the full View projector.

- [ ] **Step 1: Write failing direct service tests**

Create `game-service-projector.spec.ts` with one initial and one launched assertion:

```ts
describe('GameServiceProjector', () => {
  it('projects canonical topology, operations, alerts, and costs', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 });
    const result = new GameServiceProjector(engine).project(engine.snapshot, {
      monthlyRevenue: 0,
      monthlyCost: 225_000,
      monthlyProfit: -225_000,
    });

    expect(result.topology.nodes).toContainEqual(expect.objectContaining({
      id: 'v1:storage:OBJECT_STORAGE', name: 'Local Storage', kind: 'object-storage',
    }));
    expect(result.service.observability.level).toBe('BASIC');
    expect(result.alerts.some(({ id }) => id === 'bootstrap')).toBe(true);
    expect(result.infrastructureCosts.addDbReplicaMonthlyCostDelta).toBe(120_000);
  });

  it('preserves the launched canonical request trace', () => {
    const engine = new GameEngine({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 10 });
    for (let day = 0; day < 30 && !engine.launched; day += 1) engine.advanceDay();
    const result = new GameServiceProjector(engine).project(engine.snapshot, {
      monthlyRevenue: 0, monthlyCost: 0, monthlyProfit: 0,
    });

    expect(result.topology.traces[0]).toMatchObject({
      id: 'COMMUNITY_MVP', successPercent: 100, failureNodeId: null,
    });
  });
});
```

- [ ] **Step 2: Run the direct service test and verify RED**

```bash
rtk npm test -- src/application/__tests__/game-service-projector.spec.ts
```

Expected: FAIL because the service projector module does not exist.

- [ ] **Step 3: Implement service projection**

Create the exact contracts:

```ts
export interface FeatureImpactPreview {
  readonly summary: string;
  readonly tone: AlertView['tone'];
  readonly nodeId?: string;
}

export interface GameServiceProjection {
  readonly alerts: readonly AlertView[];
  readonly topology: TopologyView;
  readonly infrastructureCosts: InfrastructureCostView;
  readonly service: ServiceOperationsView;
}

export class GameServiceProjector {
  readonly #engine: GameEngine;

  constructor(engine: GameEngine) {
    this.#engine = engine;
  }

  project(snapshot: GameSnapshot, financials: GameFinancialProjection): GameServiceProjection {
    const service = OperationalViewProjector.project(snapshot, this.#engine.developer);
    return {
      alerts: this.alerts(snapshot, financials.monthlyProfit, service.observability),
      topology: this.topology(snapshot),
      infrastructureCosts: this.infrastructureCostView(),
      service,
    };
  }

  featureImpact(featureId: string): FeatureImpactPreview | null {
    const snapshot = this.#engine.snapshot;
    return this.featureImpactFor(snapshot, featureId);
  }
}
```

Move `percent`, `loadTone`, `nodeIdForRequestNode`, topology reconstruction, `alerts`, the current feature-impact body as private `featureImpactFor(snapshot, featureId)`, `infrastructureCostView`, and node labeling. Delete `loadTone` if removal of legacy service nodes leaves it unused. Preserve `snapshot.load.requestFlows` use in the request-failure alert because Core compatibility removal is out of scope.

- [ ] **Step 4: Share the service projector across View and Event composition**

Change `GameEventProjector` to:

```ts
constructor(engine: GameEngine, serviceProjector: GameServiceProjector) {
  this.#engine = engine;
  this.#serviceProjector = serviceProjector;
}
```

Use `this.#serviceProjector.featureImpact(...)` for requirement events. In `GameController`, create one local service projector and inject it into both consumers:

```ts
const serviceProjector = new GameServiceProjector(this.#engine);
this.#viewProjector = new GameViewProjector(this.#engine, serviceProjector);
this.#eventProjector = new GameEventProjector(this.#engine, serviceProjector);
```

Update direct event tests to construct `GameServiceProjector`; retain the stale-transition assertion literally.

- [ ] **Step 5: Reduce GameViewProjector to composition**

The final root shape is:

```ts
private financials(snapshot: GameSnapshot): GameFinancialProjection {
  const revenueModifier = snapshot.completedFeatures.reduce(
    (sum, id) => sum + (COMMUNITY_FEATURES[id as keyof typeof COMMUNITY_FEATURES]?.revenueModifier ?? 0),
    0,
  );
  const monthlyRevenue = RevenuePolicy.monthlyRevenue(snapshot.dau, revenueModifier);
  const monthlyCost = this.#engine.infrastructure.monthlyCost + RevenuePolicy.monthlyAiCost(
    snapshot.dau,
    snapshot.completedFeatures.includes('AI_RECOMMENDATION'),
  );
  return { monthlyRevenue, monthlyCost, monthlyProfit: monthlyRevenue - monthlyCost };
}

project(): GameView {
  const snapshot = this.#engine.snapshot;
  const financials = this.financials(snapshot);
  return {
    ...this.#overviewProjector.project(snapshot, financials),
    ...this.#serviceProjector.project(snapshot, financials),
    ...this.#progressionProjector.project(snapshot),
    frameworkId: this.#engine.config.frameworkId,
    databaseId: this.#engine.config.databaseId,
    appSize: this.#engine.infrastructure.app.size,
    appCount: this.#engine.infrastructure.app.count,
    dbSize: this.#engine.infrastructure.database.size,
    dbReplicaCount: this.#engine.infrastructure.database.replicaCount,
  };
}
```

Keep only engine, three child projectors, financial derivation, constructor wiring, and `project()` in this file.

- [ ] **Step 6: Strengthen architecture and event regressions**

In `game-view-projector.spec.ts`, assert the complete composed View still has overview, service, and progression literals. In `view-boundary.spec.ts`, inspect production UI imports as before and add a source assertion that no UI file imports any new projector directly; React consumes `GameView` and controller commands only.

Run:

```bash
rtk npm test -- src/application src/ui
rtk npm run typecheck
```

Expected: all Application and UI tests PASS.

- [ ] **Step 7: Run full verification**

```bash
rtk npm test
rtk npm run typecheck
rtk npm run build
rtk git diff --check
rtk git status --short
```

Expected: all tests, typecheck, and production build PASS. Only intended Phase 7 source, test, spec, and plan files remain changed. If Next rewrites TypeScript config files, inspect and reverse only those generated changes with `apply_patch`, then rerun `rtk npm run typecheck`.

- [ ] **Step 8: Commit**

```bash
rtk git add src/application/game-service-projector.ts src/application/__tests__/game-service-projector.spec.ts src/application/game-view-projector.ts src/application/game-event-projector.ts src/application/game-controller.ts src/application/__tests__/game-event-projector.spec.ts src/application/__tests__/game-view-projector.spec.ts src/application/__tests__/view-boundary.spec.ts
rtk git commit -m "refactor: compose focused game view projectors"
```

- [ ] **Step 9: Request independent code review**

Review the full range from the Phase 7 spec commit through `HEAD` against the spec. Fix every Critical and Important finding, rerun full verification, and commit review fixes separately before offering branch integration.
