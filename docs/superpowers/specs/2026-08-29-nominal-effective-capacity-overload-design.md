# Nominal / Effective Capacity & Overload Request Flow Design

Date: 2026-08-29
Base branch: `feature/playable-mvp`
Feature branch: `feature/nominal-effective-capacity`

## Goal

Make capacity limits behave like a real operational system while keeping the simulation readable and gameable.

The player must be able to distinguish:

1. a common recommended capacity baseline,
2. the actual hard limit of the chosen technology / scale / proficiency,
3. overload that immediately causes partial request loss,
4. incidents that independently degrade or disable a node,
5. downstream load that changes according to how much traffic actually passed upstream bottlenecks.

This iteration keeps exactly four generic resource axes:

- `CPU`
- `IO`
- `THROUGHPUT`
- `STORAGE`

No Memory, Connection Pool, Network Bandwidth, or other new resource axis is added.

---

## 1. Capacity Has Two Meanings

### 1.1 Nominal Capacity

`nominalCapacity` is the common player-facing baseline after structural scaling, but before product/runtime/proficiency advantages or disadvantages.

Conceptually:

```text
Nominal Capacity
= Size Baseline
× Structural Scale
```

Structural scale includes capacity added by actions such as:

- adding APP instances,
- adding DB replicas using their existing resource-specific CPU / IO factors,
- resizing a node to MEDIUM / LARGE / XLARGE.

This rule is important: scaling the infrastructure must reduce the displayed percentage as well as the real hard-limit usage.

`100%` in the UI means:

> the common recommended baseline of the currently provisioned structure is fully consumed.

Example:

```text
APP SMALL nominal CPU per instance = 100
2 APP instances                    = 200 nominal CPU
Demand                             = 160
Displayed Load                     = 80%
```

### 1.2 Effective Capacity

`effectiveCapacity` is the actual hard processing limit after technology/product characteristics and proficiency/tuning are applied to nominal capacity.

Conceptually:

```text
Effective Capacity
= Nominal Capacity
× Product / Framework Modifier
× Proficiency / Tuning Modifier
```

Do not create duplicate product-specific overload thresholds. Existing real modifiers remain the source of truth.

Example:

```text
Spring Boot SMALL CPU
Nominal Capacity    100
Framework Modifier  1.18
Effective Capacity  118
Demand              105

Displayed Load      105%
Effective Usage      89%
State               WARNING
```

A technology can also fail before nominal 100% if its effective modifier is below 1.

```text
NestJS SMALL CPU
Nominal Capacity    100
Framework Modifier  0.92
Effective Capacity   92
Demand               95

Displayed Load       95%
Effective Usage      103%
State               OVERLOAD
```

This is intentional gameplay: framework characteristics are visible rather than hidden arithmetic.

---

## 2. Resource Load Contract

Target resource-load semantics:

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

Compatibility aliases may exist temporarily during migration, but the final operational model must not depend on one ambiguous `capacity` or `ratio` field.

---

## 3. Node Load Is the Hottest Resource

A node's overall load is never an average.

Displayed node load:

```text
node.nominalLoadRatio = max(resource.nominalRatio)
```

Actual technical pressure:

```text
node.effectiveLoadRatio = max(resource.effectiveRatio)
```

Example:

```text
CPU 100%
IO   30%

Overall displayed load = 100%
```

One saturated resource constrains the node even when every other resource has headroom.

---

## 4. Player-Facing Status

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

```text
Spring CPU
Load       105%
Hard Limit 118%
WARNING
```

```text
Spring CPU
Load       119%
Hard Limit 118%
OVERLOAD
```

```text
Nest CPU
Load       95%
Hard Limit 92%
OVERLOAD
```

Therefore the UI must be able to expose both common load percentage and effective hard limit.

---

## 5. Effective-Capacity Overload Causes Immediate Partial Failure

A node does not wait for an Incident before requests begin failing.

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

At or below effective capacity, capacity failure is zero.

Above effective capacity, failure begins immediately.

### 5.1 Multiple resources on one node

CPU and IO failure percentages are not added.

