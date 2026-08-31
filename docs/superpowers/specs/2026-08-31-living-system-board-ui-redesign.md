# Dev to Scale — Living System Board UI/UX Redesign

**Status:** Approved design direction, implementation pending  
**Base:** `feature/playable-mvp`  
**Design direction:** Living System Board  
**Visual foundation:** existing developer-console dark UI, restructured as an interactive simulation board

## 1. Goal

Dev to Scale의 UI를 운영 대시보드처럼 정보를 나열하는 화면에서, **서비스가 살아 움직이고 플레이어가 구조를 보며 판단하는 시뮬레이션 보드**로 재구성한다.

플레이어는 기본 서비스 화면을 열고 **3초 안에** 다음을 알아야 한다.

1. 지금 서비스가 정상인지 위험한지.
2. 가장 큰 병목이 어디인지.
3. 현재 무엇이 진행 중인지.
4. 당장 대응해야 할 일이 있는지.
5. 시간이 흐르면서 오늘 무엇이 변했는지.

기존 게임 규칙, Application ViewModel 경계, Service Map 자동 배치, 자동 pause 정책은 유지한다. 이번 변경의 핵심은 규칙 변경이 아니라 **정보 우선순위, 탐색 구조, 시각 피드백, 상호작용 표현**이다.

## 2. Product register and audience

이 화면은 marketing UI가 아니라 **product/game UI**다.

주 사용자는 백엔드·인프라·클라우드 개념을 익히거나 즐기는 개발자다. 실제 AWS Console/Grafana의 복잡도를 복제하지 않고, 실무 개념을 시각적으로 이해할 수 있을 만큼 정확하면서도 게임처럼 즉각적인 피드백을 제공해야 한다.

### North Star

> “내가 만든 서비스가 하나의 살아 있는 시스템처럼 보이고, 어디를 손대야 할지 화면 자체가 말해준다.”

### Anti-references

다음처럼 보이면 실패다.

- AWS Console
- Grafana dashboard
- DB admin tool
- 로그 모니터링 화면
- 네온/Matrix 해커 UI
- 모든 데이터를 동일한 카드 무게로 나열하는 SaaS dashboard

## 3. Core UX principle — hierarchy before density

현재 구현은 정보량 자체보다 **모든 정보가 거의 같은 시각적 무게를 가지는 것**이 문제다.

새 UI는 정보를 세 단계로 나눈다.

### Primary — 지금 판단에 직접 필요한 것

- 현재 서비스 구조
- 위험/장애 위치
- DAU
- Cash
- 현재 날짜/시간 흐름
- 현재 진행 중 작업
- 즉시 대응 가능한 alert

### Secondary — 판단을 보조하는 것

- 월 예상 매출/비용/순이익
- 각 노드의 상세 capacity
- 다음 정산
- observability 상세 수준
- workload trace 상세

### Tertiary — 분석/학습용 정보

- 긴 히스토리
- 상세 비용 breakdown
- 상세 리포트
- 이미 완료된 옵션의 설명
- 낮은 우선순위 알림

Primary는 기본 화면에 노출하고, Secondary는 compact summary/Inspector/hover에서, Tertiary는 Report나 상세 패널에서 제공한다.

## 4. Signature interaction — Service Pulse

이번 디자인에서 가장 기억에 남는 한 가지 요소는 **Service Pulse**다.

Service Pulse는 장식용 waveform이 아니라 **하루가 지나며 시스템이 어떻게 변했는지 알려주는 짧은 상태 피드백**이다.

예:

```text
M3 · D12   ────────────●────────────   DAU +3 · DB pressure ↑ · Net -₩120K
```

원칙:

- 지속적인 화려한 animation 금지.
- day progression과 연결된 짧은 pulse만 사용.
- 최대 1~2개의 중요한 변화만 요약.
- 위험 상태는 색뿐 아니라 아이콘/텍스트 변화도 포함.
- `prefers-reduced-motion`에서는 움직임 없이 상태 변경만 표현.

Service Pulse 때문에 다른 곳에 불필요한 glow/particle을 추가하지 않는다.

## 5. Desktop information architecture

기본 서비스 화면은 Service Map이 약 65~70%의 시각적 중심을 차지한다.

