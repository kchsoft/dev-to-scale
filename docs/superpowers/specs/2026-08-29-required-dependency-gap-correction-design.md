# Required Dependency Gap Correction Design

## Problem

The first deterministic 2,700-run balance matrix produced 0 wins, but the result is not yet safe to interpret as pure game balance. Features with REQUIRED topology roles can ship while the corresponding infrastructure is missing. A missing REQUIRED route step makes that workload fail, yet the strategy observation exposes only aggregate failure/capacity signals. Strategies therefore cannot reliably distinguish “capacity is too small” from “a required dependency does not exist.”

The representative `SPRING_BOOT + POSTGRESQL + seed 17` run showed this strongly: strategies that never deployed a queue accumulated a persistent failure burden after queue-required features shipped.

## Goal

Make missing REQUIRED topology dependencies explicit, make all deterministic strategies repair those hard gaps before ordinary capacity tuning, and add metrics that let the next full matrix distinguish topology failure from true progression/growth balance.

## Non-goals

- Do not change progression DAU thresholds.
- Do not change growth probabilities or feature growth bonuses.
- Do not change revenue coefficients or the 900,000,000 exit revenue target.
- Do not redesign player-visible observability tiers.
- Do not add new infrastructure products.

## Observation contract

Add `requiredDependencyGaps` to `CommonBalanceObservation`, so it is available at BASIC/METRICS/APM/ORACLE without leaking live engine objects.

Each gap contains:

```ts
interface RequiredDependencyGapObservation {
  readonly role: ResourceRole;
  readonly workloadIds: readonly string[];
  readonly candidateTechnologyIds: readonly BuildableTechnologyId[];
}
```

A gap is derived from `snapshot.load.requestTraces`: any step with `requirement === 'REQUIRED'` and `status === 'MISSING'` contributes its role and workload. Multiple workloads sharing the same missing role are grouped deterministically and workload IDs are sorted.

V1 candidate mapping is intentionally narrow:

- `EVENT_BUS` -> `SQS`, `RABBITMQ`, `KAFKA`
- other missing roles -> no automatic technology candidates unless a concrete V1 mapping exists

This keeps the correction generic at the observation boundary while avoiding invented topology behavior.

## Strategy policy

All six strategies use one shared pre-decision guard before their existing strategy logic:

1. If there is no required dependency gap, run the original strategy unchanged.
2. If a gap exists, consider only candidate technologies for the first deterministic gap.
3. Filter by the existing player-visible `technologyOptions.available` flag and the strategy’s existing affordability/runway policy.
4. Choose the cheapest affordable candidate deterministically by immediate + projected monthly cost, then technology ID.
5. If a required gap exists but no candidate is currently available/affordable, return `NO_OP` rather than spending the day on unrelated scaling.

This preserves differences between ORACLE/APM/METRICS/REACTIVE/YOLO/CHEAPSKATE through their existing runway multipliers while making hard dependency repair common correctness behavior.

## Metrics

Extend per-run metrics with:

- `peakDau`: maximum DAU observed during the run.
- `completedFeatureCount`: maximum number of completed community features observed.
- `missingRequiredDependencyDays`: days where at least one REQUIRED request step is MISSING.
- `peakMonthlyRevenue`: maximum `lastSettlement.revenue` observed.

These fields are included in CSV output. Summary grouping may continue to focus on the existing primary comparison metrics; raw CSV provides the diagnostic fields for Balance Pass 1 analysis.

## Verification

TDD requirements:

- observation test proves a queue-required workload creates an `EVENT_BUS` gap and deploying SQS removes it;
- strategy test proves all six strategies prioritize an affordable SQS dependency repair over ordinary scaling;
- strategy test proves a hard gap with no affordable/available remedy produces `NO_OP` instead of unrelated scale;
- metrics test proves peak/gap/feature/revenue counters are exact;
- runner smoke remains deterministic;
- seed 17 is rerun to confirm queue-aware behavior changes the failure pattern;
- then the full 2,700-run matrix is rerun before any game-balance constants are changed.