The most constrained resource controls the node's processing ratio:

```text
nodeCapacityHealth
= min(resourceCapacityHealth for every resource)
= min(1, 1 / maxEffectiveRatio)
```

Example:

```text
CPU effectiveRatio = 1.10
IO  effectiveRatio = 0.73

Node Capacity Health = 0.909
```

CPU limits the node even though IO has headroom.

---

## 6. Capacity Failure and Incident Failure Are Separate

Capacity overload means too much workload is arriving for the actual processing limit.

Incident failure means the node itself is unhealthy because of an operational event.

Existing incident traffic-health semantics remain separate.

When both apply:

```text
effectiveNodeHealth
= nodeCapacityHealth
× incidentHealth
```

Example:

```text
Capacity Health = 0.91
Incident Health = 0.80
Effective Health = 0.728
```

A CRITICAL incident can still reduce node health to zero regardless of spare capacity.

Overload can therefore simultaneously:

- cause immediate partial capacity failure,
- increase incident risk,
- later coexist with a separate incident.

Do not conflate the two mechanisms.

---

## 7. Downstream Demand Follows Actual Request Flow

Demand must reflect the traffic that really reaches a node.

If an upstream required node drops traffic because of capacity or incident health, downstream nodes receive only surviving traffic.

Example:

```text
Incoming 100

ALB passes 80%
-> APP receives 80

APP passes 90% of arrivals
-> DB receives 72
```

A downstream node must not be charged for requests that never reached it.

A downstream failure also must not retroactively reduce work already performed upstream.

This creates the intended operating-game loop:

```text
Traffic growth
  -> ALB bottleneck
  -> ALB scale-up
  -> APP bottleneck revealed
  -> APP scale-out / resize
  -> DB bottleneck revealed
  -> Redis / replica / DB resize decision
```

An upstream bottleneck masking downstream bottlenecks is intentional gameplay.

---

## 8. Request Trace Integration

The existing request trace already propagates node health through the route.

Capacity health becomes an additional node-health source:

```text
Capacity Health
      ×
Incident Health
      =
Effective Node Health
      -> Request Trace
      -> Downstream Arrival
      -> Downstream Demand
      -> Final Success Ratio
```

The implementation may require staged or iterative load calculation because downstream demand depends on pass-through while pass-through depends on effective capacity calculated from demand.

The algorithm is an implementation detail, but these results are mandatory:

- each node's demand reflects actual upstream pass-through,
- calculations are deterministic,
- results do not depend on arbitrary collection iteration order,
- request-route order remains authoritative.

---

## 9. Required vs Optional Steps

`REQUIRED` and `OPTIONAL` route steps have different flow semantics.

### REQUIRED

A required node's effective health gates the main request.

Its capacity/incident loss:

- reduces primary request success,
- reduces traffic reaching later main-path nodes.

### OPTIONAL

An optional side step receives the traffic that reaches that step and has its own demand, capacity health, alerts, metrics, and diagnosis.

However its failure does **not** gate the main synchronous route by default.

For the primary request flow:

```text
optional step pass-through = arrival ratio
```

unless the route contract explicitly marks the dependency as required.

This prevents an overloaded async queue from automatically failing an otherwise successful HTTP request.

The existing no-queue optional fallback into APP remains separate and must continue to work.

---

## 10. Capacity Sources by Node Type

### APP

Resources:

- CPU
- IO

Nominal capacity:

- APP size baseline,
- multiplied by APP instance count.

Effective capacity additionally applies:

- framework resource-specific modifier,
- framework proficiency/tuning.

Current framework differences remain meaningful, including Spring CPU strength / IO weakness and Nest CPU weakness / IO strength.

### DB

Resources:

- CPU
- IO

Nominal capacity:

- DB size baseline,
- existing resource-specific replica structural factors.

Effective capacity additionally applies:

- database product capacity characteristic,
- database proficiency/tuning.

Replica CPU and IO factors remain distinct.

### ALB / Redis / Queue

Resource:

- THROUGHPUT

Nominal capacity comes from the selected node-size profile.

Effective capacity additionally applies existing technology proficiency/tuning where supported.

