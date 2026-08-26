# Queue 정책 — V1 및 향후 확장 방향

## V1 정책

V1에서는 서비스 전체에서 **활성 Queue 구현체를 하나만 사용한다.**

가능한 Queue:

- SQS
- RabbitMQ
- Kafka

새 Queue 구축을 완료하면 기존 Queue는 교체된다.

```text
SQS
  ↓ 교체
RabbitMQ
  ↓ 교체
Kafka
```

예를 들어 SQS를 사용 중 Kafka 구축을 시작한 경우:

1. Kafka 구축 중에는 기존 SQS가 계속 트래픽을 처리한다.
2. Kafka 구축 비용은 시작 즉시 차감된다.
3. Kafka 구축 완료 시 SQS가 서비스 토폴로지에서 제거된다.
4. 이후 월 비용은 Kafka 비용만 발생한다.
5. 제거된 SQS 노드에 남아 있던 장애도 함께 제거된다.

이 정책의 목적은 V1에서 불필요한 Queue 라우팅/토픽 설계를 제거하고 플레이어의 판단을 아래처럼 단순화하는 것이다.

> 지금 Queue로 계속 버틸 것인가, 더 높은 처리량의 Queue로 교체할 것인가?

## 도메인 구조

V1 정책이 단일 Queue라고 해서 인프라 모델 자체를 `queue: Queue | null` 형태로 고정하지 않는다.

`InfrastructureState`는 기술을 컬렉션으로 관리하고 Queue도 `queueTechnologies` 컬렉션 형태로 노출한다.

현재는 `deployTechnology()`의 V1 정책이 새 Queue 배포 시 기존 Queue를 retire시켜 최대 1개만 유지한다.

즉 **단일 Queue는 게임 정책이고, 자료구조의 영구 제약이 아니다.**

## 향후 MSA 확장

MSA 또는 복수 서비스가 도입되는 버전에서는 Queue를 서비스/워크로드별로 연결할 수 있도록 확장한다.

예:

```text
User
 │
 ├─ Community API
 │    └─ SQS → Notification Worker
 │
 ├─ Feed Service
 │    └─ Kafka → Feed Consumer
 │
 └─ Payment Service
      └─ RabbitMQ → Payment Worker
```

향후에는 아래 개념을 추가할 수 있다.

- Service / Bounded Context
- Queue Instance
- Producer / Consumer 연결
- Topic / Queue routing
- 서비스별 Async Load
- Queue별 Capacity / Incident

이때 V1의 `queueTechnologies` 컬렉션과 Technology 정의는 재사용하고, **단일 활성 Queue를 강제하는 배포 정책만 교체**한다.

## V1에서 하지 않는 것

- Queue 여러 개 동시 활성화
- Topic 설계
- Producer/Consumer 개별 설정
- Partition
- Consumer Group
- 서비스별 Queue 라우팅
- MSA

이 내용은 V1의 기술 선택을 지나치게 복잡하게 만들기 때문에 후속 버전으로 남긴다.
