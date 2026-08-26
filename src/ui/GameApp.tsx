'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DatabaseId, FrameworkId, ServerSize, SkillRef } from '../core';
import { GameClock, GameSpeed } from '../application/game-clock';
import {
  AlertView,
  GameController,
  GameEventView,
  GameView,
  ServiceNodeView,
  SkillNodeView,
  TechnologyOptionView,
} from '../application/game-controller';

const FRAMEWORKS: Array<{ id: FrameworkId; language: string; name: string; mark: string; trait: string; detail: string }> = [
  { id: 'SPRING_BOOT', language: 'Java', name: 'Spring Boot', mark: 'S', trait: 'STABLE', detail: 'Capacity +10% · Cost +5%' },
  { id: 'NESTJS', language: 'TypeScript', name: 'NestJS', mark: 'N', trait: 'PRODUCTIVE', detail: 'Feature Work -10% · Cost +5%' },
  { id: 'GIN', language: 'Go', name: 'Gin', mark: 'G', trait: 'EFFICIENT', detail: 'Cost -10% · Complex Work +15%' },
  { id: 'FASTAPI', language: 'Python', name: 'FastAPI', mark: 'F', trait: 'AI FRIENDLY', detail: 'AI Work -25% · Cost +10%' },
  { id: 'ASPNET_CORE', language: 'C#', name: 'ASP.NET Core', mark: '.N', trait: 'BALANCED', detail: 'Capacity / Cost 균형형' },
];

const DATABASES: Array<{ id: DatabaseId; name: string; mark: string; trait: string; detail: string }> = [
  { id: 'POSTGRESQL', name: 'PostgreSQL', mark: 'PG', trait: 'TRANSACTIONAL', detail: '복잡한 Transaction 기능에 유리' },
  { id: 'MYSQL', name: 'MySQL', mark: 'MY', trait: 'CHEAP', detail: '월 비용 -5%' },
  { id: 'MONGODB', name: 'MongoDB', mark: 'MO', trait: 'FLEXIBLE', detail: 'Capacity +5% · 유연한 데이터에 유리' },
];

const SIZE_ORDER = [ServerSize.SMALL, ServerSize.MEDIUM, ServerSize.LARGE, ServerSize.XLARGE];
const SIZE_LABEL: Record<ServerSize, string> = { SMALL: 'S', MEDIUM: 'M', LARGE: 'L', XLARGE: 'XL' };

const CATEGORY_LABEL: Record<SkillRef['category'], string> = {
  fundamental: 'FUNDAMENTALS', language: 'LANGUAGE', framework: 'FRAMEWORK', technology: 'TECHNOLOGY',
};

