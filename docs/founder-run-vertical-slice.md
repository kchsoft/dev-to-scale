## Incident deduction / War Room (v0.5)

The original incident screen was mostly an implementation-choice quiz. The daily campaign now has an evidence-backed **root-cause hypothesis board** (`src/gameplay/incident-deduction.ts`).

- Seven competing hypotheses: SQL plan, DB saturation, DB connection exhaustion, APP capacity, deployment regression, Storage I/O, Consumer lag. The same general DB CPU/P95 snapshot can support multiple competing explanations.
- Metrics, logs and trace probes reveal increasingly diagnostic **observations**, derived from live `OperationalSnapshot` values where applicable. A generic metric deliberately does not label the correct root cause. The player still must interpret the observations.
- At least **two different probes** are required before submitting a hypothesis; no empty-evidence oracle.
- Correct verification gives an **18% repair cost discount and 3 minutes faster permanent remediation**, plus a small campaign score bonus.
- Wrong verification consumes **₩20,000, seven minutes of downtime, DAU and trust**, with only two wrong verifications permitted per incident.
- Repair without submitting a hypothesis is still valid, but does not earn the diagnosis discount. Failure to verify a hypothesis never soft-locks the campaign.
- Every new root cause in a chained incident resets its hypotheses and evidence, while lifetime correct/incorrect totals remain. Monthly and final reports include diagnosis results.
- Closed incidents produce a structured postmortem recording the true root cause, remedy used, evidence collected, diagnosis attempts and outage time. These are visible in monthly reports.
- UI estimates derive from the *same quotation function* as the reducer, avoiding misleading button costs.
- The local saved-state schema key is now `v3` (structured incident reviews); earlier prototype saves do not automatically migrate.

**Honest limitation:** scenario text and candidate explanations remain authored. This is a deduction scaffold with measurable consequences, not a full distributed tracing simulator, and it still requires manual playtesting for clarity and fairness.

## Real daily simulation — new 90-DAY FOUNDER mode (v0.4)

The former Founder Run remains available as a compact three-decision prototype, but the setup screen now also exposes **90-DAY FOUNDER**, backed by a new, genuinely day-stepped `src/gameplay/daily-campaign.ts` engine. The new mode is intended to supersede the three-step prototype after user testing.

### Daily player loop

1. D1/D31/D61: resolve the same seeded three-act market deck.
2. Each month optionally buy **one** preventive investment, then choose a feature and pace (normal or Fast Track), or skip product development to prioritize operations.
3. Feature development consumes `DEVELOPMENT_DAYS[feature] + ceil(techDebt/18)` game days; Fast Track reduces the duration to ~62% at the cost of **27 tech-debt points** instead of 4.
4. Exactly **one daily simulation record** is generated per day, including while a feature is in development. Users and expenses evolve gradually; day-end capacity checks can interrupt with an incident. An accelerated run is implemented by repeatedly executing the same one-day transition and stopping at launches, outages and month-end.
5. Each release adds workload. Tech debt adds APP and DB overhead; above a threshold, it can also cause a separate deploy-regression incident. Metrics, diagnosis and corrective actions derive from the active cause.
6. Incident investigations and repairs consume cash and downtime minutes; downtime also causes DAU churn, trust loss and a final-score penalty. They do **not** replay a calendar day or duplicate revenue. The player can opt for emergency throttling (temporary) or a permanent investment/refactor and must get causal validation.
7. At D30/D60/D90, a report consolidates daily revenue, operating expenses, outages and healthy days. The next market cycle begins only after player acknowledgement.
8. At the end of 90 day records, evaluate the campaign: three released features, DAU >= 1700, trust >= 50, healthy days >= 72, and positive cash to win; failing to reach the targets while surviving is reported separately from insolvency.

### Code and integration

- `src/gameplay/daily-campaign.ts`: pure immutable deterministic transitions. No timers, network calls or mutable singleton state.
- `src/gameplay/operational-model.ts`: shared authoritative node demand/capacity calculation, now optionally including tech-debt load.
- `src/ui/DailyCampaign.tsx`: client UI for every step, progress bar, day ledger, investigation and postmortems.
- `app/daily-campaign.css`: responsive dark UI complementing existing founder styles.
- Save data is stored locally in the browser under a **versioned key**, with basic validation and safe fallback if storage is unavailable.

### Remaining realism / UX limits

- Demand and cost are game-calibration units. Market options and investigation text are authored.
- Each campaign includes only one major feature decision per month; day-to-day actions are accelerated through the clock rather than needing 90 clicks.
- APP / DB capacity expansion is repeatable in tiers; the first tier may not be enough during extreme overload.
- No employees, financing rounds, networked ranking or replay uploads yet.
- A prevented incident or permanent infrastructure improvement is more consequential, but the simulator still does not model real thread pools, transactions, database execution plans or request-level queue events.
- Save state is not cross-device and an incompatible local format would require a new save key or a migration.
- Manual browser testing and game-balance playtesting remain to be done.

# Founder Run — playable vertical slice (v0.1)

## Why this mode exists

The original Dev to Scale is a solid technical simulation, but it often asks the player to wait for a roadmap item, click "respond", and watch counters. This slice tests a different loop:

**React to a market event → invest in prevention → choose a product direction → launch → investigate a possible incident → repair/mitigate → settle the month → repeat through day 90.**

It deliberately runs beside the legacy GameEngine. Do not merge the new rules into the old architecture before playtests show which decisions are fun.

## How to play — 90-day three-act campaign

1. Run `npm install && npm run dev`; click **FOUNDER RUN** on the existing setup.
2. At **Day 1**, resolve an external **market event**. Different options alter cash, DAU, trust, one-month revenue and peak traffic load.
3. Choose up to one preventive investment this month, then release a new feature.
4. Live workload pressure is calculated with the peak traffic multiplier. An unprepared release may trigger an incident.
5. Collect metrics, logs or traces (each costs cash and response time) and select a remediation. The causal fix must address the active root cause.
6. See a month-end settlement and an incident/no-incident postmortem. The next market event starts at **Day 31** and **Day 61**.
7. At **Day 90**, check the outcome. **Victory** requires 3 successfully launched features, DAU >= 1,700, trust >= 50 and positive cash. **Survival** without the targets is not victory.
8. Replay with the same seed for a fair strategic comparison, or the next seed for a different event schedule.

**Time abstraction:** The current prototype represents each 30-day month as one strategy/feature/incident cycle; it is **not** yet a 90-tick daily simulation. Incident minutes are a distinct downtime metric.

## Market events (v0.3)

- `src/gameplay/market-events.ts` provides six authored business events split into three acts.
- Each game gets one event per act: Viral/Partner (month 1), Rival/Press (month 2), Enterprise/Cloud Cost (month 3).
- Three choices per event create measurable tradeoffs (cash, users, trust, peak request pressure, current-period revenue).
- Event selection is deterministic from `seed + sprint` and **independent of player action order**.
- Peak traffic is applied to the same `OperationalSnapshot` model that drives causal incident checks; it is removed after the month settles.
- Cash choices that cannot be afforded are disabled; every event offers an affordable non-premium route.

## Implemented scope

- Deterministic pure game-state transitions in `src/gameplay/founder-run.ts`.
- 4 feature choices, each with a different pressure point and incident.
- 3 probes per incident with concrete findings.
- 3 remediations per incident: causal fix, temporary mitigation, distractor.
- Cash, DAU, trust, downtime, score, revenue, operating expenses.
- Three-act / 90-game-day run, per-month postmortems and seed-controlled replay.
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
