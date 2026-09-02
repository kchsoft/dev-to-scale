# Service Contextual Command Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `SERVICE` the primary operational play surface by allowing Feature, Technology, and Learning decisions to be browsed, inspected, confirmed, and started without leaving the live Service Map, while retaining `BUILD` as the complete strategic catalog.

**Architecture:** Keep Core/Application game rules and projections unchanged. Extract the existing Build option-detail and confirmation UI into shared presentation primitives, add a Service-only contextual command state owned by `GameApp`, render that state through a new `ServiceCommandRail`, and reuse the same `DevelopmentWorkbenchView` / `DevelopmentActionView` data and dispatch path on both Service and Build. Responsive behavior is owned by one new command-surface stylesheet layered after the existing Living System Board details layer.

**Tech Stack:** Next.js 16.3, React 19, TypeScript 5.9, Vitest 3, CSS

**Spec:** `docs/superpowers/specs/2026-09-01-service-contextual-command-rail-design.md`

## Global Constraints

- Do not modify Core, Application projection rules, balance, costs, prerequisites, build times, incident rules, capacity, or progression.
- React consumes only Application DTOs. Do not infer readiness, effects, prerequisites, capacity, or cost previews in UI code.
- Keep `SERVICE | BUILD | REPORT` as the three primary navigation items.
- Service quick Browse contains only active + ready options for the selected kind, plus a compact locked count and Full Build handoff. Completed history stays in Build.
- All development commands continue through the existing `handleDevelopmentAction` → `dispatchDevelopmentAction` → `GameController` path.
- Blocking `EventOverlay` keeps priority and must not clear Service command state.
- Node Inspector remains an independent operational surface and may coexist with the command rail at wide widths.
- Desktop/medium Service command surfaces are non-modal: no backdrop, no focus trap, no `aria-modal`.
- Mobile command surface is also non-modal; EventOverlay remains higher priority.
- No product flow may introduce native `alert()`, `confirm()`, or `prompt()`.
- Keep product scrollbars visible; do not add hidden-scrollbar rules.
- Do not add a new shared `100vh` / `100dvh` scroll owner to `.workspace`, `.service-board`, or another shared ancestor.
- Maintain the existing Living System Board palette/type tokens; no new durable color or typography tokens are needed.
- Because this environment has no subagent runtime, execute this plan with `superpowers:executing-plans` and preserve the task review checkpoints manually.

---

### Task 1: Extract shared development option detail and action confirmation primitives

**Files:**
- Create: `src/ui/DevelopmentOptionDetail.tsx`
- Create: `src/ui/DevelopmentActionDialog.tsx`
- Modify: `src/ui/DevelopmentWorkbench.tsx`
- Create: `src/ui/__tests__/development-option-primitives.spec.tsx`
- Modify: `src/ui/__tests__/development-workbench.spec.tsx`

**Interfaces:**

```ts
export const DEVELOPMENT_KIND_LABEL: Readonly<Record<DevelopmentOptionKind, string>>;

interface DevelopmentOptionDetailProps {
  readonly option: DevelopmentOptionView;
  readonly titleId: string;
  readonly actionButtonRef?: RefObject<HTMLButtonElement | null>;
  readonly onAction?: (action: DevelopmentActionView) => void;
  readonly className?: string;
}

export function DevelopmentOptionDetail(props: DevelopmentOptionDetailProps): ReactNode;
```

`DevelopmentOptionDetail` owns the projected detail body only: status, ID, summary, progress, TIME/UPFRONT/MONTHLY, BENEFIT, RISK / TRADE-OFF, REQUIREMENTS, unavailable reason, and the projected primary action button. It does not own a surrounding Inspector header/back/close treatment.

```ts
interface DevelopmentActionDialogProps {
  readonly option: DevelopmentOptionView;
  readonly action: DevelopmentActionView;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function DevelopmentActionDialog(props: DevelopmentActionDialogProps): ReactNode;
```

The dialog preserves the current Build semantics: `role="dialog"`, `aria-modal="true"`, accessible title/description, focus trap, Escape cancel, initial focus on Cancel, and focus restoration controlled by the caller.

- [ ] **Step 1: Write failing primitive tests**

Create `development-option-primitives.spec.tsx` that imports the two new modules before they exist and asserts:

