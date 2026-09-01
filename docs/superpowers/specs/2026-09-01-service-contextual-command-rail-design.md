# Service Contextual Command Rail — Design Specification

Date: 2026-09-01
Status: awaiting user review
Base: `fix/living-system-board-layout` (`4a506ec88dcbb766047dfc661f67c05e54e3f294`)

## 1. Problem

The current game separates operational observation and development decisions across two primary tabs:

- `SERVICE` shows the live service, topology, current work, alerts, and node actions.
- `BUILD` shows feature, technology, and learning options.

That interrupts the core gameplay loop:

`observe pressure → diagnose → choose a remedy → execute → observe the result`.

While the game clock is running, switching away from the Service Map also removes immediate awareness of overload, incidents, costs, and topology changes. The Service screen should therefore become the primary operational play surface, with most immediate development decisions available in context.

## 2. Product decision

Adopt this hierarchy:

- **SERVICE = operational workspace / primary play surface**
- **BUILD = strategic catalog / deep exploration**
- **REPORT = retrospective analysis**

Build remains a first-class tab. Service gains a contextual command surface for fast Feature, Technology, and Learning decisions while the live system remains visible.

## 3. Goals

1. Start Feature, Technology, and Learning work without leaving `SERVICE`.
2. Keep the live topology visible while browsing/reviewing quick decisions on desktop.
3. Preserve incident and overload awareness while the command surface is open.
4. Reuse the same Application-projected development options, ordering, costs, durations, benefits, unavailable reasons, and actions already used by Build.
5. Use one interaction grammar for Feature, Technology, and Learning.
6. Keep Node Inspector and incident response as first-class operational tools.
7. Preserve the open command context across blocking incident overlays.
8. Keep Build valuable as the complete catalog for ready, locked, active, and completed options.

## 4. Non-goals

- No Core game-rule, balance, cost, build-time, prerequisite, capacity, or incident-rule changes.
- No UI-side estimates or effects that Application does not project.
- No removal of Build.
- No full technology tree/catalog embedded into Service.
- No desktop modal for normal quick development decisions.
- No new development actions.
- No TopologyMap request-flow or geometry rewrite in this feature.

## 5. Core UX model

### 5.1 Closed Service state

The normal Service layout keeps its existing spatial model:

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

- Active slot → open the matching active option detail.
- Idle slot → open Browse for that work kind.
- Incident stays an operational concern, not a catalog chooser.

### 5.2 Contextual Command Rail

Opening a Feature, Technology, or Learning slot grows the left work rail into a **Contextual Command Rail**.

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

Desktop behavior is non-modal:

- no backdrop;
- no focus trap;
- Service Map remains visible;
- game clock continues unless a game rule pauses it;
- NOW remains visible on wide layouts.

The signature is spatial rather than decorative: **current work expands into current decision space without leaving the machine being operated**.

### 5.3 Browse mode

Browse is intentionally smaller than Build. For the selected kind it shows:

1. `IN PROGRESS`, if that kind has active work;
2. `AVAILABLE NOW`, preserving Application ordering;
3. one compact `LOCKED / NEEDS N` summary row;
4. `OPEN FULL BUILD →`.

The quick chooser does **not** list completed history and does **not** expand locked items into a second catalog. Those belong in Build.

No readiness/prerequisite logic is duplicated in React. State comes from `DevelopmentWorkbenchView.options`.

### 5.4 Detail mode

Selecting an option changes Browse → Detail in the same command surface.

Detail order:

1. kind / projected status;
2. title;
3. summary / why it matters;
4. duration;
5. upfront cost;
6. monthly cost;
7. projected benefits;
8. unavailable reason when applicable;
9. projected primary action when available.

All copy, costs, duration, state, benefits, and unavailable reasons come from the existing `DevelopmentOptionView`. React must not fabricate an effect preview.

### 5.5 Confirmation and action

Starting work uses the same app-owned confirmation pattern and action dispatch path as Build.

After confirm:

- `handleDevelopmentAction` remains the action owner;
- the player remains on `SERVICE`;
- the current option is immediately reconciled from the latest `view.development.options`;
- if it is now active, Detail stays open on its active state;
- the existing toast confirms the action.

No browser `alert()`, `confirm()`, or `prompt()` is introduced.

## 6. Command state machine

Feature, Technology, and Learning share one state model:

```text
CLOSED
  ↓ slot
BROWSE(kind)
  ↓ option
DETAIL(kind, optionId)
  ↓ action
CONFIRM(action)
  ↓ success
DETAIL(kind, optionId) using latest projected state
```

Navigation rules are explicit:

- Detail Back → `BROWSE(same kind)`.
- Browse Close / Escape → `CLOSED`.
- Confirmation Cancel → Detail and restore focus to the action button.
- Clicking another work slot while the rail is open → `BROWSE(new kind)` or its active Detail.
- Primary nav away from Service → close the Service command state.
- Returning to Service from Build/Report → command state starts closed.

## 7. Full Build handoff

`OPEN FULL BUILD →` is a deliberate deep-exploration handoff.

When invoked:

1. close the Service command rail;
2. navigate to `BUILD`;
3. initialize Build's filter to the current kind (`feature`, `technology`, or `learning`);
4. if Detail was open, initialize Build's selected option to the same `optionId`;
5. if Browse was open, Build opens with that kind filter and no forced selection.

This requires extending Build's initial inputs so kind and selection are explicit rather than inferred.

## 8. Incident and live-state behavior

### 8.1 Blocking incidents

Existing EventOverlay priority and auto-pause behavior remains authoritative.

If a blocking incident arrives while the command rail is open:

1. EventOverlay appears above Service;
2. command `kind` and `optionId` remain stored;
3. incident response proceeds normally;
4. after the overlay closes, the previous command context is restored if that option still exists.

### 8.2 Live option reconciliation

Time can advance while Browse or Detail is open. Every render reconciles against the latest `view.development.options`:

- option still exists → render latest projected state;
- option becomes active/completed/locked → show the new state;
- selected option disappears → return to `BROWSE(same kind)`;
- never dispatch from stale copied option data.

Controller/domain validation remains authoritative.

## 9. Node Inspector coexistence

Spatial meaning is intentional:

- **left = development / preparation**
- **center = live system**
- **right = operational diagnosis / node action**

At wide desktop widths, Command Rail and Node Inspector can be open simultaneously. This enables:

`inspect PostgreSQL → compare Redis/Replica → keep node condition visible → choose remedy`.

The command surface must never replace Node Inspector.

## 10. Responsive contract

Use the existing Service breakpoint family rather than inventing an unrelated responsive system.

### 10.1 Wide desktop: `>= 1181px`

- expanded command column target: about `360px` (allowed range 340–380px for final fit);
- center topology must retain at least the existing `560px` usable minimum;
- NOW remains in the board;
- Node Inspector may coexist;
- layout expansion pushes/resizes content; it does not cover the entire Service Map.

### 10.2 Medium: `601px–1180px`

- compact rail remains the normal closed state;
- expanded command surface becomes a left-anchored persistent drawer/overlay within the workspace;
- it is non-modal: no backdrop and no focus trap;
- Service context remains visible beside/behind it where geometry allows;
- existing NOW stacking rules remain authoritative;
- the drawer owns its internal scroll only and must not create a new `100vh`/shared-workspace overflow owner.

### 10.3 Mobile: `<= 600px`

The same command state renders as a non-modal bottom command sheet:

- no backdrop;
- maximum height target: `72dvh` or equivalent safe bounded value;
- Service Map remains visible above/behind the sheet;
- explicit Close control;
- visible internal scrollbar;
- primary action remains above `env(safe-area-inset-bottom)`;
- closing restores focus to the work-slot trigger;
- blocking EventOverlay always appears above the sheet.

Desktop, medium, and mobile must reuse the same option/detail/action primitives.

## 11. Build's role after the change

Service answers:

> **What should I do right now while this system is running?**

Build answers:

> **What exists, what is locked, what is completed, and where can the architecture go next?**

Build continues to expose:

- In Progress;
- Available Now;
- Locked / Needs;
- Completed;
- complete filters;
- complete option exploration.

Service intentionally exposes the operational subset only.

## 12. Component architecture

### 12.1 Shared development UI

Do not copy DevelopmentWorkbench's option-detail or confirmation implementation into ServiceDashboard.

Extract reusable development presentation/action primitives from the current Build UI. The implementation plan should preserve these responsibilities:

- shared option-detail renderer;
- shared development-action confirmation dialog;
- shared grouping/filter helpers where appropriate.

Build and Service consume the same primitives.

### 12.2 ServiceCommandRail

Introduce one component responsible only for Service-side development presentation/navigation.

Inputs conceptually include:

- `DevelopmentWorkbenchView`;
- command state (`kind`, optional `optionId`);
- `onAction(DevelopmentActionView)`;
- `onOpenFullBuild(kind, optionId?)`;
- close/back/focus callbacks.

It owns no game rules.

### 12.3 GameApp state ownership

`GameApp` owns the Service command state because it already owns primary navigation, blocking events, selected node, action dispatch, and toast feedback.

Use a small presentation state such as:

```ts
type ServiceCommandState =
  | { kind: 'feature' | 'technology' | 'learning'; optionId: string | null }
  | null;
```

This guarantees EventOverlay does not reset the player's decision context.

GameApp also owns the explicit Build handoff inputs:

- initial Build filter kind;
- initial selected option ID.

### 12.4 ServiceDashboard

ServiceDashboard owns:

- work-slot triggers;
- compact/expanded rail placement;
- rendering ServiceCommandRail;
- focus restoration to the originating slot.

It does not embed the full Build Decision Board.

## 13. Accessibility and focus

Target WCAG 2.2 AA baseline.

- Feature/Technology/Learning slot triggers remain native buttons.
- Idle slots are enabled and have explicit accessible names.
- Command surface is a named non-modal region, not a modal dialog.
- Explicit Close action exists at every responsive size.
- Escape closes Detail/Browse only when no higher-priority overlay owns Escape.
- Close restores focus to the slot that opened the command surface.
- Detail Back keeps focus within the command surface predictably.
- Shared confirmation preserves its existing focus trap, Escape, cancel, and focus-restoration contract.
- No hover-only information.
- Product-owned scrollbars stay visible.
- Reduced-motion behavior stays intact.

## 14. Visual direction

This extends the existing Living System Board. Do not create a new visual identity.

Use current tokens and typography from `DESIGN.md` and the canonical `app/living-system-board.css` adapter.

The visual signature is the rail transformation itself: **ACTIVE work expands into an operational control bay**.

Avoid:

- generic floating SaaS cards;
- a full-screen development modal;
- decorative neon/glow expansion;
- a second primary accent;
- duplicating Build's full catalog inside Service.

The interaction should feel like opening a control bay on the same running system.

## 15. Durable DESIGN.md update

Implementation must add this durable rule to `DESIGN.md`:

> Service is the primary operational play surface. Immediate Feature, Technology, and Learning decisions use a contextual command surface that preserves live system visibility. Build remains the complete strategic catalog.

No palette or typography token changes are required.

## 16. Testing strategy

### Component/unit

- idle Feature/Technology/Learning slot opens `BROWSE(correct kind)`;
- active slot opens the matching active Detail;
- Browse preserves Application ordering;
- quick chooser includes active + ready and only a compact locked summary;
- completed history is absent from Service quick Browse;
- Detail uses projected costs/duration/benefits/reason;
- Escape/Close restores focus;
- stale/missing selected option reconciles correctly;
- Full Build handoff forwards exact kind and optional option ID.

### Integration

- start Technology from Service and remain on Service;
- start Learning from Service and remain on Service;
- start/inspect Feature work from Service;
- command state survives blocking EventOverlay;
- Node Inspector and Command Rail coexist at wide desktop state;
- Build still functions using extracted shared detail/dialog primitives;
- returning from Build to Service starts with command rail closed.

### Responsive/style contract

- `>=1181px`: expanded rail + usable center topology + NOW coexist;
- `601–1180px`: left persistent drawer mode;
- `<=600px`: bounded bottom command sheet mode;
- no new shared `100vh` scroll owner;
- no hidden-scrollbar rule.

### Full verification

- `npm test`
- `npm run typecheck`
- `npm run build`
- existing balance/determinism CI steps
- static search for native browser dialogs
- visual inspection at representative wide desktop, medium desktop, and mobile widths before merge

## 17. Acceptance criteria

Complete means all are true:

1. Available Feature, Technology, and Learning work can start from Service without switching tabs.
2. Live Service remains visible during desktop quick decisions.
3. Build remains the complete development catalog.
4. Service and Build use the same projected data and shared option/action primitives.
5. Blocking incidents do not erase open command context.
6. Service-side development actions leave the player on Service.
7. Node Inspector remains usable and independent.
8. Full Build handoff preserves exact kind and optional selected option.
9. Mobile provides the same capability through the bounded non-modal bottom sheet.
10. No Core/Application/Simulation game-rule change is required.
11. Existing tests, typecheck, build, balance verification, and new interaction tests pass.
