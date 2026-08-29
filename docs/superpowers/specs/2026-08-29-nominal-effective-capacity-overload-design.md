# Nominal / Effective Capacity & Overload Request Flow Design

Date: 2026-08-29
Base branch: `feature/playable-mvp`
Feature branch: `feature/nominal-effective-capacity`

## Goal

Make capacity limits behave like a real operational system while keeping the simulation readable and gameable.

The player should be able to distinguish:

1. a common recommended capacity baseline,
2. the actual hard limit of the chosen technology / size / proficiency,
3. overload that immediately causes request loss,
4. incidents that independently degrade or fully disable a node,
5. downstream load that changes according to how much traffic actually passed upstream bottlenecks.

This design intentionally keeps the current four resource axes only:

- `CPU`
- `IO`
- `THROUGHPUT`
- `STORAGE`

No new Memory, Connection Pool, Network Bandwidth, or other axes are introduced in this iteration.

---

## 1. Core Capacity Model

### 1.1 Nominal Capacity

`nominalCapacity` is the technology-neutral baseline for a given node size and resource axis.

It defines the common UI reference point where `100%` means:

> the recommended baseline for this size has been fully consumed.

For example, if APP SMALL has nominal CPU capacity `100`, a demand of `105` must display as `105%` regardless of framework choice.

Nominal capacity is the value used for player-facing load percentages and warning states.

### 1.2 Effective Capacity

`effectiveCapacity` is the actual hard processing limit after technology characteristics and proficiency/tuning are applied.

Conceptually:

```text
Effective Capacity
= Nominal Capacity
× Product / Framework Modifier
× Proficiency / Tuning Modifier
× Structural Scale Modifier
```

Structural scale includes things such as APP instance count and DB read replicas where applicable.

The exact factors already represented in the current engine remain authoritative; this change separates their semantic roles instead of inventing duplicate threshold constants.

### 1.3 Why the two values must be separate

A framework can exceed the common recommended baseline while still having headroom.

Example:

```text
Spring Boot SMALL CPU
Nominal Capacity   100
Framework Modifier 1.18
Effective Capacity 118
Demand             105

Displayed Load      105%
Effective Usage      89%
State               WARNING
```

A framework can also have an effective limit below the nominal baseline.

Example:

```text
NestJS SMALL CPU
Nominal Capacity   100
Framework Modifier 0.92
Effective Capacity 92
Demand             95

Displayed Load      95%
Effective Usage     103%
State               OVERLOAD
```

This lets framework differences become directly visible gameplay rather than hidden arithmetic.

---

## 2. Resource Load Contract

`NodeResourceLoad` should distinguish display load from hard-limit usage.

Target shape:

```ts
export interface NodeResourceLoad {
  readonly resourceKind: NodeResourceKind;
  readonly demand: number;
  readonly nominalCapacity: number;
  readonly effectiveCapacity: number;
  readonly nominalRatio: number;
  readonly effectiveRatio: number;
}
```

Where:

```text
nominalRatio   = demand / nominalCapacity
effectiveRatio = demand / effectiveCapacity
```

Zero-capacity handling must remain safe and deterministic.

Compatibility aliases may temporarily exist during migration if necessary, but the final operational model should not rely on a single ambiguous `capacity` or `ratio` field.

---

## 3. Node Load Semantics

A node's overall displayed load is not an average.

It is the hottest resource's nominal ratio:

```text
node.nominalLoadRatio = max(resource.nominalRatio)
```

A node's actual hard-limit pressure is the hottest effective ratio:

```text
node.effectiveLoadRatio = max(resource.effectiveRatio)
```

Example:

```text
APP CPU 100%
APP IO   30%

Overall displayed load = 100%
```

This preserves the existing bottleneck philosophy: one saturated resource is enough to constrain the node even when other resources have headroom.

---

## 4. Player-Facing Status Rules

Red always wins over orange.

For each resource:

```ts
if (effectiveRatio > 1) {
  status = 'OVERLOAD'; // red
} else if (nominalRatio >= 1) {
  status = 'WARNING'; // orange
} else {
  status = 'NORMAL';
}
```