```ts
expect(detailHtml).toContain(option.title);
expect(detailHtml).toContain(option.summary);
expect(detailHtml).toContain('TIME');
expect(detailHtml).toContain('UPFRONT');
expect(detailHtml).toContain('MONTHLY');
expect(detailHtml).toContain('BENEFIT');
expect(detailHtml).toContain(option.statusLabel);

expect(dialogHtml).toContain('role="dialog"');
expect(dialogHtml).toContain('aria-modal="true"');
expect(dialogHtml).toContain('CONFIRM ACTION');
expect(dialogHtml).toContain(action.kind);
```

Also add a source-boundary assertion to `development-workbench.spec.tsx` that `DevelopmentWorkbench.tsx` imports the shared primitives rather than defining `StartDevelopmentDialog` locally.

- [ ] **Step 2: Run RED**

Run through PR CI or local equivalent:

`npm test -- src/ui/__tests__/development-option-primitives.spec.tsx src/ui/__tests__/development-workbench.spec.tsx`

Expected: missing-module/local-implementation contract failures; existing unrelated tests remain green.

- [ ] **Step 3: Extract the detail body without changing data or classes**

Move the existing selected-option body out of `DevelopmentInspector` into `DevelopmentOptionDetail`. Reuse the current CSS class names (`development-inspector-status`, `development-summary`, `development-cost-grid`, `development-blocker`, `development-progress`) so Build styling does not regress.

Keep list rendering in the shared detail primitive; do not duplicate a Service-specific BENEFIT/RISK/REQUIREMENTS implementation.

- [ ] **Step 4: Extract the confirmation dialog unchanged in behavior**

Move `StartDevelopmentDialog` into `DevelopmentActionDialog.tsx`. Preserve its keydown/focus behavior and the exact action semantics. Do not add a second dialog implementation for Service later.

- [ ] **Step 5: Rewire Build to shared primitives**

`DevelopmentInspector` keeps its Build-specific header, backdrop, focusable sheet shell, and close behavior, but renders `DevelopmentOptionDetail` inside. `DevelopmentWorkbench` renders `DevelopmentActionDialog` for `pendingAction`.

- [ ] **Step 6: Run GREEN and typecheck**

Run:

`npm test -- src/ui/__tests__/development-option-primitives.spec.tsx src/ui/__tests__/development-workbench.spec.tsx`

`npm run typecheck`

Commit: `refactor: share development option action UI`

---

### Task 2: Add pure Service command state and operational subset helpers

**Files:**
- Create: `src/ui/ServiceCommandRail.tsx`
- Create: `src/ui/__tests__/service-command-rail.spec.tsx`

**Interfaces:**

```ts
export type ServiceCommandState =
  | { readonly kind: DevelopmentOptionKind; readonly optionId: string | null }
  | null;

export interface ServiceCommandBrowseModel {
  readonly active: readonly DevelopmentOptionView[];
  readonly ready: readonly DevelopmentOptionView[];
  readonly lockedCount: number;
}

export function developmentKindForWorkSlot(slot: WorkSlotView): DevelopmentOptionKind | null;

export function serviceCommandStateForWorkSlot(
  slot: WorkSlotView,
  options: readonly DevelopmentOptionView[],
): ServiceCommandState;

export function projectServiceCommandBrowse(
  options: readonly DevelopmentOptionView[],
  kind: DevelopmentOptionKind,
): ServiceCommandBrowseModel;

export function reconcileServiceCommandState(
  state: ServiceCommandState,
  options: readonly DevelopmentOptionView[],
): ServiceCommandState;
```

Rules:
- Incident → `null`.
- Idle Feature/Technology/Learning → `{ kind, optionId: null }`.
- Active work slot → matching active option ID using the existing `optionIdForWorkSlot` semantics, including REFACTOR handling.
- Browse preserves Application order; it filters, never sorts.
- Browse exposes active + ready, only counts locked, and exposes no completed list.
- Reconciliation keeps the latest option if it exists; missing selected option falls back to Browse of the same kind.

- [ ] **Step 1: Write failing pure-state tests**

Cover:

