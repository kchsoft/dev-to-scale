# Balance Pass 2 — Release Readiness Design

Date: 2026-08-30
Branch: `feature/balance-pass-2-release-readiness`
Stacked on: `feature/deterministic-balance-simulation-harness` / PR #19
Ultimate base: `feature/playable-mvp`

## Context

The deterministic harness and correctness fixes were split into PR #20 and merged into `feature/playable-mvp`.

Balance Pass 1 then established a playable late-game baseline with:

- progression tail: `300k -> 900k -> 2M -> 3M`;
- phase-3 positive-day probability: `0.58`;
- exit monthly-revenue target: `143M`;
- ALB XLARGE throughput: `1,800`.

Those values make wins possible while preserving bankruptcy, timeout, and late winner-day distributions. The remaining failure is strategy signal: better-observed strategies do not materially outperform reactive/riskier strategies.

Full sensitivity evidence showed that this cannot be repaired by further global late-game tuning.

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

`0.65` also violates the 45% overall-win ceiling. Exit-target sensitivity likewise failed to create meaningful cohort separation.

The structural cause is that informed strategies are currently better troubleshooters, not better operators. All strategies share the same learning controller, live REQUIRED-dependency recovery is applied identically by the registry wrapper, and most capacity decisions eventually converge on similar remedies. Better observability often changes only whether a remedy happens around 85% or after crossing 100%.

## Goal

Make **pre-release production readiness** a real operational skill.

A skilled strategy should inspect a feature already under development, anticipate the production risk of releasing it, and prepare infrastructure before live traffic reaches the new code.

The player-facing lesson is:

> Load-test and capacity-plan before shipping a feature instead of waiting for production to fail.

No strategy receives hidden probability, revenue, cost, or capacity modifiers. Every strategy continues to use the same public engine commands and affordability rules.

## Approaches considered

### A. Strategy-specific economic or capacity buffs

Rejected. This can force a win-rate gap but turns strategy identity into a hidden modifier and teaches no operational concept.

### B. Artificially weaken reactive strategies

Rejected as the primary mechanism. REACTIVE_BASIC should remain a plausible novice operator, not a strawman.

### C. Release-readiness observation and preventative decisions

Recommended and approved.

Use the current feature-development state and existing read-only `GameEngine.previewLoadWithFeature(feature)` path to model a pre-release load test. Informed strategies act on the preview before automatic release; reactive strategies continue to react to the live service afterward.

### D. Manual deployment gate

Deferred. A hold/release command is a valid future game mechanic, but the existing daily decision before `advanceDay()` already gives enough time to prepare while a feature is being developed.

## Existing engine support

`GameSnapshot.currentFeature` already exposes feature id, progress, required work, elapsed days, and estimated remaining days.

`GameEngine.previewLoadWithFeature(feature)` already calculates the load that would exist immediately after an unreleased feature ships using the same current DAU, infrastructure, skills, incidents, technologies, temporary traffic state, and live load-calculation path.

Feature definitions also already declare request routes and REQUIRED/OPTIONAL topology roles. NOTIFICATION, AI_RECOMMENDATION, and FOLLOW_FEED, for example, require a queue/event-bus path.

## Observation model

### Common pending feature

Add a nullable pending feature to `CommonBalanceObservation`:

```ts
interface PendingFeatureObservation {
  readonly id: CommunityFeatureId;
  readonly estimatedRemainingDays: number;
  readonly requiredResourceRoles: readonly ResourceRole[];
}
```

It exists only after launch while a non-bootstrap feature is under development.

This is intrinsic development knowledge. It does not reveal future production load.

### Upcoming dependency gaps

Add `upcomingRequiredDependencyGaps` to the common observation.

It is derived from:

- REQUIRED roles declared by the pending feature;
- currently deployed topology;
- the same compatible technology mapping used by live dependency recovery.

Example:

```text
FOLLOW_FEED is under development
-> requires EVENT_BUS
-> no queue is deployed
-> upcoming gap exposes SQS / RabbitMQ / Kafka candidates
```

Every strategy may see this architectural fact. Only the informed strategies gain a new preventative policy in this pass. The existing live `requiredDependencyGaps` wrapper remains the post-release correctness fallback for strategies that ship unprepared.

## Release preview by observation ceiling

The source of truth is `GameEngine.previewLoadWithFeature()` and the preview is projected through the existing observation ceilings.

### BASIC

BASIC sees:

- pending feature identity and remaining time;
- explicit upcoming REQUIRED-role gaps;
- current aggregate node health.

It receives no projected post-release load.

### METRICS

METRICS additionally receives:

```ts
interface MetricsReleasePreview {
  readonly resourceLoads: readonly BalanceResourceLoadObservation[];
  readonly maxEffectivePercent: number;
}
```

