# Deterministic Balance Simulation Harness Design

**Date:** 2026-08-29  
**Status:** Approved in design review; pending written-spec review  
**Base branch:** `feature/playable-mvp`  
**Feature branch:** `feature/deterministic-balance-simulation-harness`

## 1. Purpose

Build a deterministic, repeatable balance-analysis harness for `dev-to-scale` that can play the current game loop automatically across representative stack choices and operating strategies.

The harness exists to answer balance questions before adding more gameplay systems:

- Does observability create real gameplay value?
- Do workload-aware choices such as Redis, read replicas, queues, and object storage beat indiscriminate scaling when they should?
- Is `YOLO_SCALE` too safe because resize/scale-out mainly affects monthly cost rather than immediate cash?
- Are framework/database choices meaningful trade-offs rather than a single dominant answer?
- Does the target difficulty feel practical: one or two mistakes are recoverable, but repeatedly ignoring bottlenecks should materially hurt cash, growth, or reliability?

This feature is **measurement-only**. It must not tune game constants, recommend new balance constants, or automatically optimize parameters.

## 2. Scope

### In scope

1. A reusable simulation runner around the real `GameEngine`.
2. Six deterministic operating strategies.
3. Observation adapters that enforce BASIC / METRICS / APM information ceilings.
4. A common learning controller shared by every strategy.
5. Deterministic scenario generation across all supported frameworks and databases.
6. Run-level metrics, aggregate reports, and paired same-seed comparisons.
7. A CLI entry point for full and filtered balance runs.
8. Minimal RNG isolation needed for fair paired comparisons.
9. Tests for deterministic execution, information boundaries, strategy rules, metrics, and report aggregation.

### Out of scope

- Any game balance constant changes.
- Automatic tuning or parameter search.
- A mathematically optimal solver.
- Strategy-controlled feature order.
- Strategy-controlled learning order.
- Strategy-controlled refactoring or fast-track behavior.
- New player-facing UI.
- CI execution of the full 2,700-game matrix.

## 3. Target difficulty

The target is **practical / real-world-ish** difficulty.

Desired behavior:

- One or two imperfect decisions should be recoverable.
- Repeatedly ignoring real bottlenecks should clearly damage cash, growth, or reliability.
- Specialized solutions should create noticeable benefits when they fit the workload.
- Blind scale-up may occasionally work and may sometimes win quickly, but it must carry visible cost or over-provisioning trade-offs.
- Cheap survival play may work in favorable runs, but should carry higher timeout, failure, or lost-growth risk.

The harness reports evidence for these properties; it does not force them through hard-coded tuning.

## 4. Experiment matrix

The full default run is:

- 5 frameworks
  - `SPRING_BOOT`
  - `NESTJS`
  - `GIN`
  - `FASTAPI`
  - `ASPNET_CORE`
- 3 databases
  - `POSTGRESQL`
  - `MYSQL`
  - `MONGODB`
- 30 fixed seeds: `1..30`
- 6 operating strategies

Total:

```text
5 × 3 × 30 × 6 = 2,700 games
```

A game stops when one of these conditions is met:

```text
WON
BANKRUPT
1,080 simulated days elapsed
```

If the engine is still `RUNNING` after 1,080 calls to `advanceDay()`, the simulation terminal status is `TIMEOUT`.

## 5. Architecture

The simulation layer must not become a second game engine.

```text
BalanceScenario
  framework + database + seed
            |
            v
        GameEngine
            |
            v
   Observation Adapter
            |
            v
        Strategy
            |
       SimulationAction
            |
            v
     Command Executor
            |
     public GameEngine commands
            |
            v
       advanceDay()
            |
            v
      Metrics Collector
```

Recommended source layout:

```text
src/simulation/
  balance-scenario.ts
  balance-observation.ts
  balance-action.ts
  balance-strategy.ts
  baseline-learning-controller.ts
  simulation-runner.ts
  simulation-metrics.ts
  balance-report.ts
  strategies/
    oracle.ts
    reactive-basic.ts
    metrics-aware.ts
    apm-aware.ts
    yolo-scale.ts
    cheapskate.ts

scripts/
  run-balance.ts
```

The simulation package may read public game state and invoke public commands, but must never mutate private engine state, DAU, capacity, incidents, technology completion, or cash directly.

## 6. Command boundary

Strategy-controlled operating actions are represented as a small explicit union, for example:

```text
NO_OP
RESIZE_NODE(nodeId, size)
SCALE_OUT_NODE(nodeId)
START_TECHNOLOGY_BUILD(technologyId)
RESPOND_TRAFFIC_SPIKE(RIDE | THROTTLE | BURST)
```

Incident response and baseline learning are controllers outside the operating strategy interface.

The executor maps actions only to real commands such as:

- `resizeInfrastructureNode()`
- `scaleOutInfrastructureNode()`
- `startTechnologyBuild()`
- `respondToTrafficSpike()`
- `startIncidentResponse()`
- `startLearning()`
- `advanceDay()`

Forbidden shortcuts include:

- direct DAU edits,
- direct cash edits,
- direct capacity edits,
- force-deploying a technology,
- deleting incidents,
- force-leveling skills.

### Daily action budget

Each simulated day permits:

1. Start one incident response if an unresolved incident is available and no response is already active.
2. Make one pending viral response if needed.
3. Perform at most **one normal operating investment action**.
4. Advance the real game by one day.

Incident response and viral response do not consume the normal investment slot.

## 7. Observation model

The simulation must enforce what each strategy is allowed to know instead of trusting strategies not to inspect internal state.

Existing observability semantics are reused:

- BASIC: node-level aggregate load / health.
- METRICS: per-resource load such as CPU / I/O / throughput / storage plus hard-limit context.
- APM: METRICS plus bottleneck diagnosis, request-flow context, and correlated operational signals.

The effective strategy view is:

```text
visibleObservability = min(actualUnlockedObservability, strategyCeiling)
```

Examples:

- `METRICS_AWARE` sees only BASIC before Metrics is actually unlocked.
- `REACTIVE_BASIC` remains BASIC even after the player profile unlocks APM.
- `APM_AWARE` grows from BASIC to METRICS to APM as the shared learning baseline unlocks them.

`ORACLE` is the only exception: it may inspect full internal operational state from day one. It still may act only through real public commands.

## 8. RNG fairness and determinism

### Requirement

Repeating the same scenario must reproduce the same result. Same-seed strategy comparisons must also avoid unrelated random coupling where one infrastructure choice changes later organic-growth luck merely by consuming more random numbers elsewhere.

### Current coupling

The current engine accepts one `RandomSource` used by both growth and incident generation. Incident generation can consume a variable number of draws depending on the active topology and candidate list. A strategy that deploys an extra node can therefore perturb later organic-growth draws even when the strategy itself uses no randomness.

### Minimal isolation

Preserve existing game behavior by default, but allow the simulation factory to inject an independent incident RNG channel.

Recommended compatibility shape:

```text
GameEngineConfig.random          // existing growth/main source
GameEngineConfig.incidentRandom  // optional new source
```

Behavior:

- Existing callers that supply only `random` keep the current shared-stream semantics.
- Normal default construction may retain current behavior.
- The balance harness supplies two seed-derived `SeededRandomSource` instances: one for growth and one for incidents.
- `CommunityProgression` remains seeded from the scenario seed as it is today.

Use stable, documented seed mixing constants so the same scenario always creates the same streams.

This separation guarantees that topology-dependent incident RNG consumption cannot change the organic growth/event stream. Incident outcomes may still legitimately diverge because different strategies create different topology, load, proficiency, and incident candidate states.

Strategies themselves must be deterministic and must never own a random source.

## 9. Shared baseline learning

Learning is deliberately **not** a strategy decision in this harness. Every strategy runs the same `BaselineLearningController` so operating-strategy results are not polluted by different education policies.

Priority order:

```text
1. OS_RUNTIME        Lv.1 -> Lv.2   // unlock Metrics
2. NETWORK           Lv.1 -> Lv.2
3. SOFTWARE_DESIGN   Lv.1 -> Lv.2
4. OS_RUNTIME        Lv.2 -> Lv.3   // complete APM prerequisites
5. DATABASE          Lv.1 -> Lv.2   // Redis prerequisite path
6. NETWORK           Lv.2 -> Lv.3
7. SOFTWARE_DESIGN   Lv.2 -> Lv.3
8. NETWORK           Lv.3 -> Lv.4
9. OS_RUNTIME        Lv.3 -> Lv.4
```

The controller starts a learning task only when the real experience-day and prerequisite requirements are satisfied. It calls `startLearning()` and pays the real learning cost.

Framework, language, database-technology, and higher optional skill training are not automatically pursued in V1 beyond what the list above requires. This prevents a second optimization problem from entering the experiment.

### Protected learning reserve

The next baseline learning task's real cost is protected from strategy-controlled immediate spending.

