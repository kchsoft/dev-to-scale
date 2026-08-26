# Dev to Scale V1 UI/UX 와이어프레임

## 1. 목표

Dev to Scale V1의 UI는 **텍스트를 읽어서 판단하는 관리 화면이 아니라, 서비스 구조를 보고 직접 눌러서 대응하는 시뮬레이션 게임 UI**를 목표로 한다.

핵심 원칙은 다음과 같다.

1. 플레이어는 현재 서비스 상태를 3초 안에 파악할 수 있어야 한다.
2. 기술/서버/DB/학습 선택은 가능한 한 **그림, 카드, 노드, 아이콘**을 눌러 수행한다.
3. 상세 설명은 기본 화면에서 숨기고, 클릭/hover/상세 패널에서만 제공한다.
4. 계산식은 숨기되, 선택 전후의 결과는 보여준다.
5. 긴 표와 긴 문장은 리포트 화면을 제외하면 사용하지 않는다.
6. `안정 → 주의 → 위험 → 장애` 상태를 화면 전체에서 동일한 시각 언어로 표현한다.
7. 플레이어가 "지금 무엇을 해야 하지?"를 잃어버리지 않도록 다음 행동 후보를 항상 시각적으로 보여준다.

---

# 2. 전체 정보 구조

V1은 아래 5개 메인 화면으로 구성한다.

```text
[서비스]  [기능]  [기술]  [학습]  [리포트]
```

기본 진입 화면은 `서비스`다.

- **서비스**: 현재 서비스/인프라를 한눈에 보고 직접 조작하는 핵심 화면
- **기능**: 완료/진행/예정 기능을 카드로 확인
- **기술**: Redis, Queue, ALB, Object Storage 등 기술 구축
- **학습**: Fundamental → Language → Framework/Technology 스킬 트리
- **리포트**: DAU, 수익, 비용, 장애, 히스토리

게임의 80%는 `서비스` 화면에서 처리 가능하도록 한다.

---

# 3. 공통 상단 HUD

모든 화면 최상단에 고정한다.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Day 183      DAU  31.2K ↑      Cash ₩1.24M      MRR ₩620K          │
│                                        Profit -₩310K   ⏸  ▶ x1  ▶▶ x2│
└──────────────────────────────────────────────────────────────────────┘
```

## 항상 보여줄 값

- Game Day
- DAU + 전일 방향
- Cash
- 예상 월 매출
- 예상 월 손익
- Pause / x1 / x2

## 표현 원칙

숫자에 설명 문장을 붙이지 않는다.

예:

```text
👥 31.2K ↑
💰 ₩1.24M
📈 ₩620K
📉 -₩310K
```

처음 플레이에서는 아이콘 아래 작은 label을 보여주고, 익숙해지면 설정으로 축소할 수 있다.

---

# 4. 메인 화면 — 서비스

가장 중요한 화면이다.

## Desktop Wireframe

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ HUD                                                                           │
├──────────────┬───────────────────────────────────────────────┬────────────────┤
│              │                                               │                │
│   진행 작업   │               SERVICE MAP                     │   NOW / ALERT  │
│              │                                               │                │
│ [기능 개발]   │                  👥 Users                      │ [DB 위험]       │
│ █████░ 62%   │                     │                          │ PostgreSQL 92%  │
│              │                     ▼                          │ [확인]          │
│ [기술 구축]   │            ┌────────────────┐                 │                │
│ Redis 30%    │            │ Spring Boot    │                 │ [학습 가능]      │
│              │            │ App 74%        │                 │ Spring Lv2      │
│ [학습]        │            └──────┬─────────┘                 │ [학습]          │
│ 비어 있음 +   │                   │                           │                │
│              │       ┌───────────┼───────────┐               │ 다음 정산 D-8   │
│ [장애 대응]   │       ▼           ▼           ▼               │ 예상 -₩310K      │
│ 비어 있음     │   PostgreSQL    SQS      Object Storage      │                │
│              │     92% 🔶      48% 🟢        21% 🟢          │                │
│              │       │                                       │                │
│              │     Redis                                     │                │
│              │     BUILDING                                  │                │
├──────────────┴───────────────────────────────────────────────┴────────────────┤
│  서비스     기능       기술       학습       리포트                            │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

# 5. Service Map

UI의 중심이다.

## 기본 구조

```text
Users
  │
  ▼
