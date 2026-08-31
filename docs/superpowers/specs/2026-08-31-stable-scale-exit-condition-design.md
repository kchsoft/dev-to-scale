# Stable-Scale Exit Condition Design

Date: 2026-08-31
Branch: `feature/balance-pass-2-release-readiness`
PR: #21
Base: `feature/playable-mvp`

## Context

Balance Pass 2 successfully made informed strategies better at pre-release dependency and capacity preparation, but the exact 2,700-run matrix still failed the two strategy-signal gates:

- informed win rate: 33.33%
- riskier win rate: 30.74%
- delta: +2.59pp, below the required +10pp
- informed post-release overload: 9.90 days/run
- riskier post-release overload: 11.00 days/run
- ratio: 90.0%, above the required 80%
- informed missing dependency days: 7.06/run
- riskier missing dependency days: 19.61/run
- ratio: 36.0%, which passes the dependency-prevention criterion

The result is not explained by a failure of release-readiness logic. Informed strategies materially reduce missing dependencies and generally reduce failure/release-overload exposure.

A same-seed trace comparison exposed the late-game structural problem instead. In representative harmful cases, informed strategies successfully prepare SQS before an AI release, avoid the broken dependency, unlock later features earlier, and reach high traffic sooner. They then reach the same terminal ALB ceiling earlier and remain stuck there for hundreds of days. Reactive strategies can reach that ceiling later and occasionally cross the revenue target before the prolonged overload suppresses growth.

This means healthy operation can be punished because it accelerates the player into an infrastructure ceiling that has no further remedy.

## Root cause

The current exit condition is purely economic:

```text
all progression complete
AND monthly revenue >= 143M
```

At full monetization, 143M monthly revenue requires roughly 3.76M average DAU.

The V1 ALB XLARGE tier has only 1,800 throughput. With all V1 features active, its load curve reaches 100% around 3.43M DAU. Therefore the current game effectively requires the player to operate the gateway above its healthy capacity in order to win.

This directly conflicts with the lesson of Balance Pass 2. A strategy that keeps production healthy reaches the impossible healthy boundary sooner; a weaker strategy may occasionally win by arriving later and tolerating overload.

Two causal pilots confirmed that this single ceiling dominates late-game outcomes:

- ALB XLARGE 2,250 made the sampled 900-run pilot almost universally winnable.
- Even ALB XLARGE 1,950, only about 8% above the current value, made the same sampled pilot nearly universally winnable under the old revenue-only victory rule.

Therefore the correct fix is not to tune ALB to a narrow magic number. Late-game difficulty must stop depending on one hard capacity cliff.

## Goal

Change the final lesson from:

> Grow large enough to hit the revenue target, even if production is unhealthy.

To:

> Grow a large service and prove that you can operate it reliably at that scale.

A win should require both business scale and recent operational quality.

The exit condition becomes:

```text
all progression complete
AND monthly revenue >= 143M
AND trailing 30-day operational SLO passes
```

This makes release readiness, observability, dependency planning, capacity management, and incident recovery contribute directly to the final objective without giving any strategy hidden economic or capacity modifiers.

## Chosen approach

### 1. Remove ALB as the mandatory-overload victory gate

Change only the ALB XLARGE throughput tier:

```text
1,800 -> 2,250
```

Keep the XLARGE monthly price unchanged at 550,000 during this correction.

2,250 is not chosen to create a desired win rate. It is derived from the existing 85% readiness boundary. The gateway demand near the current 143M full-feature revenue target is approximately 1,909 throughput:

```text
1,909 / 0.85 ~= 2,246
```

Rounding to 2,250 means a correctly sized XLARGE gateway can support the target business scale at roughly the same 85% headroom boundary already taught by the informed release-readiness strategies.

This deliberately removes the gateway hard cap as the final difficulty mechanism. Other resources remain governed by their existing sizing, horizontal-scaling, technology, cost, and proficiency rules.

### 2. Add a trailing operational SLO

Introduce a core-domain rolling window that owns the latest 30 launched operational-day samples.

Each sample records:

- failure rate;
- whether any player-owned effective resource ratio is above 1.0;
- whether any REQUIRED request-route dependency is missing.

The SLO window must not depend on the simulation harness. The real `GameEngine` owns it because it is part of the actual game victory contract.

### Daily health definition

A day is healthy when all of the following are true:

```text
failureRate < 10%
no effective resource ratio > 1.0
no REQUIRED dependency is missing
```

The 10% boundary matches the existing `severeFailureDays` metric and therefore preserves an established semantic rather than inventing a second severe-failure threshold.

### Trailing 30-day SLO pass

A window passes when:

```text
sample count >= 30
healthy days >= 27
average failure rate <= 2%
missing REQUIRED dependency days == 0
```

