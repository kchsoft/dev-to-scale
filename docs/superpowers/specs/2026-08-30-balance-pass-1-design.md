# Balance Pass 1 Design

Date: 2026-08-30
Branch: `feature/deterministic-balance-simulation-harness`
Base: `feature/playable-mvp`

## Context

The deterministic balance harness is now sufficiently corrected to use as balance evidence.

The final corrected 2,700-run matrix produced:

- WON: 0
- TIMEOUT: 2,200
- BANKRUPT: 500
- maximum peak DAU: 3,949,055
- maximum peak monthly revenue: 122,265,602
- 1,965 of 2,200 TIMEOUT runs completed exactly 9 features
- no TIMEOUT run reached the 10th feature

Harness correctness issues around required topology dependencies and ALB scale-out enablement were fixed before collecting this evidence. Resource-aware strategies now scale application instances normally instead of deadlocking at XLARGE.

The remaining zero-win result is therefore treated as a balance mismatch among late-game progression, late-game growth, and the exit revenue target.

## Current late-game mismatch

Current phase-3 progression thresholds are:

- 300,000 DAU
- 1,000,000 DAU
- 3,000,000 DAU
- 10,000,000 DAU

Phase-3 organic positive-day probability is 0.55. Organic magnitude is uniformly 1%-5%, so the expected organic contribution before incidents and operational penalties is only about +0.30% per day in phase 3.

The exit target is 900,000,000 monthly revenue.

After all ten features are complete, the guaranteed additive revenue modifiers are:

- AI_RECOMMENDATION: +0.1
- ADS: +0.3
- PREMIUM: +0.5

Total additive modifier: +0.9.

With `BASE_REVENUE_PER_AVG_DAU = 20`, fully monetized revenue is therefore 38 per average DAU. The current 900M target requires approximately 23.68M average DAU, far beyond both the 10M final progression threshold and the observed simulation envelope.

## Goal

Make a skilled 1080-day run winnable without making winning automatic.

The desired game shape is:

- informed infrastructure decisions materially improve win probability;
- reckless or excessively passive strategies remain meaningfully worse;
- bankruptcy remains possible;
- reaching the final feature is not itself the win condition;
- the player must sustain a production-scale service long enough to satisfy the monthly revenue settlement;
- framework/database choice may influence difficulty but must not dominate strategy quality.

## Approaches considered

### A. Lower progression and revenue targets only

Pros:

- minimal behavior change;
- easiest to reason about.

Cons:

- leaves phase 3 feeling stagnant;
- risks turning the last phase into waiting for thresholds rather than operating a growing system;
- weakens the value of handling incidents and capacity well because growth potential remains constrained.

Rejected as the primary approach.

### B. Increase phase-3 growth only

Pros:

- preserves existing progression and exit numbers.

Cons:

- reaching 900M still requires roughly 23.68M average DAU after full monetization;
- the growth increase required would be large enough to risk runaway exponential growth;
- would amplify differences from lucky viral/event sequences more than desired.

Rejected.

### C. Moderate combined retune

Adjust the three coupled late-game quantities together:

1. smooth the final progression thresholds;
2. modestly increase phase-3 positive organic probability;
3. make the exit target correspond to approximately the same operating scale as the final progression milestone.

Recommended and approved direction.

## First candidate values

### Progression

Keep slots 1-7 unchanged and change only the final three late-game thresholds:

Current:

```text
100
400
1,500
8,000
30,000
100,000
300,000
1,000,000
3,000,000
10,000,000
```

Candidate:

```text
100
400
1,500
8,000
30,000
100,000
300,000
900,000
2,000,000
5,000,000
```

Rationale:

- preserves the existing early/mid-game curve;
- removes the 3M -> 10M cliff;
- still requires a large late-game scale increase;
- places the final milestone slightly above the current corrected median peak DAU (~3.3M), so the existing game does not become trivially winnable by only lowering the threshold.

### Phase-3 growth

Change positive organic-day probability:

```text
0.55 -> 0.58
```

Expected organic contribution before penalties changes approximately:

```text
+0.30% / day -> +0.48% / day
```

This is intentionally a modest change. Viral events, incidents, failure rate, overload penalties, and capacity handling remain important.

### Exit monthly revenue

Change:

```text
900,000,000 -> 200,000,000
```

At full monetization:

```text
revenue per average DAU = 20 * 1.9 = 38
200,000,000 / 38 ~= 5,263,158 average DAU
```

