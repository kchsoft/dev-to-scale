# Phase 5 Topology Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the independent infrastructure topology and animate representative requests along the exact edges selected by each workload trace.

**Architecture:** Core remains the sole owner of topology, route, load, and health calculation. A focused Application projector converts `TopologyGraph`, `NodeLoadSnapshot`, and `RequestTrace` into immutable UI DTOs; React owns only workload selection, deterministic node placement, SVG rendering, and animation timing.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16, CSS/SVG, Vitest 3

**Spec:** `docs/superpowers/specs/2026-08-26-infrastructure-ecosystem-topology-design.md`

## Global Constraints

- React imports Application contracts only and never imports `src/core`.
- Server, Database, Queue, Cache, Load Balancer, Object Storage, Worker, and External Service remain independent nodes identified by stable IDs.
- The UI never infers which route a request uses; highlighted edges come only from `RequestTraceView.edges`.
- Players may select a workload to observe but may not edit nodes, edges, or internal routes.
- Representative particles are capped at four per workload and do not model individual requests.
- `prefers-reduced-motion: reduce` removes movement and retains static route highlighting.
- Existing economy, growth, queue replacement, and incident behavior must not change.

---

### Task 1: Application topology view contract and projector

**Files:**
- Create: `src/application/topology-view-projector.ts`
- Create: `src/application/__tests__/topology-view-projector.spec.ts`
- Modify: `src/application/game-view.ts`
- Modify: `src/application/game-controller.ts`

**Interfaces:**
- Consumes: `TopologyGraph`, `LoadSnapshot.nodeLoads`, `LoadSnapshot.requestTraces`, current incidents, observability level, and Application-owned label/icon functions.
- Produces: `TopologyView`, `TopologyNodeView`, `TopologyEdgeView`, and `RequestTraceView` from `src/application/game-view.ts`.

- [ ] **Step 1: Write the failing projector test**

Create a real V1 topology containing app, database, storage, Redis, and queue nodes. Project its graph, node loads, and traces and assert literal node IDs, edge endpoints/modes, workload trace edge order, success percentage, failure node ID, and four-particle cap. Also assert that an unused external service is omitted while an external service traversed by a trace is retained.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/application/__tests__/topology-view-projector.spec.ts`

Expected: FAIL because `TopologyViewProjector` and the topology DTO contracts do not exist.

- [ ] **Step 3: Add immutable Application DTOs and minimal projector**

Add the following contract shapes without importing Core types into `game-view.ts`:

```ts
export interface TopologyNodeView {
  readonly id: string;
  readonly kind: 'load-balancer' | 'server-group' | 'database' | 'cache' | 'queue' | 'object-storage' | 'worker' | 'external-service';
  readonly name: string;
  readonly icon: string;
  readonly loadPercent: number;
  readonly tone: LoadTone;
  readonly detail: string;
  readonly incidentId?: string;
  readonly incidentSeverity?: string;
}

export interface TopologyEdgeView {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly mode: 'sync' | 'async';
}

export interface RequestTraceView {
  readonly id: string;
  readonly name: string;
  readonly nodes: readonly {
    readonly nodeId: string | null;
    readonly arrivalPercent: number;
    readonly status: 'healthy' | 'slow' | 'failed' | 'missing';
  }[];
  readonly edges: readonly { readonly edgeId: string; readonly trafficPercent: number }[];
  readonly successPercent: number;
  readonly failureNodeId: string | null;
  readonly particleCount: number;
  readonly trafficUnit: number;
}

export interface TopologyView {
  readonly nodes: readonly TopologyNodeView[];
  readonly edges: readonly TopologyEdgeView[];
  readonly traces: readonly RequestTraceView[];
}
```

Project load by exact node ID, incident by exact node ID, edge direction/mode from the graph, and edge order from each trace. Filter only unused `EXTERNAL_SERVICE` nodes; do not synthesize or reorder a trace route in React.

- [ ] **Step 4: Wire `GameView.topology` through `GameController`**

Reconstruct the current V1 topology from bootstrap plus completed feature definitions, pass the canonical `snapshot.load.nodeLoads` and `snapshot.load.requestTraces` to the projector, and expose the result as `GameView.topology`. Preserve the legacy `nodes` and `requestFlows` fields during Phase 5 compatibility.

- [ ] **Step 5: Run focused and Application regression tests**

Run: `npm test -- src/application/__tests__/topology-view-projector.spec.ts src/application/__tests__/game-controller.spec.ts src/application/__tests__/view-boundary.spec.ts`

Expected: all focused tests PASS and React remains free of Core imports.

- [ ] **Step 6: Commit**

```bash
git add src/application/game-view.ts src/application/topology-view-projector.ts src/application/game-controller.ts src/application/__tests__/topology-view-projector.spec.ts
git commit -m "feat: project topology for the service map"
```

### Task 2: Deterministic View-only topology layout

**Files:**
- Create: `src/ui/topology-layout.ts`
- Create: `src/ui/__tests__/topology-layout.spec.ts`

**Interfaces:**
- Consumes: `readonly TopologyNodeView[]` and `readonly TopologyEdgeView[]` from Application.
- Produces: `layoutTopology(nodes, edges): TopologyLayout` with immutable `{ nodeId, x, y }` positions and `{ edgeId, path }` SVG paths in a `1000 × 620` view box.

- [ ] **Step 1: Write the failing layout tests**

Assert with literal coordinates that gateway precedes server, server precedes data/async resources, sibling nodes receive distinct vertical positions, missing endpoints are ignored defensively, and repeated calls return equal layouts independent of input array order.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/ui/__tests__/topology-layout.spec.ts`

