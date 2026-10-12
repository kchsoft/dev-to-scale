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

## Causal operations pass (v0.2)

The second iteration adds a single quantitative source for displayed operational pressure and incident checks: `src/gameplay/operational-model.ts`.

Before launching a feature, the founder can purchase **one preventive investment per sprint**:

- Search query optimization (`INDEX`): reduces DB workload for the search feature.
- DB capacity increase (`DB_SCALE`): raises capacity but does not fix a slow query.
- APP scale-out (`APP_SCALE`): raises application capacity.
- Object Storage (`OBJECT_STORAGE`): improves upload capacity.
- Consumer concurrency (`QUEUE_WORKERS`): improves message throughput.
- Transaction/connection boundary tuning (`POOL_TUNING`): removes DB connection hoarding.
- Observability/APM (`APM`): lowers time/cost to inspect evidence, but adds **no** throughput.

Every service feature contributes APP, DB, STORAGE, and QUEUE demand. DAU amplifies that demand. Purchased capacities, features, and DAU produce a single `OperationalSnapshot` containing utilization/latency estimates.

**Causal fault logic:** structural flaws take precedence (slow query, DB connection exhaustion, storage path, Consumer backlog). After structural repair, accumulated traffic can reveal another bottleneck (APP / DB capacity). Thus the same surface-level "DB latency" may require an index fix or a genuine capacity expansion depending on architecture.

Completing a feature without any detected fault produces a **zero-downtime preventive success report**. Mitigations do not count as repairs; wrong actions are costly and never change the claimed root cause. Root repairs modify installed technology and recalculate demand and capacity before allowing completion.

Unit tests cover structural vs capacity causes, prevention, calculated node readings, observability effects, deterministic sprints, mitigations and abandonment.

## Explicit limitations

This remains an **experimental gameplay mode, not a full production or performance simulator**.

- The workloads and server capacities use authored *game units*, not real cloud benchmarks.
- The causal rules are deterministic and deliberately small; events and multiple probabilistic causes are future work.
- Symptoms are generated from simulated workloads, but some textual investigation clues remain scripted for each root cause.
- Each sprint allows exactly one preventive investment. The model does not yet support arbitrary repeated capacity tiers or hiring.
- The operations screen is a simplified topology with live per-node utilization; it is not yet the original topology graph with animated request traces.
- No persistent saves or leaderboards yet.
- The legacy mode is intentionally unchanged and available through the original BOOT SERVICE entry.

## Next milestone after playtesting

1. Add explicit product deadline and tech-debt decisions that compete with preventive infrastructure investment.
2. Move the current load calculator into a versioned, extensible operational state/reducer and add tech-debt and real node routing.
3. Generate all incident evidence from live state and add configurable observation noise; check clues always agree with actual causes.
4. Support multiple root-cause variants for the *same feature* based on state and more than one valid mitigation path.
5. Add a market-event deck and a clear 90-day campaign objective.
6. Instrument first-run completion, first investigation, first repair, reruns, and abandonment; compare them against the legacy mode.

## Design principles

- Early meaningful decisions beat idle waiting.
- A wrong architectural decision is recoverable but costly.
- SRE investigation is about evidence, not trivia.
- Multiple strategies should be viable; "always scale up" must not be optimal.
- Code should remain reproducible from a starting seed + ordered actions when competitive challenge mode arrives.