```text
┌──────────────────────────────────────────────────────────────────┐
│ M3 · D12      12.4K DAU ↑        ₩3.2M CASH       Ⅱ ▶ ▶▶ +1D   │
│ ───────────── Service Pulse / daily delta ────────────────────── │
├───────────┬───────────────────────────────────────────────┬──────┤
│ ACTIVE    │                                               │ NOW  │
│ Feature   │                  USERS                        │ ! DB │
│ ███ 62%   │                    ↓                          │ 92%  │
│           │             ┌────────────┐                    │      │
│ Tech      │             │ SPRING APP │                    │ D-4  │
│ Redis 30% │             └─────┬──────┘                    │ 정산 │
│           │          ┌────────┼────────┐                  │      │
│ Learn     │         DB       Queue    Storage             │      │
│ idle      │        92%!       48%       21%               │      │
│           │             ↳ Redis building                  │      │
├───────────┴───────────────────────────────────────────────┴──────┤
│ SERVICE                 BUILD                  REPORT             │
└──────────────────────────────────────────────────────────────────┘
```

### Structural changes

- 기존 HUD의 다섯 KPI box를 제거한다.
- `Day / DAU / Cash / Clock`만 1차 HUD에 남긴다.
- Revenue/Cost/Profit은 compact financial summary로 2차화한다.
- Service Map은 panel 중 하나가 아니라 workspace의 중심 surface가 된다.
- Work rail은 진행 중 작업을 보여주는 narrow active rail로 축소한다.
- Alert rail은 모든 알림을 동일하게 쌓지 않고 top actionable state를 우선한다.
- primary navigation은 `Service / Build / Report` 세 vocabulary로 통일한다.

## 6. Visual system

기존 dark developer-console 정체성은 유지하되, 과도한 terminal/monitoring 느낌을 제거한다.

### Palette

- **Obsidian** `#080B0F` — application background
- **Graphite** `#10161D` — primary surface
- **Raised Graphite** `#151D26` — selected/interactive surface
- **Steel** `#26313C` — divider/border
- **Signal Blue** `#4CA7FF` — selection/navigation/action
- **Mint** `#58D68D` — healthy/success
- **Amber** `#F4B860` — warning/busy
- **Coral** `#FF6577` — danger/incident
- **Fog** `#93A2B1` — secondary text
- **Ice** `#EDF4FA` — primary text

Color is semantic. 상태 표현은 반드시 icon/shape/text와 함께 사용한다.

### Typography

세 역할을 분리한다.

- **Display / section status:** narrow industrial sans stack (`Bahnschrift`, `DIN Alternate`, `Arial Narrow`, system fallback)
- **Body / Korean UI:** system sans stack optimized for Korean readability
- **Data / cost / capacity:** `ui-monospace`, `SFMono-Regular`, `Menlo`, monospace

Mono는 숫자와 기술적 짧은 metadata에만 사용한다. 일반 설명 문장을 mono로 만들지 않는다.

### Shape and depth

- 기본 radius는 8~12px 범위.
- 카드마다 강한 border를 두지 않는다.
- hierarchy는 background level, spacing, typography로 먼저 만든다.
- static panel에 큰 shadow 금지.
- glow는 selected node, incident, Service Pulse처럼 의미 있는 상태에만 제한.

## 7. HUD redesign

HUD의 목적은 dashboard가 아니라 **게임 시간과 생존 상태 확인**이다.

### Always visible

- Month/Day
- DAU + direction/delta
- Cash
- pause/x1/x2/+1D
- Service Pulse

### Secondary financial summary

Revenue/Cost/Profit은 한 compact 영역에서 묶는다.

```text
MONTHLY      Revenue 1.8M   Cost 1.2M   Net +0.6M
```

각 항목을 독립 카드로 만들지 않는다.

### Behavior

- Clock 버튼 크기는 상태 변경 중에도 고정.
- active speed가 색 외에도 shape/fill로 구분되어야 한다.
- keyboard focus가 명확해야 한다.
- HUD 변화가 아래 workspace layout을 밀지 않아야 한다.

## 8. Service Map redesign

Service Map은 게임의 핵심 object다.

### Node hierarchy

노드 기본 표시는 다음만 포함한다.

- icon
- technology/service name
- load percent
- semantic state
- 매우 짧은 secondary detail

노드에 capacity 전체, 비용 전체, 긴 문장을 넣지 않는다.

### Visual state

- Stable: calm surface + Mint indicator
- Busy: Amber indicator + slightly stronger load bar
- Critical: Amber/Coral transition + `!`
- Overload: Coral + explicit overload label
- Incident: lightning icon + restrained pulse
- Selected: Signal Blue border/focus halo
- Building: construction/progress state, 별도 node opacity/pattern