This answers which projected CPU/IO/throughput resource would be hottest if the feature shipped now. It does not expose exact raw demand/capacity values or action simulation.

### APM

APM receives the metrics preview plus projected diagnosis:

```ts
interface ApmReleasePreview extends MetricsReleasePreview {
  readonly diagnosis: BalanceDiagnosisObservation;
}
```

The diagnosis identifies the projected primary node/resource bottleneck using the same semantics as live APM diagnosis.

### ORACLE

ORACLE receives exact projected pressures:

```ts
interface OracleReleasePreview extends ApmReleasePreview {
  readonly exactPressures: readonly OracleExactPressure[];
}
```

ORACLE also **must** receive exact combined `pending feature + candidate action` previews. Approximate relief scoring is not acceptable for the ORACLE contract.

Add symmetric read-only core preview methods for:

- pending feature + technology deployment;
- pending feature + node resize;
- pending feature + node scale-out.

These methods must use the same load-calculation path as live state, must not consume RNG, and must not mutate the live engine.

Do not import simulation-layer `SimulationAction` into `src/core`. The balance observation layer wraps the three core methods behind `OraclePreviewPort` and maps a candidate action to the appropriate preview method.

## Strategy decision order

Global Balance Pass 1 constants remain frozen during this pass:

```text
progression tail = 300k / 900k / 2M / 3M
phase-3 positive probability = 0.58
exit monthly revenue = 143M
ALB XLARGE throughput = 1,800
```

For `METRICS_AWARE`, `APM_AWARE`, and `ORACLE`:

1. preserve existing live REQUIRED-dependency recovery as the highest-priority correctness fallback;
2. if an upcoming REQUIRED dependency is missing, start an affordable preventative dependency build;
3. otherwise evaluate pending-release capacity risk;
4. if no meaningful affordable preventative action exists, fall through to existing live-service logic.

This prevents readiness logic from hiding an already-broken live dependency.

### Preventative dependency build

An informed strategy starts the cheapest affordable compatible dependency as soon as the upcoming gap becomes visible. It does not wait until the final development days because technology construction itself takes time.

There is no instant deployment and no special build-duration reduction.

### METRICS_AWARE

- if projected max effective load is below 85%, take no release-capacity action;
- otherwise select the projected hottest player-owned node/resource;
- choose the first affordable remedy using existing `resourceRemedyCandidates` ordering;
- use no exact action-result preview.

### APM_AWARE

- if projected diagnosed bottleneck is below 85%, take no release-capacity action;
- otherwise use the diagnosed node/resource;
- choose the cheapest affordable diagnosis-supported remedy;
- retain topology validation and existing technology suitability rules.

### ORACLE

- if projected max effective ratio is below `0.85`, take no preventative action;
- build candidates for the projected hottest node/resource;
- discard unaffordable candidates;
- score every candidate using its **exact combined post-release preview**;
- prefer the lowest-cost candidate that brings projected max effective ratio to `<= 0.85`;
- otherwise choose the highest meaningful relief-per-cost candidate;
- reject negligible-relief candidates except required topology enablers such as ALB.

### REACTIVE_BASIC

No new preventative policy. It knows what is being developed, but waits for the existing BASIC live red threshold. If a REQUIRED dependency is missing after release, the existing recovery fallback repairs it.

### YOLO_SCALE

No feature-specific preview policy. It keeps generic 70% BASIC preemptive scaling and BURST preference. It can accidentally be release-ready, but without knowing whether its spending targets the upcoming bottleneck.

### CHEAPSKATE

No preventative policy. It continues waiting for hard-limit pressure and preserving its larger runway.

## Readiness threshold

Use the existing informed-strategy headroom boundary:

```text
< 85% projected effective load -> enough headroom
>= 85% -> prepare before release
```

Do not sweep this threshold in Balance Pass 2 to force acceptance. If the strategy signal remains weak, diagnose behavior instead.

## Metrics

Win rate alone is insufficient because an informed strategy could win more by brute-force spending.

Add the following evidence.

### Dependency prevention

Record:

- `preventativeDependencyBuildCount`;
- existing `missingRequiredDependencyDays`.

### Release overload

For each non-bootstrap feature release, observe its first seven live days. This seven-day window is metrics-only and changes no engine behavior.

Record:

- `postReleaseOverloadDays`: days in those windows where max effective ratio exceeds `1.0`;
- `featuresReleasedIntoOverload`: a feature counts once if any of its first seven days exceeds `1.0`;
- `preventativeCapacityActionCount`: readiness-triggered resize, scale-out, or technology actions.

### Spend sanity

Continue using existing infrastructure exposure, technology-build spend, ending cash, and bankruptcy metrics.

