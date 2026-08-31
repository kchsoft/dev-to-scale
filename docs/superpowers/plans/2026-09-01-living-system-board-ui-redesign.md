# Living System Board UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape Dev to Scale from an equal-weight monitoring dashboard into a service-first simulation board where players can read system health, active work, urgent risks, and available decisions within seconds.

**Architecture:** Keep Core and Application projection boundaries unchanged. React continues to consume only `GameView` / `DevelopmentWorkbenchView`; this pass changes hierarchy, markup, shared presentation helpers, and CSS. Durable visual tokens are recorded in `DESIGN.md` and mapped to root CSS variables in the same task so documentation and runtime cannot drift.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Vitest, CSS

**Spec:** `docs/superpowers/specs/2026-08-31-living-system-board-ui-redesign.md`

## Global Constraints

- Do not change Core game rules, growth, capacity, incidents, settlement, progression, or simulation strategies.
- React must not import Core or infer unavailable capacity/business rules.
- Preserve Service Map automatic layout, request traces, work-slot routing, event auto-pause, and existing controller commands.
- Primary navigation remains three tabs with internal IDs `service | development | report`; user-facing labels become `SERVICE | BUILD | REPORT`.
- Default service screen prioritizes Day, DAU, Cash, current work, system health, and top actionable alerts.
- Monthly revenue/cost/profit remain available but secondary.
- Mobile HUD must not require horizontal metric scrolling.
- All interactive controls keep native button semantics, visible focus, disabled states, and reduced-motion support.
- Palette tokens: Obsidian `#080B0F`, Graphite `#10161D`, Raised Graphite `#151D26`, Steel `#26313C`, Signal Blue `#4CA7FF`, Mint `#58D68D`, Amber `#F4B860`, Coral `#FF6577`, Fog `#93A2B1`, Ice `#EDF4FA`.

---

### Task 1: Durable design system, HUD hierarchy, and navigation vocabulary

**Files:**
- Create: `DESIGN.md`
- Create: `app/living-system-board.css`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `src/ui/Hud.tsx`
- Modify: `src/ui/game-navigation.ts`
- Test: `src/ui/__tests__/game-navigation.spec.ts`
- Create: `src/ui/__tests__/hud.spec.tsx`

**Interfaces:**
- Consumes: existing `GameView` and `GameSpeed`.
- Produces: `.hud-primary`, `.hud-finance`, `.service-pulse`, and user-facing navigation labels `SERVICE`, `BUILD`, `REPORT`.

- [ ] **Step 1: Write failing navigation and HUD hierarchy tests**

```ts
expect(GAME_NAV_ITEMS.map(([, , label]) => label)).toEqual(['SERVICE', 'BUILD', 'REPORT']);
expect(html).toContain('class="hud-primary"');
expect(html).toContain('class="service-pulse"');
expect(html).toContain('MONTHLY');
expect(html).not.toContain('class="hud-metrics"');
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/ui/__tests__/game-navigation.spec.ts src/ui/__tests__/hud.spec.tsx`

Expected: navigation still uses Korean labels and current HUD still renders `hud-metrics` without `service-pulse`.

- [ ] **Step 3: Add `DESIGN.md` and runtime token mapping**

`DESIGN.md` must define the approved palette, typography roles, layout density, 8–12px radius range, restrained elevation, Service Pulse signature, semantic state colors, and anti-references. Map those values to existing root variables in `app/globals.css`:

```css
:root {
  --bg: #080B0F;
  --panel: #10161D;
  --panel-2: #151D26;
  --line: #26313C;
  --text: #EDF4FA;
  --muted: #93A2B1;
  --blue: #4CA7FF;
  --green: #58D68D;
  --amber: #F4B860;
  --red: #FF6577;
}
```

- [ ] **Step 4: Implement the HUD hierarchy**

Replace equal-weight KPI cards with this structure:

```tsx
<header className="hud">
  <div className="hud-primary">{/* status, date, DAU, cash */}</div>
  <div className="hud-finance">{/* revenue / cost / net grouped */}</div>
  <div className="clock-controls">{/* existing commands */}</div>
  <div className="service-pulse">{/* day progress + service summary */}</div>
</header>
```

Use `view.service.summary.headline/detail` for the pulse copy rather than inventing unavailable day-over-day business data.

- [ ] **Step 5: Add `app/living-system-board.css` and import it last**

Use this file for the new shell/HUD/navigation/service-board override layer. Keep legacy CSS in place during migration; do not duplicate token values here.

- [ ] **Step 6: Run GREEN and commit**

Run: `npm test -- src/ui/__tests__/game-navigation.spec.ts src/ui/__tests__/hud.spec.tsx`