Application
  │
  ├──────────────► Queue
  │
  ├──────────────► Object Storage
  │
  ▼
Database
  │
  └──────────────► Redis
```

각 노드는 실제 배치된 기술만 표시한다.

초기에는:

```text
Users
  │
  ▼
Application
  │
  ▼
Database
```

이후 기술을 도입하면 노드가 **서비스 지도 위에 실제로 추가되는 애니메이션**을 사용한다.

이것 자체가 성장 보상이 된다.

## Node 표현

각 노드는 기본적으로 아래만 보여준다.

```text
┌───────────────────┐
│      [아이콘]       │
│   PostgreSQL      │
│                   │
│     92% 🔶        │
└───────────────────┘
```

### 상태

- 0~69%: Stable
- 70~89%: Busy
- 90~100%: Critical
- >100%: Overload
- 장애: 빨간 pulse + 장애 아이콘

색만 의존하지 않고 모양/아이콘도 사용한다.

```text
Stable    ●
Busy      ▲
Critical  !
Incident  ⚡
```

---

# 6. 노드를 눌렀을 때

새 페이지로 이동하지 않는다.

우측에서 `Inspector Drawer`가 열린다.

## Application Node

```text
Spring Boot
Lv.3

Load
████████░░ 78%

Medium ×1
Capacity 198

월 ₩210K

[ Small ] [ Medium ✓ ] [ Large ] [ XL ]

           + Server
           🔒 ALB 필요
```

Scale-up은 Server Size 그림을 눌러 수행한다.

Scale-out은 서버 카드가 옆으로 추가되는 방식으로 표현한다.

```text
[ SERVER ]  [ + ]
```

ALB가 생긴 후:

```text
             [ ALB ]
             /    \
       [SERVER] [SERVER]
```

즉 숫자 `count=2`만 보여주지 않고 **실제로 서버 그림을 2개 표시**한다.

---

# 7. Database Node

```text
PostgreSQL
Lv.2

DB Load
█████████░ 92%

[Medium]

Primary
 🛢️

Replica
 🛢️  [+]

Cache
 Redis
 🟡 구축 중
```

Replica 추가도 숫자 버튼이 아니라 DB cylinder 그림의 `+`를 누른다.

예:

```text
Primary      Replica      Replica
  🛢️           🛢️           [+]
```

최대 3개까지 그림이 늘어난다.

---

# 8. Queue 선택

Async가 없는 초기에는 Queue 영역 자체를 흐리게 표시한다.

알림 / AI / Feed 등 Async Load가 생기면 빈 슬롯이 활성화된다.

```text
Async

        [+ Queue]
```

누르면 카드 3장이 펼쳐진다.

```text
┌──────────┐ ┌──────────┐ ┌──────────┐
│   SQS    │ │ RabbitMQ │ │  Kafka   │
│   쉬움    │ │   중간    │ │   어려움  │
│   300    │ │   500    │ │   1000   │
│ ₩80K/mo  │ │ ₩150K/mo │ │ ₩350K/mo │
└──────────┘ └──────────┘ └──────────┘
```

카드를 hover하면 "왜 이걸 써야 하는지"를 한 문장으로만 보여준다.

- SQS: 가장 빠르게 Async 부하를 분리
- RabbitMQ: 더 높은 처리량, 구축 난이도 증가
- Kafka: 대규모 Event 처리에 유리

---

# 9. 선택 전후 비교 UI

기술/서버 선택에서 가장 중요하다.

플레이어에게 수식을 보여주지 않고 **예상 변화**를 보여준다.

예: Redis 카드 선택

```text
현재               도입 후 예상

DB 93%              DB 68%
█████████░    →     ███████░░░

월 비용
₩250K         →     ₩350K

구축
9 Days

[Redis 구축]
```

이 UI가 있어야 플레이어가 계산기를 들고 게임하지 않는다.

---

# 10. 좌측 — Work Slots

항상 4개의 슬롯이 보인다.

```text
Feature
Technology
Learning
Incident
```

## 비어 있을 때

```text
Learning

   ＋
비어 있음
```

누르면 바로 학습 화면/선택 Overlay로 이동한다.

## 진행 중

```text
AI 추천

██████░░░░ 61%