Interpretation:

- up to 3 unhealthy days are allowed, so a short incident does not make the game unwinnable for a full month;
- sustained low-grade failure still consumes the error budget through the 2% average failure-rate rule;
- a broken REQUIRED production dependency is never acceptable for exit qualification;
- overload matters even before it turns into a large request failure rate.

The initial SLO numbers are part of this design, not tuning knobs to sweep until the +10pp cohort gate passes. If the next matrix fails, diagnose the failing causal path before changing them.

## Operational-day sequencing

The SLO must preserve the already-fixed daily causality contract.

Strategy decisions occur before `GameEngine.advanceDay()`. A same-day resize or scale-out must not erase an overload that was already observed at the start of that day.

Therefore the SLO sample for `advanceDay()` is built from the frozen previous-day operational snapshot represented by `_growthReferenceLoad`, not from a load snapshot refreshed by a same-day strategy action.

The daily order becomes conceptually:

```text
player/strategy observes current production state
player may act
advanceDay()
  record SLO sample from frozen observed production state
  apply growth consequence from the same frozen state
  calculate the next operational state
  process economy / incidents / work
  freeze the next day's reference state
```

This keeps growth penalties, simulation metrics, and exit reliability aligned around the production state the player actually saw.

## Core model

Add a focused domain type, for example `OperationalSloWindow`, rather than placing rolling-window arithmetic directly in `GameEngine`.

Suggested contract:

```ts
interface OperationalSloSample {
  readonly failureRate: number;
  readonly overloaded: boolean;
  readonly missingRequiredDependency: boolean;
}

interface OperationalSloStatus {
  readonly sampleCount: number;
  readonly healthyDays: number;
  readonly unhealthyDays: number;
  readonly averageFailureRate: number;
  readonly missingRequiredDependencyDays: number;
  readonly passes: boolean;
}
```

The domain object:

- keeps at most the most recent 30 samples;
- calculates status deterministically;
- contains no RNG;
- does not know about strategies, balance runs, UI, or revenue;
- can be unit-tested independently.

## GameEngine integration

`GameEngine` owns one SLO window after launch.

At the beginning of each launched `advanceDay()`, before growth is calculated, record one sample derived from `_growthReferenceLoad`.

The missing-dependency flag is true when any request trace contains a node with:

```text
requirement == REQUIRED
AND status == MISSING
```

At monthly settlement, victory requires:

```ts
progression.finished
&& month.revenue >= RevenuePolicy.EXIT_MONTHLY_REVENUE_TARGET
&& operationalSlo.status.passes
```

Bankruptcy remains higher priority than victory exactly as today.

No mid-month instant victory is introduced. Exit remains a monthly business checkpoint.

## Snapshot and player-facing information

Expose exit readiness in `GameSnapshot` so the game can explain why the most recent monthly checkpoint did or did not qualify for exit.

Suggested shape:

```ts
exitReadiness: {
  monthlyRevenueTarget: number;
  lastSettledMonthlyRevenue: number;
  progressionComplete: boolean;
  slo: OperationalSloStatus;
  lastSettlementQualified: boolean;
}
```

`lastSettledMonthlyRevenue` is the completed settlement value already used by the victory check, not a partial estimate for the current month. Before the first settlement it is `0`. `lastSettlementQualified` is true only when the latest completed settlement simultaneously had finished progression, revenue at or above target, and a passing SLO.

The UI should present the three final requirements separately:

- product progression complete;
- last settled monthly revenue target reached;
- 30-day production SLO passed.

The SLO display should show at minimum:

- healthy days / 30;
- average failure rate / 2% budget;
- REQUIRED dependency health.

This is not a hidden win formula. The player must be able to understand which operational objective is blocking exit.

Detailed visual redesign is outside this correction. Reuse the existing status/progression surfaces where possible.

## Balance-harness evidence

Extend `BalanceRunResult` with enough end-state evidence to distinguish economic failure from operational qualification failure.

Recommended fields:

```text
revenueTargetMetButSloFailedSettlements
finalSloSampleCount
finalSloHealthyDays
finalSloAverageFailureRate
finalSloMissingRequiredDependencyDays
```

`revenueTargetMetButSloFailedSettlements` increments only for a completed settlement where progression is finished, monthly revenue is at or above 143M, the account is not bankrupt, and the SLO is the condition that prevents a win. This isolates the operational gate from ordinary progression, revenue, or bankruptcy failures.

Existing metrics remain authoritative for cumulative run behavior:

- failure days;
- severe failure days;
- cumulative failure burden;
- overload days;
- post-release overload days;
- missing required dependency days;
- infrastructure exposure and bankruptcy.

Do not move core SLO state into `SimulationMetricsCollector`; the collector only reports the game-domain status and adds diagnostic counters.

