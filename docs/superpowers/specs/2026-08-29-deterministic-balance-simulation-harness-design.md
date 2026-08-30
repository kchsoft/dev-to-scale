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
9. Narrow read-only load previews needed by the full-information oracle.
10. Tests for deterministic execution, information boundaries, strategy rules, metrics, and report aggregation.

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

If the engine is still `RUNNING` after 1,080 calls to `advanceDay()`, the simulation terminal status is `TIMEOUT`. `daysPlayed` is the number of successful `advanceDay()` calls performed by the simulation, not the engine's one-based day label.

For a fixed framework/database/seed group, `CommunityProgression` keeps the same seeded feature permutation. Release timing may diverge because each strategy can produce different growth, incidents, and development pressure; that divergence is an intended outcome.

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

The simulation package may read public game state and invoke public commands, but must never mutate private engine state, DAU, capacity, incidents, technology completion, proficiency, or cash directly.

## 6. Command boundary

Strategy-controlled operating actions are represented as a small explicit union:

```text
NO_OP
RESIZE_NODE(nodeId, size)
SCALE_OUT_NODE(nodeId)
START_TECHNOLOGY_BUILD(technologyId)
RESPOND_TRAFFIC_SPIKE(RIDE | THROTTLE | BURST)
```

Incident response and baseline learning are controllers outside the operating strategy interface.

The executor maps actions only to real commands:

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

Incident response and viral response do not consume the normal investment slot. A technology build already in progress prevents starting another technology build through the real `TechnologyBuildSlot` rule; the harness must not bypass that restriction.

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

Observation adapters produce immutable strategy-facing data. Non-oracle strategies must not receive the live `GameEngine`, `DeveloperProfile`, `InfrastructureState`, raw `GameSnapshot.load`, or other objects that can reveal information above their ceiling.

## 8. RNG fairness and determinism

### Requirement

Repeating the same scenario must reproduce the same result. Same-seed strategy comparisons must also avoid unrelated random coupling where one infrastructure choice changes later organic-growth luck merely by consuming more random numbers elsewhere.

### Current coupling

The current engine accepts one `RandomSource` used by both growth and incident generation. Incident generation can consume a variable number of draws depending on the active topology and candidate list. A strategy that deploys an extra node can therefore perturb later organic-growth draws even when the strategy itself uses no randomness.

### Minimal isolation

Preserve existing game behavior by default, but allow the simulation factory to inject an independent incident RNG channel.

Compatibility shape:

```text
GameEngineConfig.random          // existing growth/main source
GameEngineConfig.incidentRandom  // optional new source
```

Behavior:

- Existing callers that provide only `random` keep current shared-stream behavior: incidents fall back to the same source.
- Existing callers that provide no random sources keep current default behavior.
- The balance harness explicitly supplies two seed-derived `SeededRandomSource` instances: one for growth and one for incidents.
- `CommunityProgression` remains seeded from the scenario seed as it is today.

The harness owns stable documented seed mixing constants, for example one fixed XOR constant per stream. The exact constants are implementation details once committed, but must remain stable after tests lock them.

This separation guarantees that topology-dependent incident RNG consumption cannot change the organic growth/event stream in balance runs. Incident outcomes may still legitimately diverge because strategies create different topology, load, proficiency, active incidents, and therefore incident candidate states.

Strategies themselves are deterministic and never own a random source.

## 9. Shared baseline learning

Learning is deliberately **not** a strategy decision. Every strategy runs the same `BaselineLearningController` so operating-strategy results are not polluted by different education policies.

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

This sequence unlocks the current technology prerequisite ladder needed for Redis/ALB/SQS, then RabbitMQ, then Kafka while also unlocking Metrics and APM.

The controller starts a learning task only when the real experience-day and prerequisite requirements are satisfied. It calls `startLearning()` and pays the real learning cost.

Framework, language, database-technology, and higher optional skill training are not automatically pursued in V1 beyond the list above. This prevents a second optimization problem from entering the experiment.

