# Dev to Scale V1 비주얼 스타일

## 확정 방향

V1의 기본 비주얼은 **A2 — 개발자 콘솔 / 다크 UI**로 확정한다.

단, 실제 운영도구나 Grafana처럼 보이는 것을 피하고 **게임 UI로 느껴지도록** 설계한다.

## 핵심 원칙

- 다크 배경 + 높은 대비
- Service Map 중심
- 카드/노드/아이콘을 직접 눌러 조작
- 텍스트는 보조 정보로 사용
- 정상/주의/위험/장애 상태는 색상 + 아이콘 + 모션을 함께 사용
- 숫자 표시는 짧고 굵게
- 개발자 도구 느낌은 살리되 로그/표/설정 화면처럼 보이지 않게 한다

## 시각 계층

### 1. 기본 배경

- 아주 짙은 회색/남색 계열
- 완전 검정(#000) 사용은 최소화
- 패널은 배경보다 한 단계 밝게
- 카드 경계는 얇고 낮은 대비

### 2. 강조 색상

상태 색상은 의미를 일관되게 유지한다.

- Stable: Green
- Busy: Yellow
- Critical: Orange
- Overload / Incident: Red
- 선택/활성 상태: Blue 또는 Cyan 계열
- 잠금/비활성: Gray

상태를 색상에만 의존하지 않는다.

```text
Stable      ●
Busy        ▲
Critical    !
Incident    ⚡
Locked      🔒
```

## Service Map

메인 화면의 가장 큰 영역을 차지한다.

```text
             USERS
               │
              ALB
            /     \
       APP       APP
          \       /
             DB
          /       \
      Redis      Queue
                    \
                 Storage
```

각 노드는 다음 정보를 최소 단위로 표시한다.

```text
┌─────────────────┐
│ PostgreSQL   ●  │
│                 │
│      91%        │
│    3 Replicas   │
└─────────────────┘
```

노드를 클릭하면 우측 Inspector가 열린다.

## 카드 스타일

카드는 단순한 데이터 박스가 아니라 **게임에서 선택하는 오브젝트**처럼 보여야 한다.

Hover:
- 테두리 밝아짐
- 1~2px 정도 미세한 이동
- 선택 가능한 카드임을 명확히 표시

Selected:
- Accent border
- 약한 glow
- 선택 전/후 Preview 연결

Disabled:
- opacity 감소
- 🔒 표시
- 필요한 Skill 노드를 함께 표시

## 애니메이션

허용:
- 새 기술 배치 시 Node 등장
- 서버 Scale-out 시 서버 카드가 복제되어 나타남
- Redis/Queue 추가 시 연결선 생성
- 장애 Node pulse
- Requirement 도착 시 중앙 카드 등장
- Load 급증 시 Gauge 짧은 pulse
- Milestone에서 숫자 count-up

금지:
- 화면 전체 particle
- 지속적인 깜빡임
- 긴 transition
- 과한 네온 glow
- Matrix/해커 콘솔 같은 장식

## HUD

상단 HUD는 개발자 대시보드 느낌을 주되 최대 6개 핵심 항목만 노출한다.

```text
Day 142    👥 32.4K    💰 ₩1.24M    MRR ₩1.8M    Cost ₩1.2M    ⏸ ▶ ▶▶
```

큰 숫자 + 작은 label 구조를 기본으로 한다.

## 화면 구성

```text
┌────────────────────────────────────────────────────────────┐
│ HUD                                                        │
├────────────┬──────────────────────────────┬────────────────┤
│ Work Slots │        Service Map           │ Alerts         │
│            │                              │                │
│ Feature    │           APP                │ DB 91% !       │
│ Tech       │        /       \             │ Settlement D-3 │
│ Learning   │      DB        Queue          │ Learning ready │
│ Incident   │      │                       │                │
│            │    Redis                     │                │
├────────────┴──────────────────────────────┴────────────────┤
│ 서비스      기능      기술      학습      리포트            │
└────────────────────────────────────────────────────────────┘
```

## 게임성 확보 기준

다크 UI를 선택했지만 아래처럼 보이면 실패다.

- Grafana dashboard
- AWS Console
- DB Admin Tool
- 로그 모니터링 화면

대신 아래 느낌을 목표로 한다.

- 서비스 구조가 성장하면서 화면도 커진다.
- 기술을 추가하면 실제 노드가 생긴다.
- 장애가 발생한 위치가 즉시 보인다.
- 선택 가능한 것이 그림만 봐도 드러난다.
- 한 화면에서 "현재 시스템"을 관찰하는 재미가 있다.

## 함께 유지하는 기존 UX 결정

별도 변경 요청이 없으면 다음을 유지한다.

- Service Map은 자동 배치(B1)
- Requirement + Major/Critical Incident에서 자동 Pause(C1)
- Minor Incident는 Alert만 표시
- 기술 선택 전/후 Load/Cost Preview 제공
- React UI는 게임 규칙을 직접 판단하지 않는다
- Application Layer의 ViewModel만 사용한다
