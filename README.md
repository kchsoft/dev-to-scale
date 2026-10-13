# Dev to Scale

**Build it. Ship it. Keep it alive. Scale it.**

개발자가 제한된 시간, 돈, 역량 안에서 기술 스택과 인프라를 선택하며 커뮤니티 서비스를 성장시키는 웹 기반 경영 시뮬레이션 게임입니다.

## 현재 MVP

- Next.js + TypeScript 기반 웹 게임
- 커뮤니티 서비스 플레이
- Founder 역량 프리셋
- Java / TypeScript / Python / Go / PHP / Ruby / C# 선택
- 언어별 프레임워크 선택
- PostgreSQL / MySQL / MongoDB 선택
- VM / Serverless / Managed Container 선택
- 기능 개발과 기술 도입
- DAU, MRR, Cash, Trust, Reliability, Tech Debt, Fatigue 시뮬레이션
- 트래픽 Capacity 및 Architecture Complexity
- 과부하 / 복잡도 / 바이럴 이벤트와 대응 선택
- 기본 역량 / 언어 / 프레임워크 숙련도 성장

## 기본 역량

1. CS / Algorithms
2. Computer Systems
3. Network & Web
4. Database & Storage
5. Software Design
6. Infrastructure & Operations
7. Security

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 검증

```bash
npm run typecheck
npm run build
```

## 게임 철학

최고의 기술을 많이 쓰는 것이 정답이 아닙니다. 현재 서비스 규모, 팀의 실력, 돈과 시간에 맞는 기술을 필요한 순간에 선택하는 것이 핵심입니다.

## 새로운 게임 모드: Founder Run (실험적 버전)

기존 운영 시뮬레이션을 유지하면서, 스타트업 경영 + 장애 추리를 결합한 **90일·3개월 캠페인 모드**를 추가했습니다.

1. 시작 화면에서 **FOUNDER RUN**을 선택합니다.
2. 매달 시장 이벤트(바이럴, 경쟁사, 대형 계약 등)에 대응하고 인프라에 투자한 뒤 기능을 출시합니다.
3. 피크 트래픽과 기능 부하로 장애가 발생할 수 있습니다. 증거를 수집해 임시 완화 또는 근본 해결을 선택합니다.
4. 30·60·90일 정산과 장애 회고를 진행하고, 최종 캠페인 결과를 확인한 뒤 같은 Seed/다른 Seed로 재도전할 수 있습니다.

이 모드는 아직 기존 시뮬레이션 엔진과 분리된 게임플레이 실험입니다. 상세 범위와 다음 단계는 [Founder Run 설계 노트](docs/founder-run-vertical-slice.md)를 참고하세요.

### 90-DAY FOUNDER — 실제 일 단위 시뮬레이션

시작 화면에서 **90-DAY FOUNDER**를 선택하면 90개의 실제 게임 일자를 하루씩 또는 자동 진행으로 운영할 수 있습니다.

- 기능 개발에 시간이 걸리며 Fast Track을 사용하면 기술 부채가 쌓여 이후 개발 속도와 운영 부하에 영향을 줍니다.
- 매일 DAU·매출·운영비·처리량을 갱신하며 출시와 장애, 월말 정산 시 자동으로 진행이 멈춥니다.
- 기술 부채로 배포 회귀 장애가 발생할 수 있고, 리팩터링 및 원인별 복구로 운영을 정상화할 수 있습니다.
- 브라우저 로컬 저장으로 이어하기를 지원합니다(다른 기기와 동기화되지 않음).

이전 **FOUNDER RUN**은 3회의 월간 결정을 빠르게 시험하는 프로토타입으로 남겨 두었습니다.
