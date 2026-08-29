# Workload-aware Database Fit Engine Design

Date: 2026-08-29
Status: Approved direction, implementation pending
Base: `feature/playable-mvp` @ `579632c32e24749092eb7831542f1f222eb4bb74`

## 1. Purpose

The current simulation already models:

- feature-specific APP/DB CPU and I/O demand,
- framework-specific APP CPU/I/O hard limits,
- nominal vs effective capacity,
- Redis read offload,
- DB read replicas,
- flow-aware upstream/downstream capacity masking.

Database choice is still comparatively shallow. PostgreSQL, MySQL, and MongoDB mostly differ by a single aggregate capacity/cost modifier and development-work modifiers. A feature that is read-heavy, write-heavy, transactional, content-oriented, or search-heavy therefore creates almost the same DB runtime pressure regardless of the selected database.

The goal of this change is to make database choice participate in the same workload-driven operational game loop as framework choice without creating a universal best database.

## 2. Design principles

1. **Workload fit changes demand, not nominal hardware size.**
   Server size remains the player-facing hardware/reference capacity. Database fit represents how much CPU/I/O work a particular database performs for the same logical feature workload.

2. **CPU and I/O are independent.**
   A database may be more efficient for a workload on one axis without being universally stronger.

3. **Generic tags drive the model.**
   The engine must not hard-code `COMMENT`, `SEARCH`, or another feature ID. Existing feature tags such as `READ_HEAVY`, `WRITE_HEAVY`, `TRANSACTIONAL`, `CONTENT`, and `SEARCH` are the input.

4. **Differences are directional, not benchmark claims.**
   V1 values are game-balance abstractions, intentionally small (normally 5-20%), not statements that one real database is always N% faster than another.

5. **Existing infrastructure decisions remain distinct.**
   - Database fit reduces per-request DB work.
   - Redis removes a portion of read-heavy DB work.
   - Read replicas increase DB capacity.
   These choices should complement rather than replace each other.

## 3. Core model

Add a database runtime-workload contract:

```ts
export interface DatabaseResourceDemandModifier {
  readonly cpu: number;
  readonly io: number;
}
```

`DatabaseDefinition` exposes:

```ts
resourceDemandModifierFor(feature: FeatureDefinition): DatabaseResourceDemandModifier
```

The returned values are multipliers applied to the DB resource demand that remains after any request-level read offload.

Examples:

```text
CPU multiplier 0.90 = 10% less DB CPU work per request
IO multiplier  1.10 = 10% more DB I/O work per request
```

The multiplier does not alter:

- nominal DB capacity,
- DB server-size prices,
- replica scaling coefficients,
- APP demand,
- cache capacity,
- queue/storage demand.

## 4. V1 database profiles

The following values are deliberately modest and asymmetric.

### PostgreSQL

Profile: strong transactional/write consistency and complex relational/query workloads; neutral general-purpose baseline.

| Feature tag | CPU | I/O |
| --- | ---: | ---: |
| `TRANSACTIONAL` | 0.90 | 0.88 |
| `WRITE_HEAVY` | 0.95 | 0.90 |
| `SEARCH` | 0.95 | 0.95 |
| other | 1.00 | 1.00 |

### MySQL

Profile: cost-efficient mainstream web/read workload; neutral writes and transactions rather than a major penalty.

| Feature tag | CPU | I/O |
| --- | ---: | ---: |
| `READ_HEAVY` | 0.94 | 0.90 |
| `CONTENT` | 0.97 | 0.95 |
| `TRANSACTIONAL` | 1.03 | 1.05 |
| other | 1.00 | 1.00 |

The small transactional penalty exists to create a gameplay distinction, not to claim MySQL is unsuitable for transactions.

### MongoDB

Profile: efficient document/content workloads; weaker fit for transaction-heavy relational behavior.