Examples:

### Spring Boot CPU

```text
Load       105%
Hard Limit 118%
State      WARNING / orange
```

```text
Load       119%
Hard Limit 118%
State      OVERLOAD / red
```

### NestJS CPU

```text
Load       95%
Hard Limit 92%
State      OVERLOAD / red
```

The UI should therefore be able to show both the common displayed load and the effective hard limit.

---

## 5. Overload Immediately Causes Capacity Failure

Exceeding effective capacity must have immediate operational consequences.

The service does not wait for an Incident before requests begin to fail.

For one resource:

```text
resourceCapacityHealth
= min(1, effectiveCapacity / demand)
= min(1, 1 / effectiveRatio)
```

Example:

```text
Demand             130
Effective Capacity 118

Capacity Health = 118 / 130 = 0.9077
Capacity Failure = 9.23%
```

### 5.1 Multiple resources on one node

CPU and IO failures are not added together.

The most constrained resource defines the node's capacity processing ratio:

```text
nodeCapacityHealth
= min(resourceCapacityHealth for all resources)
= min(1, 1 / maxEffectiveRatio)
```

Example:

```text
CPU effectiveRatio = 1.10
IO  effectiveRatio = 0.73

Node capacity health = 1 / 1.10 = 0.909
```

The CPU bottleneck limits the node even though IO still has headroom.

---

## 6. Capacity Failure and Incident Failure Are Independent

Capacity overload and Incidents represent different failure mechanisms.

### Capacity overload

Too much traffic arrives for the node's effective processing limit.

It causes immediate partial failure according to the processing ratio.

### Incident

The node itself is unhealthy because of an operational event.

Existing incident traffic health remains conceptually separate:

- MINOR -> partial degradation
- MAJOR -> heavy degradation
- CRITICAL -> node unavailable

When both exist:

```text
effectiveNodeHealth
= nodeCapacityHealth
× incidentHealth
```

Example:

```text
Capacity Health = 0.91
Incident Health = 0.80

Effective Node Health = 0.728
```

Existing incident probability rules remain in place. Overload may therefore simultaneously cause immediate capacity failure and increase the chance of a separate incident.

This feature must not remove the distinction between overload and incident.

---

## 7. Request-Flow-Based Downstream Demand

This is a core gameplay rule.

Demand must follow the traffic that actually passed upstream nodes.

If an upstream node drops traffic because of capacity or incident health, downstream nodes must only receive the surviving traffic.

Example:

```text
Incoming: 100

ALB passes 80%
-> APP receives 80

APP passes 90% of what arrived
-> DB receives 72
```

Therefore an upstream bottleneck can mask downstream bottlenecks.

When the player fixes the upstream bottleneck, the next bottleneck can become visible.

Expected gameplay loop:

```text
Traffic growth
  -> ALB bottleneck
  -> ALB scale-up
  -> APP bottleneck revealed
  -> APP scale-out / scale-up
  -> DB bottleneck revealed
  -> Redis / replica / DB resize decision
```

This is intentional and should be treated as a core operating-game mechanic rather than an incidental side effect.

---

## 8. Request Trace Integration

The existing request-trace model already propagates a node health ratio through the resolved route.

Capacity health should become another node-health source that participates in the same request flow.

Conceptually:

```text
Node Capacity Health
       ×
Incident Health
       =
Effective Node Health
       -> Request Trace
       -> Downstream arrival ratio
       -> Final success ratio
```

The implementation may require iterative or staged load calculation because capacity health depends on demand, while downstream demand depends on upstream pass-through.

The design requirement is the result, not a particular algorithm:

> each node's demand must reflect the traffic that actually reached that node after all upstream required steps.

The implementation must remain deterministic and must not introduce simulation instability or order-dependent results unrelated to route order.

---

## 9. Required vs Optional Route Steps

`REQUIRED` and `OPTIONAL` steps must not be treated identically.

### REQUIRED

Capacity or incident degradation reduces the primary request success ratio and therefore reduces traffic reaching later required nodes.

### OPTIONAL