## Acceptance criteria

The existing Balance Pass 2 hard gates remain in force after this correction.

### Outcome bands

For the final exact 2,700 runs:

- overall win rate: 15%-45%;
- bankruptcy rate: 10%-35%;
- timeout non-zero;
- at least four of six strategies win;
- no strategy exceeds 80% win rate.

### Strategy signal

Informed cohort:

- `METRICS_AWARE`
- `APM_AWARE`
- `ORACLE`

Riskier/flawed cohort:

- `REACTIVE_BASIC`
- `YOLO_SCALE`
- `CHEAPSKATE`

Hard criterion:

- informed aggregate win rate is at least +10 percentage points above riskier aggregate.

### Prevention signal

Hard criteria remain:

- informed post-release overload days/run <= 80% of riskier;
- informed missing REQUIRED dependency days/run <= 50% of riskier.

### Game length

- winner-day median: 500-1,000;
- wins before day 365 remain rare.

### SLO sanity

Review the matrix before acceptance if either of these occurs:

- almost every revenue-qualified run immediately satisfies the SLO, meaning the new gate is decorative;
- almost no revenue-qualified run can satisfy the SLO, meaning the new gate is effectively impossible.

Inspect `revenueTargetMetButSloFailedSettlements` by strategy and stack. The expected signal is that observability/readiness strategies convert revenue-qualified states into stable exits more reliably, not that they receive a special pass.

## Calibration sequence

Do not run another capacity sweep.

After implementation:

1. run core/unit/TDD verification;
2. run representative traces proving revenue-only exit is blocked by bad SLO and allowed by good SLO;
3. run a broad 450-run pilot across all 15 framework/database stacks;
4. inspect outcome bands, cohort delta, prevention metrics, and SLO qualification metrics;
5. only if the pilot is plausible, run the exact 2,700 matrix;
6. merge PR #21 only if all hard gates pass.

If the pilot fails, debug the causal reason. Do not respond by sweeping ALB capacity or SLO thresholds.

## TDD slices

Implement in this order:

1. `OperationalSloWindow` unit behavior;
2. frozen observed-day sample integration in `GameEngine`;
3. revenue + SLO monthly victory contract;
4. `GameSnapshot.exitReadiness` projection;
5. ALB XLARGE 2,250 capacity correction;
6. balance-result SLO diagnostics;
7. UI/status projection regression coverage as required by existing surfaces;
8. representative trace diagnostics;
9. 450-run pilot;
10. exact 2,700-run final matrix only if the pilot is plausible.

Every production behavior slice starts RED.

## Required tests

At minimum prove:

- fewer than 30 samples cannot pass the exit SLO;
- 27 healthy / 3 unhealthy days can pass if all other budgets pass;
- 26 healthy / 4 unhealthy days fail;
- average failure rate above 2% fails even if no individual day reaches 10%;
- any REQUIRED dependency-missing day in the trailing window fails;
- the window evicts day 1 when day 31 is recorded;
- a same-day capacity correction does not rewrite the already-observed SLO sample;
- revenue >= 143M with failed SLO does not set `WON`;
- revenue >= 143M with finished progression and passing SLO does set `WON`;
- bankruptcy still wins precedence over exit qualification;
- `lastSettledMonthlyRevenue` never reports a partial current-month estimate;
- ALB XLARGE throughput is exactly 2,250 and remains monotonic with lower tiers;
- trace on/off remains result-identical;
- deterministic scenario replay remains identical for the same seed and strategy.

## Non-goals

This correction does not change:

- 1,080-day horizon;
- starting cash;
- progression thresholds;
- phase-3 growth probabilities;
- feature load, growth, or revenue modifiers;
- 143M exit monthly-revenue target;
- infrastructure prices;
- app/database scaling limits;
- technology build costs or durations;
- incident or viral probabilities;
- strategy observability ceilings;
- release-readiness thresholds or action ordering;
- learning rules;
- automatic feature release timing.

It also does not add a new ALB horizontal-scaling mechanic in V1. The capacity correction simply prevents the fixed gateway tier from being the mandatory-overload victory gate.

## Decision rule

This design is successful only if the final game rewards reliable operation rather than one capacity cliff.

If the SLO-based exit condition produces a meaningful informed-strategy advantage while preserving bankruptcy, timeout, winner-day distribution, and stack fairness, accept it and merge Balance Pass 2.

If the SLO metrics improve but the +10pp outcome signal still does not appear, investigate the remaining terminal paths before changing strategy thresholds or global difficulty constants.

If the overall game becomes too easy or too hard, first identify which exit requirement or resource path is causing the result. Do not reintroduce difficulty by making the revenue target require unavoidable overload.
