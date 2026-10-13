import type { DatabaseOptionId, FrameworkOptionId } from '../application/game-view';
import { GAME_DATABASE_OPTIONS, GAME_FRAMEWORK_OPTIONS } from '../application/game-setup-options';

interface GameSetupProps {
  readonly frameworkId: FrameworkOptionId;
  readonly databaseId: DatabaseOptionId;
  readonly onFrameworkChange: (id: FrameworkOptionId) => void;
  readonly onDatabaseChange: (id: DatabaseOptionId) => void;
  readonly onStart: () => void;
  readonly onStartFounderRun?: () => void;
  readonly onStartDailyCampaign?: () => void;
}

export function GameSetup({ frameworkId, databaseId, onFrameworkChange, onDatabaseChange, onStart, onStartFounderRun, onStartDailyCampaign }: GameSetupProps) {
  return (
    <main className="setup-screen">
      <header className="setup-brand"><div className="brand-symbol">D2S</div><div><span>SOFTWARE SERVICE MANAGEMENT SIM</span><h1>DEV TO SCALE</h1><p>코드를 선택하고, 서비스를 띄우고, 장애와 비용을 견디며 Scale 하세요.</p></div></header>
      <section className="setup-stage service-stage"><div className="stage-index">01</div><div className="stage-copy"><span>SERVICE</span><strong>Community</strong><small>회원가입 + 게시글부터 시작하는 V1 서비스</small></div><div className="service-glyph"><span>◎</span><b>COMMUNITY</b><em>AVAILABLE</em></div></section>
      <section className="setup-stage stack-stage">
        <div className="stage-title"><span>02 · BACKEND STACK</span><strong>언어 + 프레임워크</strong><small>CPU / I/O 성향과 개발 생산성의 트레이드오프를 보고 선택합니다.</small></div>
        <div className="stack-card-grid">{GAME_FRAMEWORK_OPTIONS.map((framework) => <button key={framework.id} onClick={() => onFrameworkChange(framework.id)} className={`stack-card ${frameworkId === framework.id ? 'selected' : ''}`}><span className="stack-mark">{framework.mark}</span><div><small>{framework.language}</small><strong>{framework.name}</strong><em>{framework.trait}</em><p>{framework.detail}</p></div><i>{frameworkId === framework.id ? 'SELECTED' : 'SELECT'}</i></button>)}</div>
      </section>
      <section className="setup-stage database-stage">
        <div className="stage-title"><span>03 · DATABASE</span><strong>Primary Database</strong><small>DB 선택도 개발과 비용 특성에 영향을 줍니다.</small></div>
        <div className="database-card-grid">{GAME_DATABASE_OPTIONS.map((database) => <button key={database.id} onClick={() => onDatabaseChange(database.id)} className={`database-card ${databaseId === database.id ? 'selected' : ''}`}><span>{database.mark}</span><div><strong>{database.name}</strong><em>{database.trait}</em><small>{database.detail}</small></div></button>)}</div>
      </section>
      <footer className="launch-console"><div><span>INITIAL ARCHITECTURE</span><strong>Client → {GAME_FRAMEWORK_OPTIONS.find((item) => item.id === frameworkId)?.name} → {GAME_DATABASE_OPTIONS.find((item) => item.id === databaseId)?.name}</strong></div><div><span>STARTING CASH</span><strong>₩3.0M</strong></div><button onClick={onStart}>BOOT SERVICE <b>→</b></button></footer>
      {onStartDailyCampaign && <section className="founder-launch-wrap" aria-label="90일 스타트업 게임">
        <button type="button" className="founder-launch" onClick={onStartDailyCampaign}>
          <strong>▶ 90-DAY FOUNDER · 신규 캠페인</strong>
          <small>90일간 실제로 날짜를 진행하며 기능을 개발하고, 기술 부채와 장애를 관리하는 스타트업 경영 × 장애 추리 게임</small>
        </button>
      </section>}
      {onStartFounderRun && <section className="founder-launch-wrap" aria-label="신규 게임 모드"><button type="button" className="founder-launch" onClick={onStartFounderRun}><strong>▶ FOUNDER RUN · 새로운 플레이 모드</strong><small>기존 월 단위 결정만 체험하는 3-스프린트 실험 모드</small></button></section>}
    </main>
  );
}