Expected: FAIL because `layoutTopology` does not exist.

- [ ] **Step 3: Implement the minimal deterministic layered layout**

Assign columns by infrastructure role (`load-balancer`, `server-group`, data/async resources, `worker`/`external-service`) and distribute siblings vertically in stable node-ID order. Build cubic SVG paths from the projected edge endpoints. Keep all geometry and sorting in this View-only module.

- [ ] **Step 4: Run layout and boundary tests**

Run: `npm test -- src/ui/__tests__/topology-layout.spec.ts src/application/__tests__/view-boundary.spec.ts`

Expected: both test files PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/topology-layout.ts src/ui/__tests__/topology-layout.spec.ts
git commit -m "feat: lay out topology nodes in the view"
```

### Task 3: Interactive Service Map renderer

**Files:**
- Create: `src/ui/TopologyMap.tsx`
- Modify: `src/ui/GameApp.tsx`
- Modify: `src/application/__tests__/view-boundary.spec.ts`

**Interfaces:**
- Consumes: `TopologyView`, `ObservabilityView`, DAU, launch state, selected-node callback.
- Produces: workload selector, SVG topology edges, independent node buttons, static failure markers, and representative SVG particles whose motion paths reference only selected trace edge IDs.

- [ ] **Step 1: Strengthen the boundary test and verify RED**

Extend the AST import test to scan every `.ts`/`.tsx` file under `src/ui`, and assert there are no imports whose resolved source path contains `/core`. The test must fail before production changes because the current test scans only `GameApp.tsx` and does not enforce the new module boundary repository-wide.

- [ ] **Step 2: Extract and render `TopologyMap`**

Replace `ArchitectureGraph` and `RequestFlowBoard` with `TopologyMap`. Keep selected workload ID as local React state, repair selection when traces change, and default to the last available trace. Render:

```text
USERS → [entry infrastructure] → [server group] → [database/cache/queue/storage/external]
```

Render edge classes from `selectedTrace.edges`, node failure state from `selectedTrace.failureNodeId`, async styling from `edge.mode`, and node cards from `TopologyNodeView`. Clicking a node calls the existing inspector callback; workload selection never mutates the domain.

- [ ] **Step 3: Preserve compatibility and empty states**

Before launch, show topology nodes with `PRE-LAUNCH` and no particles. If no trace exists, show the graph plus “서비스 공개 후 요청이 흐릅니다.” If a required node is missing, show a `MISSING` stop marker derived from the trace without creating a phantom infrastructure card.

- [ ] **Step 4: Run boundary, Application, and layout tests**

Run: `npm test -- src/application/__tests__/view-boundary.spec.ts src/application/__tests__/topology-view-projector.spec.ts src/ui/__tests__/topology-layout.spec.ts`

Expected: all focused tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/TopologyMap.tsx src/ui/GameApp.tsx src/application/__tests__/view-boundary.spec.ts
git commit -m "feat: render the interactive topology map"
```

### Task 4: Motion, queue waiting, responsive layout, and verification

**Files:**
- Modify: `app/globals.css`
- Modify: `app/dense-ui.css`
- Modify: `app/mobile.css`
- Modify: `src/ui/TopologyMap.tsx`

**Interfaces:**
- Consumes: projected traffic percentage, particle count, edge mode, trace status, and OS reduced-motion preference.
- Produces: restrained request motion, async queue dwell, stopped failure particle, static reduced-motion highlight, and responsive desktop/mobile topology.

- [ ] **Step 1: Add topology-specific visual tokens and motion**

Use the existing dark-console palette: canvas `#081018`, panel `#0a1219`, line `#29465b`, selected path `#43d9d1`, request particle `#e8fbff`, warning `#ffb454`, and failure `#ff616d`. Use SVG `animateMotion` on the Application-provided edge path. Cap visible particles at four, slow async edges, and render one stationary failure particle at the failed node.

- [ ] **Step 2: Add reduced-motion and non-color status cues**

Under `@media (prefers-reduced-motion: reduce)`, hide moving particles, remove pulse animations, and retain thicker selected edges plus `SYNC`/`ASYNC`, `!`, and `×` labels. Ensure node buttons have visible `:focus-visible` outlines.

- [ ] **Step 3: Make the graph responsive**

Keep the same SVG view box on desktop and mobile, use `aspect-ratio` with a minimum readable height, allow the workload selector to scroll horizontally, and keep node hit targets at least 44 CSS pixels. Do not create a second mobile route calculation.

- [ ] **Step 4: Run full automated verification**

Run: `npm test`

Expected: all test files and tests PASS with zero failures.

Run: `npm run typecheck`

Expected: exit code 0.

Run: `npm run build`

Expected: Next.js production build exits with code 0.

- [ ] **Step 5: Verify the rendered service map**

Start the app and inspect the service screen at desktop `1440 × 1000` and mobile `390 × 844`. Confirm node labels do not overlap, selected edges match the workload, particles stay on those edges, failed traces stop at the failed node, keyboard focus is visible, and reduced-motion leaves a readable static route.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/dense-ui.css app/mobile.css src/ui/TopologyMap.tsx
git commit -m "feat: animate requests across the topology"
```
