# Balance Pass 2 — Release Readiness Design

Date: 2026-08-30
Branch: `feature/balance-pass-2-release-readiness`
Stacked on: `feature/deterministic-balance-simulation-harness` / PR #19
Ultimate base: `feature/playable-mvp`

## Context

The deterministic balance harness and harness-correctness fixes have been split out and merged into `feature/playable-mvp` through PR #20.

Balance Pass 1 then established a playable late-game baseline and exhaustively tested the three global late-game axes that were intentionally allowed in that pass:

- final progression threshold;
- phase-3 positive organic-growth probability;
- exit monthly-revenue target.

The current Balance Pass 1 branch uses:

- progression tail: `300k -> 900k -> 2M -> 3M`;
- phase-3 positive-day probability: `0.58`;
- exit monthly-revenue target: `143M`;
- ALB XLARGE throughput: `1,800`.

Those values make wins possible, preserve bankruptcy and timeout outcomes, and produce winner-day medians around the intended late-game window. However, the strategy-quality acceptance signal remains missing.

The 2,700-run candidate matrix at the playable baseline produced an informed-cohort win rate only slightly above the intentionally flawed/riskier cohort. Subsequent full sensitivity sweeps showed that global constants cannot create the desired separation without mostly helping all strategies together:

### Final-threshold sensitivity

| Final threshold | Overall win | Informed | Riskier | Delta |
| --- | ---: | ---: | ---: | ---: |
| 3.5M | 31.78% | 32.52% | 31.04% | +1.48pp |
| 4.0M | 31.96% | 31.78% | 32.15% | -0.37pp |
| 4.5M | 29.11% | 29.26% | 28.96% | +0.30pp |

### Phase-3 positive-day sensitivity

| Probability | Overall win | Informed | Riskier | Delta |
| --- | ---: | ---: | ---: | ---: |
| 0.60 | 36.33% | 36.59% | 36.07% | +0.52pp |
| 0.62 | 42.89% | 41.85% | 43.93% | -2.07pp |
| 0.65 | 47.59% | 47.33% | 47.85% | -0.52pp |

`0.65` also violates the intended 45% overall-win ceiling. Exit-target sensitivity likewise failed to produce a meaningful informed advantage.

The conclusion is structural: the harness currently gives better-observed strategies too little preventative advantage. Most strategies ultimately perform a similar remedy, with the main difference being whether they react around 85% or after crossing 100%. In addition, all strategies share the same baseline learning controller and all six receive identical post-failure REQUIRED-dependency recovery from the registry wrapper. This makes the better-observability strategies efficient troubleshooters, but not meaningfully better operators.

## Goal

Make pre-release production readiness a real operational skill.

A skilled strategy should be able to inspect a feature that is already being developed, anticipate the production risk of releasing it, and prepare infrastructure before the feature starts receiving live traffic.

The desired game behavior is:

- the developer knows which feature is currently being built and approximately when it will ship;
- the developer knows explicit architectural requirements of their own feature, such as a REQUIRED event bus;
- better observability enables progressively better pre-release load analysis;
- informed strategies can build required dependencies or add targeted capacity before release;
- reactive/passive strategies are still allowed to ship unprepared and recover afterward;
- YOLO can still spend early, but without the precision of observability-aware planning;
- no strategy receives hidden probability buffs, revenue buffs, capacity buffs, or artificial penalties;
- every strategy continues to use the same public engine actions and affordability rules.

The player-facing lesson should be recognizable to a developer: **load-test and capacity-plan before shipping a feature, rather than waiting for production to fail.**

## Approaches considered

### A. Give informed strategies cheaper infrastructure or direct success bonuses

Examples would include reduced build cost, lower incident probability, or extra capacity when an informed strategy is active.

Pros:

- easy to force a win-rate gap.

Cons:

- strategy identity becomes a hidden game modifier rather than a consequence of better decisions;
- does not teach an operational concept;
- makes the harness less representative of the player-facing game.

Rejected.

### B. Make reactive strategies deliberately worse

Examples would include delaying their response, increasing runway requirements, or forcing poor technology choices.

Pros:

- also easy to create a cohort gap.

Cons:

- weakens the meaning of the comparison;
- risks turning REACTIVE_BASIC into a strawman;
- does not add a new gameplay decision.

Rejected as the primary mechanism.

### C. Add release-readiness observation and preventative decisions

Use the current feature-development state and the existing read-only `GameEngine.previewLoadWithFeature(feature)` capability to model a pre-release load test.

Informed strategies use this information to prepare before the automatic feature release. Reactive strategies continue to respond to the live system after release.

Pros:

- creates a real operational decision rather than a hidden bonus;
- reuses existing engine behavior and preview infrastructure;
- directly addresses REQUIRED-dependency outage days and post-release overload;
- preserves the meaning of BASIC/METRICS/APM/ORACLE observation ceilings;
- naturally produces a trade-off between early spend and production stability.

Cons:

- expands observation contracts and strategy semantics;
- requires new metrics to prove that any win-rate improvement comes from prevention rather than accidental spending.

Recommended and approved direction.

### D. Add a manual deployment gate / hold-release command

The player could stop a completed feature from shipping until readiness checks pass.

This is a valid future mechanic, but it changes the core development/release loop more substantially than required for this pass. The current engine already gives strategies a decision step each day before `advanceDay()`, so preventative infrastructure can be started while the feature is still in progress without adding deployment scheduling.

Deferred.

## Existing engine support

`GameSnapshot.currentFeature` already exposes:

- feature id;
- progress;
- required work;
- elapsed days;
- estimated remaining days.

`GameEngine.previewLoadWithFeature(feature)` already computes the load that would exist immediately after an unreleased feature ships, using the same:

- current DAU;
- infrastructure;
- developer proficiency;
- incidents;
- deployed technologies;
- temporary traffic state;
- load-calculation path used by the live game.

This preview is read-only and therefore is the source of truth for release-readiness projections.

The game also already records feature definitions with request routes and REQUIRED/OPTIONAL topology requirements. For example, NOTIFICATION, AI_RECOMMENDATION and FOLLOW_FEED explicitly require a queue/event-bus path.

## Observation model

### Common pending-feature observation

Add a nullable `pendingFeature` to `CommonBalanceObservation`.

It is present only when:

- the service has launched;
- a non-bootstrap feature is currently under development.

It contains only information the developer should intrinsically know about their own work:

```ts
interface PendingFeatureObservation {
  readonly id: CommunityFeatureId;
  readonly estimatedRemainingDays: number;
  readonly requiredResourceRoles: readonly ResourceRole[];
}
```

The common observation does **not** expose exact future load numbers.

`requiredResourceRoles` is derived from REQUIRED entries in the feature's declared request route. This is architecture knowledge, not production observability.

### Upcoming dependency gaps

Add `upcomingRequiredDependencyGaps` to the common observation.

Unlike the existing `requiredDependencyGaps`, which is derived from failed live request traces after a feature has shipped, the upcoming form is derived from:

- the pending feature's REQUIRED resource roles;
- the currently deployed topology;
- the same allowed candidate technology mapping used for live dependency recovery.

Example:

```text
FOLLOW_FEED is being developed
-> request route requires EVENT_BUS
-> no queue technology is deployed
-> upcomingRequiredDependencyGaps contains EVENT_BUS with SQS/RabbitMQ/Kafka candidates
```

This information is visible to every strategy, but only the informed strategies gain a new preventative policy in this pass. Reactive/riskier strategies are intentionally free to ignore it until the existing live-gap recovery path activates.

The current post-release registry wrapper remains in place as a safety/correctness fallback so a poor strategy does not permanently deadlock the simulation.

## Release preview by observation ceiling

The preview is generated from `GameEngine.previewLoadWithFeature()` but projected through the strategy's existing observation ceiling.

### BASIC

BASIC receives:

- `pendingFeature`;
- `upcomingRequiredDependencyGaps`;
- current aggregate node health, as today.

BASIC does not receive projected post-release load.

This preserves the meaning of REACTIVE_BASIC: it knows what it is shipping, but lacks instrumentation to estimate where the capacity problem will land.

### METRICS

METRICS additionally receives a `releasePreview` containing projected resource-level percentages for the pending feature:

```ts
interface MetricsReleasePreview {
  readonly resourceLoads: readonly BalanceResourceLoadObservation[];
  readonly maxEffectivePercent: number;
}
```

The projected values use the same resource observation format already visible for the live service.

METRICS therefore answers:

> If this feature shipped now, which CPU/IO/throughput resource would be hottest and how close would it be to its effective limit?

It does not receive exact raw demand/capacity internals or action simulation.

### APM

APM receives the METRICS release preview plus a projected diagnosis:

```ts
interface ApmReleasePreview extends MetricsReleasePreview {
  readonly diagnosis: BalanceDiagnosisObservation;
}
```

The diagnosis identifies the projected top bottleneck using the same node/resource semantics as live APM diagnosis.

APM therefore answers:

> If this feature shipped now, what would be the primary bottleneck?

This enables targeted technology/capacity preparation rather than generic scale-up.

### ORACLE

ORACLE receives exact projected operational pressures for the pending feature:

```ts
interface OracleReleasePreview extends ApmReleasePreview {
  readonly exactPressures: readonly OracleExactPressure[];
}
```

The Oracle preview port is extended only as far as needed to rank preventative actions against the pending release. It must remain read-only and must not mutate the live engine or consume RNG.

For the first implementation, ORACLE must be able to compare the projected release pressure with the relief offered by candidate actions. If exact combined `feature + candidate action` preview is necessary to do this correctly, add symmetric core read-only preview methods for:

- pending feature + technology deployment;
- pending feature + node resize;
- pending feature + node scale-out.

Do **not** import simulation-layer `SimulationAction` types into `src/core`.

The simulation layer may wrap those core preview methods behind `OraclePreviewPort`.

## Strategy semantics

Global Balance Pass 1 constants stay frozen while evaluating this design:

```text
progression tail = 300k / 900k / 2M / 3M
phase-3 positive probability = 0.58
exit monthly revenue = 143M
ALB XLARGE throughput = 1,800
```

### Shared rule for informed strategies

`METRICS_AWARE`, `APM_AWARE`, and `ORACLE` gain a pre-release readiness phase before their existing live-service decision.

Decision ordering:

1. existing live REQUIRED-dependency recovery remains the highest-priority correctness fallback;
2. if an upcoming REQUIRED dependency is missing, attempt an affordable preventative dependency build;
3. otherwise evaluate release capacity risk when a pending feature exists;
4. if no meaningful affordable preventative action exists, fall through to the strategy's existing live-service logic.

This ordering prevents readiness logic from masking a currently broken production dependency.

### Preventative dependency selection

For an upcoming dependency gap, informed strategies start the cheapest affordable compatible dependency using the same public technology-build command and existing affordability policy.

The build starts as soon as the upcoming gap becomes visible; it is **not** delayed until the last few development days. This matters because technology construction itself takes time.

There is no special instant-deploy behavior.

### METRICS_AWARE

METRICS uses the projected release resource loads.

Initial policy:

- if projected max effective load is below 85%, no release-capacity action is required;
- otherwise select the projected hottest player-owned node/resource;
- choose the first affordable resource-aware remedy using the existing `resourceRemedyCandidates` ordering;
- after the preventative action, normal live-service logic continues on subsequent days.

METRICS does not receive an exact action-result preview. It acts on visible projected resource pressure.

### APM_AWARE

APM uses the projected diagnosis.

Initial policy:

- if projected top bottleneck is below 85%, no release-capacity action is required;
- otherwise select the diagnosed node/resource;
- choose the cheapest affordable diagnosis-supported remedy from `resourceRemedyCandidates`;
- preserve existing technology suitability rules and topology validation.

APM should be more targeted than METRICS when several resources are elevated.

### ORACLE

ORACLE evaluates the exact projected release pressure.

Initial policy:

- if projected max effective ratio is below `0.85`, no preventative action is required;
- build the same candidate set that would be valid for the projected hottest node/resource;
- discard unaffordable candidates;
- rank candidates by projected post-release relief and one-month cost;
- prefer a candidate that brings the projected release max to `<= 0.85` at the lowest cost;
- otherwise choose the highest meaningful relief-per-cost candidate;
- reject candidates with negligible projected relief unless they are a required topology enabler such as ALB.