```ts
expect(serviceCommandStateForWorkSlot(idleTechSlot, options)).toEqual({ kind: 'technology', optionId: null });
expect(serviceCommandStateForWorkSlot(activeFeatureSlot, options)).toEqual({ kind: 'feature', optionId: 'feature:COMMUNITY_MVP' });
expect(serviceCommandStateForWorkSlot(incidentSlot, options)).toBeNull();
```

For browse projection, compare arrays directly against `options.filter(...)` to prove no UI reorder. Assert `completed` is not part of the return contract and `lockedCount` equals the locked subset length.

For reconciliation, pass a selected option ID absent from the next option array and expect `{ kind, optionId: null }`.

- [ ] **Step 2: Write failing ServiceCommandRail rendering tests**

Render Browse for a kind and assert:

```ts
expect(html).toContain('AVAILABLE NOW');
expect(html).toContain('IN PROGRESS');
expect(html).toContain('LOCKED / NEEDS');
expect(html).toContain('OPEN FULL BUILD');
expect(html).not.toContain('COMPLETED');
```

Render Detail with a real option and assert it uses the same shared detail labels/data from Task 1.

- [ ] **Step 3: Run RED**

`npm test -- src/ui/__tests__/service-command-rail.spec.tsx`

Expected: new component/helpers do not exist.

- [ ] **Step 4: Implement the helpers and rail presentation**

`ServiceCommandRail` props:

```ts
interface ServiceCommandRailProps {
  readonly view: DevelopmentWorkbenchView;
  readonly state: NonNullable<ServiceCommandState>;
  readonly onStateChange: (next: ServiceCommandState) => void;
  readonly onAction: (action: DevelopmentActionView) => void;
  readonly onOpenFullBuild: (kind: DevelopmentOptionKind, optionId: string | null) => void;
  readonly onClose: () => void;
}
```

The component owns only presentation-local `pendingAction`. The selected option is always looked up fresh from `view.options` by `state.optionId`; do not store a copied `DevelopmentOptionView` in state.

Browse rows use native buttons. Detail Back sets `{ kind, optionId: null }`. Close calls `onClose`. `OPEN FULL BUILD` forwards `state.kind` and current `optionId`.

- [ ] **Step 5: Reconcile live changes**

Use a small `useEffect` only to push the pure `reconcileServiceCommandState(...)` result upward when a selected option disappears. State transitions like ready → active or active → completed render naturally because detail resolves the current projected option each render.

- [ ] **Step 6: Run GREEN and typecheck**

`npm test -- src/ui/__tests__/service-command-rail.spec.tsx src/ui/__tests__/development-option-primitives.spec.tsx`

`npm run typecheck`

Commit: `feat: add service contextual command rail`

---

### Task 3: Integrate the command rail into ServiceDashboard with focus restoration

**Files:**
- Modify: `src/ui/ServiceDashboard.tsx`
- Modify: `src/ui/__tests__/game-screens.spec.tsx`
- Modify: `src/ui/__tests__/service-command-rail.spec.tsx`

**Interfaces:**

Replace `onDevelopmentSlot` with explicit command props:

```ts
interface ServiceDashboardProps {
  readonly view: GameView;
  readonly observability: ObservabilityView;
  readonly commandState: ServiceCommandState;
  readonly onCommandStateChange: (next: ServiceCommandState) => void;
  readonly onDevelopmentAction: (action: DevelopmentActionView) => void;
  readonly onOpenFullBuild: (kind: DevelopmentOptionKind, optionId: string | null) => void;
  readonly onNode: (id: string) => void;
}
```

- [ ] **Step 1: Write failing Service board contract tests**

Update fixtures to pass `commandState={null}` and new callbacks. Assert idle non-incident slots are enabled and include explicit accessible names indicating selection/browse action.

Add a render with `commandState={{ kind: 'technology', optionId: null }}` and assert:

```ts
expect(html).toContain('class="service-board command-open"');
expect(html).toContain('class="service-command-rail"');
expect(html).toContain('Service Map');
expect(html).toContain('class="actionable-alerts"');
```

This proves opening the command surface does not replace the map or NOW rail in markup.

- [ ] **Step 2: Run RED**

`npm test -- src/ui/__tests__/game-screens.spec.tsx src/ui/__tests__/service-command-rail.spec.tsx`

Expected: current dashboard still accepts `onDevelopmentSlot` and has no command surface.