Then run: `npm run typecheck`

Commit: `feat: establish living system board shell`

---

### Task 2: Service-first board, compact work rail, and actionable alert stack

**Files:**
- Modify: `src/ui/ServiceDashboard.tsx`
- Modify: `src/ui/TopologyMap.tsx`
- Modify: `app/living-system-board.css`
- Modify: `app/topology-map.css`
- Modify: `src/ui/__tests__/game-screens.spec.tsx`
- Modify: `src/ui/__tests__/topology-map.spec.tsx`

**Interfaces:**
- Consumes: `GameView.workSlots`, `GameView.alerts`, `GameView.service`, `TopologyView`.
- Produces: `service-board`, `active-work-rail`, `service-stage`, `actionable-alerts`, and `remaining-alert-count` markup.

- [ ] **Step 1: Write failing service hierarchy tests**

```ts
expect(html).toContain('class="service-board"');
expect(html).toContain('class="active-work-rail"');
expect(html).toContain('class="service-stage"');
expect(html).toContain('class="actionable-alerts"');
expect(html).not.toContain('WORK QUEUE');
expect(html).not.toContain('NOW / ALERT');
```

Add a fixture with four alerts and assert only three alert cards are rendered while the remaining count is shown.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/ui/__tests__/game-screens.spec.tsx src/ui/__tests__/topology-map.spec.tsx`

Expected: old `dashboard-layout` / rail headings remain and all alerts render.

- [ ] **Step 3: Implement service hierarchy**

Structure:

```tsx
<div className="service-board">
  <aside className="active-work-rail">...</aside>
  <section className="service-stage">...</section>
  <aside className="actionable-alerts">...</aside>
</div>
```

Keep all four work slots visible but compact; active slots get visual priority and idle slots remain low-contrast. Preserve click-through to the Build screen.

- [ ] **Step 4: Limit visible alerts without changing Application ordering**

Use `view.alerts.slice(0, 3)`. Do not sort in React. If more alerts exist, render `+N MORE` as a non-clickable compact count. Node-linked alert buttons continue opening the existing Inspector target.

- [ ] **Step 5: Quiet the topology chrome**

Reduce toolbar/card dominance, keep request-trace controls secondary, preserve exact trace particle/failure semantics, and let the topology canvas occupy the majority of the central stage.

- [ ] **Step 6: Run GREEN and commit**

Run: `npm test -- src/ui/__tests__/game-screens.spec.tsx src/ui/__tests__/topology-map.spec.tsx`

Then run: `npm run typecheck`

Commit: `feat: make service map the primary game board`

---

### Task 3: Action-centric Node Inspector

**Files:**
- Modify: `src/ui/NodeInspector.tsx`
- Modify: `app/living-system-board.css`
- Modify: `src/ui/__tests__/node-inspector.spec.tsx`

**Interfaces:**
- Consumes: existing `TopologyNodeView.scaling`, `monthlyCost`, `detail`, `tone`, and incident fields.
- Produces: ordered sections `STATUS`, `WHY IT MATTERS`, `CURRENT`, `OPTIONS`, plus the existing incident action.

- [ ] **Step 1: Write failing information-order tests**

```ts
expect(html.indexOf('STATUS')).toBeLessThan(html.indexOf('WHY IT MATTERS'));
expect(html.indexOf('WHY IT MATTERS')).toBeLessThan(html.indexOf('CURRENT'));
expect(html.indexOf('CURRENT')).toBeLessThan(html.indexOf('OPTIONS'));
expect(html).toContain('CURRENT SIZE');
expect(html).toContain('MONTHLY');
```

Keep existing generic scaling expectations for APP, DB, storage, load balancer, cache, and queue.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/ui/__tests__/node-inspector.spec.tsx`

Expected: new section labels/order are absent.

- [ ] **Step 3: Implement the new reading order**

Use only values already exposed by `TopologyNodeView`. `WHY IT MATTERS` shows `node.detail`; do not calculate an unprojected diagnosis. `CURRENT` shows current size/cost/count. `OPTIONS` shows each vertical size with capacity summary and monthly cost plus scale-out when supported.

- [ ] **Step 4: Preserve semantics and accessibility**