약 8일
```

정확한 ETA 대신 현재 숙련도/장애 상태를 반영한 **예상 ETA**를 표시한다.

Feature 슬롯은 Requirement 발생 시 자동으로 채워진다.

---

# 11. Requirement Event

새 기능 요구가 발생하면 게임을 자동 Pause 한다.

전체 화면을 막는 긴 Modal 대신 중앙에 큰 카드 하나를 띄운다.

```text
               NEW REQUIREMENT

                 🔔 알림

             성장      +0.5%p

          APP +1     DB +1
              ASYNC +3

             개발이 시작됩니다

                 [확인]
```

중요: `개발 시작` 버튼이 아니다.

이미 개발은 강제 시작 상태이며 버튼은 `확인`만 제공한다.

---

# 12. Incident Event

장애도 발생 즉시 Pause.

해당 노드가 Service Map에서 빨갛게 점멸한다.

중앙 카드:

```text
⚡ MAJOR INCIDENT

PostgreSQL

성장       -3%p
개발 속도   -30%

예상 대응   6 Days

[대응 시작]     [나중에]
```

`나중에`를 선택할 수 있으며 장애 효과는 계속 유지된다.

여러 장애가 누적된 경우 Service Map에서 각 노드에 빨간 badge를 보여준다.

---

# 13. 우측 — NOW / ALERT

이 영역은 플레이어에게 정답을 알려주는 AI 추천 패널이 아니다.

**현재 발생한 사실과 주목할 항목**만 알려준다.

예:

```text
⚠ PostgreSQL 93%

🎓 Spring Lv.2 학습 가능

💸 다음 정산 D-4
   예상 Cash ₩120K

📦 Storage Load 상승 중
```

## 금지

```text
"지금 Redis를 구축하세요"
```

처럼 정답을 직접 지시하지 않는다.

대신:

```text
"DB Load 93%"
```

을 누르면 관련 선택지를 보여준다.

플레이어가 해결 방법을 고르게 한다.

---

# 14. 기능 화면

Feature는 표가 아니라 **Phase Board**로 보여준다.

```text
EARLY

[댓글 ✓]   [이미지 ✓]   [좋아요 개발 중]

───────────────

GROWTH

[ ? ]      [ ? ]      [ ? ]

───────────────

SCALE

[ ? ] [ ? ] [ ? ] [ ? ]
```

Seed로 아직 공개되지 않은 기능은 `?` 카드로 둔다.

이렇게 해야 랜덤 순서를 미리 알 수 없다.

완료한 Feature를 누르면:

```text
이미지 업로드

Growth +0.5%p

App  +1
DB   +1
Storage +3

완료 Day 131
```

정도만 보여준다.

---

# 15. 기술 화면

기술은 카테고리별로 시각화한다.

```text
TRAFFIC
[ ALB ]

CACHE
[ Redis ]

ASYNC
[ SQS ] [ RabbitMQ ] [ Kafka ]

STORAGE
[ Object Storage ]
```

각 기술 카드는 세 상태만 가진다.

- 잠김
- 구축 가능
- 구축 완료

### 잠김

카드 자체는 보여주되 흐리게 한다.

```text
Kafka 🔒

Network Lv.3
OS Lv.3
Design Lv.3
```

Prerequisite 설명도 문장보다 Skill 아이콘 + 레벨로 표시한다.

---

# 16. 학습 화면

V1에서 가장 복잡할 수 있으므로 **스킬 트리**를 사용한다.

```text
        FUNDAMENTALS

 Network    OS      DB      DSA     Security    Design
    │        │       │       │          │          │
    └─────┐  └───┐   │       │          │          │
          ▼      ▼   │       ▼          │          │
        Java    Go   ...                          ...
          │
          ▼
       Spring

 DB + Network ──────────────► Redis
 Network + Design ──────────► SQS
 Network + OS + Design ─────► Kafka
```

노드 안에는 최대 3개 정보만 보여준다.

```text
Spring
Lv.3
████░ 34/45d
```

노드를 누르면 Drawer:

```text
Spring Boot
Lv.3 → Lv.4

Experience
34 / 36 Days ✓

Java Lv.4 ✓

Study
4 Days

Cost
₩200K