This mirrors the existing ORACLE live policy, but scores the upcoming release instead of only the already-live service.

### REACTIVE_BASIC

No new preventative policy.

It sees that a feature is being developed and can see explicit REQUIRED roles, but continues to act only when BASIC live aggregate load reaches the existing red threshold.

If the new feature ships without a required dependency, the existing post-release dependency-recovery wrapper repairs it after the gap becomes live.

This remains a plausible novice operator rather than a deliberately sabotaged strategy.

### YOLO_SCALE

No new feature-specific preview policy.

It retains its existing generic preemptive scaling at 70% BASIC aggregate load and BURST preference during viral spikes.

YOLO may sometimes be accidentally ready for a release, but it pays for capacity without knowing whether it addresses the coming bottleneck.

### CHEAPSKATE

No new preventative policy.

It continues to wait for hard-limit pressure and preserve its large runway. It may benefit from the common knowledge of a pending feature only through existing behavior; it does not proactively spend for release readiness.

## Why the 85% readiness target remains unchanged

The informed live strategies already use 85% as the meaningful headroom boundary. Reusing the same boundary for release readiness avoids inventing another tuning parameter and keeps the mental model consistent:

```text
< 85% projected effective load -> enough headroom
>= 85% -> prepare before shipping
```

This pass must not tune the 85% threshold to force acceptance. If the strategy signal remains weak, diagnose the behavior rather than immediately adding threshold sweep dimensions.

## Metrics

Win rate alone is insufficient evidence because an informed strategy could win more simply by overspending.

Add release-readiness metrics to `BalanceRunResult` / `SimulationMetricsCollector`.

### Prevented dependency evidence

Track:

- `preventativeDependencyBuildCount` — technology builds started because of an upcoming REQUIRED dependency;
- existing `missingRequiredDependencyDays` remains the post-release failure metric.

Acceptance signal:

- informed strategies should materially reduce live missing-dependency days relative to the riskier cohort;
- the full matrix should not show informed strategies creating **more** live missing-dependency days than the baseline.

### Release-overload evidence

Track a seven-day observation window after every non-bootstrap feature release.

A `postReleaseOverloadDay` is a day within that window where the maximum effective operational ratio exceeds `1.0`.

Record:

- `postReleaseOverloadDays`;
- `featuresReleasedIntoOverload` — count a feature once if any of its first seven live days exceeds `1.0`;
- `preventativeCapacityActionCount` — resize / scale-out / technology action selected by release-readiness policy.

The seven-day window is an evidence window only. It does not change engine behavior.

### Spend evidence

Existing infrastructure exposure and technology-build-spend metrics remain authoritative.

Review:

- median monthly infrastructure exposure;
- technology build spend;
- ending cash;
- bankruptcy rate.

A strategy-signal pass is not acceptable if the informed cohort wins only by indiscriminate spending that destroys the intended economic trade-off.

## Acceptance criteria

### Outcome bands

For the final 2,700-run matrix:

- overall win rate: 15%-45%;
- bankruptcy rate: 10%-35%;
- timeout remains non-zero;
- at least four of six strategies record wins;
- no strategy exceeds 80% wins.

These stay unchanged from Balance Pass 1.

### Strategy signal

Define informed:

- `METRICS_AWARE`;
- `APM_AWARE`;
- `ORACLE`.

Define riskier/flawed:

- `REACTIVE_BASIC`;
- `YOLO_SCALE`;
- `CHEAPSKATE`.

Hard acceptance:

- informed aggregate win rate exceeds riskier aggregate win rate by at least **10 percentage points**.

Strict ordering inside either cohort is not required.

### Prevention signal

Hard acceptance:

- informed aggregate `postReleaseOverloadDays` per run is at least **20% lower** than riskier aggregate;
- informed aggregate `missingRequiredDependencyDays` per run is at least **50% lower** than riskier aggregate.

If the denominator is zero for the riskier cohort, treat the corresponding ratio criterion as not applicable and document the absolute values instead. A zero/zero result cannot be used as evidence of preventative advantage.

These metrics establish causality: the informed cohort must win more because it actually releases healthier systems.

