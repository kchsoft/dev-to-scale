# Infrastructure Ecosystem and Topology Design

## 1. Purpose

Dev to Scale은 단순히 인프라 선택지를 나열하는 게임이 아니라, 독립적인 서버·데이터베이스·캐시·메시지 큐·스토리지 사이의 연결과 부하를 운용하는 작은 인프라 생태계를 지향한다.

이 설계의 목적은 다음과 같다.

- 현재 V1의 플레이 흐름과 밸런스를 유지하면서 상태 일관성 오류를 제거한다.
- 서버, DB, MQ, Cache를 특정 서비스의 부속 객체가 아닌 독립 자원으로 모델링한다.
- 기능/API별 요청이 실제로 통과한 노드와 연결을 계산한다.
- 향후 MSA에서 기능/API의 진입 모듈을 선택할 수 있게 한다.
- 서비스 내부의 세부 경로는 게임이 제공하는 Blueprint가 소유하고 플레이어가 임의 편집하지 못하게 한다.
- View와 핵심 도메인 모델 사이에 엄격한 Application 경계를 둔다.
- 계산된 요청 경로를 따라가는 입자 기반 Service Map UI를 지원한다.

## 2. Non-goals

이번 작업에서는 다음을 구현하지 않는다.

- 완전한 MSA 게임 플레이
- 플레이어가 임의의 Node/Edge를 연결하는 네트워크 편집기
- 플레이어가 물리 서버 인스턴스를 직접 라우팅 대상으로 선택하는 기능
- Service 내부 DB, MQ, Cache 경로를 플레이어가 변경하는 기능
- Topic, Partition, Consumer Group 상세 설정
- 실제 요청 한 건마다 객체를 생성하는 시뮬레이션
- LocalStorage 저장 및 복원 시스템
- 기존 게임 밸런스의 의도적인 변경

README의 `LocalStorage 자동 저장` 문구는 현재 구현과 맞지 않으므로 제거한다.

## 3. Architectural invariants

### 3.1 Independent infrastructure resources

Server, Database, Queue, Cache, Load Balancer, Object Storage, Worker는 독립적인 인프라 자원이다.

- 자원은 특정 ServiceModule을 소유하지 않는다.
- ServiceModule도 인프라 자원을 객체로 소유하지 않는다.
- 양쪽은 안정적인 ID와 Binding으로만 연결된다.
- 같은 Queue나 Cache를 여러 Module이 공유할 수 있다.
- 자원 교체는 Module 정의 변경이 아니라 Binding 또는 Deployment 변경으로 표현한다.
- `CommunityServer`, `SearchKafka`와 같은 서비스 결합형 자원 클래스를 만들지 않는다.
- 상속보다 독립 노드의 조합을 사용한다.

### 3.2 Strict View/Application/Core separation

의존성 방향은 아래 한 방향만 허용한다.

```text
React View → Application Contracts/Commands → Core Domain
```

- React View는 `GameEngine`, Domain Entity, Domain Policy를 import하지 않는다.
- React View는 Core의 `GameSnapshot`을 받지 않는다.
- React View는 Load, Observability, Incident diagnosis, route를 계산하지 않는다.
- React View는 Application이 제공한 불변 DTO/ViewModel을 표시하고 Command를 호출한다.
- Application은 Domain state를 UI 전용 문자열, tone, progress, node, edge, trace로 투영한다.
- Core는 React, Next.js, 브라우저 API, CSS, 아이콘, 표시 문구를 알지 못한다.
- 계층 경계는 import 검사와 Application contract 테스트로 검증한다.

### 3.3 Derived-state consistency

`LoadSnapshot`과 `RequestTrace`는 현재 canonical state로부터 계산되는 파생 상태다.

- 출시, 기능 완료, 기술 완공, Scale 변경, 장애 생성/복구, 숙련도 변경 뒤의 View는 항상 같은 시점의 파생 상태를 가진다.
- 하루 성장 계산에는 직전 관측 부하를 사용하되, 하루 처리가 끝난 Snapshot은 모든 당일 mutation을 반영한다.
- Preview는 실제 적용과 동일한 계산 함수와 Context를 사용한다.
- 파생 상태를 갱신하지 않는 public mutation 경로를 허용하지 않는다.

## 4. Domain vocabulary

### 4.1 InfrastructureNode

실제로 배치된 독립 인프라 자원이다.