[학습 시작]
```

조건이 안 되면 버튼 대신 부족한 선행 노드가 연결선에서 강조된다.

---

# 17. 리포트 화면

여기만 숫자와 그래프를 허용한다.

## 카드 1 — DAU

Line chart

## 카드 2 — Revenue / Cost

두 개의 line 또는 bar

## 카드 3 — Infrastructure Cost 구성

- App
- DB
- Cache
- Queue
- Storage
- AI

## 카드 4 — Timeline

```text
Day 18  🚀 Service Launch
Day 93  💬 댓글 출시
Day 127 ⚡ PostgreSQL Major Incident
Day 135 🧠 Redis 구축
Day 171 📈 Viral
```

리포트는 게임을 진행하는 화면이 아니라 회고용이다.

---

# 18. Game Start UI

처음부터 Drop-down으로 Stack을 선택하지 않는다.

## Step 1 — Language / Framework 카드

```text
Java        TypeScript       Go        Python       C#

 ☕            TS            Go         🐍          C#
Spring       NestJS         Gin       FastAPI    ASP.NET
```

Framework를 선택하면 해당 Language가 같이 선택되는 구조를 권장한다.

즉 V1에서는 `Java 선택 → Spring 선택`이라는 2단계 UI를 굳이 만들지 않는다.

카드 선택 시 Trait만 짧게:

```text
Spring Boot

🛡 Stable
Capacity +10%
Cost +5%
```

```text
FastAPI

✨ AI Friendly
AI Feature Dev -25%
Cost +10%
```

## Step 2 — Database 카드

```text
PostgreSQL        MySQL         MongoDB

Transaction       Cheap         Flexible
```

선택 후:

```text
[서비스 시작]
```

누르면 Bootstrap 개발이 자동 시작된다.

---

# 19. Mobile 대응

V1은 웹 중심으로 가되 최소한 좁은 화면에서도 망가지지 않도록 한다.

Desktop의 3-column을 그대로 축소하지 않는다.

Mobile / narrow width에서는:

```text
HUD

Service Map

Work Slots (horizontal cards)

Alerts

Bottom Navigation
```

Inspector는 오른쪽 Drawer가 아니라 Bottom Sheet.

다만 V1의 1차 UX 최적화 대상은 Desktop이다.

---

# 20. 애니메이션

게임성을 살리되 기능성을 방해하지 않는다.

사용:

- 새 서버 추가 → 노드가 복제되어 나타남
- ALB 도입 → 연결선이 재배치됨
- Redis 도입 → DB 옆에 Cache 노드 등장
- 장애 → node pulse
- Overload → Load gauge shake/pulse를 아주 약하게
- Feature Complete → 해당 Feature icon이 Service Map 주변에서 짧게 표시
- DAU milestone → HUD 숫자 count-up

금지:

- 지속적으로 흔들리는 UI
- 화면 전체 particle 효과
- 긴 transition
- 숫자를 읽기 어려운 과한 애니메이션

---

# 21. UI 상태 모델

React 컴포넌트가 Domain 객체를 직접 해석하지 않도록 Application Layer에서 ViewModel을 제공한다.

예상 구조:

```text
src/
  core/
    ...existing domain...

  application/
    GameController.ts
    GameClock.ts
    selectors/
      selectHudView.ts
      selectServiceMapView.ts
      selectWorkSlotsView.ts
      selectAlertsView.ts
      selectLearningTreeView.ts
      selectTechnologyCatalogView.ts

  ui/
    game/
      GameShell.tsx
      Hud.tsx
      ServiceMap/
      WorkSlots/
      AlertRail/
      inspectors/
      modals/
    features/
    technologies/
    learning/
    reports/
