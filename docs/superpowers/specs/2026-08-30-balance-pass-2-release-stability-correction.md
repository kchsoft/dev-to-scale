# Balance Pass 2 — Release Stability Threshold Correction

Date: 2026-08-30
Branch: `feature/balance-pass-2-release-readiness`
Parent design: `2026-08-30-balance-pass-2-release-readiness-design.md`

## Status

This document amends only the release-readiness capacity threshold from the parent Balance Pass 2 design. All Balance Pass 1 global constants and all other Balance Pass 2 behavior remain frozen.

## Evidence that invalidated the 85% assumption

The first full Balance Pass 2 matrix completed exactly 2,700 scenarios (5 frameworks × 3 databases × 30 seeds × 6 strategies) in GitHub Actions run `33314716856`.

The matrix preserved plausible global difficulty, but failed the two remaining strategy criteria:

- informed win rate: 32.30% vs riskier 30.74% = +1.56pp (required >= +10pp);
- informed post-release overload days/run: 9.83 vs riskier 11.00 = 89.4% (required <= 80%).

Dependency prevention did work: informed missing-required-dependency days/run were 7.02 vs riskier 19.61. Features released into overload also improved directionally (1.95 vs 2.69 per run), so the observation/action path itself is functioning.

The five-seed pilot `[5, 8, 17, 23, 29]` had shown a +11.1pp informed win advantage, but the full 30-seed matrix demonstrated that this sample was unusually favorable and cannot be used as acceptance evidence for win separation.

## Root cause

The original policy treated `<85%` projected effective load at the instant of release as sufficient headroom. The acceptance metric, however, evaluates overload during the feature's first seven live days.

Those are different contracts.

A seven-day stability target must leave enough headroom for ordinary post-release growth. At the largest ordinary positive organic day (+5%), seven consecutive positive days multiply load by approximately:

```text
1.05^7 ≈ 1.407
```

Therefore:

```text
0.85 × 1.05^7 ≈ 1.196
0.70 × 1.05^7 ≈ 0.985
```

An 85% launch point can become overloaded during the measured stability window even without a new infrastructure mistake. A 70% launch point is the bounded target that keeps the worst ordinary seven-day organic-growth sequence just under 100% in the absence of other events.

This is not a threshold sweep chosen to maximize win rate. It is a single causal correction that aligns the decision boundary with the already-approved seven-day release-stability metric.

## Corrected policy

Use one shared release stability target:

```text
RELEASE_STABILITY_TARGET_RATIO = 0.70
RELEASE_STABILITY_TARGET_PERCENT = 70
```

Apply it consistently to:

- METRICS pending-release max effective load;
- APM pending-release max effective load and diagnosed bottleneck;
- ORACLE pending-release current max effective ratio;
- ORACLE exact candidate target (`nextMax <= 0.70`).

Dependency readiness remains unchanged and still has priority over capacity readiness.

## Frozen values

Do not change while validating this correction:

- progression tail: `300k -> 900k -> 2M -> 3M`;
- phase-3 positive organic-day probability: `0.58`;
- exit monthly-revenue target: `143M`;
- ALB XLARGE throughput: `1,800`;
- 1,080-day horizon;
- starting cash;
- feature workloads/revenue modifiers;
- incident/viral probabilities and modifiers;
- infrastructure prices;
- framework/database modifiers;
- technology costs/durations;
- learning rules/order;
- automatic feature release timing.

## TDD evidence

RED run `33315883940` proved the old implementation rejected exactly the new boundary behavior:

- METRICS at 70% returned no readiness action;
- APM at a diagnosed 70% bottleneck returned `NO_OP`;
- ORACLE at exact 0.70 returned `NO_OP` with sufficient-headroom reasoning.

All unrelated tests remained green in that RED run (386 passed; only the three new boundary tests failed).

GREEN run `33315952063` passed the full normal verification pipeline after changing only the shared release-readiness threshold:

- tests;
- typecheck;
- production build;
- balance CLI smoke;
- deterministic rerun evidence;
- representative strategy traces;
- generated-artifact hygiene.

## Recalibration rule

1. Re-run the existing 450-scenario pilot shape across all 15 framework/database stacks and seeds `[5, 8, 17, 23, 29]` to catch regressions and inspect prevention/spend behavior.
2. Because this seed set is now known to be favorable, do **not** accept or reject the +10pp win criterion from the pilot alone.
3. If the pilot shows the intended overload-prevention direction without breaking difficulty or spend, run the exact 2,700-scenario full matrix over seeds 1–30.
4. Only the full matrix decides the hard strategy-signal and prevention criteria.
5. If the full matrix still fails, do not tune another threshold immediately. Diagnose the remaining causal gap first.

## Merge rule

PR #21 remains Draft and must not merge until the corrected full matrix satisfies the hard criteria or a new causal design is approved. PR #19 likewise remains unmerged while its playable baseline is still logically stacked with an unaccepted strategy-signal pass.