```ts
type InfrastructureNodeId = string;

type InfrastructureNodeKind =
  | 'LOAD_BALANCER'
  | 'SERVER_GROUP'
  | 'DATABASE'
  | 'CACHE'
  | 'QUEUE'
  | 'OBJECT_STORAGE'
  | 'WORKER'
  | 'EXTERNAL_SERVICE';

interface InfrastructureNode {
  id: InfrastructureNodeId;
  kind: InfrastructureNodeKind;
  productId: string;
  capacity: ResourceCapacity;
  monthlyCost: number;
}
```

`productId`는 Spring Boot App, PostgreSQL, Redis, Kafka와 같은 제품/런타임 정의를 가리킨다. Node는 제품 정의와 배치 상태를 조합하지만 ServiceModule에는 종속되지 않는다.

### 4.2 ServiceModule

논리적인 기능 경계다. V1에는 `community` 하나만 존재하고, 향후 `feed`, `search`, `notification`, `payment` 등으로 확장할 수 있다.

ServiceModule은 다음만 정의한다.

- 제공하는 Workload/API/Event
- 필요한 논리적 Resource Role
- Workload별 내부 Route Blueprint

ServiceModule은 구체적인 서버나 DB 인스턴스를 소유하지 않는다.

### 4.3 ResourceRole and ModuleDeployment

Blueprint가 요구하는 논리적 역할과 실제 독립 자원을 연결한다.

```ts
type ResourceRole =
  | 'ENTRY_APP'
  | 'PRIMARY_DATABASE'
  | 'CACHE'
  | 'EVENT_BUS'
  | 'OBJECT_STORAGE'
  | 'WORKER';

interface ModuleDeployment {
  moduleId: string;
  bindings: ReadonlyMap<ResourceRole, InfrastructureNodeId>;
}
```

필요한 역할이 없는 Module은 해당 Binding을 가지지 않는다. Queue 교체는 `EVENT_BUS`가 가리키는 Node ID를 변경하는 것으로 표현한다.

### 4.4 Workload and assignment

Workload는 플레이어가 이해하는 기능/API/Event 단위다.

```ts
interface WorkloadAssignment {
  workloadId: string;
  entryModuleId: string;
}
```

향후 MSA 플레이에서 플레이어는 Workload의 `entryModuleId`만 선택할 수 있다. 물리 서버 인스턴스나 Module 내부 경로는 선택하지 않는다.

### 4.5 RouteBlueprint and resolved route

Route Blueprint는 Resource Role 기준으로 작성되는 Module 내부의 고정 경로다. 실제 계산 전 `ModuleDeployment`의 Binding을 통해 Node ID 경로로 해석한다.

```text
COMMENT
ENTRY_APP → PRIMARY_DATABASE → EVENT_BUS(optional)

SEARCH
ENTRY_APP → CACHE → PRIMARY_DATABASE
```

해석된 Route는 단순 배열이 아니라 방향 그래프다. 다음을 표현할 수 있어야 한다.

- 순차 경로
- Optional 단계
- 조건 분기와 fallback
- Fan-out
- 비동기 Queue → Worker 흐름

V1에서는 기존 요청 경로와 동일한 선형 경로만 사용하되, 자료구조는 이후 그래프 확장을 막지 않아야 한다.

### 4.6 TopologyGraph

독립적인 InfrastructureNode와 통신 가능 관계를 관리한다.

```ts
interface TopologyEdge {
  id: string;
  from: InfrastructureNodeId;
  to: InfrastructureNodeId;
  mode: 'SYNC' | 'ASYNC';
}

interface TopologyGraph {
  nodes: readonly InfrastructureNode[];
  edges: readonly TopologyEdge[];
}
```

TopologyGraph는 요청 경로 그 자체가 아니다. 통신 가능한 물리/논리 연결을 나타내며, Workload Route는 이 그래프 위의 유효한 경로여야 한다.

## 5. Request and load data flow

```text
Player Command
  → Game Application Command
  → GameEngine mutation
  → Module/Topology route resolution
  → Node-specific Load calculation
  → Node-specific Incident/Health application
  → RequestTrace calculation
  → GameViewProjector
  → immutable GameView
  → React rendering and animation
```

### 5.1 Node-specific load

현재의 전역 `APP`, `DB`, `QUEUE` 비율은 Node ID별 부하로 확장한다.

```ts
interface NodeLoadSnapshot {
  nodeId: InfrastructureNodeId;
  cpuDemand?: number;
  ioDemand?: number;
  throughputDemand?: number;
  capacity: number;
  loadRatio: number;
}
```

기존 `appRatio`, `dbRatio`, `asyncRatio`, `storageRatio` 필드는 V1 호환 projection으로 유지한 뒤 Application ViewModel이 Node별 값으로 전환되면 제거할 수 있다.

### 5.2 Node-specific health and incidents