The **policy** is identical across strategies; exact learning start dates may still diverge if a strategy's prior recurring costs or failures leave it unable to pay. That divergence is a causal consequence of its operating decisions, not a different learning policy.

### Protected learning reserve

The next unfinished baseline learning step's real cost is protected from strategy-controlled immediate spending.

```text
protectedLearningReserve = nextBaselineLearningCost
```

If all baseline learning steps are complete, the protected reserve is `0`.

## 10. Strategy affordability and runway

To eliminate vague cash behavior, every discretionary strategy action uses the same affordability formula with a strategy-specific infrastructure-runway multiplier.

For a candidate action:

```text
cashAfterImmediateCost
  = currentCash - candidateImmediateCost

requiredCashFloor
  = protectedLearningReserve
  + runwayMultiplier × projectedMonthlyInfrastructureCost

affordable
  = cashAfterImmediateCost >= requiredCashFloor
```

`projectedMonthlyInfrastructureCost` means the infrastructure cost after the candidate takes effect. For a technology build, use the cost after deployment, including queue replacement semantics. For `BURST`, infrastructure cost is unchanged. This reserve intentionally does not include AI cost or projected revenue; those remain game outcomes rather than hidden simulation estimates.

Runway multipliers:

| Strategy | Multiplier | Intent |
| --- | ---: | --- |
| ORACLE | 1.00 | preserve roughly one month of infra runway |
| APM_AWARE | 1.00 | disciplined operations |
| METRICS_AWARE | 0.50 | moderate reserve |
| REACTIVE_BASIC | 0.25 | mostly current-cash reactive |
| YOLO_SCALE | 0.00 | spend aggressively; protect learning only |
| CHEAPSKATE | 2.00 | preserve a large buffer |

These multipliers are **simulation strategy parameters**, not game balance constants. The measurement-only rule prohibits changing core economy/capacity constants in this feature.

Learning itself ignores the strategy runway multiplier and pays its actual cost whenever the baseline controller is eligible and the real cash balance can afford it.

## 11. Oracle preview boundary

`ORACLE` may compare immediate post-action load without mutating and rolling back the live game.

Keep the existing `previewLoadWithTechnology()` behavior and add exactly the narrow read-only capabilities needed for capacity actions:

```text
previewLoadWithNodeResize(nodeId, size)
previewLoadWithNodeScaleOut(nodeId)
```

Each method:

1. clones `InfrastructureState`,
2. applies the real infrastructure operation to the clone,
3. runs the existing `GameEngine` load-calculation path with current features, proficiency, incidents, and traffic conditions,
4. returns a `LoadSnapshot`,
5. never changes live game state.

The simulation can obtain projected monthly cost from an equivalently mutated `InfrastructureState.clone()` using the real `monthlyCost` calculation. It must not duplicate sizing or cost formulas.

### Oracle local candidate selection

`ORACLE` is still a heuristic, not look-ahead search.

For the current exact bottleneck it first builds the bottleneck-specific candidate list from Section 12.1. It filters invalid/unaffordable actions, then previews each remaining candidate.

For each candidate:

```text
currentMax = current maximum player-owned effective pressure
previewMax = preview maximum player-owned effective pressure
relief = max(0, currentMax - previewMax)
oneMonthCost = immediateCost + max(0, projectedMonthlyCost - currentMonthlyCost)
```

Ranking:

1. If one or more candidates reduce `previewMax` to `<= 0.85`, choose the candidate with the lowest `oneMonthCost`.
2. Otherwise choose the highest `relief / max(1, oneMonthCost)`.
3. Reject a candidate with `< 0.02` relief unless it is a required enabling action such as deploying ALB before APP scale-out.
4. Exact ties use the fixed bottleneck-specific candidate order, then a stable action identifier.

The technology preview represents the fully deployed technology's immediate load effect; the real build delay still applies after the strategy chooses `startTechnologyBuild()`. The oracle does not simulate future days to compensate for that delay.