### Request flow

현재 request trace 기능은 유지한다. 단, particle은 관찰 가능성이 해금된 경우에만 표시하고 다른 animation과 경쟁하지 않아야 한다.

Trace selector는 toolbar의 작은 control로 유지하되, Service Map보다 시각적으로 강하면 안 된다.

## 9. Work rail

현재 4개의 큰 work-slot card를 모두 동일하게 보여주는 구조를 축소한다.

목표는 “현재 무엇이 돌아가고 있는가”를 빠르게 확인하는 것.

각 slot은 다음을 표시한다.

- category icon/label
- 현재 작업 이름
- progress
- idle 여부

활성 slot이 우선이고 idle slot은 낮은 contrast로 유지한다.

클릭 시 Build 화면에서 해당 option이 선택되는 기존 연결은 유지한다.

## 10. Actionable alert stack

Alert는 “알림 목록”이 아니라 “지금 대응할 수 있는 상태”로 설계한다.

우선순위:

1. Major/Critical incident
2. overload/capacity danger
3. required dependency gap
4. settlement/runway danger
5. learning/build opportunity
6. informational state

기본 서비스 화면에는 top 1~3개만 강하게 보여준다. 나머지는 compact count 또는 secondary drawer/report로 이동한다.

Alert가 node에 연결된 경우 클릭하면 해당 node Inspector를 연다.

## 11. Node Inspector redesign

Inspector의 읽기 순서를 **상태 → 원인 → 대응 → 비용/효과**로 바꾼다.

```text
PostgreSQL                       ×
CRITICAL · 92%

WHY IT MATTERS
Read I/O pressure is near capacity

CURRENT
M · Primary + 1 Replica
₩180K / month

OPTIONS
[ Scale M → L ]     +₩80K/mo
  CPU +... / IO +...

[ + Read Replica ]  +₩60K/mo
  Read I/O +...

INCIDENT / BLOCKER if any
```

원칙:

- size option을 단순 S/M/L/XL grid로만 보여주지 않는다.
- current option은 명확하지만 비활성처럼 보여서는 안 된다.
- 가능한 대응의 **변화량/비용**을 현재값 옆에서 비교할 수 있어야 한다.
- 실제 preview 데이터가 Application ViewModel에 존재하지 않는 값은 UI에서 계산하지 않는다.
- UI가 게임 규칙을 추론하지 않는다.

## 12. Build / Development screen

현재 `DevelopmentWorkbench`의 핵심 기능은 유지하되, admin list 느낌을 줄인다.

새 구조는 decision board다.

### Sections

- **In progress** — 현재 수행 중 작업
- **Available now** — 지금 실행 가능한 결정
- **Locked / needs** — 선행 조건 때문에 아직 불가능
- **Completed** — 기본적으로 시각적 우선순위를 낮춤

Feature/Tech/Learn filter는 secondary control로 유지한다.

행의 핵심 비교값은 `time / upfront / monthly / key effect`다. 긴 benefit/risk/requirement는 Inspector에서 제공한다.

실행은 기존 confirmation dialog를 유지하되 visual language를 공통 dialog system으로 통일한다.

## 13. Report screen

Report는 density가 허용되는 유일한 주요 화면이다.

하지만 service UI와 동일한 semantic colors/type roles를 사용한다.

- trend와 before/after 비교 중심
- 긴 raw data table을 기본값으로 만들지 않음
- 사건/기능 출시/기술 도입 시점을 chart annotation으로 연결할 수 있도록 확장 가능하게 설계

이번 1차 redesign에서는 Report의 data semantics는 변경하지 않고 visual consistency 위주로 맞춘다.

## 14. Mobile contract

모바일은 desktop dashboard를 세로로 쌓는 방식으로 만들지 않는다.

### HUD

상단에 다음만 고정한다.

- Day
- DAU
- Cash
- clock controls

Revenue/Cost/Profit은 expandable summary나 Report에서 확인한다.

**HUD metric horizontal scroll은 제거한다.**

### Service screen

우선순위:

1. Service Map
2. actionable alerts
3. active work
4. secondary finance

Bottom navigation은 `Service / Build / Report`를 유지한다.

### Interaction

