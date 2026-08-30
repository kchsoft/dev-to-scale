# Post-Release Stability Watch Design

Date: 2026-08-30
Branch: `feature/balance-pass-2-release-readiness`
Parent: `2026-08-30-balance-pass-2-release-readiness-design.md`
Rejected experiment: `2026-08-30-balance-pass-2-release-stability-correction.md`

## Goal

Improve the strategy signal specifically inside the already-defined seven-day post-release stability window without lowering the existing 85% projected pre-release readiness threshold or changing global balance constants.

## Evidence

The full 2,700-scenario Balance Pass 2 matrix improved dependency readiness and features released into overload, but informed strategies still failed the required post-release overload and win-separation criteria.

The rejected 70% pre-release experiment proved that applying 70% to projected pending-release pressure is too early: paired traces diverged while live pressure was still near 60%, causing premature capacity actions, low-utilization infrastructure, higher cost exposure and lower win rate.

The same traces show the opposite gap after a release is live. Examples under the restored 85% policy:

- METRICS_AWARE: live hottest pressure 73 -> 73 -> 75 -> 77 -> 79 -> 81 -> 84% across a release window, all NO_OP.
- APM_AWARE: 85 -> 88 -> 92 -> 93 -> 95 -> 100 -> 101%; ALB enablement begins only after the measured window is mostly consumed.
- ORACLE: 75 -> 77 -> 77 -> 79 -> 79 -> 81 -> 84%, all treated as sufficient headroom.

Therefore the next intervention should be scoped to actual live pressure during the active seven-day window.

## Policy

Keep pre-release readiness unchanged:

- projected pending-release threshold: 85%;
- dependency readiness keeps first priority inside the pre-release path;
- ORACLE release target remains <=0.85.

Add a post-release stability watch for informed strategies only:

- active only while at least one seven-day release window is active;
- uses actual current observed load, never release preview load;
- starts considering a capacity remedy at effective live pressure >=70%;
- never acts below 70%;
- live stability action is evaluated before speculative readiness for the next feature;
- action affordability still protects the learning reserve and monthly cash runway;
- no changes to growth, prices, framework/database modifiers, feature workloads, release timing, progression or learning.

## State propagation

`SimulationMetricsCollector` already owns the canonical seven-day release-window lifecycle. Add a read-only query:

```ts
hasActiveReleaseWindow(): boolean
```

In `simulation-runner.ts`, capture this value before `recordOperationalDay()` decrements the current window, then pass it into strategy context:

```ts
interface StrategyDecisionContext {
  readonly protectedLearningReserve: number;
  readonly postReleaseStabilityWindowActive?: boolean;
}
```

The property is optional so existing unit-test context literals remain source-compatible. Production runner always passes an explicit boolean.

## Strategy behavior

### METRICS_AWARE

When the window is active, sort live `resourceLoads` by effective percent. If the hottest resource is >=70%, choose the first affordable remedy using the existing resource-remedy ordering.

### APM_AWARE

When the window is active, use the current live diagnosis top bottleneck. If its effective percent is >=70%, choose the cheapest affordable diagnosis-supported remedy.

If no usable APM diagnosis exists, fall back to the METRICS live-resource watch rather than using release preview data.

### ORACLE

When the window is active and the exact current max effective ratio is >=0.70, rank the same workload-aware current-live candidates used by normal ORACLE behavior.

Candidate evaluation uses the normal live preview functions, not `previewReleaseAction`. Preserve the existing meaningful-relief floor (2%). Prefer candidates that reduce live max pressure to <=0.85; otherwise use relief per one-month cost with deterministic candidate ordering.

## Action intent

Extend action metadata with:

```ts
'POST_RELEASE_STABILITY_CAPACITY'
```

This remains executable-identical to the underlying resize/scale/build action. `SimulationMetricsCollector.recordPreventativeAction()` counts this as preventative capacity so diagnostics can compare pre-release and post-release prevention together while action reasons distinguish them.

## Ordering

For informed strategies:

1. post-release live stability watch;
2. existing pre-release readiness;
3. existing normal live strategy behavior.

This ordering prevents a projected next-feature action from displacing protection of a currently live release window.

## Implementation verification

Normal CI run `33317599608` passed after the three informed strategies were wired to the live stability watch:

- 396 tests;
- typecheck;
- production build;
- balance CLI smoke;
- deterministic rerun evidence;
- representative strategy traces;
- generated-artifact hygiene.

Targeted paired trace run `33317801535` compared the watch against restored-85 baseline commit `161af3532aaa1a082536f77b13b1118d729372e3` and passed all causal assertions.

The previously harmful pre-release divergence points remain unchanged:

- METRICS_AWARE, ASP.NET Core/MongoDB/seed 5, day 283: live app I/O 60%, both policies `NO_OP`.
- APM_AWARE, ASP.NET Core/MySQL/seed 5, day 283: live app I/O 60%, both policies `NO_OP`.
- ORACLE, ASP.NET Core/MySQL/seed 29, day 362: live MySQL I/O 60%, both policies `NO_OP`.

The first watch-specific divergences occur only after an actual release and at live pressure above the new floor:

- METRICS_AWARE: day 284, live ASP.NET Core I/O 73%, baseline `NO_OP`, watch resizes app server.
- APM_AWARE: day 284, live diagnosed ASP.NET Core I/O 73%, baseline `NO_OP`, watch resizes app server.
- ORACLE: day 459, live exact MySQL I/O 0.75x, baseline `NO_OP`, watch starts Redis.

Every `stabilize live` action in the three traces occurred inside a computed seven-day release window and at a parsed live pressure >=70%. All three representative scenarios remained `WON` under both baseline and watch policies.

Additional observed boundary examples include APM acting at exactly 70% and METRICS acting at 71% after release, while the earlier 60% live-load speculative actions from the rejected pre-release experiment no longer occur.

## Acceptance path

1. RED unit tests for active-window boundary and no-action outside window / below 70%.
2. GREEN normal CI.
3. Targeted representative traces proving the first action occurs on live >=70%, not projected pressure with live <70%.
4. Paired 450-scenario pilot over the same 15 stacks and seeds `[5,8,17,23,29]`.
5. Reject immediately if premature capacity actions or low-utilization expanded-node days reproduce the 70% pre-release regression.
6. Only if the pilot improves post-release overload without material strategy-economy regression, run the exact 2,700-scenario full matrix.

Steps 1-3 are complete. The next gate is the paired 450-scenario pilot.

## Merge rule

PR #21 remains Draft until the full matrix satisfies the hard strategy-signal criteria. Do not merge based on targeted traces or the favorable five-seed pilot alone.