```text
spendableImmediateCash = cash - nextBaselineLearningCost
```

Technology builds and `BURST` are allowed only if their immediate cost leaves the protected reserve intact. Learning itself spends that reserve normally when eligible.

Monthly infrastructure exposure is **not** protected by a common reserve rule. How aggressively a strategy accepts recurring cost is part of the strategy being measured.

## 10. Strategy definitions

### 10.1 `ORACLE`

`ORACLE` is a strong full-information heuristic benchmark, not a mathematical optimum.

It sees:

- exact topology,
- nominal/effective resource pressure,
- workload tags,
- current cash and cost exposure,
- current feature/load state.

Priority behavior:

```text
DB I/O + read-heavy workload
  -> Redis if absent
  -> read replica
  -> DB resize

DB CPU
  -> read replica
  -> DB resize

APP CPU
  -> ALB when needed for horizontal scaling
  -> APP scale-out when cost-effective
  -> resize when the current size step is the better local action

APP I/O + async/event-heavy workload
  -> queue technology
  -> APP scale-out / resize

QUEUE bottleneck
  -> queue resize
  -> upgrade queue family only when sustained demand justifies it

STORAGE bottleneck
  -> Object Storage if absent
  -> storage resize

ALB / Redis bottleneck
  -> resize that node
```

The oracle may compare the immediate post-action load effect of candidate actions, but it does **not** run a multi-day search tree.

To support exact non-mutating comparison where needed, add a narrow read-only preview API rather than mutating and rolling back the live engine. The preview must use cloned infrastructure and the same load-calculation semantics as the live engine.

### 10.2 `APM_AWARE`

Uses only the player-visible APM observation once unlocked.

It follows diagnosed bottlenecks and request-flow context, including upstream masking. It avoids speculative downstream investment while an upstream bottleneck is suppressing traffic.

Example:

```text
ALB 130%, APP 74%, DB 50%
-> fix ALB first
-> observe next day
-> react to APP only if it becomes the next real bottleneck
```

It maintains a meaningful recurring-cost reserve and chooses the least expensive effective option among APM-supported remedies.

### 10.3 `METRICS_AWARE`

Uses CPU / I/O / throughput / storage pressure but has no request-flow causal diagnosis.

Rules are resource-driven:

```text
DB I/O      -> Redis / replica / DB resize
DB CPU      -> replica / DB resize
APP CPU     -> ALB + scale-out / resize
APP I/O     -> queue / scale-out / resize
Storage     -> Object Storage / resize
```

It acts on the highest visible resource pressure and can therefore misread masked downstream capacity compared with APM.

### 10.4 `REACTIVE_BASIC`

Uses only aggregate node load and health.

Default behavior:

```text
highest node load >= 100%
-> resize that node one step

APP cannot resize further
-> deploy ALB if needed
-> scale out APP

DB cannot resize further
-> add read replica
```

It does not intelligently choose Redis or queues as bottleneck remedies because the resource/workload signal needed for those decisions is hidden.

### 10.5 `YOLO_SCALE`

Represents the naive "money exists, scale first" behavior the balance harness is specifically intended to test.

Behavior:

```text
node load >= 70%
-> resize one step

APP reaches medium pressure and cash is available
-> deploy ALB
-> add APP instances

DB reaches medium pressure and cash is available
-> add replicas

raw capacity before specialized technology
```

It invests before failure, considers recurring-cost runway weakly, and chooses `BURST` for viral spikes whenever immediate protected-cash rules allow it.

If this strategy is consistently faster, cheaper, and safer than APM-aware play, the current economy/choice structure is a balance red flag.

### 10.6 `CHEAPSKATE`

Represents delayed spending.

Behavior:

```text
warning only
-> do nothing

effective load <= hard limit
-> avoid investment

actual capacity failure
-> choose the cheapest plausible corrective action

cash runway threatened
-> delay optional spending
```

For viral events it normally rides while healthy and chooses `THROTTLE` when overload risk is visible. It almost never pays for `BURST`.

## 11. Incident and viral policies

### Incident response

Every strategy starts incident response as soon as an unresolved incident is available and the response slot is free.

Reason: incident response has no immediate cash choice, so deliberately delaying it would add an artificial handicap instead of measuring infrastructure decisions.

### Viral response

Default tendencies:

| Strategy | Viral behavior |
| --- | --- |
| ORACLE | choose from pressure + cash + expected capacity effect |
| APM_AWARE | use diagnosed bottleneck and cash reserve |
| METRICS_AWARE | respond when resource overload is visible |
| REACTIVE_BASIC | respond only when aggregate health/load looks dangerous |
| YOLO_SCALE | prefer BURST when affordable |
| CHEAPSKATE | prefer RIDE when healthy, THROTTLE when risky |

## 12. Capacity-action accounting

### `prematureCapacityActions`

Count a resize, APP scale-out, or DB replica action as premature when, immediately before the action:

```text
target node effective ratio < 0.70
AND no active VIRAL spike
```

Technology builds are not counted by this metric.

### `lowUtilizationExpandedNodeDays`

After a node has received a capacity expansion, count each later simulated node-day where:

```text
target node effective ratio < 0.50
```

Count node-days rather than multiplying the same day by the number of historical expansion actions. This distinguishes short-lived pre-provisioning from capacity that stays materially underused for long periods.

## 13. Run metrics

Each run records at least:

```text
scenario:
  frameworkId
  databaseId
  seed
  strategy

terminal:
  terminalStatus: WON | BANKRUPT | TIMEOUT
  daysPlayed
  finalDau
  endingCash
  minimumCash

reliability:
  failureDays
  severeFailureDays
  cumulativeFailureBurden
  overloadDays
  incidentCount

spending:
  technologyBuildSpend
  learningSpend
  burstSpend
  settledInfrastructureSpend
  infrastructureCostExposure

capacity actions:
  resizeCount
  appScaleOutCount
  dbReplicaActionCount
  prematureCapacityActions
  lowUtilizationExpandedNodeDays

viral:
  viralRideCount
  viralThrottleCount
  viralBurstCount
```

Definitions:

- `failureDays`: days with `failureRate > 0`.
- `severeFailureDays`: days with `failureRate >= 0.10`.
- `cumulativeFailureBurden`: sum of daily `failureRate`; interpretable as failure-equivalent days.
- `overloadDays`: days where any player-owned primary effective pressure exceeds `1.0`.
- `settledInfrastructureSpend`: sum of infrastructure charges from actual monthly settlements.
- `infrastructureCostExposure`: sum of `currentMonthlyInfrastructureCost / 30` per simulated day, so partial final months and early over-provisioning remain visible analytically.

`minimumCash` is observed after every action and day transition so immediate build/burst spending is included.

## 14. Reporting

Generated artifacts are analysis output, not source-of-truth game data.

```text
artifacts/balance/
  runs.csv
  summary.json
```

Generated artifacts should not be committed by default.

### `runs.csv`

One row per game. A complete unfiltered run therefore contains exactly 2,700 rows plus the header.

### `summary.json`

Aggregate by:

1. all runs,
2. strategy,
3. framework,
4. database,
5. framework × database,
6. strategy × framework × database.

For numeric metrics include at least:

- mean,
- median,
- P25,
- P75.

For terminal status include counts and rates.

### Paired comparisons

Same-seed comparisons are first-class output. For each framework/database/seed group, compare strategy pairs on:

- terminal outcome,
- days to win where comparable,
- infrastructure cost exposure,
- cumulative failure burden,
- premature capacity actions,
- low-utilization expanded-node days.

Primary comparisons should include:

```text
APM_AWARE vs YOLO_SCALE
APM_AWARE vs METRICS_AWARE
METRICS_AWARE vs REACTIVE_BASIC
ORACLE vs APM_AWARE
CHEAPSKATE vs APM_AWARE
```

## 15. CLI

Add a dedicated command:

```text
npm run balance
```

Default: run all 2,700 games and write `runs.csv` plus `summary.json`.

Support narrow filters for investigation:

```text
npm run balance -- --seed 17
npm run balance -- --framework SPRING_BOOT --db POSTGRESQL
npm run balance -- --strategy APM_AWARE
npm run balance -- --seed 17 --framework SPRING_BOOT --db POSTGRESQL --strategy APM_AWARE --trace
```

`--trace` prints or writes a day/action decision trace for the selected narrow run. It is not enabled for the full matrix by default.

No external CSV/reporting dependency is required unless implementation proves the standard library approach materially inadequate.

## 16. Balance interpretation

The harness does not hard-code one numeric score. It reports several directional signals.

### Healthy signals

Expected broad ordering:

```text
ORACLE ≳ APM_AWARE ≳ METRICS_AWARE > REACTIVE_BASIC
```

This is a tendency, not a per-seed law.

Additional healthy behavior:

- `YOLO_SCALE` can sometimes win quickly but pays visible cost/over-provisioning penalties.
- `CHEAPSKATE` may survive or even win favorable runs but has higher timeout, failure, or growth-loss risk.
- APM does not need to equal ORACLE; ORACLE is a benchmark with privileged information.
- METRICS may occasionally beat APM so the game does not become a fixed answer sheet.

### Red flags

1. `YOLO_SCALE` is faster, cheaper, and safer than APM across most stack combinations.
2. BASIC and APM strategies produce nearly indistinguishable outcomes.
3. Repeated resize/scale-out consistently beats workload-fit technologies.
4. One framework or database dominates nearly every strategy and seed.
5. One or two ordinary mistakes cause widespread bankruptcy, implying difficulty is too hardcore.
6. Nearly every strategy wins comfortably with growing cash, preserving the "money exists, click everything" problem.

These findings become input to a separate balance-tuning design. This harness must not change constants in response.

## 17. Failure behavior and integrity

The harness must fail loudly rather than silently produce misleading balance data.

- An invalid strategy action is a simulation error, not a skipped action.
- Unsupported CLI values return a non-zero exit status with the invalid argument identified.
- A strategy seeing data above its declared observation ceiling is a test failure.
- A run that throws includes framework, database, seed, strategy, and day in the error context.
- Full-report files are written only after all requested runs complete successfully, or via a safe temporary-file/rename pattern.

## 18. Testing strategy

The full 2,700-game batch is **not** part of normal CI. Normal CI verifies deterministic building blocks with a small scenario set.

Required tests:

### Scenario / determinism

- same scenario + same strategy produces identical result,
- scenario matrix cardinality is 2,700,
- seed list and supported stack IDs are stable,
- full simulation never exceeds 1,080 `advanceDay()` calls.

### RNG isolation

- when an independent incident RNG is supplied, incident candidate draw count cannot perturb the growth RNG sequence,
- existing callers that provide only the legacy `random` source preserve shared-stream behavior.

### Observation boundaries

- BASIC never exposes per-resource signatures,
- METRICS exposes resource-level pressure but not APM diagnosis,
- APM unlock follows the real developer skill state,
- strategy ceilings remain enforced after higher observability unlocks,
- ORACLE receives full internal observation only through its dedicated adapter.

### Learning baseline

- priorities execute in order when experience/prerequisites permit,
- no forced proficiency mutation occurs,
- protected learning reserve blocks strategy-controlled immediate spending but not the learning task itself.

### Strategy behavior

Use focused fixtures to lock representative choices, for example:

- ORACLE chooses Redis before DB size-up for a read-heavy DB I/O bottleneck when affordable,
- METRICS responds to visible DB I/O without hidden request-flow information,
- REACTIVE_BASIC prefers resize because resource diagnosis is hidden,
- YOLO_SCALE expands at the 70% policy threshold,
- CHEAPSKATE waits until actual hard-limit failure,
- APM fixes a masked upstream bottleneck before speculative downstream scaling.

### Action budget / executor

- at most one normal investment action per simulated day,
- incident and viral responses remain separate from that slot,
- every action maps to a public `GameEngine` command,
- invalid strategy actions fail the run.

### Metrics / reporting

- premature-capacity threshold is `< 0.70` and ignores active viral spikes,
- low-utilization expanded-node threshold is `< 0.50`, counted as node-days,
- cumulative failure burden sums daily failure rate,
- partial-month infrastructure exposure is included,
- aggregate mean/median/P25/P75 are correct,
- paired comparisons match framework/database/seed before comparing strategies,
- filtered CLI runs produce the expected row count.

### Manual/full validation

Before considering the implementation complete, run the full 2,700-game matrix once outside the regular CI suite and inspect:

- total row count,
- no invalid/aborted runs,
- reproducibility of at least one rerun,
- summary grouping completeness,
- representative `--trace` output for ORACLE, APM, YOLO, and CHEAPSKATE.

## 19. Implementation invariants

1. The live game remains the source of truth; the harness never reimplements game rules.
2. No game balance constants change in this feature.
3. Strategies use deterministic rules only.
4. Observation limits are enforced structurally.
5. Same-seed organic growth randomness is isolated from topology-dependent incident RNG consumption in balance runs.
6. Feature progression remains the real `CommunityProgression`; strategies do not choose feature order.
7. Learning follows one shared baseline for all strategies.
8. One normal operating investment per day.
9. `ORACLE` means full-information heuristic benchmark, not proven optimum.
10. Full-matrix output is evidence for a later tuning task, not an automatic tuning mechanism.
