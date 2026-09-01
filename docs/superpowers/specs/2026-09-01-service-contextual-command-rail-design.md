# Service Contextual Command Rail — Design Specification

Date: 2026-09-01
Status: proposed for implementation
Base: `fix/living-system-board-layout` (`4a506ec88dcbb766047dfc661f67c05e54e3f294`)

## 1. Problem

The current game splits operational observation and development decisions across two primary tabs:

- `SERVICE` shows the live service, topology, current work, alerts, and node actions.
- `BUILD` shows feature, technology, and learning options.

This creates unnecessary context switching during the most important gameplay loop:

`observe pressure → diagnose → choose a remedy → execute → observe the result`.

A player who leaves the Service Map to browse technology or learning options loses immediate situational awareness. That is especially harmful while the clock is running, because overload, incidents, costs, and topology state can change during the decision.

The Service screen should therefore become the primary operational play surface. Most immediate development decisions must be possible without leaving it.

## 2. Product decision

Adopt the following hierarchy:

- **SERVICE = operational workspace / primary play surface**
- **BUILD = strategic catalog / deep exploration**
- **REPORT = retrospective analysis**

The Build tab remains. It is not replaced by the Service command rail.

The Service screen gets a contextual command rail that supports fast Feature, Technology, and Learning decisions while keeping the live Service Map and operational alerts visible.

## 3. Goals

1. Let the player start Feature, Technology, and Learning work without changing away from `SERVICE`.
2. Keep the live topology visible while browsing or reviewing an option on desktop.
3. Preserve incident and overload awareness while the command rail is open.
4. Reuse the same Application-projected development options, state ordering, costs, durations, benefits, unavailable reasons, and actions already used by Build.
5. Preserve a single interaction grammar across Feature, Technology, and Learning.
6. Keep Node Inspector and incident response as first-class operational tools.
7. Preserve command-rail context across blocking incident overlays so the player can resume the interrupted decision.
8. Keep Build valuable as the place for complete strategic exploration, including locked and completed items.

## 4. Non-goals

- Do not change Core game rules, balancing, costs, build times, prerequisites, capacity calculations, or incident rules.
- Do not add UI-side estimates that are not already projected by Application.
- Do not remove the Build tab.
- Do not turn the Service screen into a complete technology tree or full catalog.
- Do not make the command rail modal on desktop.
- Do not invent new development actions.
- Do not rewrite TopologyMap geometry or request-trace behavior as part of this feature.

## 5. UX model

### 5.1 Closed state

The normal Service layout keeps the existing three-zone mental model:

```text
┌──────────────┬──────────────────────────────────────┬─────────────┐
│ ACTIVE       │                                      │ NOW         │
│              │             SERVICE MAP              │             │
│ FEATURE      │                                      │ Alerts      │
│ TECHNOLOGY   │                                      │             │
│ LEARNING     │                                      │             │
│              │                                      │             │
│ MONTHLY NET  │                                      │             │
└──────────────┴──────────────────────────────────────┴─────────────┘
```

Feature, Technology, and Learning slots are actionable even when idle.

- Active slot: opens the active option detail.
- Idle slot: opens the quick chooser for that kind.
- Incident remains an operational concern, not a catalog chooser.

### 5.2 Contextual command rail

Opening a Feature, Technology, or Learning slot expands the left operational rail into a **Contextual Command Rail**.

Desktop concept:

```text
┌──────────────────────────┬───────────────────────────────┬───────────┐
│ TECHNOLOGY               │                               │ NOW       │
│                          │         SERVICE MAP           │           │
│ AVAILABLE NOW            │                               │ DB 87%    │
│ Redis                    │ USERS → APP → DB             │           │
│ Read Replica             │              ↘ STORAGE       │           │
│ Queue                    │                               │           │
│                          │                               │           │
│ LOCKED / NEEDS      4    │                               │           │
│ OPEN FULL BUILD →        │                               │           │
└──────────────────────────┴───────────────────────────────┴───────────┘
```

The command rail is non-modal on desktop:

- no backdrop;
- no focus trap;
- Service Map remains visible;
- alerts remain visible where the viewport allows;
- game clock continues unless another game rule pauses it.

### 5.3 Browse mode

The browse mode is intentionally smaller than Build.

For the selected kind it shows:

1. **IN PROGRESS** when applicable;
2. **AVAILABLE NOW** options;
3. a compact **LOCKED / NEEDS** count/summary;
4. `OPEN FULL BUILD →` for the complete catalog.

Completed options do not occupy the quick chooser unless they are needed to explain the current active state. Completed history belongs in Build.

Application ordering is preserved inside each group.

The Service rail must not duplicate business logic for deciding readiness or prerequisites.

### 5.4 Detail mode

Selecting an option changes the rail from browse mode to detail mode without navigating away.

Detail order:

1. Kind / status
2. Title
3. Summary / why it matters
4. Duration
5. Upfront cost
6. Monthly cost
7. Benefits already projected by Application
8. Unavailable reason when locked
9. Primary action when Application exposes one

Example:

```text
TECHNOLOGY

← Redis

CACHE
Redis

Repeated reads can be served without returning to the database.

TIME       3 days
UPFRONT    ₩40K
MONTHLY    +₩15K

EXPECTED EFFECT
• DB read pressure ↓
• App throughput ↑

[ BUILD REDIS ]
```

The actual copy and effects are sourced from the existing `DevelopmentOptionView`. React does not invent effects or preview values.

### 5.5 Confirmation

Starting a development action uses the existing app-owned development confirmation pattern.

The confirmation appears over the Service screen and uses the same action vocabulary and data as Build.

No browser `confirm()` / `alert()` / `prompt()` is introduced.

After confirmation:

- the action is dispatched through the same `handleDevelopmentAction` path used by Build;
- the player stays on `SERVICE`;
- the command rail returns to the appropriate active state or remains on the now-active option;
- the existing toast confirms the action.

## 6. Interaction grammar by work kind

Feature, Technology, and Learning use the same rail state machine.

```text
CLOSED
  ↓ slot click
BROWSE(kind)
  ↓ option click
DETAIL(kind, optionId)
  ↓ start
CONFIRM(action)
  ↓ success
DETAIL/ACTIVE(kind, optionId)
```

Back behavior:

- Detail Back → Browse for the same kind.
- Browse Close / Escape → Closed.
- Confirmation Cancel → Detail and restore focus to the action trigger.
- `OPEN FULL BUILD` → Build tab with the same kind selected; selected option is preserved when practical.

## 7. Incident and live-state behavior

### 7.1 Blocking incidents

Blocking events keep existing priority and auto-pause behavior.

If an incident occurs while the Service command rail is open:

1. the EventOverlay appears above the current Service UI;
2. command-rail kind and selected option are retained in state;
3. incident response proceeds normally;
4. dismissing/resolving the overlay returns the player to the same command-rail context when that option still exists.

The player must not lose a technology/learning decision merely because an incident interrupted it.

### 7.2 Live option reconciliation

Because game time can advance while the rail is open, development option state can change.

The UI must reconcile against the newest `view.development.options` on every render:

- if a selected option still exists, render its latest projected state;
- if it becomes active/completed/locked, show the new state rather than stale local data;
- if it no longer exists, return to Browse for the same kind;
- never dispatch an action solely from stale local option data.

Existing controller-side validation remains authoritative.

## 8. Node Inspector coexistence

Spatial meaning is intentional:

- **left = development / preparation decision**
- **center = live system**
- **right = operational diagnosis / node action**

On sufficiently wide desktop layouts, Command Rail and Node Inspector may be open at the same time.

This supports workflows such as:

`inspect PostgreSQL pressure → compare Redis/Replica → keep PostgreSQL Inspector visible → choose remedy`.

The Service Map must retain a usable minimum center width. Responsive rules decide when simultaneous side surfaces stop being practical.

## 9. Responsive behavior

### 9.1 Wide desktop

At widths where the center topology can retain its established usable minimum:

- the left column expands from compact rail to approximately 340–380px;
- the Service Map remains visible and is resized by layout, not covered by a modal backdrop;
- NOW remains visible;
- Node Inspector can coexist.

### 9.2 Medium desktop / tablet landscape

When expanding both sides would make the topology unreadable:

- Command Rail becomes a persistent overlay/drawer anchored to the left edge of the workspace;
- it remains non-modal when there is still enough visible Service context;
- NOW may continue using the existing stacked responsive treatment;
- Node Inspector follows its established responsive behavior.

The drawer must not change document height or create competing viewport scroll owners.

### 9.3 Mobile

Mobile does not attempt a narrow left rail.

The same command state is rendered as a bottom sheet / bottom panel:

- Service Map remains the first Service content;
- opening Feature/Technology/Learning brings up the command surface from the bottom;
- the surface has an explicit close action and visible scrolling;
- primary action remains reachable above safe-area insets;
- closing restores focus to the originating slot;
- incident overlays retain higher priority.

The mobile command surface must reuse the same data and action components as desktop rather than becoming a separate feature implementation.

## 10. Build tab role after this change

Build remains the complete strategic view.

Service answers:

> **What can/should I do right now while this system is running?**

Build answers:

> **What options exist, what is locked, what have I completed, and where can I take the architecture next?**

Build continues to show:

- In Progress
- Available Now
- Locked / Needs
- Completed
- full filters
- detailed option browsing

Service intentionally shows a reduced operational subset.

## 11. Component architecture

### 11.1 Shared development presentation

Do not duplicate DevelopmentWorkbench detail/confirmation logic in ServiceDashboard.

Refactor reusable pieces into shared components/helpers, likely along these boundaries:

- `DevelopmentOptionDetail` — renders the projected option detail
- `DevelopmentActionDialog` — shared confirmation
- existing grouping/filter helpers remain shared or move to a neutral development UI module

Build and Service both consume these primitives.

### 11.2 ServiceCommandRail

Introduce one bounded component responsible for Service-side development navigation.

Inputs:

- `DevelopmentWorkbenchView`
- current command state / initial kind
- `onAction(DevelopmentActionView)`
- `onOpenFullBuild(kind, optionId?)`
- close/focus callbacks as needed

It owns presentation state only. It must not own game rules.

### 11.3 GameApp ownership

`GameApp` continues to own:

- active primary tab;
- selected node;
- blocking events;
- development action dispatch;
- toast feedback.

Command-rail state should live high enough that a blocking EventOverlay does not reset it. It may be owned by GameApp or by a Service subtree that remains mounted while EventOverlay is shown; implementation should prefer the smallest owner that guarantees interruption persistence.

Opening Full Build passes the relevant kind/selection into DevelopmentWorkbench using existing or extended initial-selection inputs.

### 11.4 ServiceDashboard

ServiceDashboard becomes the trigger/placement owner for the command rail.

It must not duplicate the full Build Decision Board.

The compact Active rail remains useful when the command surface is closed.

## 12. Accessibility and focus

Target: WCAG 2.2 AA baseline.

- Work-slot actions remain native buttons.
- Idle Feature/Technology/Learning slots are enabled and have explicit accessible names.
- Command Rail has a named region/surface and explicit close action.
- Escape closes Detail/Browse when no higher-priority overlay owns Escape.
- Closing the rail restores focus to the slot that opened it.
- Detail Back restores focus predictably inside the rail.
- Confirmation follows existing dialog focus trap, Escape, cancel, and focus restoration behavior.
- No hover-only information.
- Scrollbars remain visible and operable.
- Reduced-motion rules remain respected.
- The non-modal desktop rail must not claim modal dialog semantics.

## 13. Visual direction

This feature extends the existing Living System Board; it does not create a new visual identity.

Use existing tokens and typography from `DESIGN.md` / `app/living-system-board.css`.

Signature behavior is spatial rather than decorative: the left rail physically grows from **current work** into **current decision space**, while the live architecture remains present.

Avoid:

- floating generic SaaS cards;
- oversized modal catalogs;
- neon/glow expansion effects;
- a second competing accent color;
- duplicating Build's full board inside Service.

The transition should feel like opening a control bay on the same machine, not navigating to another product screen.

## 14. Durable DESIGN.md update

Implementation must update `DESIGN.md` with this approved system rule:

> Service is the primary operational play surface. Immediate Feature, Technology, and Learning decisions use a contextual command surface that preserves live system visibility. Build remains the complete strategic catalog.

No palette or typography token changes are required by this feature.

## 15. Testing strategy

### Component / unit

- idle Feature/Technology/Learning slot opens the correct Browse kind;
- active slot opens the corresponding active option detail;
- Browse preserves Application ordering;
- locked/completed options follow the Service subset policy;
- Detail renders costs/duration/benefits directly from the projected option;
- Escape closes and focus restoration contract is covered;
- stale/missing selected option reconciles back to current projected state;
- `OPEN FULL BUILD` forwards kind/selection.

### Integration

- start Technology from Service and remain on Service;
- start Learning from Service and remain on Service;
- start/inspect Feature work from Service;
- command-rail state survives a blocking EventOverlay;
- Node Inspector and Command Rail can coexist on wide desktop state;
- Build still works with the extracted shared detail/dialog primitives.

### Style / responsive contract

- wide desktop expanded rail preserves a bounded usable topology region;
- command surface does not introduce a new `100vh`/overflow owner on shared workspace ancestors;
- medium widths use the intended drawer mode;
- mobile uses the intended bottom-panel mode;
- no hidden scrollbar rule is introduced.

### Full verification

- `npm test`
- `npm run typecheck`
- `npm run build`
- existing balance/determinism CI steps
- static search for native browser dialogs
- refreshed visual inspection at representative wide desktop, medium desktop, and mobile widths before merge

## 16. Acceptance criteria

The feature is complete when all of the following are true:

1. A player can begin available Feature, Technology, and Learning actions from Service without switching tabs.
2. The live service remains visible during desktop quick decisions.
3. Build continues to expose the complete development catalog.
4. Service and Build use the same projected option data and shared action/detail primitives.
5. A blocking incident does not erase the player's open command context.
6. Starting a Service-side development action leaves the player on Service.
7. Node Inspector remains usable and is not replaced by the development rail.
8. Mobile offers the same capability through a safe-area-aware bottom surface.
9. No Core/Application/Simulation game-rule behavior changes are required.
10. Existing tests, typecheck, build, balance verification, and new interaction tests pass.