## 12. Strategy definitions

### 12.1 `ORACLE`

`ORACLE` is a strong full-information heuristic benchmark, not a mathematical optimum.

It sees:

- exact topology,
- nominal/effective resource pressure,
- workload tags,
- current cash and cost exposure,
- current feature/load state.

Bottleneck-specific candidate order:

```text
DB I/O + read-heavy workload
  -> Redis if absent
  -> read replica
  -> DB resize

DB CPU
  -> read replica
  -> DB resize

APP CPU
  -> ALB when needed to enable scale-out
  -> APP scale-out
  -> APP resize

APP I/O + async/event-heavy workload
  -> queue technology
  -> APP scale-out
  -> APP resize

QUEUE bottleneck
  -> queue resize
  -> next queue family only when the current family cannot provide sufficient local relief

STORAGE bottleneck
  -> Object Storage if absent
  -> storage resize

ALB / Redis bottleneck
  -> resize that node
```

The preview ranking in Section 11 chooses among valid candidates. There is no multi-day search tree.

### 12.2 `APM_AWARE`

Uses only the player-visible APM observation once unlocked.

It follows diagnosed bottlenecks and request-flow context, including upstream masking. It avoids speculative downstream investment while an upstream bottleneck is suppressing traffic.

Example:

```text
ALB 130%, APP 74%, DB 50%
-> fix ALB first
-> observe next day
-> react to APP only if it becomes the next real bottleneck
```

Within remedies supported by the visible diagnosis, it chooses the valid affordable action with the lowest projected one-month infrastructure cost. It does **not** use oracle-only hidden load previews.

### 12.3 `METRICS_AWARE`

Uses CPU / I/O / throughput / storage pressure but has no request-flow causal diagnosis.

Rules are resource-driven:

```text
DB I/O      -> Redis / replica / DB resize
DB CPU      -> replica / DB resize
APP CPU     -> ALB + scale-out / APP resize
APP I/O     -> queue / scale-out / APP resize
Storage     -> Object Storage / resize
```

It acts on the highest visible resource pressure. Within the rule's ordered choices it takes the first valid affordable action. It can therefore misread masked downstream capacity compared with APM.

### 12.4 `REACTIVE_BASIC`

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

It does not intelligently choose Redis or queues as bottleneck remedies because the resource/workload signal needed for those decisions is hidden. If the preferred action is invalid or unaffordable, it performs no normal investment that day rather than inspecting hidden alternatives.

### 12.5 `YOLO_SCALE`

Represents the naive "money exists, scale first" behavior the harness is specifically intended to test.

Behavior:

```text
node load >= 70%
-> resize one step

APP at/above 70% and horizontal capacity is available or can be enabled
-> deploy ALB if needed
-> add APP instances before specialized technology

DB at/above 70%
-> add replicas before specialized technology

raw capacity before Redis / queue remedies
```

It invests before failure, uses a `0.00` runway multiplier, and chooses `BURST` for viral spikes whenever the shared affordability rule permits it.

If this strategy is consistently faster, cheaper, and safer than APM-aware play, the current economy/choice structure is a balance red flag.

### 12.6 `CHEAPSKATE`

Represents delayed spending.

Behavior:

```text
warning only
-> do nothing

effective load <= hard limit
-> avoid investment

actual capacity failure
-> choose the cheapest valid plausible corrective action visible at BASIC level

cash buffer would fall below 2 months of projected infra cost
-> delay the action
```

For viral events it chooses `RIDE` while BASIC health is not degraded by overload/failure and `THROTTLE` when overload/failure is visible. It does not choose `BURST` in V1.

## 13. Incident and viral policies

### Incident response

Every strategy starts incident response as soon as an unresolved incident is available and the response slot is free.

Reason: incident response has no immediate cash choice, so deliberately delaying it would add an artificial handicap instead of measuring infrastructure decisions.

### Viral response

Default tendencies:

| Strategy | Viral behavior |
| --- | --- |
| ORACLE | compare current exact pressure; use BURST only when it materially lowers overload and is affordable, THROTTLE when BURST is not justified, otherwise RIDE |
| APM_AWARE | use visible diagnosis and reserve; BURST for clearly dangerous diagnosed overload when affordable, otherwise THROTTLE; RIDE while healthy |
| METRICS_AWARE | BURST when visible resource pressure would exceed hard limit and affordable; otherwise THROTTLE; RIDE when resource headroom remains |
| REACTIVE_BASIC | THROTTLE when aggregate health/load is already degraded; otherwise RIDE |
| YOLO_SCALE | BURST whenever affordable; otherwise RIDE |
| CHEAPSKATE | RIDE while healthy; THROTTLE when overload/failure is visible; never BURST |

A pending viral response is made once, using the real `GrowthEvent` one-response rule.

## 14. Capacity-action accounting

### `prematureCapacityActions`

Count a resize, APP scale-out, or DB replica action as premature when, immediately before the action:

```text
target node effective ratio < 0.70
AND no active VIRAL spike
```

Technology builds are not counted by this metric.

### `lowUtilizationExpandedNodeDays`

After a node has received at least one capacity expansion, count each later simulated node-day where:

```text
target node effective ratio < 0.50
```

Count a node at most once per simulated day regardless of how many historical expansions it received. This distinguishes short-lived pre-provisioning from capacity that stays materially underused for long periods.

## 15. Run metrics

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
- `overloadDays`: days where any player-owned effective resource pressure exceeds `1.0`.
- `incidentCount`: count each unique incident ID the first day it appears.
- `settledInfrastructureSpend`: sum of infrastructure charges from actual monthly settlements.
- `infrastructureCostExposure`: sum of `currentMonthlyInfrastructureCost / 30` once per simulated day, so partial final months and early over-provisioning remain visible analytically.

`minimumCash` is observed after incident/viral/investment/learning actions and after every day transition so immediate build/burst/learning spending is included.

## 16. Reporting

Generated artifacts are analysis output, not source-of-truth game data.

```text
artifacts/balance/
  runs.csv
  summary.json
```

Generated artifacts should be ignored by git and not committed by default.

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

Use deterministic nearest-rank quantiles on sorted values so repeated reports do not depend on a statistics library's interpolation default.

For terminal status include counts and rates.

### Paired comparisons

Same-seed comparisons are first-class output. For each framework/database/seed group, compare strategy pairs on:

- terminal outcome,
- days to win where both won,
- infrastructure cost exposure,
- cumulative failure burden,
- premature capacity actions,
- low-utilization expanded-node days.

Primary comparisons:

```text
APM_AWARE vs YOLO_SCALE
APM_AWARE vs METRICS_AWARE
METRICS_AWARE vs REACTIVE_BASIC
ORACLE vs APM_AWARE
CHEAPSKATE vs APM_AWARE
```

For a paired numeric delta, define `left - right` and encode that direction in the report key/metadata. Do not silently flip signs per metric.

## 17. CLI

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

`--trace` is valid only when filters select exactly one run. It emits a deterministic decision log containing day, visible observation summary, controller actions, strategy action, reason code, and resulting high-level state. It must not expose hidden oracle-only data for non-oracle strategies.

No external CSV/reporting dependency is required unless implementation proves the standard library approach materially inadequate.

## 18. Balance interpretation

The harness does not hard-code one numeric score. It reports directional signals.

### Healthy signals

Expected broad ordering:

```text
ORACLE ≳ APM_AWARE ≳ METRICS_AWARE > REACTIVE_BASIC
```

This is a tendency across distributions, not a per-seed law.

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

These findings become input to a separate balance-tuning design. This harness must not change constants or generate tuning recommendations in response.

## 19. Failure behavior and integrity

The harness must fail loudly rather than silently produce misleading balance data.