| Feature tag | CPU | I/O |
| --- | ---: | ---: |
| `CONTENT` | 0.90 | 0.88 |
| `READ_HEAVY` | 0.96 | 0.94 |
| `TRANSACTIONAL` | 1.15 | 1.20 |
| `SEARCH` | 1.05 | 1.08 |
| other | 1.00 | 1.00 |

The existing MongoDB aggregate capacity modifier remains unchanged in this feature. This work only adds workload-demand fit.

## 5. Multiple matching tags

A feature may carry multiple relevant tags. Matching modifiers multiply independently by axis.

Example:

```text
MongoDB + CONTENT + READ_HEAVY
CPU = 0.90 * 0.96 = 0.864
IO  = 0.88 * 0.94 = 0.8272
```

To prevent accidental extreme combinations as new tags are added, the final V1 multiplier is clamped per axis:

```text
minimum = 0.80
maximum = 1.25
```

This clamp belongs to the database-fit policy rather than feature definitions.

## 6. Load-calculation order

For each feature, DB workload is calculated in this order:

```text
Feature DB CPU/I/O weight
        ↓
Raw DB resource demand
        ↓
Redis read offload (when active + READ_HEAVY)
        ↓
Residual DB workload
        ↓
Database workload-fit CPU/I/O modifiers
        ↓
Request-trace arrival ratio
        ↓
Actual DB CPU/I/O demand
        ↓
Nominal / Effective Capacity pressure
```

### Why Redis comes before database fit

The original brainstorming direction placed DB fit before Redis offload. The implementation spec intentionally refines that ordering.

Redis cache traffic represents logical read traffic and must not change merely because the player selected PostgreSQL, MySQL, or MongoDB. Therefore:

- `cacheDemand` is derived from raw read-heavy DB demand,
- Redis removes its configured fraction from the raw DB workload,
- database fit is applied only to the residual work that actually reaches the database.

For DB demand itself, the multiplicative result is equivalent. The important difference is that Redis demand remains database-independent.

Existing V1 Redis offload values remain unchanged:

```text
DB CPU offload: 12%
DB I/O offload: 40%
```

## 7. Relationship to read replicas

Read replicas remain a **capacity-side** decision.

```text
workload fit → changes demand
replica      → changes capacity
```

No replica coefficient changes are included in this feature.

This is intentional because it creates different player decisions:

- workload mismatch: architecture/stack fit problem,
- growing read traffic: Redis or replica problem,
- simply larger service: DB scale-up problem.

## 8. Relationship to nominal/effective capacity

Database fit does not alter the nominal/effective split introduced by the previous feature.

```text
Nominal Capacity
= current DB size + structural replica scaling

Effective Capacity
= existing DB capacity modifiers + proficiency/tuning

Actual Demand
= workload demand after Redis offload and database fit
```

Operational pressure remains:

```text
actual demand / effective capacity
```

Player-facing percentage remains:

```text
actual demand / nominal capacity
```

Therefore choosing a better-fit database can visibly reduce both displayed load and technical pressure without changing the server's displayed size.

## 9. Development-work modifiers

Existing database development-work modifiers remain separate and unchanged.

For example, PostgreSQL's existing `TRANSACTIONAL` development advantage and MongoDB's existing transactional development penalty continue to affect implementation work. Runtime workload fit is a second, explicit concern.

Do not reuse one modifier table for both development productivity and runtime capacity/demand.

## 10. Presentation and diagnosis

V1 does not add a new dashboard panel.

Existing node/resource load, bottleneck, P95, health, alerts, and feature-impact projections automatically reflect the changed DB demand.

Where a user-facing explanation is already available for stack effects, a compact database-fit hint may be projected later, but that is not required for this implementation.

No hidden score such as `databaseFit = 87` should be introduced in V1.

## 11. Architecture boundaries

### `src/core/database.ts`

Owns:

- database workload-fit modifier tables,
- tag combination,
- per-axis clamp,
- `resourceDemandModifierFor(feature)`.