function money(value: number): string {
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${sign}₩${(absolute / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${sign}₩${(absolute / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${sign}₩${Math.round(absolute / 1_000)}K`;
  return `${sign}₩${absolute.toLocaleString()}`;
}

function number(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return value.toLocaleString();
}

function pct(progress: number | null): number {
  return progress === null ? 0 : Math.max(0, Math.min(100, Math.round(progress * 100)));
}

export default function GameApp() {
  const [frameworkId, setFrameworkId] = useState<FrameworkId>('SPRING_BOOT');
  const [databaseId, setDatabaseId] = useState<DatabaseId>('POSTGRESQL');
  const [controller, setController] = useState<GameController | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [speed, setSpeedState] = useState<GameSpeed>(0);
  const [dayProgress, setDayProgress] = useState(0);
  const [tab, setTab] = useState<'service' | 'features' | 'technology' | 'learning' | 'report'>('service');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [events, setEvents] = useState<GameEventView[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const clockRef = useRef<GameClock | null>(null);

  useEffect(() => {
    if (!controller) return;
    const unsubscribe = controller.subscribe(setView);
    const clock = new GameClock(controller, (incoming) => {
      const blocking = incoming.filter((event) => event.autoPause);
      if (blocking.length) setEvents((current) => [...current, ...blocking]);
    });
    const unsubscribeClock = clock.subscribe(setSpeedState);
    const unsubscribeProgress = clock.subscribeProgress(setDayProgress);
    clockRef.current = clock;
    return () => {
      unsubscribe();
      unsubscribeClock();
      unsubscribeProgress();
      clock.dispose();
      clockRef.current = null;
    };
  }, [controller]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const startGame = () => {
    const next = new GameController({ frameworkId, databaseId, seed: Math.floor(Date.now() % 2_147_483_647) });
    setController(next);
    setView(next.getView());
    setDayProgress(0);
    setTab('service');
  };

  const restart = () => {
    clockRef.current?.dispose();
    setController(null);
    setView(null);
    setEvents([]);
    setSelectedNode(null);
    setSpeedState(0);
    setDayProgress(0);
  };

  const run = (action: () => void, success?: string) => {
    try {
      action();
      if (success) setToast(success);
    } catch (error) {
      setToast(error instanceof Error ? error.message : '처리할 수 없습니다.');
    }
  };

  const closeActiveEvent = () => {
    const hasMoreBlockingEvents = events.length > 1;
    setEvents((current) => current.slice(1));
    if (!hasMoreBlockingEvents) clockRef.current?.resumeAfterAutoPause();
  };

  if (!controller || !view) {
    return (
      <main className="setup-screen">
        <header className="setup-brand">
          <div className="brand-symbol">D2S</div>
          <div>
            <span>SOFTWARE SERVICE MANAGEMENT SIM</span>
            <h1>DEV TO SCALE</h1>
            <p>코드를 선택하고, 서비스를 띄우고, 장애와 비용을 견디며 Scale 하세요.</p>
          </div>
        </header>

        <section className="setup-stage service-stage">
          <div className="stage-index">01</div>
          <div className="stage-copy"><span>SERVICE</span><strong>Community</strong><small>회원가입 + 게시글부터 시작하는 V1 서비스</small></div>
          <div className="service-glyph"><span>◎</span><b>COMMUNITY</b><em>AVAILABLE</em></div>
        </section>

        <section className="setup-stage stack-stage">
          <div className="stage-title"><span>02 · BACKEND STACK</span><strong>언어 + 프레임워크</strong><small>하나의 카드를 눌러 함께 선택합니다.</small></div>
          <div className="stack-card-grid">
            {FRAMEWORKS.map((framework) => (
              <button key={framework.id} onClick={() => setFrameworkId(framework.id)} className={`stack-card ${frameworkId === framework.id ? 'selected' : ''}`}>
                <span className="stack-mark">{framework.mark}</span>
                <div><small>{framework.language}</small><strong>{framework.name}</strong><em>{framework.trait}</em><p>{framework.detail}</p></div>
                <i>{frameworkId === framework.id ? 'SELECTED' : 'SELECT'}</i>
              </button>
            ))}
          </div>
        </section>

        <section className="setup-stage database-stage">
          <div className="stage-title"><span>03 · DATABASE</span><strong>Primary Database</strong><small>DB 선택도 개발과 비용 특성에 영향을 줍니다.</small></div>
          <div className="database-card-grid">
            {DATABASES.map((database) => (
              <button key={database.id} onClick={() => setDatabaseId(database.id)} className={`database-card ${databaseId === database.id ? 'selected' : ''}`}>
                <span>{database.mark}</span><div><strong>{database.name}</strong><em>{database.trait}</em><small>{database.detail}</small></div>
              </button>
            ))}
          </div>
        </section>

        <footer className="launch-console">
          <div><span>INITIAL ARCHITECTURE</span><strong>Client → {FRAMEWORKS.find((item) => item.id === frameworkId)?.name} → {DATABASES.find((item) => item.id === databaseId)?.name}</strong></div>
          <div><span>STARTING CASH</span><strong>₩3.0M</strong></div>
          <button onClick={startGame}>BOOT SERVICE <b>→</b></button>
        </footer>
      </main>
    );
  }

  const activeEvent = events[0] ?? null;
  const selected = view.nodes.find((node) => node.id === selectedNode) ?? null;

  return (
    <main className="game-screen">
      <Hud view={view} speed={speed} dayProgress={dayProgress} onSpeed={(next) => clockRef.current?.setSpeed(next)} onStep={() => clockRef.current?.advanceOneDay()} />

      <div className="main-shell">
        <nav className="side-nav">
          <div className="nav-brand">D<span>2</span>S</div>
          {([
            ['service', '⌂', '서비스'], ['features', '☆', '기능'], ['technology', '⌕', '기술'], ['learning', '◇', '학습'], ['report', '▥', '리포트'],
          ] as const).map(([id, icon, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><span>{icon}</span><small>{label}</small></button>
          ))}
          <button className="restart-button" onClick={restart}><span>↺</span><small>재시작</small></button>
        </nav>

        <section className="workspace">
          {tab === 'service' && <ServiceDashboard view={view} onNode={setSelectedNode} onTab={setTab} />}
          {tab === 'features' && <FeatureBoard view={view} />}
          {tab === 'technology' && <TechnologyPanel view={view} onBuild={(tech) => run(() => controller.startTechnologyBuild(tech.id), `${tech.name} 구축을 시작했습니다.`)} />}
          {tab === 'learning' && <LearningPanel view={view} onStudy={(skill) => run(() => controller.startLearning(skill.ref), `${skill.name} 학습을 시작했습니다.`)} />}
          {tab === 'report' && <ReportPanel view={view} />}
        </section>
      </div>

      {selected && <NodeInspector node={selected} view={view} onClose={() => setSelectedNode(null)} onAction={(action) => run(action)} controller={controller} />}
      {activeEvent && <EventOverlay event={activeEvent} onDismiss={closeActiveEvent} onRespond={() => {
        if (activeEvent.kind === 'incident') run(() => controller.startIncidentResponse(activeEvent.id), '장애 대응을 시작했습니다.');
        closeActiveEvent();
      }} />}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function Hud({ view, speed, dayProgress, onSpeed, onStep }: { view: GameView; speed: GameSpeed; dayProgress: number; onSpeed: (speed: GameSpeed) => void; onStep: () => void }) {
  const metrics = [
    ['DAY', `#${view.hud.day}`], ['DAU', number(view.hud.dau)], ['CASH', money(view.hud.cash)], ['MRR · EST', money(view.hud.monthlyRevenue)], ['COST · EST', money(view.hud.monthlyCost)],
  ];
  const progressPercent = Math.max(0, Math.min(100, dayProgress * 100));
  return (
    <header className="hud">
      <div className="hud-status"><span className={`status-dot ${view.hud.status.toLowerCase()}`} /><div><strong>{view.hud.launched ? 'SERVICE ONLINE' : 'BUILDING MVP'}</strong><small>{view.hud.status}</small></div></div>
      <div className="hud-metrics">{metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className={`profit-chip ${view.hud.monthlyProfit >= 0 ? 'positive' : 'negative'}`}><span>PROFIT</span><strong>{money(view.hud.monthlyProfit)}</strong></div>
      <div className="clock-controls">
        <button className={speed === 0 ? 'active' : ''} onClick={() => onSpeed(0)}>Ⅱ</button>
        <button className={speed === 1 ? 'active' : ''} onClick={() => onSpeed(1)}>▶ <small>x1</small></button>
        <button className={speed === 2 ? 'active' : ''} onClick={() => onSpeed(2)}>▶▶ <small>x2</small></button>
        <button title="하루 진행" onClick={onStep}>+1D</button>
      </div>
      <div
        aria-label={`Day ${view.hud.day} progress ${Math.round(progressPercent)} percent`}
        title={speed === 0 ? `Day ${view.hud.day} · PAUSED` : `Day ${view.hud.day} → ${view.hud.day + 1}`}
        style={{ position: 'absolute', left: 12, right: 12, bottom: 2, height: 5, borderRadius: 999, overflow: 'hidden', background: '#13202b', boxShadow: 'inset 0 0 0 1px rgba(72, 102, 126, .26)' }}
      >
        <span style={{ display: 'block', width: `${progressPercent}%`, height: '100%', borderRadius: 999, background: speed === 0 ? '#4a5d6d' : 'linear-gradient(90deg, #3d9cff, #43d9d1)', boxShadow: speed === 0 ? 'none' : '0 0 12px rgba(67, 217, 209, .62)', transition: 'width 100ms linear, background 160ms ease' }} />
      </div>
    </header>
  );
}

function ServiceDashboard({ view, onNode, onTab }: { view: GameView; onNode: (id: string) => void; onTab: (tab: 'technology' | 'learning' | 'service' | 'features' | 'report') => void }) {
  const featureTiming = view.snapshot.currentFeature;
  return (
    <div className="dashboard-layout">
      <aside className="work-rail panel-shell">
        <PanelTitle code="WORK QUEUE" title="진행 작업" badge="4 SLOTS" />
        <div className="work-slot-list">
          {view.workSlots.map((slot) => {
            const meta = slot.id === 'feature' && featureTiming
              ? `${featureTiming.elapsedDays} / ~${featureTiming.elapsedDays + featureTiming.estimatedRemainingDays}일 · 약 ${featureTiming.estimatedRemainingDays}일 남음`
              : slot.meta;
            return (
              <button key={slot.id} onClick={() => slot.id === 'technology' ? onTab('technology') : slot.id === 'learning' ? onTab('learning') : undefined} className={`work-slot ${slot.active ? 'active' : 'empty'}`}>
                <div><span>{slot.label}</span><b>{slot.active ? '●' : '+'}</b></div><strong>{slot.title}</strong><small>{meta}</small>
                {slot.progress !== null && <div className="progress-track"><i style={{ width: `${pct(slot.progress)}%` }} /></div>}
              </button>
            );
          })}
        </div>
        <div className="runway-box"><span>RUNWAY SIGNAL</span><strong className={view.hud.monthlyProfit >= 0 ? 'ok' : 'warn'}>{view.hud.monthlyProfit >= 0 ? 'PROFITABLE' : 'BURNING CASH'}</strong><small>{view.hud.monthlyProfit >= 0 ? '현재 예상 손익이 양수입니다.' : `${money(Math.abs(view.hud.monthlyProfit))} / month`}</small></div>
      </aside>

      <section className="service-map panel-shell">
        <PanelTitle code="LIVE ARCHITECTURE" title="Service Map" badge="AUTO LAYOUT" />
        <ArchitectureGraph view={view} onNode={onNode} />
        <div className="load-strip">
          <LoadMini label="APP" value={view.snapshot.load.appRatio} />
          <LoadMini label="DB" value={view.snapshot.load.dbRatio} />
          <LoadMini label="ASYNC" value={view.snapshot.load.asyncRatio} />
          <LoadMini label="STORAGE" value={view.snapshot.load.storageRatio} />
        </div>
      </section>

      <aside className="alert-rail panel-shell">
        <PanelTitle code="NOW / ALERT" title="주목할 상태" badge={`${view.alerts.length}`} />
        <div className="alert-list">{view.alerts.map((alert) => <AlertCard key={alert.id} alert={alert} onClick={() => alert.nodeId && onNode(alert.nodeId.replace('technology:', '').replace('framework:', 'application').replace('database:', 'database'))} />)}</div>
      </aside>
    </div>
  );
}

function ArchitectureGraph({ view, onNode }: { view: GameView; onNode: (id: string) => void }) {
  const app = view.nodes.find((node) => node.kind === 'application')!;
  const db = view.nodes.find((node) => node.kind === 'database')!;
  const alb = view.nodes.find((node) => node.kind === 'load-balancer');
  const cache = view.nodes.find((node) => node.kind === 'cache');
  const queue = view.nodes.find((node) => node.kind === 'queue');
  const storage = view.nodes.find((node) => node.kind === 'storage');
  return (
    <div className="architecture-canvas">
      <div className="grid-glow" />
      <div className="users-node"><span>◎</span><b>USERS</b><small>{view.hud.launched ? `${number(view.hud.dau)} DAU` : 'PRE-LAUNCH'}</small></div>
      <div className="flow-line vertical line-top" />
      {alb && <><InfraNode node={alb} onClick={() => onNode(alb.id)} extra="TRAFFIC" /><div className="flow-line vertical line-alb" /></>}
      <InfraNode node={app} onClick={() => onNode(app.id)} extra={`${view.appCount} SERVER${view.appCount > 1 ? 'S' : ''}`} />
      <div className="flow-line vertical line-db" />
      <InfraNode node={db} onClick={() => onNode(db.id)} extra={`${view.dbReplicaCount} REPLICA`} />
      {cache && <div className="side-node cache-node"><div className="side-line" /><InfraNode node={cache} onClick={() => onNode(cache.id)} extra="CACHE" /></div>}
      {queue && <div className="side-node queue-node"><div className="side-line" /><InfraNode node={queue} onClick={() => onNode(queue.id)} extra="ASYNC" /></div>}
      {storage && <div className="side-node storage-node"><div className="side-line" /><InfraNode node={storage} onClick={() => onNode(storage.id)} extra="STORAGE" /></div>}
      {!cache && <button className="empty-node cache-node" onClick={() => onNode('database')}><span>＋</span><small>CACHE</small></button>}
      {!queue && <button className="empty-node queue-node"><span>＋</span><small>QUEUE</small></button>}
      {!storage && <button className="empty-node storage-node"><span>＋</span><small>STORAGE</small></button>}
    </div>
  );
}

function InfraNode({ node, onClick, extra }: { node: ServiceNodeView; onClick: () => void; extra: string }) {
  return (
    <button className={`infra-node ${node.kind} ${node.tone}`} onClick={onClick}>
      <div className="node-head"><span>{node.icon}</span><small>{extra}</small>{node.incidentId && <b>⚡</b>}</div>
      <strong>{node.name}</strong>
      <div className="node-load"><em>{node.loadPercent}%</em><i><span style={{ width: `${Math.min(100, node.loadPercent)}%` }} /></i></div>
      <small>{node.detail}</small>
    </button>
  );
}

function LoadMini({ label, value }: { label: string; value: number }) {
  const valuePct = Math.round(value * 100);
  const tone = value > 1 ? 'danger' : value >= .9 ? 'critical' : value >= .7 ? 'busy' : 'stable';
  return <div className={`load-mini ${tone}`}><span>{label}</span><strong>{valuePct}%</strong><i><b style={{ width: `${Math.min(100, valuePct)}%` }} /></i></div>;
}

function AlertCard({ alert, onClick }: { alert: AlertView; onClick: () => void }) {
  return <button onClick={onClick} className={`alert-card ${alert.tone}`}><span>{alert.tone === 'danger' ? '!' : alert.tone === 'warning' ? '△' : alert.tone === 'good' ? '✓' : 'i'}</span><div><strong>{alert.title}</strong><small>{alert.detail}</small></div><b>›</b></button>;
}

function TechnologyPanel({ view, onBuild }: { view: GameView; onBuild: (tech: TechnologyOptionView) => void }) {
  const groups = [
    ['TRAFFIC', ['ALB']], ['CACHE', ['REDIS']], ['ASYNC', ['SQS', 'RABBITMQ', 'KAFKA']], ['STORAGE', ['OBJECT_STORAGE']],
  ] as const;
  return (
    <section className="page-panel">
      <PageHeading eyebrow="TECHNOLOGY CATALOG" title="서비스에 기술 연결" description="카드를 눌러 구축합니다. 수식 대신 현재 구조에서 예상되는 효과를 먼저 보여줍니다." />
      <div className="technology-groups">
        {groups.map(([name, ids]) => (
          <div className="technology-group" key={name}><div className="group-label"><span>{name}</span><i /></div><div className="technology-grid">
            {ids.map((id) => {
              const tech = view.technologies.find((item) => item.id === id)!;
              return <button className={`technology-card ${tech.deployed ? 'deployed' : ''}`} key={id} disabled={!tech.available} onClick={() => onBuild(tech)}>
                <div className="tech-top"><span>{tech.icon}</span><em>{tech.deployed ? 'ACTIVE' : tech.available ? 'READY' : 'LOCKED'}</em></div>
                <strong>{tech.name}</strong><p>{tech.preview}</p>
                <div className="tech-numbers"><span><small>BUILD</small><b>{money(tech.buildCost)}</b></span><span><small>MONTH</small><b>{money(tech.monthlyCost)}</b></span><span><small>WORK</small><b>{tech.buildWork}</b></span></div>
                <div className="tech-action">{tech.deployed ? 'CONNECTED' : tech.reason ?? 'BUILD →'}</div>
              </button>;
            })}
          </div></div>
        ))}
      </div>
    </section>
  );
}

function LearningPanel({ view, onStudy }: { view: GameView; onStudy: (skill: SkillNodeView) => void }) {
  const categories = ['fundamental', 'language', 'framework', 'technology'] as const;
  return (
    <section className="page-panel">
      <PageHeading eyebrow="DEVELOPER SKILL TREE" title="실전 경험 → 학습 → 레벨업" description="실제로 사용한 기술만 경험이 쌓입니다. 선행 노드와 경험 조건을 만족한 뒤 학습 슬롯을 사용합니다." />
      <div className="skill-tree">
        {categories.map((category) => (
          <div className={`skill-lane ${category}`} key={category}><div className="skill-lane-title"><span>{CATEGORY_LABEL[category]}</span><i /></div><div className="skill-node-grid">
            {view.skills.filter((skill) => skill.category === category).map((skill) => (
              <button
                key={skill.key}
                className={`skill-node ${skill.canStudy ? 'ready' : ''} ${skill.studying ? 'studying' : ''}`}
                disabled={!skill.canStudy}
                onClick={() => onStudy(skill)}
                style={skill.studying ? { opacity: 1, borderColor: 'var(--cyan)', boxShadow: 'inset 0 0 0 1px rgba(67,217,209,.2), 0 0 20px rgba(67,217,209,.08)' } : undefined}
              >
                <span className="skill-icon">{skill.icon}</span><div><strong>{skill.name}</strong><em>Lv.{skill.level}{skill.studying && skill.targetLevel ? ` → ${skill.targetLevel}` : ''}</em></div>
                <div className="skill-exp"><i><b style={{ width: `${skill.requiredExperience ? Math.min(100, Math.round(skill.experienceDays / skill.requiredExperience * 100)) : 100}%` }} /></i><small>{skill.requiredExperience ? `${skill.experienceDays}/${skill.requiredExperience}d EXP` : 'MAX'}</small></div>
                {skill.studying && <div style={{ width: '100%', marginTop: 8 }}><div className="progress-track" style={{ marginTop: 0 }}><i style={{ width: `${pct(skill.studyProgress)}%` }} /></div><small style={{ display: 'block', marginTop: 5, color: 'var(--cyan)', fontSize: 9 }}>STUDYING · {skill.elapsedStudyDays}/{skill.studyDays}일 · {pct(skill.studyProgress)}%</small></div>}
                <footer>{skill.studying ? <><b>STUDYING</b><span>{skill.elapsedStudyDays}/{skill.studyDays}d</span></> : skill.canStudy ? <><b>STUDY</b><span>{skill.studyDays}d · {money(skill.cost ?? 0)}</span></> : <span>{skill.reason ?? 'LOCKED'}</span>}</footer>
              </button>
            ))}
          </div></div>
        ))}
      </div>
    </section>
  );
}

function FeatureBoard({ view }: { view: GameView }) {
  const current = view.snapshot.currentFeature;
  return (
    <section className="page-panel">
      <PageHeading eyebrow="COMMUNITY ROADMAP" title="Requirement Timeline" description="Phase 안의 기능 순서는 Seed에 따라 달라집니다. 해금되기 전에는 무엇이 나올지 알 수 없습니다." />
      <div className="phase-board">{([1, 2, 3] as const).map((phase) => <div className="phase-lane" key={phase}><header><span>PHASE {phase}</span><strong>{phase === 1 ? 'EARLY' : phase === 2 ? 'GROWTH' : 'SCALE'}</strong></header><div>
        {view.features.filter((feature) => feature.phase === phase).map((feature, index) => <article className={`feature-card ${feature.state}`} key={feature.id}><div className="feature-index">{String(index + 1).padStart(2, '0')}</div><span>{feature.state === 'completed' ? '✓' : feature.state === 'developing' ? '●' : feature.state === 'hidden' ? '?' : '○'}</span><strong>{feature.name}</strong><small>DAU {number(feature.threshold)}</small>{feature.state === 'developing' && current && <small>개발 {current.elapsedDays}/~{current.elapsedDays + current.estimatedRemainingDays}일</small>}{feature.load && <div><i>A {feature.load.app}</i><i>D {feature.load.db}</i><i>Q {feature.load.async}</i><i>S {feature.load.storage}</i></div>}</article>)}
      </div></div>)}</div>
    </section>
  );
}

function ReportPanel({ view }: { view: GameView }) {
  const cards = [
    ['DAU', number(view.hud.dau), '현재 일간 활성 사용자'], ['REVENUE · EST', money(view.hud.monthlyRevenue), '현재 DAU 기준 월 매출'], ['INFRA + AI', money(view.hud.monthlyCost), '현재 월 예상 비용'], ['PROFIT · EST', money(view.hud.monthlyProfit), '현재 월 예상 손익'],
  ];
  return <section className="page-panel"><PageHeading eyebrow="OPERATING REPORT" title="현재 런 요약" description="V1 리포트는 현재 운영 상태를 요약합니다. 월별 히스토리 차트는 다음 UI 마일스톤에서 연결합니다." /><div className="report-grid">{cards.map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small><i /></article>)}</div><div className="report-loads"><LoadMini label="APPLICATION" value={view.snapshot.load.appRatio} /><LoadMini label="DATABASE" value={view.snapshot.load.dbRatio} /><LoadMini label="ASYNC" value={view.snapshot.load.asyncRatio} /><LoadMini label="STORAGE" value={view.snapshot.load.storageRatio} /></div></section>;
}

function NodeInspector({ node, view, onClose, onAction, controller }: { node: ServiceNodeView; view: GameView; onClose: () => void; onAction: (action: () => void) => void; controller: GameController }) {
  const app = node.kind === 'application';
  const db = node.kind === 'database';
  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="node-drawer"><header><div className={`drawer-icon ${node.tone}`}>{node.icon}</div><div><span>{node.kind.toUpperCase()}</span><strong>{node.name}</strong></div><button onClick={onClose}>×</button></header><section className="drawer-load"><span>LIVE LOAD</span><strong>{node.loadPercent}%</strong><i><b style={{ width: `${Math.min(100, node.loadPercent)}%` }} /></i><small>{node.detail}</small></section>
    {app && <section className="drawer-section"><label>SERVER SIZE</label><div className="size-grid">{SIZE_ORDER.map((size) => <button key={size} className={view.appSize === size ? 'active' : ''} onClick={() => onAction(() => controller.scaleApplication(size))}><span>{SIZE_LABEL[size]}</span><small>{size}</small></button>)}</div><div className="scale-row"><div><span>INSTANCE</span><strong>{view.appCount} / 10</strong></div><button onClick={() => onAction(() => controller.addApplicationServer())}>＋ SERVER</button></div><p>Scale-out은 ALB가 구축된 뒤 사용할 수 있습니다.</p></section>}
    {db && <section className="drawer-section"><label>DATABASE SIZE</label><div className="size-grid">{SIZE_ORDER.map((size) => <button key={size} className={view.dbSize === size ? 'active' : ''} onClick={() => onAction(() => controller.scaleDatabase(size))}><span>{SIZE_LABEL[size]}</span><small>{size}</small></button>)}</div><div className="replica-row"><div className="db-cylinder primary">P</div>{Array.from({ length: view.dbReplicaCount }).map((_, index) => <div className="db-cylinder" key={index}>R</div>)}{view.dbReplicaCount < 3 && <button onClick={() => onAction(() => controller.addDatabaseReplica())}>＋</button>}</div><p>Replica는 최대 3개까지 추가할 수 있습니다.</p></section>}
    {node.incidentId && <section className="incident-action"><span>⚡ {node.incidentSeverity} INCIDENT</span><button onClick={() => onAction(() => controller.startIncidentResponse(node.incidentId!))}>대응 시작</button></section>}
  </aside></div>;
}

function EventOverlay({ event, onDismiss, onRespond }: { event: GameEventView; onDismiss: () => void; onRespond: () => void }) {
  const incident = event.kind === 'incident';
  return <div className="event-overlay"><article className={`event-card ${event.kind}`} style={{ position: 'relative' }}><button aria-label="팝업 닫기" onClick={onDismiss} style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line)', background: '#0a1118', color: 'var(--muted)', cursor: 'pointer', zIndex: 2 }}>×</button><div className="event-scan" /><span className="event-code">{event.kind === 'requirement' ? 'SYSTEM / REQUIREMENT' : event.kind === 'incident' ? 'SYSTEM / INCIDENT' : 'SYSTEM'}</span><div className="event-symbol">{incident ? '⚡' : event.kind === 'won' ? '◆' : event.kind === 'bankrupt' ? '×' : '＋'}</div><h2>{event.title}</h2><p>{event.message}</p>{event.severity && <strong className="severity-chip">{event.severity}</strong>}<footer>{incident && <button className="secondary" onClick={onDismiss}>나중에</button>}<button className="primary" onClick={incident ? onRespond : onDismiss}>{incident ? '대응 시작' : '확인'}</button></footer></article></div>;
}

function PanelTitle({ code, title, badge }: { code: string; title: string; badge: string }) {
  return <header className="panel-title"><div><span>{code}</span><strong>{title}</strong></div><b>{badge}</b></header>;
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="page-heading"><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></header>;
}