## Acceptance criteria

### Outcome bands

For the final 2,700 runs:

- overall win rate 15%-45%;
- bankruptcy rate 10%-35%;
- timeout non-zero;
- at least four of six strategies win;
- no strategy exceeds 80% win rate.

### Strategy signal

Informed cohort:

- `METRICS_AWARE`;
- `APM_AWARE`;
- `ORACLE`.

Riskier/flawed cohort:

- `REACTIVE_BASIC`;
- `YOLO_SCALE`;
- `CHEAPSKATE`.

Hard criterion:

- informed aggregate win rate exceeds riskier aggregate win rate by at least **10 percentage points**.

Strict ordering inside a cohort is not required.

### Prevention signal

Hard criteria:

- informed aggregate `postReleaseOverloadDays` per run is at least **20% lower** than riskier aggregate;
- informed aggregate `missingRequiredDependencyDays` per run is at least **50% lower** than riskier aggregate.

If the riskier denominator is zero, the corresponding percentage criterion is not applicable and the absolute values must be documented. Zero/zero is not evidence of preventative advantage.

### Game length

- winner-day median remains 500-1,000;
- wins before day 365 remain rare under the existing Balance Pass 1 rule.

### Spend sanity

Investigate before acceptance if:

- informed median infrastructure exposure is more than 50% above riskier;
- informed bankruptcy rate exceeds riskier.

These are review triggers rather than hard rejection thresholds because legitimate preventative capacity has a cost.

### Stack fairness

Inspect all 15 framework/database stacks. Investigate strong cohort-direction reversals, disappearance of prevention benefit, or nearly deterministic stack outcomes.

## Calibration method

The old five-tuple calibration sample was too seed-sensitive. Balance Pass 2 uses a broader pilot:

```text
5 frameworks × 3 databases × 5 seeds × 6 strategies = 450 runs
```

Fixed seeds:

```text
5, 8, 17, 23, 29
```

This covers every framework/database stack before a full matrix.

Pilot review includes:

- terminal outcomes;
- informed-vs-riskier win delta;
- missing dependency days;
- post-release overload days;
- preventative action counts;
- infrastructure exposure and ending cash;
- winner-day distribution.

Do not run the final matrix unless the pilot shows the intended causal prevention signal.

Final evidence remains exactly:

```text
5 frameworks × 3 databases × 30 seeds × 6 strategies = 2,700 runs
```

with the existing row-count, per-strategy, per-stack, seed, duplicate-key, and determinism checks.

## TDD implementation slices

Implement causally:

1. pending-feature observation and upcoming dependency-gap projection;
2. METRICS/APM release preview projection;
3. exact ORACLE pending-feature and combined-action preview contract;
4. post-release overload and preventative-action metrics;
5. METRICS preventative dependency/capacity policy;
6. APM preventative policy;
7. ORACLE preventative policy;
8. 450-run pilot;
9. only if plausible, full 2,700-run evidence.

Each behavior slice begins with a failing test.

Observation/regression tests must prove:

- BASIC never gains projected resource loads;
- METRICS never gains APM diagnosis or ORACLE exact internals;
- APM never gains ORACLE exact demand/capacity internals;
- combined previews do not mutate infrastructure, feature state, RNG sequence, cash, or day;
- trace on/off remains result-identical.

Strategy tests must prove representative preventative actions occur before feature completion.

## Non-goals

Balance Pass 2 does not change:

- 1080-day horizon;
- starting cash;
- feature workloads or revenue modifiers;
- incident or viral-event probabilities/modifiers;
- infrastructure prices;
- framework/database modifiers;
- Balance Pass 1 late-game constants (`3M`, `0.58`, `143M`, ALB XLARGE `1,800`);
- technology build costs/durations;
- learning costs or shared baseline learning order;
- automatic feature completion/release timing;
- post-release REQUIRED-dependency recovery fallback;
- public game commands.

This pass changes what a strategy can infer from an already-known pending release and how informed strategies act on that information.

## Decision rule

Run the 450-run pilot first.

If prevention metrics improve and the cohort delta moves materially toward +10pp without breaking difficulty/spend, run the full 2,700 matrix.

If prevention improves but win separation remains weak, investigate whether healthy release behavior is insufficiently rewarded by the current failure/growth economy before touching strategy thresholds.

If prevention does not improve, debug the observation/action path rather than tuning global constants.

If the final matrix satisfies all hard criteria, merge the playable Balance Pass 1 baseline first if it is still stacked, verify the rebased Balance Pass 2 CI, then merge Balance Pass 2.

If the final matrix fails, keep the balance PRs unmerged until the failing criterion has a causal explanation. The already-merged deterministic harness remains unaffected.