An optional secondary step must not automatically cause the primary synchronous request to fail merely because that optional component is degraded.

Examples include asynchronous queue work that can be decoupled from the primary request.

For this iteration:

- required path capacity health affects primary request success,
- optional path overload must still generate its own resource pressure / alert / operational diagnosis,
- optional failure should not be multiplied into primary request success unless the route contract explicitly requires it.

The existing optional queue fallback-to-APP behavior when no queue is deployed remains separate and should continue to work.

---

## 10. Capacity Sources by Node Type

The four generic resource axes remain unchanged.

### APP

Resources:

- CPU
- IO

Nominal capacity comes from the APP size baseline.

Effective capacity applies framework characteristics, instance count, and proficiency/tuning.

Framework characteristics should remain resource-specific.

Examples from the current model:

- Spring Boot: stronger CPU, weaker IO
- NestJS: weaker CPU, stronger IO
- Gin: strong CPU
- FastAPI: stronger IO than CPU
- ASP.NET Core: balanced

### DB

Resources:

- CPU
- IO

Nominal capacity comes from the DB size baseline.

Effective capacity applies database characteristics, replica effects, and proficiency/tuning.

Read replicas may continue to affect CPU and IO differently.

### ALB / Redis / Queue

Resource:

- THROUGHPUT

Nominal capacity comes from the size profile.

Effective capacity applies technology proficiency/tuning where the current engine already supports it.

### Storage

Resource:

- STORAGE

Nominal and effective capacity are identical unless a real technology/tuning modifier exists. This design does not invent one merely for symmetry.

---

## 11. Observability and UI

The player-facing load percentage should use nominal load.

Recommended resource presentation:

```text
Spring Boot APP
Overall Load 105%   WARNING

CPU 105%
Hard Limit 118%

IO 40%
Hard Limit 96%
```

When overloaded:

```text
CPU 119%
Hard Limit 118%
OVERLOAD
Capacity Failure 0.8%
```

The exact visual wording can remain an Application/UI concern, but the view model must expose enough information to distinguish:

- displayed nominal load,
- effective hard limit,
- warning vs overload,
- capacity-induced failure where relevant.

BASIC observability can continue to expose aggregate node load.

METRICS/APM should expose resource-level nominal/effective information.

APM/diagnosis should be able to explain which exact resource exceeded its effective hard limit.

---

## 12. Growth, Health, P95, Alerts, and Existing Generic Bottleneck Logic

The previous Generic Operational Bottleneck Engine remains the structural source of bottleneck selection.

However, consumers must use the correct ratio for their purpose.

### Player-facing load and warning

Use nominal ratio.

### Actual overload / request failure

Use effective ratio.

### Primary operational bottleneck

The structural engine should support selecting the meaningful hottest resource without reintroducing APP/DB/ALB-specific whitelists.

Where a consumer cares about actual service failure, effective pressure is authoritative.

Where a consumer displays the common 100% baseline, nominal pressure is authoritative.

Growth / Health / P95 must continue to use generic topology-scoped pressure and request success semantics rather than fixed node-kind candidate lists.

Existing failure-rate effects, P95 curve, health thresholds, and incident semantics should be preserved unless a direct inconsistency is exposed by the new capacity failure source.

Any necessary formula adjustment must be narrowly scoped and regression-tested; this design does not authorize unrelated balance changes.

---

## 13. Feature / Change Impact Preview

Previewed load must use the same nominal/effective and request-flow rules as live load.

A preview must not use a simplified capacity model that disagrees with the running simulation.

Example desired output semantics:

```text
ALB SMALL -> MEDIUM

ALB 125% -> 63%
APP 82%  -> 117%  projected next bottleneck
```

This makes hidden downstream bottlenecks legible before the player spends money and prevents the flow-based model from feeling arbitrary.

The first implementation does not require a new dedicated resize-preview UI if one does not already exist, but all existing preview APIs must compute against the same engine rules so a future UI can expose this safely.

---

## 14. Incident Risk

Existing incident generation behavior remains.

The current engine already raises incident risk as node load rises.