- An invalid strategy action is a simulation error, not a skipped action.
- Unsupported CLI values return a non-zero exit status with the invalid argument identified.
- A strategy seeing data above its declared observation ceiling is a test failure.
- A run that throws includes framework, database, seed, strategy, and simulated day in the error context.
- Full-report files are published only after all requested runs complete successfully, using temporary files followed by rename so a failed batch does not look complete.

## 20. Testing strategy

The full 2,700-game batch is **not** part of normal CI. Normal CI verifies deterministic building blocks with a small scenario set.

### Scenario / determinism

- same scenario + same strategy produces identical result,
- scenario matrix cardinality is 2,700,
- seed list and supported stack IDs are stable,
- full simulation never exceeds 1,080 `advanceDay()` calls,
- same framework/database/seed keeps the same seeded feature permutation even when strategy outcomes diverge.

### RNG isolation

- when an independent incident RNG is supplied, incident candidate draw count cannot perturb the growth RNG sequence,
- existing callers that provide only the legacy `random` source preserve shared-stream behavior,
- strategies never consume game random sources.

### Preview purity

- node-resize preview leaves live infrastructure, cash, load, incidents, and day unchanged,
- node-scale-out preview leaves live state unchanged,
- preview load matches the load obtained by performing the equivalent operation on an otherwise identical throwaway engine/state fixture.

### Observation boundaries

- BASIC never exposes per-resource signatures,
- METRICS exposes resource-level pressure but not APM diagnosis,
- APM unlock follows the real developer skill state,
- strategy ceilings remain enforced after higher observability unlocks,
- ORACLE receives full internal observation only through its dedicated adapter.

### Learning baseline

- priorities execute in the documented order when experience/prerequisites permit,
- no forced proficiency mutation occurs,
- protected learning reserve is computed from the next unfinished baseline step,
- identical policy is applied to every strategy,
- inability to pay delays learning rather than cheating the level up.

### Affordability

- each strategy uses the documented runway multiplier,
- technology build projected cost includes the eventual deployed recurring cost,
- queue replacement uses replacement cost rather than double-counting both queues,
- `BURST` uses current infrastructure cost because it adds no recurring node,
- learning payment is not blocked by strategy runway multiplier.

### Strategy behavior

Use focused fixtures to lock representative choices:

- ORACLE chooses Redis before DB size-up for a read-heavy DB I/O bottleneck when the preview ranking supports it,
- ORACLE tie-breaks deterministically,
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
- low-utilization expanded-node threshold is `< 0.50`, counted once per expanded node per day,
- cumulative failure burden sums daily failure rate,
- incident count de-duplicates by incident ID,
- partial-month infrastructure exposure is included,
- aggregate mean/median/nearest-rank P25/P75 are correct,
- paired comparisons match framework/database/seed before comparing strategies,
- paired delta direction is stable,
- filtered CLI runs produce the expected row count,
- `--trace` rejects filters that select more than one run.

### Manual/full validation

Before considering the implementation complete, run the full 2,700-game matrix once outside the regular CI suite and inspect:

- exactly 2,700 run rows,
- no invalid/aborted runs,
- reproducibility of at least one rerun,
- summary grouping completeness,
- representative `--trace` output for ORACLE, APM, YOLO, and CHEAPSKATE.

## 21. Implementation invariants

1. The live game remains the source of truth; the harness never reimplements game rules.
2. No game balance constants change in this feature.
3. Strategies use deterministic rules only.
4. Observation limits are enforced structurally.
5. Same-seed organic growth randomness is isolated from topology-dependent incident RNG consumption in balance runs.
6. Default/legacy random behavior outside the harness remains compatible.
7. Feature progression remains the real `CommunityProgression`; strategies do not choose feature order.
8. Learning follows one shared policy for all strategies.
9. One normal operating investment per day.
10. `ORACLE` means full-information heuristic benchmark, not proven optimum.
11. Oracle previews are pure and read-only.
12. Full-matrix output is evidence for a later tuning task, not an automatic tuning mechanism.