장애 영향은 `RequestNodeKind`가 아니라 `InfrastructureNodeId`로 적용한다.

- `kafka-feed` 장애는 해당 Node를 지나는 Workload에만 영향을 준다.
- 같은 종류의 다른 Queue는 영향을 받지 않는다.
- Node를 공유하는 여러 Module은 공유 장애의 영향을 함께 받는다.
- 장애가 해결되거나 Node가 교체되면 같은 상태 전이 안에서 Trace와 Load를 다시 계산한다.

### 5.3 RequestTrace

RequestTrace는 Route 해석과 Health 적용 결과다.

```ts
interface RequestTrace {
  workloadId: string;
  nodes: readonly {
    nodeId: InfrastructureNodeId;
    arrivalRatio: number;
    passThroughRatio: number;
    status: 'HEALTHY' | 'SLOW' | 'FAILED' | 'MISSING';
  }[];
  edges: readonly {
    edgeId: string;
    trafficRatio: number;
  }[];
  successRatio: number;
  failureNodeId: InfrastructureNodeId | null;
}
```

LoadCalculator는 각 Trace의 도착 비율을 이용해 Node별 Demand를 합산한다.

## 6. Application contracts

`GameController`가 Domain facade와 View projector 역할을 동시에 수행하는 현재 구조를 점진적으로 분리한다.

### 6.1 GameCommandService

UI에서 허용된 사용자 행동만 노출한다.

- 하루 진행 및 속도 제어
- 기술 구축, 학습, 장애 대응
- Scale-up/out
- 향후 Workload의 진입 Module 선택

Core 객체나 mutable collection은 반환하지 않는다.

### 6.2 GameViewProjector

Core state를 완전한 UI ViewModel로 변환한다.

- HUD와 비용
- Work slot
- 기술/학습 선택 가능 여부
- Service Map node/edge
- RequestTraceView
- Observability에 따라 공개 가능한 진단 정보
- Incident action availability

### 6.3 View contract

React는 Application package가 소유하는 다음 데이터만 사용한다.

```ts
interface TopologyView {
  nodes: readonly TopologyNodeView[];
  edges: readonly TopologyEdgeView[];
  traces: readonly RequestTraceView[];
}
```

`GameView.snapshot`과 `GameController.engine` 공개 접근은 단계적으로 제거한다. 테스트 준비를 위한 Domain 직접 조작은 production API가 아니라 test fixture/builder에 둔다.

## 7. Request-path UI

Service Map은 Application이 제공한 Node/Edge/Trace를 렌더링한다.

- Node card는 독립 인프라 자원을 나타낸다.
- Edge는 실제 연결을 나타낸다.
- 작은 원은 선택된 Workload의 RequestTrace를 따라 이동한다.
- Traffic 규모는 제한된 수의 대표 입자로 정규화한다.
- 실패 입자는 장애/Missing Node에서 멈춘다.
- Queue는 유입과 소비 사이의 대기감을 표현할 수 있다.
- Fan-out은 Edge별로 입자를 복제한다.
- Observability level에 따라 세부 수치 공개 범위를 달리한다.
- `prefers-reduced-motion`에서는 이동 대신 정적 강조를 사용한다.

UI는 경로를 추론하지 않는다. Node 위치 결정과 애니메이션은 표시 책임이지만, 어떤 Edge를 통과하는지는 `RequestTraceView`가 결정한다.

## 8. Validation and error handling

Topology와 Blueprint는 구성 시점에 fail-fast 검증한다.

필수 검증:

- 중복 Node ID 금지
- 존재하지 않는 Node를 가리키는 Edge 금지
- Module이 요구하는 필수 Role Binding 누락 금지
- Binding의 Node kind/capability 불일치 금지
- Workload entry module 누락 금지
- Blueprint를 해석한 경로가 TopologyGraph의 Edge와 불일치하면 실패
- 무한 순환을 만들 수 있는 동기 Route 금지
- Queue 교체 후 retired Node를 참조하는 Binding/Incident 정리

설정 오류는 코드와 함께 `TopologyValidationError`로 표현한다. 현재 V1에서는 내부 Catalog 오류이므로 게임을 조용히 계속하지 않고 개발 단계에서 즉시 실패시킨다. 플레이어 명령 실패는 Application이 UI용 오류 메시지로 변환한다.

## 9. Compatibility and migration

작업은 아래 순서로 나누며 각 단계는 독립적으로 테스트 가능해야 한다.

### Phase 1: State consistency