This feature must ensure that incident risk uses the ratio representing actual technical stress, not a misleading display-only ratio where that distinction matters.

The exact mapping must be chosen consistently during implementation and covered by tests.

No new incident types, probability bands, or severity distributions are introduced by this design.

---

## 15. Invariants

The implementation must preserve these invariants:

1. The generic resource axes remain `CPU`, `IO`, `THROUGHPUT`, `STORAGE`.
2. Overall node load is based on the hottest resource, never an average.
3. `100%` in player-facing load means the common nominal baseline.
4. Actual failure begins only when demand exceeds effective capacity.
5. Effective capacity is derived from real capacity modifiers; do not maintain duplicate per-product overload thresholds.
6. Capacity overload causes immediate partial request failure.
7. Incidents remain a separate health/failure mechanism.
8. Upstream pass-through limits downstream demand.
9. Fixing an upstream bottleneck may reveal a downstream bottleneck.
10. Required path failure affects primary request success.
11. Optional path failure does not automatically fail the primary request.
12. External services remain outside player-owned operational capacity pressure unless explicitly modeled in a future feature.
13. Same-kind decoy nodes must never affect the current service topology.
14. Live load and preview load must use the same engine semantics.
15. No fixed node-kind bottleneck whitelist may be reintroduced.

---

## 16. Non-Goals

This iteration does not add:

- Memory pressure
- Connection pool pressure
- Network bandwidth as a separate axis
- Retry storms
- Backpressure queues as a new simulation subsystem
- Per-request timeout distributions
- Autoscaling policies
- New incident types
- New queue delivery guarantees
- New storage failure modes
- CDN
- Redis clustering
- Worker autoscaling
- Cost rebalance unrelated to the capacity semantics

Those may be future layers, but they are not required to make this model coherent.

---

## 17. Testing Requirements

At minimum, implementation tests must cover:

### Capacity contract

- nominal and effective capacity are both exposed,
- nominal ratio and effective ratio differ correctly for framework modifiers,
- node aggregate load uses hottest resource.

### Framework behavior

- Spring Boot CPU can be above nominal 100% but below effective hard limit,
- Spring Boot IO can overload before nominal 100% when its effective limit is lower,
- NestJS CPU can overload before nominal 100%,
- NestJS IO can remain healthy above nominal 100% when effective headroom exists.

### Immediate capacity failure

- no capacity failure at or below effective capacity,
- capacity failure begins immediately above effective capacity,
- failure ratio matches `1 - effectiveCapacity / demand`,
- hottest effective resource controls node capacity health.

### Request flow

- upstream overload reduces downstream arrival and demand,
- relieving the upstream bottleneck can reveal a downstream bottleneck,
- downstream overload does not retroactively reduce work already done upstream,
- required nodes affect primary request success,
- optional nodes do not automatically fail primary request success.

### Incident composition

- capacity health and incident health multiply,
- CRITICAL incident can still fully stop a node,
- overload can coexist with incident risk without conflating the two mechanisms.

### Generic topology behavior

- ALB, APP, Redis, DB, Queue, and Storage continue to use the generic operational model,
- external services are excluded,
- same-kind decoy loads are excluded,
- no fixed APP/DB-only whitelist returns.

### Regression

- existing growth semantics remain unless directly affected by the new real failure rate,
- existing P95/health thresholds remain,
- existing finance/progression/feature development behavior remains,
- live and preview calculations agree on capacity semantics,
- full test suite, typecheck, and production build pass.

---

## 18. Success Criteria

This feature is complete when the following player experience is possible:

```text
Spring Boot APP
CPU 108%  WARNING
Hard limit 118%
No capacity failure yet
```

then later:

```text
Spring Boot APP
CPU 130%  OVERLOAD
Hard limit 118%
Capacity failures are occurring
```

and, after an upstream scale action:

```text
Before:
ALB 125% OVERLOAD
APP 82%
DB 61%

After ALB resize:
ALB 63%
APP 113% OVERLOAD
DB 79%
```

The player should understand that fixing one bottleneck changes the traffic reaching the rest of the topology and can reveal the next operational constraint.

That sequence is the intended gameplay loop.