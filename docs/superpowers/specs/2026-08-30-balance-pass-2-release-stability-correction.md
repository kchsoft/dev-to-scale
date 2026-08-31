# Balance Pass 2 — Rejected 70% Pre-Release Threshold Experiment

Date: 2026-08-30
Branch: `feature/balance-pass-2-release-readiness`
Parent design: `2026-08-30-balance-pass-2-release-readiness-design.md`

## Status

**Rejected.** The 70% value must not replace the existing 85% pre-release readiness threshold.

This document records the experiment so the same hypothesis is not repeated. Production strategy code and boundary tests were restored to the original 85% policy in commit `161af3532aaa1a082536f77b13b1118d729372e3`.

## Why the experiment was attempted

The first full Balance Pass 2 matrix completed exactly 2,700 scenarios (5 frameworks × 3 databases × 30 seeds × 6 strategies) in GitHub Actions run `33314716856`.

The matrix preserved plausible global difficulty, but failed the two remaining strategy criteria:

- informed win rate: 32.30% vs riskier 30.74% = +1.56pp (required >= +10pp);
- informed post-release overload days/run: 9.83 vs riskier 11.00 = 89.4% (required <= 80%).

Dependency prevention did work: informed missing-required-dependency days/run were 7.02 vs riskier 19.61. Features released into overload also improved to 1.95 vs 2.69 per run (72.5%). This distinction later became important: the existing pre-release readiness path prevents bad launches, but does not sufficiently protect the seven live days after launch.

The initial hypothesis was that 85% simply left too little seven-day growth headroom, so a single bounded 70% pre-release target was tested.

## TDD experiment

RED run `33315883940` added three boundary tests at 70% and proved that the existing policy rejected exactly those actions. All unrelated tests remained green (386 passed; only the three experimental boundary tests failed).

Experiment commit `05790b862c4abfbbbf90c069d29622f054512ec5` changed only the release-readiness capacity threshold to 70%.

GREEN run `33315952063` passed the normal verification pipeline after that change.

## Paired 450-scenario result

The existing five-seed pilot shape was re-run over all 15 framework/database stacks with seeds `[5, 8, 17, 23, 29]`. Because the riskier strategies do not use release readiness, their rows were byte-for-behavior identical between the 85% and 70% policies, giving a useful paired experiment for the informed strategies.

The 70% pre-release policy regressed the intended outcomes:

| Metric | 85% pre-release | 70% pre-release | Result |
| --- | ---: | ---: | --- |
| informed win rate | 47.11% | 43.11% | worse by 4.0pp |
| informed advantage vs riskier | +11.11pp | +7.11pp | worse |
| post-release overload days/run | 10.15 | 10.64 | worse |
| features released into overload/run | 1.93 | 2.08 | worse |
| premature capacity actions/run | 0.63 | 4.87 | severe regression |
| low-utilization expanded-node days/run | 334.15 | 424.88 | severe regression |
| infrastructure exposure/run | ~61.10M | ~67.44M | +~6.34M |
| failure days/run | 228.25 | 247.31 | worse |
| overload days/run | 186.34 | 204.03 | worse |

All three informed strategies lost four percentage points of win rate on the paired sample:

- METRICS_AWARE: 50.67% -> 46.67%;
- APM_AWARE: 52.00% -> 48.00%;
- ORACLE: 38.67% -> 34.67%.

The terminal-status transitions explain the net loss: 19 paired scenarios changed TIMEOUT -> WON, but 28 changed WON -> TIMEOUT.

## Trace diagnosis

Diagnostic run `33316638935` compared three representative scenarios that were WON under 85% but TIMEOUT under the 70% experiment.

The first divergence consistently happened while **live load was still around 60%**, because the 70% policy reacted to projected pending-release pressure:

- METRICS_AWARE, ASP.NET Core/MongoDB/seed 5, day 283: live app I/O 60%; 85% = `NO_OP`; 70% = resize because projected release load was 71%.
- APM_AWARE, ASP.NET Core/MySQL/seed 5, day 283: live app I/O 60%; 85% = `NO_OP`; 70% = resize because projected APM release diagnosis was 71%.
- ORACLE, ASP.NET Core/MySQL/seed 29, day 362: live MySQL I/O 60%; 85% = `NO_OP`; 70% = database scale-out because projected release ratio was 0.75x.

This matches the aggregate spike in premature capacity actions and low-utilization expanded-node days. The 70% value was applied to the wrong signal at the wrong time.

## Actual remaining gap

The same traces expose a different, narrower problem after a feature is actually live.

Under the restored 85% policy, representative post-release windows include:

- METRICS_AWARE feature release: live hottest pressure `73, 73, 75, 77, 79, 81, 84%` over the seven-day window; every day is `NO_OP` because the normal live threshold is 85%.
- APM_AWARE feature release: `85, 88, 92, 93, 95, 100, 101%`; ALB enablement starts only on the final day after overload has already consumed the measured stability window.
- ORACLE feature release: `75, 77, 77, 79, 79, 81, 84%`; all seven days are treated as sufficient headroom.

Late-game traces also show some windows where pressure is already above 100% but no affordable remedy remains. Earlier **live** intervention during the release window can therefore matter without requiring speculative pre-release overprovisioning.

This reconciles the original full-matrix metrics:

- `featuresReleasedIntoOverload` improves strongly because pre-release readiness works;
- `postReleaseOverloadDays` improves too little because after release the strategy immediately falls back to the generic 85% live threshold.

## Design implication

Keep the existing 85% **projected pre-release readiness** threshold unchanged.

The next causal experiment should instead add a bounded **post-release stability watch**:

- active only for the same seven live days already measured by the acceptance metric;
- based only on actual live observed pressure, not pending-release projections;
- starts considering a capacity remedy at live effective pressure >=70%;
- never acts below 70%, preserving the existing definition of a premature capacity action;
- applies only to informed strategies (METRICS_AWARE, APM_AWARE, ORACLE);
- protects current live stability before speculative capacity preparation for the next feature;
- leaves dependency readiness, global growth, prices, workloads, progression, learning and automatic release timing unchanged.

The 70% number is therefore not a new global threshold. It is a narrowly scoped lower intervention floor for **observed live pressure during an active post-release stability window**.

## Merge rule

PR #21 remains Draft. Do not merge PR #21 or its stacked playable baseline while the full strategy-signal criteria remain unmet. A new full 2,700-scenario matrix is justified only after the post-release stability watch passes targeted tests and a paired pilot without repeating the overinvestment regression recorded here.