```

## 중요한 원칙

UI는 아래처럼 사용한다.

```ts
const view = controller.getView();
controller.scaleDatabase('LARGE');
controller.startTechnologyBuild('REDIS');
```

UI가 아래를 직접 하면 안 된다.

```ts
if (dau > 100000 && dbLoad > 0.9) {
  // game rule
}
```

---

# 22. 컴포넌트 후보

## Game Shell

- `GameHud`
- `MainNavigation`
- `GameEventOverlay`

## Dashboard

- `ServiceMap`
- `InfrastructureNode`
- `ConnectionEdge`
- `LoadGauge`
- `WorkSlotRail`
- `AlertRail`
- `NodeInspector`

## Feature

- `PhaseLane`
- `FeatureCard`
- `LockedFeatureCard`

## Technology

- `TechnologyCategory`
- `TechnologyCard`
- `TechnologyComparisonSheet`

## Learning

- `SkillTree`
- `SkillNode`
- `SkillConnection`
- `SkillInspector`

## Report

- `DauChart`
- `FinanceChart`
- `CostBreakdown`
- `GameTimeline`

---

# 23. 구현 우선순위

## UI Milestone 1 — 실제 플레이 가능

1. `GameClock`
2. `GameController`
3. Stack 선택 화면
4. HUD
5. Service Map
6. Work Slots
7. Requirement / Incident Overlay
8. Node Inspector
9. Technology Build 선택
10. Learning 선택

여기까지 완료하면 **처음부터 파산/Exit까지 플레이 가능한 상태**가 되어야 한다.

## UI Milestone 2 — 사용성

11. 선택 전후 Preview
12. Alert Rail
13. Feature Phase Board
14. Technology Catalog
15. Learning Tree 개선

## UI Milestone 3 — 게임성

16. Report
17. Timeline
18. 전환/노드 애니메이션
19. 사운드(추후 판단)

---

# 24. UX 판단 기준

각 UI를 만들 때 아래 질문으로 검토한다.

1. 사용자가 설명서를 읽지 않고 눌러볼 수 있는가?
2. 선택하기 전에 비용과 효과를 알 수 있는가?
3. 문제가 발생한 위치가 Service Map에서 바로 보이는가?
4. 현재 가능한 행동과 불가능한 행동이 형태만 봐도 구분되는가?
5. 같은 숫자를 여러 화면에서 반복하고 있지 않은가?
6. UI가 Game Rule을 소유하고 있지 않은가?

---

# 25. 현재 기본 결정안

별도 의견이 없다면 구현은 아래 방향으로 진행한다.

- Desktop-first
- Dark dashboard가 아닌 **밝고 게임적인 중성 UI**
- Card + Node 중심
- Service Map을 메인 화면 중앙에 크게 배치
- 좌측 Work Slots / 우측 Alerts
- 상세 정보는 Drawer
- 이벤트는 자동 Pause + 중앙 Event Card
- Framework는 Language와 한 세트 카드로 선택
- 기술 도입 시 선택 전/후 Load Preview 제공
- 스킬은 List가 아니라 Tree
- 리포트 외 화면에서는 Chart 사용 최소화

---

# 26. 사용자 판단이 필요한 부분

## 결정 A — 전체 비주얼 톤

### A1. 밝은 스타트업/게임 UI — 기본 추천

```text
오프화이트 배경
둥근 카드
깔끔한 아이콘
상태 색상만 강하게
```

장점: 직관적이고 부담이 적다.

### A2. 개발자 콘솔/다크 UI

```text
다크 배경
모니터링 대시보드 느낌
네온 상태 색상
```

장점: 개발자 게임이라는 정체성이 강하다.
단점: Grafana/관리자 도구처럼 보일 가능성이 높다.

**현재 기본값: A1**

---

## 결정 B — Service Map 자유 배치 여부

### B1. 자동 배치 — 기본 추천

게임이 기술에 맞춰 노드를 자동 배치한다.
플레이어는 구조를 조작하지 않는다.

장점:
- 훨씬 쉬움
- 모바일 대응 쉬움
- 게임 규칙과 UI가 명확함

### B2. 직접 Drag & Drop

플레이어가 노드를 자유 배치.

장점: 내 시스템을 만든다는 느낌.
단점: 게임에 의미 없는 편집 작업이 생긴다.

**현재 기본값: B1**

---

## 결정 C — 사건 발생 시 자동 Pause

### C1. Requirement + Major/Critical 장애만 자동 Pause — 기본 추천

Minor는 알림만 표시.

### C2. 모든 장애 자동 Pause

더 안전하지만 플레이 흐름을 자주 끊는다.

**현재 기본값: C1**

---

# 27. 최종 UX 목표

플레이어가 이런 식으로 생각하게 만들어야 한다.

```text
"어? DB가 빨간색이네"
        ↓
PostgreSQL 그림 클릭
        ↓
"Replica / Scale-up / Redis가 있네"
        ↓
Redis 클릭
        ↓
"DB 94% → 69%, 대신 월 +100K구나"
        ↓
구축
```

반대로 아래 흐름은 피한다.

```text
DB Load 94.128%
DB Capacity = 80
Read Heavy Modifier = 0.7
Replica Formula = ...
```

플레이어가 시스템 설계의 **원인과 결과**는 배우되, 계산식을 읽는 게임이 되어서는 안 된다.