### Storage

Resource:

- STORAGE

Nominal capacity comes from the size profile.

Effective capacity equals nominal capacity unless a real modifier already exists or is explicitly introduced by a future feature.

Do not invent a modifier for symmetry.

---

## 11. Which Ratio Each System Uses

This distinction is fixed, not deferred to implementation.

### Nominal ratio is used for

- player-facing load percentage,
- orange `WARNING` threshold,
- BASIC aggregate load display,
- METRICS/APM displayed load percentages,
- preview percentages shown to the player.

### Effective ratio is used for

- red `OVERLOAD` threshold,
- capacity health / immediate request failure,
- incident load-risk input,
- actual technical-pressure bottleneck selection,
- GrowthPolicy capacity-pressure input,
- service-health technical pressure,
- P95 technical pressure,
- overload danger alerts.

This means Spring may display `105%` orange while service-health calculations see only about `89%` effective usage.

### Failure rate

Request-trace success after capacity and incident health remains the authoritative source for `failureRate`.

Existing consumers of `failureRate` continue to receive the resulting real user impact.

---

## 12. Operational Pressure Engine

The Generic Operational Bottleneck Engine remains the structural source of bottleneck selection.

It must not reintroduce fixed APP / DB / ALB candidate lists.

Operational pressure should carry enough information to distinguish nominal and effective pressure.

For actual technical bottleneck selection, effective ratio is authoritative.

For displayed percentages, nominal ratio is authoritative.

Exact current topology node IDs remain the scope boundary; external services and same-kind decoys must not participate in player-owned operational pressure.

---

## 13. Alerts and Diagnosis

Alert semantics:

```text
nominalRatio >= 1 && effectiveRatio <= 1
-> warning / orange

 effectiveRatio > 1
-> danger / red
```

Diagnosis should identify the exact node and resource responsible for the highest effective technical pressure.

APM can explain both values, for example:

```text
Spring Boot CPU
Displayed load: 110%
Hard limit:     118%
Still within effective capacity
```

or:

```text
Spring Boot CPU
Displayed load: 130%
Hard limit:     118%
Capacity failures occurring
```

---

## 14. Feature and Change Preview

Live and preview calculations must use the same capacity and request-flow engine.

A preview may display nominal percentages while determining projected overload using effective pressure.

Example desired semantics:

```text
ALB SMALL -> MEDIUM

ALB 125% -> 63%
APP 82%  -> 117%  projected next bottleneck
```

This is how the game explains hidden downstream bottlenecks before the player spends money.

A brand-new resize-preview UI is not mandatory in this iteration if none exists, but current preview APIs must be compatible with the new semantics.

---

## 15. Incident Risk

Incident risk uses **effective node pressure**, not nominal display pressure.

Reason: incident probability should represent actual technical stress.

Example:

```text
Spring CPU displayed load = 105%
Effective usage           = 89%
```

Incident risk should behave like an 89%-loaded Spring node, not like a technically overloaded node.

Existing incident probability bands, base risks, proficiency multipliers, severity distributions, and resolution rules remain unchanged.

Only the load-ratio source changes from ambiguous load to effective technical pressure.

---

## 16. Growth, Service Health, and P95

Existing formulas and thresholds remain unchanged.

Their technical-pressure input becomes effective pressure.

This prevents the common nominal warning line from pretending that a product-specific hard limit has already been reached.

`failureRate` continues to affect these systems wherever it already does, now including immediate capacity loss because request traces include overload health.

No unrelated balance rebasing is authorized.

If regression tests expose genuine double-counting caused by the new real failure source, only the minimum correction needed to preserve the intended existing formula semantics may be made and must be separately tested.

---

## 17. Observability UI

Recommended presentation:

```text
Spring Boot APP
Overall Load 105%  WARNING

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

BASIC can continue to expose one aggregate displayed load per owned node.

METRICS/APM expose resource-level nominal/effective values.

APM diagnosis exposes the actual effective bottleneck and capacity-failure explanation.

---

## 18. Invariants

1. Resource axes remain `CPU`, `IO`, `THROUGHPUT`, `STORAGE`.
2. Overall node load uses the hottest resource, never an average.
3. Nominal capacity includes structural scale.
4. Effective capacity adds technology/product/proficiency characteristics to nominal capacity.
5. Player-facing `100%` means the common nominal baseline.
6. Actual overload begins only when effective ratio exceeds 1.
7. No duplicate product-specific overload-threshold table is introduced.
8. Effective overload causes immediate partial request failure.
9. Incidents remain a separate failure mechanism.
10. Upstream required-node pass-through limits downstream demand.
11. Downstream failure does not retroactively erase upstream work.
12. Fixing an upstream bottleneck may reveal the next bottleneck.
13. Optional steps do not gate primary request success by default.
14. Incident risk uses effective pressure.
15. Growth/Health/P95 technical pressure uses effective pressure.
16. Player-visible percentages use nominal pressure.
17. External services remain outside player-owned capacity pressure.
18. Same-kind decoy nodes never affect the current topology.
19. Live and preview load use identical engine semantics.
20. No fixed node-kind bottleneck whitelist may return.

---

## 19. Non-Goals

This iteration does not add:

- Memory pressure
- Connection pool pressure
- Network bandwidth as a new resource axis
- Retry storms
- A new backpressure-queue subsystem
- Per-request timeout distributions
- Autoscaling policies
- New incident types
- New queue delivery guarantees
- New storage failure modes
- CDN
- Redis clustering
- Worker autoscaling
- Unrelated cost rebalance

---

## 20. Testing Requirements

### Capacity contract

- nominal and effective capacity are both exposed,
- nominal and effective ratios are correct,
- node aggregate displayed load uses hottest nominal resource,
- node technical pressure uses hottest effective resource.

### Structural scaling

- APP instance count increases nominal and effective capacity,
- DB replicas increase nominal capacity using existing CPU / IO structural factors,
- resizing changes nominal baseline correctly.

### Framework behavior

- Spring CPU can exceed nominal 100% and remain below effective hard limit,
- Spring IO can overload before nominal 100%,
- Nest CPU can overload before nominal 100%,
- Nest IO can remain healthy above nominal 100%.

### Immediate capacity failure

- no capacity failure at or below effective limit,
- capacity failure starts immediately above effective limit,
- failure ratio matches `1 - effectiveCapacity / demand`,
- hottest effective resource controls node capacity health.

### Request flow

- upstream required overload reduces downstream arrival and demand,
- relieving upstream bottleneck can reveal downstream bottleneck,
- downstream overload does not retroactively reduce upstream demand,
- required steps affect primary request success,
- optional step failure does not gate primary request success,
- optional step still has its own demand and operational pressure.

### Incident composition

- capacity health and incident health multiply,
- CRITICAL incident can still fully stop a node,
- incident risk uses effective pressure,
- overload and incident remain distinguishable.

### Generic topology

- ALB, APP, Redis, DB, Queue, Storage remain generic participants,
- external service is excluded,
- same-kind decoys are excluded,
- no fixed candidate whitelist returns.

### Consumers

- displayed metrics use nominal ratio,
- overload alerts use effective ratio,
- Growth technical pressure uses effective ratio,
- Health/P95 technical pressure uses effective ratio,
- live and preview calculations agree.

### Regression

- existing finance/progression/development semantics remain,
- existing incident probability formulas remain apart from ratio source,
- existing P95/health threshold formulas remain,
- full tests, typecheck, and production build pass.

---

## 21. Success Criteria

The player can observe:

```text
Spring Boot APP
CPU 108% WARNING
Hard Limit 118%
No capacity failure
```

then later:

```text
Spring Boot APP
CPU 130% OVERLOAD
Hard Limit 118%
Capacity failures occurring
```

and can experience bottleneck revelation:

```text
Before
ALB 125% OVERLOAD
APP 82%
DB 61%

After ALB resize
ALB 63%
APP 113% OVERLOAD
DB 79%
```

The player should understand that infrastructure choices determine both the visible 100% baseline and the real hard limit, while traffic only reaches downstream systems when upstream systems actually pass it.