- Load 파생 상태 갱신을 단일 경로로 통합한다.
- 출시와 Scale action 직후 Snapshot 일관성을 보장한다.
- 장애 생성/복구, 기능 완료, 기술 완공 이후의 일관성을 보장한다.
- Technology Preview가 실제 계산 Context를 사용하도록 한다.

### Phase 2: Application/View boundary

- Observability, ServiceHealth, IncidentDiagnosis 계산을 Application projector로 이동한다.
- UI의 Core policy import를 제거한다.
- Raw GameSnapshot과 public GameEngine 노출을 제거한다.
- ViewModel만으로 기존 UI를 렌더링하도록 전환한다.

Topology 도입 전에 이 경계를 닫아 이후 Core 구조 변경이 React에 전파되지 않게 한다.

### Phase 3: Topology foundation

- 독립 Node, Edge, Blueprint, Deployment, Binding 타입을 도입한다.
- 현재 V1 InfrastructureState로부터 `SingleServiceTopology`를 생성한다.
- 기존 기능 경로를 V1 Blueprint adapter로 변환한다.
- 기존 Queue 교체 정책을 유지한다.

### Phase 4: Node-specific simulation

- Request health와 Incident를 Node ID 기준으로 전환한다.
- Node별 Load와 RequestTrace를 계산한다.
- 기존 aggregate Load 필드는 호환 projection으로 유지한다.

### Phase 5: Topology visualization

- Node/Edge 기반 Service Map을 렌더링한다.
- Workload를 선택하면 해당 Trace를 강조한다.
- 대표 입자가 실제 Edge를 따라 이동하도록 한다.
- 실패, 병목, Queue 대기, reduced-motion 상태를 표현한다.

### Phase 6: Catalog and responsibility cleanup

- ID와 exhaustive mapping을 정리한다.
- 기능별 `growthBonus`가 실제 계산에 사용되도록 한다.
- GameController의 Command/Event/View projection 책임을 분리한다.
- GameApp을 화면 책임별 모듈로 나눈다.
- README의 잘못된 LocalStorage 설명을 제거한다.

## 10. Testing strategy

모든 behavior 변경은 실패하는 테스트를 먼저 작성한다.

### Domain regression tests

- 출시 Snapshot에 DAU와 현재 V1 Request Flow가 함께 존재한다.
- Scale action 직후 Snapshot capacity/load가 새 인프라와 일치한다.
- 장애 생성/복구 직후 Trace와 failure rate가 incident state와 일치한다.
- Technology Preview와 실제 배포 후 계산 결과가 동일하다.
- `growthBonus`가 서로 다른 기능은 서로 다른 성장 기여도를 가진다.

### Topology tests

- Server, DB, MQ는 Module 없이 독립 생성할 수 있다.
- 하나의 MQ를 여러 ModuleDeployment가 공유할 수 있다.
- 서로 다른 Workload가 서로 다른 Server/DB 경로를 사용할 수 있다.
- 존재하지 않는 Node Binding과 끊긴 Route는 검증 실패한다.
- Queue 교체는 Module Blueprint를 변경하지 않는다.
- 특정 Node 장애는 해당 Node를 통과하는 Trace에만 영향을 준다.

### Application boundary tests

- GameView가 mutable Domain 객체를 노출하지 않는다.
- React UI source는 Core Domain과 직접 의존하지 않는다.
- Observability별 ViewModel은 허용된 정보만 포함한다.
- RequestTraceView는 Domain RequestTrace와 같은 Node/Edge 순서를 가진다.

### End-to-end verification

- `npm test`
- `npm run typecheck`
- `npm run build`
- 시작 → 출시 → Scale → 기술 구축 → 장애 대응의 대표 플레이 루프
- Desktop과 mobile Service Map의 시각 확인

## 11. Success criteria

다음 조건을 모두 만족하면 설계 목표를 달성한 것으로 본다.

- 모든 public mutation 직후 View의 Load/Trace가 현재 Domain state와 일치한다.
- Technology Preview와 실제 적용이 동일한 계산 경로를 사용한다.
- React에서 Core Domain policy와 GameEngine 직접 접근이 사라진다.
- 독립 Server/DB/MQ Node를 ModuleDeployment가 Binding으로 조합한다.
- 기능별로 서로 다른 진입 Module과 내부 Route를 표현할 수 있다.
- 내부 Route는 Blueprint 소유이며 플레이어가 임의 편집하지 않는다.
- 장애와 부하가 Node ID 단위로 격리된다.
- UI 입자가 계산된 RequestTrace의 실제 Edge를 따라간다.
- 기존 V1 Queue 교체 정책, Seed 진행, 경제 및 성장 흐름의 비의도적 회귀가 없다.