- [ ] **Step 3: Change work-slot behavior**

Keep all four slots visible. Feature/Technology/Learning buttons are enabled whether active or idle. Incident remains disabled in this chooser.

On slot click:

```ts
onCommandStateChange(serviceCommandStateForWorkSlot(slot, view.development.options));
```

When `commandState !== null`, replace the compact left rail contents with `ServiceCommandRail` in the same left-column ownership; do not overlay a second duplicate active-work rail on wide desktop.

- [ ] **Step 4: Add focus restoration**

Maintain refs keyed by Feature/Technology/Learning slot kind. When the command rail closes, requestAnimationFrame focus back to the slot that opened/currently owns the rail.

Do not trap focus in the desktop/medium/mobile command surface. Escape from the rail calls the same close path; the existing higher-priority EventOverlay remains responsible for its own Escape behavior when present.

- [ ] **Step 5: Preserve Node and alert behavior**

Do not change TopologyMap, alert slicing, node selection, NodeInspector callback semantics, load mini rendering, or Service summary logic.

- [ ] **Step 6: Run GREEN and typecheck**

`npm test -- src/ui/__tests__/game-screens.spec.tsx src/ui/__tests__/service-command-rail.spec.tsx`

`npm run typecheck`

Commit: `feat: open development decisions inside service`

---

### Task 4: Move command ownership and Full Build handoff into GameApp

**Files:**
- Modify: `src/ui/GameApp.tsx`
- Modify: `src/ui/DevelopmentWorkbench.tsx`
- Modify: `src/ui/__tests__/development-workbench.spec.tsx`
- Create: `src/ui/__tests__/game-app-command-contract.spec.ts`

**Interfaces:**

`GameApp` adds:

```ts
const [serviceCommand, setServiceCommand] = useState<ServiceCommandState>(null);
const [developmentInitialFilter, setDevelopmentInitialFilter] = useState<DevelopmentFilter>('all');
const [developmentInitialSelectedId, setDevelopmentInitialSelectedId] = useState<string | null>(null);
```

`DevelopmentWorkbenchProps` becomes:

```ts
interface DevelopmentWorkbenchProps {
  readonly view: DevelopmentWorkbenchView;
  readonly initialFilter?: DevelopmentFilter;
  readonly initialSelectedId?: string | null;
  readonly onAction: (action: DevelopmentActionView) => void;
}
```

- [ ] **Step 1: Write failing Build handoff/filter tests**

In `development-workbench.spec.tsx`, render:

```tsx
<DevelopmentWorkbench
  view={view.development}
  initialFilter="technology"
  initialSelectedId="technology:REDIS"
  onAction={vi.fn()}
/>
```

Assert TECHNOLOGY filter is selected and a valid selected option opens its Inspector. Use an option ID that actually exists in the fixture rather than hardcoding one without checking the projected options.

- [ ] **Step 2: Add a source-level GameApp orchestration contract test**

`game-app-command-contract.spec.ts` reads `src/ui/GameApp.tsx` and asserts the composition root:

- declares Service command state;
- passes it to `ServiceDashboard`;
- passes `handleDevelopmentAction` to Service;
- Full Build handoff sets exact initial filter/selection then `setTab('development')`;
- normal primary nav away from Service clears Service command state;
- EventOverlay callbacks do not clear Service command state.

This is source-boundary coverage, not a substitute for browser interaction.

- [ ] **Step 3: Run RED**

`npm test -- src/ui/__tests__/development-workbench.spec.tsx src/ui/__tests__/game-app-command-contract.spec.ts`

Expected: no `initialFilter`, no Service command orchestration.

- [ ] **Step 4: Implement explicit Build initialization**

Initialize Workbench filter from `initialFilter ?? 'all'`. Initial selection is accepted only if the option exists and belongs to the initial filter (unless filter is `all`). Because Build unmounts when leaving its tab, mount-time initialization is sufficient; avoid prop-sync effects that would unexpectedly reset user-changed filters while Build remains open.

When Build work-slot strip selects an active slot, preserve its existing behavior of selecting the option; setting filter to `all` there is still acceptable because that interaction originates inside Build.

- [ ] **Step 5: Implement Service command ownership**

Start/restart reset `serviceCommand` to `null`.

Normal side-nav navigation:

```ts
const openPrimaryTab = (nextTab: GameTab) => {
  setServiceCommand(null);
  if (nextTab === 'development') {
    setDevelopmentInitialFilter('all');
    setDevelopmentInitialSelectedId(null);
  }
  setTab(nextTab);
};
```

Service Full Build handoff is a separate callback so it is not wiped by the generic nav reset:

```ts
const openFullBuild = (kind: DevelopmentOptionKind, optionId: string | null) => {
  setServiceCommand(null);
  setDevelopmentInitialFilter(kind);
  setDevelopmentInitialSelectedId(optionId);
  setTab('development');
};
```

Do not clear `serviceCommand` from EventOverlay arrival, response, or dismissal; overlay interruption therefore preserves it.

- [ ] **Step 6: Keep Service actions on Service**

`ServiceCommandRail` invokes the existing `handleDevelopmentAction`. No call to `setTab('development')` occurs on action confirm. After controller emit, Service receives the new `view.development.options` and the rail resolves the updated state.

- [ ] **Step 7: Run GREEN and typecheck**

`npm test -- src/ui/__tests__/development-workbench.spec.tsx src/ui/__tests__/game-app-command-contract.spec.ts src/ui/__tests__/game-screens.spec.tsx`

`npm run typecheck`

Commit: `feat: preserve service command context and build handoff`

---

### Task 5: Implement wide, medium, and mobile command-surface geometry

**Files:**
- Create: `app/living-system-command.css`
- Modify: `app/layout.tsx`
- Modify: `app/living-system-board.css` only where a shared board hook/class is genuinely required
- Modify: `src/ui/__tests__/living-system-style-contract.spec.ts`

**CSS ownership:** `app/living-system-command.css` is the single canonical owner for `.service-command-*` geometry and states. It may consume existing `:root` tokens but must not redeclare palette/type tokens.

Import order in `app/layout.tsx`:

```ts
import "./living-system-board.css";
import "./living-system-details.css";
import "./living-system-command.css";
import "./living-system-report.css";
```

This keeps command geometry after shared board/details and before report-only overrides.

- [ ] **Step 1: Write failing style-contract tests**

Assert command stylesheet import ordering and these durable geometry contracts:

Wide `>=1181px`:

```css
.service-board.command-open {
  grid-template-columns: clamp(340px, 24vw, 360px) minmax(560px, 1fr) minmax(190px, 224px);
}
```

Medium `601–1180px`:
- command surface is positioned/anchored left within Service workspace;
- bounded width around 340–360px / available viewport;
- `overflow-y: auto` belongs to command surface;
- no backdrop rule;
- no `100vh`/`100dvh` shared ancestor owner.

Mobile `<=600px`:
- fixed/sticky bottom command surface;
- `max-height: 72dvh` (or exact equivalent chosen before GREEN);
- bottom padding includes `env(safe-area-inset-bottom)`;
- own `overflow-y: auto`;
- no backdrop and no hidden scrollbar.

- [ ] **Step 2: Run RED**

`npm test -- src/ui/__tests__/living-system-style-contract.spec.ts`

Expected: command stylesheet/import/breakpoint contracts absent.

- [ ] **Step 3: Implement the visual surface using current tokens**

The command rail should read as an extension of ACTIVE, not a new dashboard card:
- Graphite/Raised Graphite surfaces;
- Signal Blue for selected/current command state;
- Mint/Amber/Coral only for semantic status;
- 8–12px radii;
- no broad glow;
- restrained 120–180ms transform/opacity/width transition only where geometry remains stable;
- reduced motion removes expansion animation.

Add `:focus-visible` for command buttons. Disabled/locked summary must not look clickable unless it actually opens Full Build.

- [ ] **Step 4: Protect topology usability**

At wide widths, center retains `minmax(560px, 1fr)` and NOW remains. At medium widths, the overlay/drawer must not change Service Map document height. At mobile, bottom sheet overlays lower content while the map remains mounted and first in document order.

- [ ] **Step 5: Define z-index ordering explicitly**

Command surface below Node Inspector/EventOverlay where those components already require priority. Do not raise command surface above blocking event overlays.

- [ ] **Step 6: Run GREEN and typecheck/build**

