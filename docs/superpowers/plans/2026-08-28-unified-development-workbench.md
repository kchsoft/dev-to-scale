# Unified Development Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify feature, technology, and learning decisions into one development Workbench without changing Core game rules.

**Architecture:** Add a pure Application projection on top of the existing `GameView`, expose it through `GameController`, and keep all command execution in the `GameApp` composition root. React components consume only Application DTOs and manage filter/selection/dialog state.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Vitest

**Spec:** `docs/superpowers/specs/2026-08-28-unified-development-workbench-design.md`

## Global Constraints

- Do not add or alter Core feature/technology/learning rules.
- Do not add `startFeature`.
- Keep existing FAST TRACK, REFACTOR, technology build, and learning commands.
- React must not import Core or projector internals.
- No optimistic mutation UI.
- Preserve four work slots and existing service/report/node/event behavior.

---

### Task 1: Application Workbench contract and projection

**Files:**
- Create: `src/application/development-view.ts`
- Create: `src/application/development-workbench-projector.ts`
- Modify: `src/application/game-controller.ts`
- Test: `src/application/__tests__/development-workbench-projector.spec.ts`

**Interfaces:**
- Produces `DevelopmentWorkbenchView`, `DevelopmentOptionView`, and `DevelopmentActionView`.
- Extends the controller-facing `GameView` with `development`.

- [x] Write projector tests for unique IDs, ordering, lock/action behavior, technology, learning, FAST TRACK, and REFACTOR.
- [x] Add the UI-only DTO contract and pure projector.
- [x] Attach the projection to the controller-facing view without exposing Core.

### Task 2: Unified navigation and command dispatch

**Files:**
- Create: `src/ui/game-navigation.ts`
- Create: `src/ui/development-action-dispatcher.ts`
- Modify: `src/ui/GameApp.tsx`
- Modify: `src/ui/ServiceDashboard.tsx`
- Test: `src/ui/__tests__/game-navigation.spec.ts`
- Test: `src/ui/__tests__/development-action-dispatcher.spec.ts`

**Interfaces:**
- Navigation exposes only `service | development | report`.
- Dispatcher maps Application action DTOs to callback handlers; `GameApp` alone owns controller access.

- [x] Replace five primary tabs with service, development, report.
- [x] Route feature/technology/learning service work slots to development.
- [x] Map all four supported development actions to existing controller commands.
- [x] Re-read the latest feature before FAST TRACK to reject a stale confirmation.
- [x] Refresh the latest Application view when a command fails.

### Task 3: Workbench, Inspector, confirmation, responsive layout

**Files:**
- Create: `src/ui/DevelopmentWorkbench.tsx`
- Create: `app/development-workbench.css`
- Modify: `app/layout.tsx`
- Test: `src/ui/__tests__/development-workbench.spec.tsx`

**Interfaces:**
- Consumes only `DevelopmentWorkbenchView` and emits `DevelopmentActionView`.

- [x] Render all four work slots and type filters.
- [x] Preserve Application ordering while filtering.
- [x] Keep selection side-effect free and clear it when filtered out.
- [x] Render full decision information in the Inspector.
- [x] Show action buttons only when `action !== null`.
- [x] Require a confirmation dialog before dispatch.
- [x] Add keyboard focus behavior, Escape handling, focus return, and reduced-motion handling.
- [x] Use a fixed bottom-sheet Inspector layout on mobile.

### Task 4: Regression verification

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Review the final diff for accidental Core changes and stale feature/technology/learning tab references.