- 최소 touch target 44px 수준을 목표로 한다.
- hover-only 정보 금지.
- Inspector는 narrow viewport에서 full-height sheet/drawer로 동작.
- safe-area를 유지한다.

## 15. Accessibility and motion

WCAG 2.2 AA를 목표로 한다.

필수:

- clickable UI는 native button/link 사용
- visible `:focus-visible`
- 상태를 색만으로 전달하지 않음
- icon-only control에 accessible name
- dialog/drawer focus restoration
- `prefers-reduced-motion` 지원
- scrollbar를 aesthetics 때문에 숨기지 않음
- keyboard로 Service/Build/Report와 주요 node/action 접근 가능

기존 mobile CSS의 hidden horizontal scrollbar 패턴은 제거 대상이다.

## 16. Canonical ownership

구현 시 다음 canonical owner를 사용한다.

| Capability | Owner |
|---|---|
| Visual tokens | project-root `DESIGN.md` → runtime CSS variables |
| App shell/navigation | `GameApp` + `game-navigation` shared structure |
| HUD/time controls | `Hud` |
| Service state surface | `ServiceDashboard` |
| Architecture visualization | `TopologyMap` |
| Node actions | `NodeInspector` |
| Build decision flow | `DevelopmentWorkbench` |
| Toast/status | current GameApp toast behavior, migrated to a shared presentation primitive if reuse expands |
| Confirmation dialog | current Development dialog behavior, visual primitive to be shared if additional dialogs require it |

`DESIGN.md`는 implementation 첫 changeset에서 runtime token 변경과 함께 생성한다. 문서와 CSS를 독립적으로 변경하지 않는다.

## 17. Implementation phases

### Phase 1 — Foundation + primary play surface

- Create `DESIGN.md` and map its tokens to runtime CSS variables in the same changeset.
- Redesign App shell/navigation.
- Redesign HUD + Service Pulse surface.
- Redesign Service Dashboard hierarchy.
- Restyle/restructure Topology Map nodes and workspace.
- Redesign Node Inspector.
- Remove mobile HUD horizontal scrolling and establish responsive primary hierarchy.

### Phase 2 — Decision surfaces

- Migrate DevelopmentWorkbench to the decision-board hierarchy.
- Unify confirmation/dialog and state presentation.
- Align Report visuals with the new system.

### Phase 3 — polish and resilience

- interaction states and keyboard audit
- reduced motion
- scrollbar baseline
- narrow viewport verification
- long Korean copy / overflow verification
- empty/error/disabled/loading states
- visual cleanup: remove redundant borders/glows/labels

## 18. Testing strategy

Implementation must be behavior-preserving unless a specific UX behavior is listed in this spec.

Required verification:

- existing unit tests remain green
- UI component tests updated for new hierarchy/labels where behavior changes
- navigation remains `Service / Build / Report`
- node click still opens matching inspector
- work slot still deep-links to the matching Build option
- alert click still selects related topology node when available
- clock controls retain pause/x1/x2/+1D behavior
- dialogs keep Escape/focus-trap/focus-restoration behavior
- mobile has no hidden horizontally scrolling HUD metrics
- keyboard focus visible across primary controls
- reduced-motion mode disables non-essential repeated motion
- typecheck + production build pass

## 19. Non-goals

이번 redesign에서 하지 않는다.

- game economy/balance changes
- topology/domain rule changes
- new infrastructure technologies
- new report metrics
- framework/database selection rule changes
- UI layer에서 capacity/growth/game-rule 계산 추가
- full animation engine
- external component library migration

## 20. Acceptance criteria

디자인 작업은 다음 조건을 만족해야 한다.

1. Service Map이 명확한 화면의 주인공이다.
2. 첫 화면에서 KPI card wall처럼 보이지 않는다.
3. 3초 안에 service health, biggest problem, current work를 파악할 수 있다.
4. 실제 운영도구가 아니라 게임처럼 보이지만, 기술 의미는 훼손하지 않는다.
5. Node Inspector에서 현재 상태와 가능한 대응의 비용/효과를 비교하기 쉽다.
6. Build 화면은 admin list가 아니라 decision surface처럼 읽힌다.
7. 모바일 HUD는 horizontal scroll 없이 핵심 상태를 보여준다.
8. 상태는 색 하나에 의존하지 않는다.
9. motion은 Service Pulse/incident/request flow처럼 의미 있는 곳에만 사용한다.
10. 기존 game/application boundary와 핵심 interaction contract는 유지된다.