It must not know about DAU, Redis deployment, traces, node IDs, or infrastructure sizing.

### `src/core/infrastructure.ts` / `LoadCalculator`

Owns orchestration:

- compute raw feature DB demand,
- compute Redis demand/offload,
- ask the selected `DatabaseDefinition` for workload-fit modifiers,
- apply those modifiers to residual DB CPU/I/O demand,
- multiply by request-trace arrival.

The calculator must not contain PostgreSQL/MySQL/MongoDB-specific tag tables.

### Application/UI

No new authoritative business rules. Existing projections consume the resulting load snapshots.

## 12. Error handling and invariants

- Unknown database IDs remain impossible through the existing `DatabaseId` union and `byId` switch.
- Features with no matching database-fit tags return `{ cpu: 1, io: 1 }`.
- A zero DB resource weight remains zero after all modifiers.
- Database-fit multipliers must stay finite and positive.
- Redis demand must be invariant for the same logical feature traffic regardless of selected database.
- Database fit must not change APP, queue, or storage demand.
- Database fit must not modify nominal/effective capacity values.

## 13. Testing strategy

### Pure database policy tests

Add tests that verify:

1. neutral features return `1 / 1`,
2. PostgreSQL transactional/write tags reduce the intended axes,
3. MySQL read-heavy/content tags reduce the intended axes,
4. MongoDB content/read tags reduce demand,
5. MongoDB transactional tags increase demand,
6. multiple tags compose and clamp correctly.

### LoadCalculator integration tests

For equal DAU, feature set, server size, and proficiency:

1. `PREMIUM` / transactional-heavy workload produces lower DB pressure on PostgreSQL than MongoDB,
2. content/read-heavy workload can produce lower DB pressure on MySQL or MongoDB than PostgreSQL,
3. Redis reduces read-heavy DB I/O after database selection while cache demand stays identical across database choices,
4. DB workload fit changes DB CPU/I/O only,
5. replica/size capacities are unchanged by workload-fit policy,
6. flow-aware upstream masking still limits database arrival before workload pressure is counted.

### Regression

All existing tests, typecheck, and production build must remain green.

## 14. Acceptance examples

### Transactional feature

Given identical SMALL DB infrastructure and a transactional workload:

```text
PostgreSQL residual DB demand
< MySQL residual DB demand
< MongoDB residual DB demand
```

The exact final pressure also depends on existing effective-capacity modifiers and proficiency.

### Content/read-heavy feature

A read/content-oriented feature should create a meaningful trade-off:

```text
MySQL / MongoDB demand advantage
vs
PostgreSQL general-purpose / transactional profile
```

There must be no single database that wins every feature mix.

### Redis invariant

Given the same read-heavy feature, DAU, route, and Redis health:

```text
Redis throughput demand(PostgreSQL)
= Redis throughput demand(MySQL)
= Redis throughput demand(MongoDB)
```

while residual DB CPU/I/O may differ.

## 15. Non-goals

This feature does not add:

- indexes or query-plan simulation,
- connection pools,
- lock contention / MVCC detail,
- schema/document modeling,
- sharding,
- multi-primary replication,
- per-feature database selection,
- database migration during an active game,
- new database products,
- changes to Redis hit-rate tuning,
- changes to read-replica coefficients,
- benchmark-derived claims about real products.

Those may become later gameplay systems once the workload-fit layer proves useful.

## 16. Success criterion

After this feature, database selection must materially influence which resource becomes the bottleneck for a given feature mix, while scaling, Redis, replicas, and framework choice continue to solve different parts of the system.

The desired gameplay loop is:

```text
feature mix grows
   ↓
DB CPU/I/O pattern emerges
   ↓
selected database fit changes pressure
   ↓
player diagnoses the bottleneck
   ↓
scale up? replica? Redis? accept current stack trade-off?
```

The result should reward understanding the workload rather than memorizing one universally strongest database.
