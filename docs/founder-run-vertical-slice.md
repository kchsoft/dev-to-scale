# Founder Run — playable vertical slice (v0.1)

## Why this mode exists

The original Dev to Scale is a solid technical simulation, but it often asks the player to wait for a roadmap item, click "respond", and watch counters. This slice tests a different loop:

**Choose a product direction → launch → observe a production incident → investigate → mitigate or fix → get a postmortem → reinvest.**

It deliberately runs beside the legacy GameEngine. Do not merge the new rules into the old architecture before playtests show which decisions are fun.

## How to play

1. Run `npm install && npm run dev`.
2. On the existing setup screen, choose **FOUNDER RUN** below "BOOT SERVICE".
3. Pick one of four features: Search, Images, Ads, Notifications.
4. A related production incident starts. The **symptoms** are visible immediately, but the **cause** is hidden.
5. Optionally investigate metrics, logs or traces. Each probe costs **₩10,000 and 3 outage minutes**.
6. Select a remediation. Actions have distinct cash and downtime costs.
7. Wrong remedies waste resources. Mitigation reduces the impact of downtime but **does not close** the incident. The causal fix resolves it and opens the postmortem.
8. Complete three feature→incident sprints to see the final outcome. The replay button restarts from the same initial state.

If funds are too low for a repair, a **concede** action resolves the soft-lock with major business consequences.

## Implemented scope

- Deterministic pure game-state transitions in `src/gameplay/founder-run.ts`.
- 4 feature choices, each with a different pressure point and incident.
- 3 probes per incident with concrete findings.
- 3 remediations per incident: causal fix, temporary mitigation, distractor.
- Cash, DAU, trust, downtime, score, revenue, operating expenses.
- 3-sprint run and postmortem screen with replay.
- Responsive standalone incident war room and entry via existing setup.
- Pure unit tests for transitions, repeatability, costs and failure/concede paths.

## Explicit limitations

This is **an experimental vertical slice, not a full replacement game**.

- The incident metrics and root causes are handcrafted per feature. They are **not yet driven by the legacy LoadCalculator**.
- Cash/DAU/trust use simplified balancing formulas to exercise gameplay. They are not real cloud cost estimates.
- The topology panel highlights the affected dependency but does not yet dynamically simulate request flow.
- Every feature maps to one predictable incident. Introduce root-cause variants and different observability levels after validating the puzzle UX.
- No persistent saves or rankings yet.
- The old game and its tests remain unchanged. Only the initial entry screen exposes the additional mode.
- The gameplay tests cover deterministic state transitions; UI and build integration should be checked by CI/browser.

## Next milestone after playtesting

1. Add preventive decisions to each sprint: monitoring, capacity investment, refactoring, or faster feature delivery.
2. Introduce a shared system model (`OperationalState`, `Workload`, `IncidentCause`, `Observation`, `Remediation`) with one authoritative reducer, rather than coding solutions as modal choices.
3. Generate incident evidence from *live* simulated state. Enforce the invariant that clues are consistent with the actual causal chain.
4. Allow more than one root cause for the same symptoms, and allow multiple viable mitigations.
5. Add a market-event deck and a clear 90-day campaign objective.
6. Instrument first-run completion, first investigation, first repair, reruns, and abandonment; compare them against the legacy mode.

## Design principles

- Early meaningful decisions beat idle waiting.
- A wrong architectural decision is recoverable but costly.
- SRE investigation is about evidence, not trivia.
- Multiple strategies should be viable; "always scale up" must not be optimal.
- Code should remain reproducible from a starting seed + ordered actions when competitive challenge mode arrives.
