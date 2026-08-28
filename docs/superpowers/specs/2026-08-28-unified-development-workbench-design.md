# Unified Development Workbench Design

**Status:** Approved by user on 2026-08-28

## Goal

Replace the separate feature, technology, and learning screens with one development decision surface while preserving the existing Core domain boundaries and commands.

## Product decisions

- Primary navigation is `service -> development -> report` plus restart.
- Feature, technology, and learning Core models stay independent.
- Application projects those domains into a UI-only common `DevelopmentOptionView`.
- Default ordering is `active -> ready -> locked -> completed` and React preserves it.
- Selecting an option never mutates game state.
- Every mutation follows `select -> Inspector -> action -> confirmation -> existing command`.
- Feature roadmap items remain auto-started. No `startFeature` command is introduced.
- Existing FAST TRACK and REFACTOR commands remain available through the unified surface.
- Four work slots remain visible: feature, technology, learning, incident.
- Locked items remain visible with the most important reason.
- Desktop shows filters, option list, and Inspector together; mobile moves the Inspector into a bottom-sheet presentation without dropping decision information.
- React owns only transient presentation state and must not re-derive cash, prerequisites, slot availability, or command eligibility.
- Failed commands must not create optimistic success state; the latest Application view is shown instead.

## Application boundary

`GameController` continues to expose the existing `GameView` data and adds `development: DevelopmentWorkbenchView`. `DevelopmentWorkbenchProjector` is a pure read projection over that existing Application view and never mutates Core state.

Supported UI actions are restricted to existing commands:

- `start-technology`
- `start-learning`
- `fast-track-feature`
- `start-refactor`

Refactor is represented as the synthetic UI option `feature:refactor`. This keeps the Core model untouched while allowing FAST TRACK and REFACTOR to remain separately reviewable actions.

## UI structure

1. Work slot strip
2. Type filter: ALL / FEATURE / TECH / LEARN
3. Dense development option list
4. Inspector with status, progress, cost, time, benefit, risk, requirements, blocker, and action
5. Confirmation dialog with focus containment and explicit cancel path

The service dashboard routes feature/technology/learning work-slot navigation to the development tab.

## Verification

- Projector tests cover unique IDs, stable state ordering, lock/action projection, and existing command payloads.
- UI tests cover navigation definition, filtering/order preservation, slot selection, static Workbench information, and action dispatch mapping.
- Existing React/Application boundary test must continue to prevent Core/projector imports from UI.
- Project typecheck, tests, and build remain the final verification commands.