### Game length

Among winners:

- median winning day remains between 500 and 1,000;
- wins before day 365 remain rare, using the same Balance Pass 1 rule.

### Spend sanity

No hard ratio is imposed initially because preventative infrastructure should legitimately cost money.

However, before accepting the pass, investigate if the informed cohort's median infrastructure exposure is more than 50% above the riskier cohort or if its bankruptcy rate exceeds the riskier cohort. Such a result suggests brute-force overprovisioning rather than useful readiness planning.

### Stack fairness

As in Pass 1, inspect all 15 framework/database stacks.

Flag stacks where:

- the cohort win-rate direction reverses strongly;
- release-overload prevention disappears;
- a framework/database combination becomes nearly deterministic regardless of strategy.

No new hard per-stack threshold is introduced in this pass.

## Calibration method

The previous five-tuple calibration set proved too seed-sensitive. Balance Pass 2 therefore uses a broader pilot before any final matrix.

Pilot matrix:

```text
5 frameworks × 3 databases × 5 fixed seeds × 6 strategies = 450 runs
```

Fixed seeds:

```text
5, 8, 17, 23, 29
```

This preserves the useful prior seeds while covering **all 15 stacks** instead of sampling only five stack/seed tuples.

Pilot review includes:

- terminal outcomes;
- informed-vs-riskier win-rate delta;
- missing dependency days;
- post-release overload days;
- preventative action counts;
- infra exposure / ending cash;
- winner-day distribution.

If the pilot does not show the intended causal prevention signal, do not run the full 2,700 matrix. Diagnose strategy behavior first.

The final candidate must still run:

```text
5 frameworks × 3 databases × 30 seeds × 6 strategies = 2,700 runs
```

with the same integrity checks used by the deterministic harness.

## TDD and implementation boundaries

Implement in causal slices.

1. Pending-feature observation and upcoming dependency-gap projection.
2. Release load preview projected through METRICS/APM/ORACLE ceilings.
3. Metrics for post-release overload and preventative actions.
4. METRICS preventative dependency/capacity policy.
5. APM preventative policy.
6. ORACLE preventative policy and any required combined read-only preview methods.
7. 450-run pilot.
8. Only if plausible: full 2,700-run evidence.

Each behavior slice starts with a failing contract/regression test.

Required observation tests must prove:

- BASIC does not gain projected resource load;
- METRICS does not gain APM diagnosis or ORACLE exact pressure;
- APM does not gain ORACLE exact demand/capacity internals;
- preview construction does not mutate live infrastructure, feature state, RNG sequence, cash, or day;
- trace on/off remains result-identical.

Strategy tests must prove preventative actions happen **before** feature completion for representative cases.

## Non-goals

Balance Pass 2 does not change:

- the 1080-day horizon;
- starting cash;
- feature workload definitions;
- feature revenue modifiers;
- incident generation probability or severity;
- viral event probability or modifiers;
- infrastructure prices;
- framework/database capacity modifiers;
- Balance Pass 1 late-game constants (`3M`, `0.58`, `143M`, ALB XLARGE `1,800`);
- technology build costs or build durations;
- learning costs or the shared baseline learning sequence;
- automatic feature-completion/release timing;
- post-release REQUIRED-dependency recovery correctness fallback;
- public game commands.

The pass changes what strategies can infer from an **already-known pending release** and how informed strategies act on that information.

## Decision rule

If the 450-run pilot shows:

- improved prevention metrics;
- a substantial movement toward the +10pp cohort target;
- acceptable overall difficulty and spend;

then run the full 2,700 matrix.

If prevention metrics improve but win-rate separation remains weak, investigate whether healthy release behavior is insufficiently rewarded by the existing growth/failure economy before changing strategy thresholds.

If prevention metrics do **not** improve, the release-readiness policy is not doing what it claims; debug the observation/action path rather than tuning global constants.

If the full matrix satisfies all hard criteria, merge the playable Balance Pass 1 baseline first if still stacked, then merge Balance Pass 2 after fresh merged-base CI verification.

If it fails, keep both balance PRs unmerged until the failing criterion has a causal explanation. The already-merged deterministic harness remains unaffected.
