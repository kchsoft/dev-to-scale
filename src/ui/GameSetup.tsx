import type { DatabaseOptionId, FrameworkOptionId } from '../application/game-view';

const FRAMEWORKS: Array<{ id: FrameworkOptionId; language: string; name: string; mark: string; trait: string; detail: string }> = [
  { id: 'SPRING_BOOT', language: 'Java', name: 'Spring Boot', mark: 'S', trait: 'CPU STRONG', detail: 'CPU +18% · I/O -4% · Cost +5%' },
  { id: 'NESTJS', language: 'TypeScript', name: 'NestJS', mark: 'N', trait: 'I/O STRONG', detail: 'CPU -8% · I/O +18% · Work -10%' },
  { id: 'GIN', language: 'Go', name: 'Gin', mark: 'G', trait: 'CPU EFFICIENT', detail: 'CPU +25% · I/O +8% · Cost -10%' },
  { id: 'FASTAPI', language: 'Python', name: 'FastAPI', mark: 'F', trait: 'I/O / AI', detail: 'CPU -5% · I/O +12% · AI Work -25%' },
  { id: 'ASPNET_CORE', language: 'C#', name: 'ASP.NET Core', mark: '.N', trait: 'BALANCED', detail: 'CPU +8% · I/O +8% · 균형형' },
];

const DATABASES: Array<{ id: DatabaseOptionId; name: string; mark: string; trait: string; detail: string }> = [
  { id: 'POSTGRESQL', name: 'PostgreSQL', mark: 'PG', trait: 'TRANSACTIONAL', detail: '복잡한 Transaction 기능에 유리' },
  { id: 'MYSQL', name: 'MySQL', mark: 'MY', trait: 'CHEAP', detail: '월 비용 -5%' },
  { id: 'MONGODB', name: 'MongoDB', mark: 'MO', trait: 'FLEXIBLE', detail: 'Capacity +5% · 유연한 데이터에 유리' },
];

interface GameSetupProps {
  readonly frameworkId: FrameworkOptionId;
  readonly databaseId: DatabaseOptionId;
  readonly onFrameworkChange: (id: FrameworkOptionId) => void;
  readonly onDatabaseChange: (id: DatabaseOptionId) => void;
  readonly onStart: () => void;
}

export function GameSetup({ frameworkId, databaseId, onFrameworkChange, onDatabaseChange, onStart }: GameSetupProps) {
  return (
    <main className="setup-screen">
      <header className="setup-brand"><div className="brand-symbol">D2S</div><div><span>SOFTWARE SERVICE MANAGEMENT SIM</span><h1>DEV TO SCALE</h1><p>코드를 선택하고, 서비스를 띄우고, 장애와 비용을 견디며 Scale 하세요.</p></div></header>
      <section className="setup-stage service-stage"><div className="stage-index">01</div><div className="stage-copy"><span>SERVICE</span><strong>Community</strong><small>회원가입 + 게시글부터 시작하는 V1 서비스</small></div><div className="service-glyph"><span>◎</span><b>COMMUNITY</b><em>AVAILABLE</em></div></section>
      <section className="setup-stage stack-stage">
        <div className="stage-title"><span>02 · BACKEND STACK</span><strong>언어 + 프레임워크</strong><small>CPU / I/O 성향과 개발 생산성의 트레이드오프를 보고 선택합니다.</small></div>
        <div className="stack-card-grid">{FRAMEWORKS.map((framework) => <button key={framework.id} onClick={() => onFrameworkChange(framework.id)} className={`stack-card ${frameworkId === framework.id ? 'selected' : ''}`}><span className="stack-mark">{framework.mark}</span><div><small>{framework.language}</small><strong>{framework.name}</strong><em>{framework.trait}</em><p>{framework.detail}</p></div><i>{frameworkId === framework.id ? 'SELECTED' : 'SELECT'}</i></button>)}</div>
      </section>
      <section className="setup-stage database-stage">
        <div className="stage-title"><span>03 · DATABASE</span><strong>Primary Database</strong><small>DB 선택도 개발과 비용 특성에 영향을 줍니다.</small></div>
        <div className="database-card-grid">{DATABASES.map((database) => <button key={database.id} onClick={() => onDatabaseChange(database.id)} className={`database-card ${databaseId === database.id ? 'selected' : ''}`}><span>{database.mark}</span><div><strong>{database.name}</strong><em>{database.trait}</em><small>{database.detail}</small></div></button>)}</div>
      </section>
      <footer className="launch-console"><div><span>INITIAL ARCHITECTURE</span><strong>Client → {FRAMEWORKS.find((item) => item.id === frameworkId)?.name} → {DATABASES.find((item) => item.id === databaseId)?.name}</strong></div><div><span>STARTING CASH</span><strong>₩3.0M</strong></div><button onClick={onStart}>BOOT SERVICE <b>→</b></button></footer>
    </main>
  );
}
