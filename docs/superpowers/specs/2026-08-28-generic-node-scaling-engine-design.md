# Generic Infrastructure Node Scaling Engine Design

## Status

Approved architecture for `feature/playable-mvp` follow-up work.

## Goal

Turn infrastructure sizing into a first-class operational decision across every player-owned infrastructure node so the game rewards bottleneck diagnosis instead of making APP/DB upgrades the only meaningful scaling actions.

## Why this change

The current engine gives `ServerSize` only to the application and database clusters. ALB, Redis, queues, and storage are modeled as deployed technologies with fixed capacity/cost. Some displayed node loads are also derived from unrelated node capacity: ALB follows APP capacity and Redis load is derived from DB pressure. As a result, topology nodes are not independent operational resources and the UI cannot offer a truthful scale-up decision for every node.

The target simulation should let the player distinguish architectural decisions from operational sizing decisions:

- Build Kafka: architecture/technology decision.
- Resize Kafka SMALL -> MEDIUM: infrastructure operating decision.
- Add an APP instance: horizontal scaling decision.
- Add a DB read replica: horizontal scaling decision.

## Scope

### Player-owned nodes that support size tiers

- Application server group
- Primary database cluster
- Application Load Balancer
- Redis cache
- SQS
- RabbitMQ
- Kafka
- Local storage
- Object storage

Every listed node supports the four tiers:

- `SMALL`
- `MEDIUM`
- `LARGE`
- `XLARGE`

### Nodes excluded from player sizing

- `EXTERNAL_SERVICE`, including the external AI node

`WORKER` remains supported by the generic topology model but no worker product is introduced by this change. A future owned worker product should plug into the same sizing catalog without requiring a new resize API.

## Architecture

### 1. InfrastructureState is the single source of truth for owned node sizing

Introduce a generic owned-node state abstraction that exposes:

```ts
interface SizedInfrastructureNode {
  readonly nodeId: InfrastructureNodeId;
  readonly productId: string;
  readonly kind: InfrastructureNodeKind;
  readonly size: ServerSize;
  readonly capacity: ResourceCapacity;
  readonly monthlyCost: number;
  resize(size: ServerSize): void;
}
```

Concrete APP/DB state may keep domain-specific behavior, but their capacity and monthly cost must be resolved through the same node sizing catalog as the other owned nodes.

`InfrastructureState` owns the current size for every deployed owned node. Technology deployment creates/replaces the corresponding node at `SMALL`.

### 2. Product-specific size catalog

Capacity and monthly cost are defined per product and size tier. Do not use one universal multiplier because products need distinct economics and performance characteristics.

The catalog resolves:

```ts
interface NodeSizeProfile {
  readonly capacity: ResourceCapacity;
  readonly monthlyCost: number;
}

type NodeSizeCatalog = Readonly<Record<string, Readonly<Record<ServerSize, NodeSizeProfile>>>>;
```

The catalog must cover:

- each selectable framework APP product
- each selectable database product
- ALB
- Redis
- SQS
- RabbitMQ
- Kafka
- Local Storage
- Object Storage

Existing APP/DB SMALL behavior should remain compatible with current values unless an explicit balance test requires a deliberate change.

Initial non-APP/DB capacity anchors should preserve the current relative technology identities:

| Product | SMALL | MEDIUM | LARGE | XLARGE | Resource |
| --- | ---: | ---: | ---: | ---: | --- |
| ALB | 180 | 360 | 700 | 1,300 | THROUGHPUT |
| Redis | 160 | 320 | 600 | 1,050 | THROUGHPUT |
| SQS | 300 | 550 | 950 | 1,500 | THROUGHPUT |
| RabbitMQ | 500 | 850 | 1,400 | 2,200 | THROUGHPUT |
| Kafka | 1,000 | 1,700 | 2,700 | 4,000 | THROUGHPUT |
| Local Storage | 100 | 180 | 320 | 500 | STORAGE |
| Object Storage | 1,000 | 2,000 | 4,000 | 8,000 | STORAGE |

Monthly cost must increase monotonically with tier for every product. Existing technology monthly cost is the SMALL tier baseline for ALB, Redis, SQS, RabbitMQ, Kafka, and Object Storage. Local Storage SMALL remains free and higher tiers may carry increasing infrastructure cost.

### 3. Horizontal scaling remains capability-specific