This deliberately pairs the economic win target with the 5M final progression threshold.

The player should not win merely by touching 5M DAU. They must complete the final feature and then maintain roughly 5.26M average DAU across a settlement window.

## Tuning method

Balance Pass 1 will not change strategy heuristics while tuning game constants. Strategy behavior remains a measuring instrument.

The implementation sequence is deliberately staged so each variable's effect can be attributed:

1. update progression thresholds and run deterministic calibration evidence;
2. update exit revenue target and rerun the same calibration set;
3. update phase-3 positive probability and rerun;
4. run the full corrected 2,700-scenario matrix only after the candidate is plausible;
5. if acceptance bands are missed, adjust only one of the three balance values at a time and rerun the deterministic calibration set before another full matrix.

The same framework/database/seed/strategy tuples must be used for before/after comparisons.

## Acceptance criteria

These are target bands, not rules that force a particular strict strategy ordering.

### Overall outcome

For the full 2,700-run matrix:

- overall win rate: 15%-45%;
- overall bankruptcy rate: 10%-35%;
- timeout remains non-zero;
- at least four of six strategies record wins;
- no strategy exceeds 80% wins.

The purpose is to keep winning achievable but uncertain.

### Strategy signal

Define the informed cohort as:

- APM_AWARE
- METRICS_AWARE
- ORACLE

Define the intentionally flawed/riskier cohort as:

- REACTIVE_BASIC
- YOLO_SCALE
- CHEAPSKATE

Acceptance:

- informed-cohort aggregate win rate should exceed the flawed/riskier cohort by at least 10 percentage points;
- strict ordering between APM, METRICS, and ORACLE is not required;
- strict ordering among the flawed strategies is not required.

This avoids overfitting the game to the harness's local ORACLE heuristic while still requiring better information and decisions to matter.

### Game length

Among winning runs:

- median winner day should be between 500 and 1,000;
- wins before day 365 should be rare rather than the normal outcome.

The 1080-day horizon remains unchanged.

### Stack fairness

Framework/database choices may shift difficulty, but no single stack should make strategy irrelevant.

As a review signal, compare informed-cohort win rate for each of the 15 framework/database combinations against the global informed-cohort rate. Large outliers should be investigated before accepting the pass.

No hard percentage threshold is imposed in Pass 1 because framework/database differentiation is part of the game's intended character.

## Non-goals

Balance Pass 1 does not change:

- 1080-day simulation horizon;
- starting cash;
- infrastructure prices;
- framework or database load profiles;
- incident frequency/severity;
- viral event frequency or modifiers;
- feature workloads;
- feature revenue modifiers;
- technology build costs;
- learning costs;
- strategy heuristics;
- simulation observation boundaries.

Those remain stable so the effect of this pass can be attributed to the three intended late-game balance axes.

## Tests and verification

### Unit/regression tests

Use TDD for changed policies:

- progression tests assert the new final threshold sequence;
- growth tests assert the phase-3 probability behavior through deterministic random boundaries rather than implementation-private state;
- finance tests assert the new exit target and the mathematical relationship between fully monetized average DAU and the target;
- existing game-engine win tests continue to verify that progression completion and monthly revenue settlement are both required.

### Fast branch verification

Before any full matrix:

- `npm test`
- `npm run typecheck`
- `npm run build`
- filtered deterministic balance run
- same-scenario rerun diff

### Full evidence

The final candidate must run the exact 2,700 matrix:

```text
5 frameworks × 3 databases × 30 seeds × 6 strategies
```

Verify:

- exactly 2,700 rows;
- exactly 450 rows per strategy;
- exactly 180 rows per framework/database pair;
- seeds 1-30 present;
- zero duplicate scenario keys;
- same-scenario determinism remains intact.

The full matrix stays out of normal PR CI and is executed only as one-off balance evidence.

## Decision rule after Pass 1

If the candidate lands inside the broad acceptance bands, stop tuning and preserve the evidence. Do not optimize toward a single ideal win rate.

If it misses:

- too few wins while many runs reach 5M: lower the exit target before increasing growth;
- too few runs reach 5M: adjust phase-3 growth before lowering the final threshold again;
- too many wins: reduce phase-3 positive probability first;
- informed and flawed strategies have similar win rates: investigate whether the new growth curve overwhelms operational decision quality before changing strategy code.

This keeps the tuning process causal and prevents simultaneous guesswork.