Close button gets `aria-label="Inspector 닫기"`. Disabled scale-out retains the reason in visible text. Current size remains selectable-looking but gets `aria-current="true"`.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- src/ui/__tests__/node-inspector.spec.tsx`

Then run: `npm run typecheck`

Commit: `feat: reshape node inspector around decisions`

---

### Task 4: Development Workbench as a decision board

**Files:**
- Modify: `src/ui/DevelopmentWorkbench.tsx`
- Modify: `app/development-workbench.css`
- Modify: `app/living-system-board.css`
- Modify: `src/ui/__tests__/development-workbench.spec.tsx`

**Interfaces:**
- Consumes: existing `DevelopmentWorkbenchView.options` whose Application ordering remains authoritative.
- Produces: visual groups `IN PROGRESS`, `AVAILABLE NOW`, `LOCKED / NEEDS`, `COMPLETED` while keeping filtering and Inspector behavior.

- [ ] **Step 1: Write failing decision-board tests**

```ts
expect(html).toContain('DECISION BOARD');
expect(html).toContain('IN PROGRESS');
expect(html).toContain('AVAILABLE NOW');
expect(html).toContain('LOCKED / NEEDS');
expect(html).toContain('COMPLETED');
expect(html).not.toContain('DEVELOPMENT OPTIONS');
```

Keep existing tests for filters, initial selection, Escape dismissal, and work-slot option selection.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/ui/__tests__/development-workbench.spec.tsx`

Expected: old unified workbench heading/list is still rendered.

- [ ] **Step 3: Add a pure presentation grouping helper**

```ts
export function groupDevelopmentOptions(options: readonly DevelopmentOptionView[]) {
  return {
    active: options.filter((option) => option.state === 'active'),
    ready: options.filter((option) => option.state === 'ready'),
    locked: options.filter((option) => option.state === 'locked'),
    completed: options.filter((option) => option.state === 'completed'),
  };
}
```

Do not re-sort inside groups; preserve Application order.

- [ ] **Step 4: Render state sections and keep filters secondary**

Each option continues to show `time / upfront / monthly / key effect`; long benefit/risk/requirements stay in Inspector. Existing confirmation dialog and command dispatch stay unchanged.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- src/ui/__tests__/development-workbench.spec.tsx`

Then run: `npm run typecheck`

Commit: `feat: turn build screen into a decision board`

---

### Task 5: Mobile hierarchy, report consistency, and production verification

**Files:**
- Modify: `app/mobile.css`
- Modify: `app/living-system-board.css`
- Modify: `src/ui/ReportPanel.tsx`
- Create: `src/ui/__tests__/report-panel.spec.tsx`
- Modify: `DESIGN.md` only if implementation reveals an approved durable token/layout adjustment.

**Interfaces:**
- Consumes: current report data and all markup created in Tasks 1–4.
- Produces: non-scrolling mobile HUD, map-first mobile order, compact secondary finance/report treatment, reduced-motion-safe pulse.

- [ ] **Step 1: Write failing report semantics test**

```ts
expect(html).toContain('OPERATING REPORT');
expect(html).toContain('CURRENT RUN');
expect(html).toContain('FINANCIALS');
expect(html).toContain('SYSTEM LOAD');
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/ui/__tests__/report-panel.spec.tsx`

Expected: current report does not expose the new section hierarchy.

- [ ] **Step 3: Remove mobile HUD horizontal scrolling**

Delete the `hud-metrics` mobile scrolling pattern. New mobile order is Day/DAU/Cash/clock, then Service Pulse, with finance summary compacted below or omitted from sticky primary row. Keep bottom navigation and safe-area handling.

- [ ] **Step 4: Make mobile service map first**

Keep service stage before work and alerts, retain bottom-sheet Inspector, ensure controls have at least 44px touch height where already interactive, and do not hide scrollbars for product-owned scrollable regions.

- [ ] **Step 5: Restyle Report without changing data semantics**

Group current cards into `FINANCIALS` and `SYSTEM LOAD`; keep last settlement and observability details. Do not add charts or fabricated history in this pass.

- [ ] **Step 6: Run focused GREEN**

Run: `npm test -- src/ui/__tests__/report-panel.spec.tsx src/ui/__tests__/game-screens.spec.tsx src/ui/__tests__/development-workbench.spec.tsx src/ui/__tests__/node-inspector.spec.tsx src/ui/__tests__/topology-map.spec.tsx src/ui/__tests__/hud.spec.tsx`

- [ ] **Step 7: Run full verification**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run build`

GitHub PR CI must also pass Balance CLI smoke, deterministic rerun evidence, representative strategy traces, and artifact hygiene.

- [ ] **Step 8: Premium/static review**

Search changed code for native `alert(` / `confirm(` / `prompt(`, non-semantic click targets, hidden scrollbars, and missing focus/disabled states. Verify `DESIGN.md` tokens exactly match `:root` runtime variables. If the premium audit script cannot be executed in the connector environment, record that limitation explicitly rather than claiming it ran.

- [ ] **Step 9: Commit**

Commit: `feat: complete living system board redesign`