Generic resize does not imply generic horizontal scale-out.

Capabilities for V1:

| Node | Resize | Horizontal scale |
| --- | --- | --- |
| APP | yes | instances, max 10, requires ALB above count 1 |
| DB | yes | read replicas, max 3 |
| ALB | yes | no |
| Redis | yes | no |
| Queue | yes | no |
| Storage | yes | no |

APP scale-out continues to multiply CPU/I/O capacity and monthly APP cost by instance count. DB replicas continue to increase CPU and especially read I/O capacity and multiply DB infrastructure cost.

### 4. Generic engine commands

Replace product-specific public resize commands with node-oriented commands:

```ts
resizeInfrastructureNode(nodeId: InfrastructureNodeId, size: ServerSize): void
scaleOutInfrastructureNode(nodeId: InfrastructureNodeId): void
```

`scaleOutInfrastructureNode` validates the node capability and throws for nodes that do not support horizontal scaling.

Application/controller APIs expose the same node-oriented contract. UI code must not need a separate resize callback for APP, DB, ALB, Redis, queue, and storage.

### 5. Technology deployment and replacement semantics

Building a technology is separate from sizing it.

When a technology is deployed for the first time, its owned node starts at `SMALL`.

When one queue implementation replaces another, the replacement starts at `SMALL` regardless of the previous queue size:

```text
SQS LARGE -> build Kafka -> Kafka SMALL
```

This preserves the distinction between architectural migration and provisioned capacity and prevents a new technology from inheriting infrastructure sizing for free.

When Object Storage replaces Local Storage, Object Storage starts at `SMALL`.

### 6. Load calculation: independent node capacity

`NodeLoadSnapshot` remains the common representation of demand, capacity, and load ratio.

Refactor load calculation into responsibilities equivalent to:

```text
WorkloadDemandCalculator
  -> NodeDemandRouter
  -> InfrastructureCapacityResolver
  -> NodeLoadCalculator
```

The exact file/class names may vary if the implementation finds a smaller boundary, but the responsibilities must remain separated:

- Workload demand: derive APP CPU/I/O, DB CPU/I/O, async, storage, and entry traffic demand from feature workload characteristics.
- Demand routing: apply request-trace arrival, optional queue fallback, Redis read-offload behavior, Kafka event-heavy behavior, and topology routing.
- Capacity resolution: read the current product/size/count/replica state for the actual topology node.
- Node load: calculate resource ratios without product-specific UI assumptions.

### 7. Independent bottleneck rules

Resizing one node must not silently resize another node.

Required behavior:

- ALB SMALL -> MEDIUM lowers ALB throughput ratio while APP CPU/I/O capacity is unchanged.
- Redis SMALL -> MEDIUM lowers Redis throughput ratio while DB capacity is unchanged.
- APP resize changes APP CPU/I/O capacity only.
- DB resize changes DB CPU/I/O capacity only.
- Queue resize changes the active queue throughput capacity only.
- Storage resize changes storage capacity only.

Redis retains its architectural read-offload effect on READ_HEAVY workloads. Redis throughput demand must be based on traffic actually routed through the cache instead of being reverse-derived from DB capacity.

Kafka retains its EVENT_HEAVY efficiency policy. Queue product choice and queue tier therefore both matter.

ALB throughput demand is derived from entry traffic and compared against the ALB's own capacity instead of APP capacity.

### 8. Cost model

Resize semantics intentionally match the existing APP/DB behavior:

- resize applies immediately
- no one-time resize charge
- downsizing is allowed
- monthly infrastructure cost changes to the selected tier
- technology build cost remains a separate one-time architecture investment

Total monthly infrastructure cost is the sum of every currently deployed owned node, including horizontal APP instances and DB replicas.

The monthly settlement continues to use the infrastructure state active at settlement time according to the existing game economy flow.

### 9. Application projection

Remove APP/DB-only sizing fields as the primary UI contract:

```text
appSize
appCount
dbSize
dbReplicaCount
InfrastructureCostView.appSizeMonthlyCosts
InfrastructureCostView.dbSizeMonthlyCosts
```

Replace them with node-local scaling information attached to topology node views.

Target shape:

```ts
interface NodeScalingView {
  readonly currentSize: ServerSizeView;
  readonly sizeOptions: readonly {
    readonly size: ServerSizeView;
    readonly capacity: ResourceCapacityView;
    readonly monthlyCost: number;
  }[];
  readonly scaleOut: null | {
    readonly kind: 'INSTANCE' | 'READ_REPLICA';
    readonly count: number;
    readonly maxCount: number;
    readonly monthlyCostDelta: number | null;
    readonly available: boolean;
    readonly reason: string | null;
  };
}
```

`TopologyNodeView` receives `monthlyCost` and `scaling: NodeScalingView | null`.

An external service returns `scaling: null`.

### 10. Node Inspector UX

The Service topology remains the operational surface.

Flow:

```text
Service topology -> click node -> Node Inspector -> choose S/M/L/XL or horizontal scale action
```

`NodeInspector` renders sizing from `node.scaling` and must not branch on APP/DB merely to render size options.

APP and DB may show their horizontal actions based on `scaleOut.kind`, but the UI consumes capability data instead of knowing Core rules.

The inspector should show enough information to make an operational decision:

- current tier
- monthly cost per tier
- capacity per tier for the node's resources
- current load signal
- horizontal scale state when available

Existing incident response behavior stays available in the same inspector.

### 11. Observability and diagnosis

Operational diagnosis remains resource-oriented.

The existing global bottleneck categories may remain APP/DB/ASYNC/STORAGE for the current HUD, but node diagnosis must use the selected node's actual load snapshot.

ALB and Redis must become truthful independent bottlenecks. Future UI work may promote them into the global bottleneck enum, but that promotion is not required to land the generic scaling engine.

### 12. Compatibility and migration

This is an intentional Core refactor, but unrelated game systems should keep their behavior:

- feature progression
- learning
- technology prerequisites/build work
- incidents and incident response
- tech debt/refactoring
- growth events
- revenue policy
- request-route topology validation

Legacy `scaleApplication` / `scaleDatabase` public commands may exist temporarily during migration, but the final implementation must remove UI dependence on them. Prefer removing obsolete public methods once all call sites and tests use generic node commands.

No save-game migration is required because the current playable MVP does not define a persisted external save contract that this feature must preserve.

## Testing strategy

Use strict TDD for behavior changes.

### Characterization before migration

Protect current APP/DB behavior before replacing internals:

- APP SMALL capacity/cost by framework
- APP instance scale-out capacity/cost behavior
- ALB requirement for APP count > 1
- DB SMALL capacity/cost by database
- DB read replica CPU/I/O/cost behavior

### Generic sizing domain

Verify:

- all owned products expose SMALL/MEDIUM/LARGE/XLARGE
- tier capacity and monthly cost are monotonic for each relevant resource
- invalid/unknown node resize fails
- external service cannot resize
- deployed technology starts SMALL
- replacement queue starts SMALL
- Object Storage replacement starts SMALL

### Independent load behavior

Verify with the same workload before/after resize:

- ALB resize changes only ALB capacity/load ratio
- Redis resize changes only Redis capacity/load ratio
- APP resize does not change DB/queue/storage capacity
- DB resize does not change APP/queue/storage capacity
- queue resize does not change APP/DB/storage capacity
- storage resize does not change APP/DB/queue capacity

### Costs

Verify total monthly cost changes by exactly the selected node's cost delta for pure resize operations.

### Application/UI

Verify:

- every owned topology node projects generic scaling options
- external AI has no scaling actions
- Node Inspector renders size choices for ALB, Redis, Queue, Storage as well as APP/DB
- horizontal action appears only when capability is projected
- commands use node IDs

### Regression gate

Before merge run the repository's complete validation set:

```bash
npm test
npm run typecheck
npm run build
```

## Definition of done

The feature is complete when:

1. Every player-owned topology node listed in Scope has S/M/L/XL sizing.
2. Every node's load ratio uses its own current capacity.
3. Redis and ALB no longer derive capacity/load from DB or APP capacity.
4. Generic node resize commands replace UI-level APP/DB-specific resize commands.
5. APP instance and DB replica scale-out continue to work through capability data.
6. Node Inspector exposes the same sizing interaction for all owned nodes.
7. Monthly cost includes all node tiers and horizontal scaling.
8. Queue/storage technology replacement starts the replacement node at SMALL.
9. Existing unrelated gameplay behavior remains regression-green.
10. Full tests, typecheck, and production build pass before merge.