`npm test -- src/ui/__tests__/living-system-style-contract.spec.ts src/ui/__tests__/game-screens.spec.tsx`

`npm run typecheck`

`npm run build`

Commit: `feat: style contextual service command surface`

---

### Task 6: Update durable design context and add regression boundaries

**Files:**
- Modify: `DESIGN.md`
- Modify: `src/ui/__tests__/living-system-style-contract.spec.ts`
- Modify: `src/ui/__tests__/game-navigation.spec.ts` only if a role-description assertion is useful; labels/IDs must remain unchanged

- [ ] **Step 1: Add a failing durable-context assertion**

Assert `DESIGN.md` contains the approved rule that Service is the primary operational play surface and Build remains the complete strategic catalog.

Also assert the command CSS does not redeclare `:root` token ownership.

- [ ] **Step 2: Run RED**

`npm test -- src/ui/__tests__/living-system-style-contract.spec.ts`

Expected: durable role statement absent.

- [ ] **Step 3: Update DESIGN.md**

Under Layout/Components add the approved system behavior:

> Service is the primary operational play surface. Immediate Feature, Technology, and Learning decisions use a contextual command surface that preserves live system visibility. Build remains the complete strategic catalog.

Document spatial meaning:
- left = development/preparation;
- center = live system;
- right = operational diagnosis.

No palette/type token changes.

- [ ] **Step 4: Run GREEN**

`npm test -- src/ui/__tests__/living-system-style-contract.spec.ts src/ui/__tests__/game-navigation.spec.ts`

Commit: `docs: define service operational workspace contract`

---

### Task 7: End-to-end regression verification and Premium review

**Files:**
- No production change expected unless verification finds a defect.
- Modify tests only when a discovered real bug needs a regression test first.

- [ ] **Step 1: Run focused UI suite**

`npm test -- src/ui/__tests__/development-option-primitives.spec.tsx src/ui/__tests__/service-command-rail.spec.tsx src/ui/__tests__/development-workbench.spec.tsx src/ui/__tests__/game-app-command-contract.spec.ts src/ui/__tests__/game-screens.spec.tsx src/ui/__tests__/living-system-style-contract.spec.ts src/ui/__tests__/node-inspector.spec.tsx src/ui/__tests__/topology-map.spec.tsx`

Expected: all green.

- [ ] **Step 2: Run full verification**

`npm test`

`npm run typecheck`

`npm run build`

PR CI must additionally pass:
- Balance CLI smoke;
- deterministic rerun evidence;
- representative strategy traces;
- generated artifact hygiene;
- artifact upload.

- [ ] **Step 3: Review change boundary**

Compare implementation head against `4a506ec88dcbb766047dfc661f67c05e54e3f294` and verify no production files under `src/core`, `src/application`, or `src/simulation` changed. The only expected Application-facing change is consuming existing exported DTO types; no projector/controller behavior change is required.

- [ ] **Step 4: Premium/static audit**

Review changed production code for:
- native `alert(` / `confirm(` / `prompt(`;
- clickable non-button/div handlers;
- missing `aria` names on icon-only controls;
- command surface incorrectly claiming modal semantics;
- hidden scrollbar rules;
- new `100vh`/`100dvh` shared scroll ownership;
- duplicated option/business rules;
- duplicate development detail/dialog implementations;
- focus restoration and Escape paths;
- reduced-motion command transition;
- stale copied option data.

If the Premium Python audit / official DESIGN lint cannot run in the connector-only environment, record that limitation explicitly. Do not claim it ran.

- [ ] **Step 5: Visual acceptance before merge**

A refreshed browser render is required at representative widths before merge:
- wide desktop around 1440–2048px: closed Service, Technology Browse, Detail, Node Inspector coexistence;
- medium around 900–1100px: non-modal left drawer and visible Service context;
- mobile around 390px: bottom command sheet, safe-area action, visible internal scrolling;
- blocking incident while rail is open, then return to same command context.

If this connector environment cannot launch a browser, ask the user for refreshed screenshots and keep the PR unmerged until visual acceptance.

- [ ] **Step 6: Final commit/PR update**

Update PR body with RED/GREEN evidence, exact final head SHA, changed-file boundary, Premium limitations, and remaining visual-acceptance requirement.

Do not merge automatically; integration remains a user decision.
