'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DatabaseOptionId,
  FrameworkOptionId,
  LoadMetricView,
  ObservabilityView,
  SERVER_SIZE_VALUES,
  ServerSizeView,
  SkillRefView,
  TrafficResponseChoice,
} from '../application/game-view';
import { GameClock, GameSpeed } from '../application/game-clock';
import {
  AlertView,
  GameController,
  GameEventView,
  GameView,
  RequestFlowView,
  ServiceNodeView,
  SkillNodeView,
  TechnologyOptionView,
} from '../application/game-controller';

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

const SIZE_ORDER = SERVER_SIZE_VALUES;
const SIZE_LABEL: Record<ServerSizeView, string> = { SMALL: 'S', MEDIUM: 'M', LARGE: 'L', XLARGE: 'XL' };

const CATEGORY_LABEL: Record<SkillRefView['category'], string> = {
  fundamental: 'FUNDAMENTALS', language: 'LANGUAGE', framework: 'FRAMEWORK', technology: 'TECHNOLOGY',
};

const REQUEST_NODE_LABEL: Record<string, string> = {
  ALB: 'ALB', APP: 'APP', DB: 'DB', CACHE: 'REDIS', QUEUE: 'MQ', STORAGE: 'STORAGE', AI: 'AI',
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
  const [frameworkId, setFrameworkId] = useState<FrameworkOptionId>('SPRING_BOOT');
  const [databaseId, setDatabaseId] = useState<DatabaseOptionId>('POSTGRESQL');
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
      const settlement = incoming.find((event) => event.kind === 'settlement');
      if (settlement) setToast(`${settlement.title} · ${settlement.message}`);
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
    const timer = setTimeout(() => setToast(null), 3600);
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
          <div className="stage-title"><span>02 · BACKEND STACK</span><strong>언어 + 프레임워크</strong><small>CPU / I/O 성향과 개발 생산성의 트레이드오프를 보고 선택합니다.</small></div>
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
  const observability = view.service.observability;
  const handleTrafficResponse = (response: TrafficResponseChoice) => {
    try {
      const cost = response === 'BURST' ? view.operations.trafficSpike?.burstCost ?? 0 : 0;
      controller.respondTrafficSpike(response);
      const label = response === 'RIDE' ? 'RIDE THE WAVE' : response === 'THROTTLE' ? 'TRAFFIC LIMIT' : 'EMERGENCY BURST';
      setToast(`${label} 선택${cost > 0 ? ` · 즉시 ${money(cost)}` : ''}`);
      closeActiveEvent();
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Traffic 대응을 적용할 수 없습니다.');
    }
  };

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
          {tab === 'service' && <ServiceDashboard view={view} observability={observability} onNode={setSelectedNode} onTab={setTab} />}
          {tab === 'features' && <FeatureBoard view={view} observability={observability} onFastTrack={() => run(() => controller.fastTrackCurrentFeature(), 'FAST TRACK · 기능 진행 +30% · Tech Debt 증가')} onRefactor={() => run(() => controller.startRefactor(), 'REFACTORING 시작 · 5일간 기능 개발 중단')} />}
          {tab === 'technology' && <TechnologyPanel view={view} onBuild={(tech) => run(() => controller.startTechnologyBuild(tech.id), `${tech.name} 구축 시작 · 즉시 ${money(tech.buildCost)} · 월 ${money(tech.monthlyCost)}`)} />}
          {tab === 'learning' && <LearningPanel view={view} onStudy={(skill) => run(() => controller.startLearning(skill.ref), `${skill.name} 학습 시작 · ${money(skill.cost ?? 0)}`)} />}
          {tab === 'report' && <ReportPanel view={view} observability={observability} />}
        </section>
      </div>

      {selected && <NodeInspector node={selected} view={view} observability={observability} onClose={() => setSelectedNode(null)} onAction={(action) => run(action)} controller={controller} />}
      {activeEvent && <EventOverlay event={activeEvent} view={view} observability={observability} onDismiss={closeActiveEvent} onTrafficResponse={handleTrafficResponse} onRespond={() => {
        if (activeEvent.kind === 'incident') run(() => controller.startIncidentResponse(activeEvent.id), '장애 대응을 시작했습니다.');
        closeActiveEvent();
      }} />}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function Hud({ view, speed, dayProgress, onSpeed, onStep }: { view: GameView; speed: GameSpeed; dayProgress: number; onSpeed: (speed: GameSpeed) => void; onStep: () => void }) {
  const metrics = [
    ['DATE', `M${view.hud.month} · D${view.hud.dayOfMonth}`, `정산까지 ${view.hud.daysUntilSettlement}일`],
    ['DAU', number(view.hud.dau), '일간 활성 사용자'],
    ['CASH', money(view.hud.cash), '정산 시 실제 증감'],
    ['월 예상 매출', money(view.hud.monthlyRevenue), '현재 DAU 기준'],
    ['월 예상 비용', money(view.hud.monthlyCost), '인프라 + AI'],
  ];
  const progressPercent = Math.max(0, Math.min(100, dayProgress * 100));
  const last = view.hud.lastSettlement;
  return (
    <header className="hud">
      <div className="hud-status"><span className={`status-dot ${view.hud.status.toLowerCase()}`} /><div><strong>{view.hud.launched ? 'SERVICE ONLINE' : 'BUILDING MVP'}</strong><small>{view.hud.status}</small></div></div>
      <div className="hud-metrics">{metrics.map(([label, value, detail]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</div>
      <div className={`profit-chip ${view.hud.monthlyProfit >= 0 ? 'positive' : 'negative'}`}><span>월 예상 순이익</span><strong>{money(view.hud.monthlyProfit)}</strong><small>{last ? `직전 M${last.month}: ${last.profit >= 0 ? '+' : ''}${money(last.profit)}` : '첫 정산 대기'}</small></div>
      <div className="clock-controls">
        <button className={speed === 0 ? 'active' : ''} onClick={() => onSpeed(0)}>Ⅱ</button>
        <button className={speed === 1 ? 'active' : ''} onClick={() => onSpeed(1)}>▶ <small>x1</small></button>
        <button className={speed === 2 ? 'active' : ''} onClick={() => onSpeed(2)}>▶▶ <small>x2</small></button>
        <button title="하루 진행" onClick={onStep}>+1D</button>
      </div>
      <div className="day-progress-shell" aria-label={`M${view.hud.month} D${view.hud.dayOfMonth} progress ${Math.round(progressPercent)} percent`} title={speed === 0 ? `M${view.hud.month} D${view.hud.dayOfMonth} · PAUSED` : `M${view.hud.month} D${view.hud.dayOfMonth} 진행 중`}>
        <span style={{ width: `${progressPercent}%` }} />
      </div>
    </header>
  );
}

function ServiceDashboard({ view, observability, onNode, onTab }: { view: GameView; observability: ObservabilityView; onNode: (id: string) => void; onTab: (tab: 'technology' | 'learning' | 'service' | 'features' | 'report') => void }) {
  const health = view.service.health;
  const visibleAlerts = view.alerts;
  return (
    <div className="dashboard-layout">
      <aside className="work-rail panel-shell">
        <PanelTitle code="WORK QUEUE" title="진행 작업" badge="4 SLOTS" />
        <div className="work-slot-list">
          {view.workSlots.map((slot) => (
            <button key={slot.id} onClick={() => slot.id === 'technology' ? onTab('technology') : slot.id === 'learning' ? onTab('learning') : slot.id === 'feature' ? onTab('features') : undefined} className={`work-slot ${slot.active ? 'active' : 'empty'}`}>
              <div><span>{slot.label}</span><b>{slot.active ? '●' : '+'}</b></div><strong>{slot.title}</strong><small>{slot.meta}</small>
              {slot.progress !== null && <><div className="progress-track"><i style={{ width: `${pct(slot.progress)}%` }} /></div><em className="progress-percent">{pct(slot.progress)}%</em></>}
            </button>
          ))}
        </div>
        <div className="runway-box"><span>MONTHLY NET · EST</span><strong className={view.hud.monthlyProfit >= 0 ? 'ok' : 'warn'}>{money(view.hud.monthlyProfit)}</strong><small>실제 CASH 반영은 M{view.hud.month} D30 종료 시</small></div>
      </aside>

      <section className="service-map panel-shell">
        <PanelTitle code="LIVE ARCHITECTURE" title="Service Map" badge={`OBS · ${observability.level}`} />
        {view.hud.launched ? (
          <div className="settlement-summary service-health-summary">
            <span>SERVICE HEALTH · {health.status} · {observability.label}</span>
            <strong>{view.service.summary.headline}</strong>
            <small>{view.service.summary.detail}</small>
          </div>
        ) : (
          <div className="settlement-summary service-health-summary"><span>SERVICE HEALTH · PRE-LAUNCH</span><strong>OBS · {observability.level}</strong><small>{observability.nextUnlock ?? 'APM까지 해금됨'}</small></div>
        )}
        <ArchitectureGraph view={view} observability={observability} onNode={onNode} />
        <RequestFlowBoard flows={view.requestFlows} failurePercent={view.service.failurePercent} observability={observability} />
        <div className="load-strip resource-load-strip">
          {view.service.visibleLoads.map((metric) => <LoadMini key={metric.label} metric={metric} />)}
        </div>
      </section>

      <aside className="alert-rail panel-shell">
        <PanelTitle code="NOW / ALERT" title="주목할 상태" badge={`${visibleAlerts.length}`} />
        <div className="alert-list">{visibleAlerts.map((alert) => <AlertCard key={alert.id} alert={alert} onClick={() => alert.nodeId && onNode(alert.nodeId.replace('technology:', '').replace('framework:', 'application').replace('database:', 'database'))} />)}</div>
      </aside>
    </div>
  );
}

function RequestFlowBoard({ flows, failurePercent, observability }: { flows: readonly RequestFlowView[]; failurePercent: number; observability: ObservabilityView }) {
  if (flows.length === 0) {
    return <section className="request-flow-board empty"><div><span>LIVE REQUEST FLOW</span><strong>서비스 공개 후 요청이 흐릅니다.</strong></div></section>;
  }

  const trafficUnit = flows[0].trafficUnit;
  const apm = observability.tracesRequests;
  const metrics = observability.level !== 'BASIC';
  return (
    <section className={`request-flow-board ${apm && failurePercent > 0 ? 'has-failure' : ''}`}>
      <header>
        <div><span>LIVE REQUEST FLOW · {apm ? 'TRACED' : 'TOPOLOGY'}</span><strong>{apm ? '요청이 실제 인프라를 통과하는 경로와 실패 지점' : '요청 경로 구조 · APM에서 Hop별 추적 해금'}</strong></div>
        <small>{metrics ? `● ≈ ${number(trafficUnit)} requests · FAIL ${failurePercent}%` : '상세 Traffic Metrics 잠김'}</small>
      </header>
      <div className="request-flow-list">
        {flows.map((flow) => (
          <div className={`request-flow-row ${apm && flow.failureNode ? 'failed' : ''}`} key={flow.id}>
            <div className="request-source"><span>FEATURE</span><strong>{flow.name}</strong><small>{apm ? `${flow.successPercent}% success` : 'route known'}</small></div>
            <div className="request-route">
              {flow.nodes.map((node, nodeIndex) => (
                <div className="request-hop" key={`${flow.id}-${node.node}-${nodeIndex}`}>
                  {nodeIndex > 0 && (
                    <div className="request-link">
                      {Array.from({ length: apm ? flow.particleCount : 1 }).map((_, particleIndex) => (
                        <i key={particleIndex} style={{ animationDelay: `${particleIndex * -.34}s` }} />
                      ))}
                    </div>
                  )}
                  <div className={`request-node ${apm && !node.available ? 'missing' : ''} ${apm && flow.failureNode === node.node ? 'failed' : ''}`}>
                    <b>{REQUEST_NODE_LABEL[node.node] ?? node.node}</b>
                    <small>{apm ? (node.available ? `${node.arrivalPercent}% IN` : 'MISSING') : 'CONNECTED'}</small>
                  </div>
                </div>
              ))}
              {apm && flow.failureNode && <span className="request-failed-mark">× REQUEST FAILED</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ArchitectureGraph({ view, observability, onNode }: { view: GameView; observability: ObservabilityView; onNode: (id: string) => void }) {
  const app = view.nodes.find((node) => node.kind === 'application')!;
  const db = view.nodes.find((node) => node.kind === 'database')!;
  const alb = view.nodes.find((node) => node.kind === 'load-balancer');
  const cache = view.nodes.find((node) => node.kind === 'cache');
  const queue = view.nodes.find((node) => node.kind === 'queue');
  const storage = view.nodes.find((node) => node.kind === 'storage');
  const metrics = observability.level !== 'BASIC';
  return (
    <div className="architecture-canvas">
      <div className="grid-glow" />
      <div className="users-node"><span>◎</span><b>USERS</b><small>{view.hud.launched ? `${number(view.hud.dau)} DAU` : 'PRE-LAUNCH'}</small></div>
      <div className="flow-line vertical line-top" />
      {alb && <><InfraNode node={alb} onClick={() => onNode(alb.id)} extra="TRAFFIC" /><div className="flow-line vertical line-alb" /></>}
      <InfraNode node={app} onClick={() => onNode(app.id)} extra={`${view.appCount} SERVER${view.appCount > 1 ? 'S' : ''}`} resourceDetail={metrics ? app.resourceDetail : 'RESOURCE METRICS LOCKED'} />
      <div className="flow-line vertical line-db" />
      <InfraNode node={db} onClick={() => onNode(db.id)} extra={`${view.dbReplicaCount} REPLICA`} resourceDetail={metrics ? db.resourceDetail : 'RESOURCE METRICS LOCKED'} />
      {cache && <div className="side-node cache-node"><div className="side-line" /><InfraNode node={cache} onClick={() => onNode(cache.id)} extra="CACHE" /></div>}
      {queue && <div className="side-node queue-node"><div className="side-line" /><InfraNode node={queue} onClick={() => onNode(queue.id)} extra="ASYNC" /></div>}
      {storage && <div className="side-node storage-node"><div className="side-line" /><InfraNode node={storage} onClick={() => onNode(storage.id)} extra="STORAGE" /></div>}
      {!cache && <button className="empty-node cache-node" onClick={() => onNode('database')}><span>＋</span><small>CACHE</small></button>}
      {!queue && <button className="empty-node queue-node"><span>＋</span><small>QUEUE</small></button>}
      {!storage && <button className="empty-node storage-node"><span>＋</span><small>STORAGE</small></button>}
    </div>
  );
}

function InfraNode({ node, onClick, extra, resourceDetail }: { node: ServiceNodeView; onClick: () => void; extra: string; resourceDetail?: string }) {
  return (
    <button className={`infra-node ${node.kind} ${node.tone}`} onClick={onClick}>
      <div className="node-head"><span>{node.icon}</span><small>{extra}</small>{node.incidentId && <b>⚡</b>}</div>
      <strong>{node.name}</strong>
      <div className="node-load"><em>{node.loadPercent}%</em><i><span style={{ width: `${Math.min(100, node.loadPercent)}%` }} /></i></div>
      <small>{resourceDetail ?? node.detail}</small>
    </button>
  );
}

function LoadMini({ metric }: { metric: LoadMetricView }) {
  return <div className={`load-mini ${metric.tone}`}><span>{metric.label}</span><strong>{metric.percent}%</strong><i><b style={{ width: `${Math.min(100, metric.percent)}%` }} /></i></div>;
}

function AlertCard({ alert, onClick }: { alert: AlertView; onClick: () => void }) {
  return <button onClick={onClick} className={`alert-card ${alert.tone}`}><span>{alert.tone === 'danger' ? '!' : alert.tone === 'warning' ? '△' : alert.tone === 'good' ? '✓' : 'i'}</span><div><strong>{alert.title}</strong><small>{alert.detail}</small></div><b>›</b></button>;
}

function TechnologyPanel({ view, onBuild }: { view: GameView; onBuild: (tech: TechnologyOptionView) => void }) {
  const groups = [
    ['TRAFFIC', ['ALB']], ['CACHE', ['REDIS']], ['ASYNC', ['SQS', 'RABBITMQ', 'KAFKA']], ['STORAGE', ['OBJECT_STORAGE']],
  ] as const;
  const activeBuild = view.operations.currentTechnologyBuild;
  return (
    <section className="page-panel">
      <PageHeading eyebrow="TECHNOLOGY CATALOG" title="서비스에 기술 연결" description="구축비는 즉시 CASH에서 빠지고, 월 비용은 매월 정산 때 반영됩니다. 모든 기술에는 해결하는 병목과 감수할 비용/위험이 함께 있습니다." />
      <div className="technology-groups">
        {groups.map(([name, ids]) => (
          <div className="technology-group" key={name}><div className="group-label"><span>{name}</span><i /></div><div className="technology-grid">
            {ids.map((id) => {
              const tech = view.technologies.find((item) => item.id === id)!;
              const building = activeBuild?.id === id;
              const totalDays = building ? activeBuild.elapsedDays + activeBuild.estimatedRemainingDays : 0;
              return <button className={`technology-card ${tech.deployed ? 'deployed' : ''} ${building ? 'building' : ''}`} key={id} disabled={!tech.available} onClick={() => onBuild(tech)}>
                <div className="tech-top"><span>{tech.icon}</span><em>{tech.deployed ? 'ACTIVE' : building ? 'BUILDING' : tech.available ? 'READY' : 'LOCKED'}</em></div>
                <strong>{tech.name}</strong><p>{tech.preview}<br />✓ {tech.benefits[0]}<br />△ {tech.tradeoffs[0]}</p>
                <div className="tech-numbers"><span><small>즉시 구축비</small><b>{money(tech.buildCost)}</b></span><span><small>월 비용</small><b>{money(tech.monthlyCost)}</b></span><span><small>BASE WORK</small><b>{tech.buildWork}</b></span></div>
                {building && <div className="inline-progress"><div className="progress-track"><i style={{ width: `${pct(activeBuild.progress / activeBuild.requiredWork)}%` }} /></div><small>{activeBuild.elapsedDays}/~{totalDays}일 · 약 {activeBuild.estimatedRemainingDays}일 남음</small></div>}
                <div className="tech-action">{tech.deployed ? 'CONNECTED' : building ? 'BUILDING…' : tech.reason ?? 'BUILD →'}</div>
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
      <PageHeading eyebrow="DEVELOPER SKILL TREE" title="실전 경험 → 학습 → 레벨업" description="학습 비용은 시작 즉시 CASH에서 차감됩니다. OS & Runtime / Network / Software Design을 올리면 관측 정보도 BASIC → METRICS → APM으로 깊어집니다." />
      <div className="skill-tree">
        {categories.map((category) => (
          <div className={`skill-lane ${category}`} key={category}><div className="skill-lane-title"><span>{CATEGORY_LABEL[category]}</span><i /></div><div className="skill-node-grid">
            {view.skills.filter((skill) => skill.category === category).map((skill) => (
              <button
                key={skill.key}
                className={`skill-node ${skill.canStudy ? 'ready' : ''} ${skill.studying ? 'studying' : ''}`}
                disabled={!skill.canStudy}
                onClick={() => onStudy(skill)}
              >
                <span className="skill-icon">{skill.icon}</span><div><strong>{skill.name}</strong><em>Lv.{skill.level}{skill.studying && skill.targetLevel ? ` → ${skill.targetLevel}` : ''}</em></div>
                <div className="skill-exp"><i><b style={{ width: `${skill.requiredExperience ? Math.min(100, Math.round(skill.experienceDays / skill.requiredExperience * 100)) : 100}%` }} /></i><small>{skill.requiredExperience ? `${skill.experienceDays}/${skill.requiredExperience}d EXP` : 'MAX'}</small></div>
                {skill.studying && <div className="inline-progress"><div className="progress-track"><i style={{ width: `${pct(skill.studyProgress)}%` }} /></div><small>STUDYING · {skill.elapsedStudyDays}/{skill.studyDays}일 · {pct(skill.studyProgress)}%</small></div>}
                <footer>
                  <b>{skill.studying ? 'STUDYING' : skill.canStudy ? 'STUDY' : skill.reason ?? 'LOCKED'}</b>
                  <span>{skill.studyDays ? `${skill.studyDays}일 · ${money(skill.cost ?? 0)}` : 'MAX'}</span>
                </footer>
              </button>
            ))}
          </div></div>
        ))}
      </div>
    </section>
  );
}

function FeatureBoard({ view, observability, onFastTrack, onRefactor }: { view: GameView; observability: ObservabilityView; onFastTrack: () => void; onRefactor: () => void }) {
  const current = view.operations.currentFeature;
  const debt = view.operations.techDebt;
  const showResourceSignature = observability.showsResourceSignature;
  return (
    <section className="page-panel">
      <PageHeading eyebrow="COMMUNITY ROADMAP" title="Requirement Timeline" description="기능마다 서로 다른 자원 성향을 가지며, 빠른 출시와 코드 건강성 사이의 트레이드오프도 관리합니다." />
      {view.hud.launched && <div className="settlement-summary">
        <span>TECH DEBT · {debt.value}/100</span>
        <strong>{debt.refactoring ? `REFACTORING · ${debt.remainingRefactorDays}D` : `DEV EFF ${pct(debt.developmentModifier)}%`}</strong>
        <small>Incident Risk ×{debt.incidentRiskMultiplier.toFixed(2)} · FAST TRACK은 현재 기능을 30% 당기는 대신 Debt를 쌓고, REFACTOR는 5일간 기능 개발을 멈춰 Debt -30.</small>
        <button className="replica-add" disabled={!debt.canFastTrack || debt.refactoring} onClick={onFastTrack}>⚡ FAST TRACK · +30% PROGRESS</button>
        <button className="replica-add" disabled={debt.value < 10 || debt.refactoring} onClick={onRefactor}>↺ REFACTOR · 5 DAYS · DEBT -30</button>
      </div>}
      <div className="settlement-summary">
        <span>OBSERVABILITY · {observability.level}</span>
        <strong>{observability.label}</strong>
        <small>{observability.nextUnlock ?? '요청 추적과 출시 영향 분석까지 모두 해금되었습니다.'}</small>
      </div>
      <div className="phase-board">{([1, 2, 3] as const).map((phase) => <div className="phase-lane" key={phase}><header><span>PHASE {phase}</span><strong>{phase === 1 ? 'EARLY' : phase === 2 ? 'GROWTH' : 'SCALE'}</strong></header><div>
        {view.features.filter((feature) => feature.phase === phase).map((feature, index) => <article className={`feature-card ${feature.state}`} key={feature.id}><div className="feature-index">{String(index + 1).padStart(2, '0')}</div><span>{feature.state === 'completed' ? '✓' : feature.state === 'developing' ? '●' : feature.state === 'hidden' ? '?' : '○'}</span><strong>{feature.name}</strong><small>DAU {number(feature.threshold)}</small>{feature.state === 'developing' && current && <div className="inline-progress"><div className="progress-track"><i style={{ width: `${pct(current.progress / current.requiredWork)}%` }} /></div><small>{current.elapsedDays}/~{current.elapsedDays + current.estimatedRemainingDays}일 · 약 {current.estimatedRemainingDays}일 남음</small></div>}{feature.route && <div className="feature-route-tags">{feature.route.map((node, nodeIndex) => <i key={`${node}-${nodeIndex}`}>{REQUEST_NODE_LABEL[node] ?? node}</i>)}</div>}{feature.load && showResourceSignature && <div><i>A {feature.load.app}</i><i>D {feature.load.db}</i><i>Q {feature.load.async}</i><i>S {feature.load.storage}</i></div>}{feature.load && !showResourceSignature && <small>Resource signature · METRICS에서 해금</small>}</article>)}
      </div></div>)}</div>
    </section>
  );
}

function ReportPanel({ view, observability }: { view: GameView; observability: ObservabilityView }) {
  const cards = [
    ['DAU', number(view.hud.dau), '현재 일간 활성 사용자'], ['월 예상 매출', money(view.hud.monthlyRevenue), '현재 DAU 기준 예상치'], ['월 예상 비용', money(view.hud.monthlyCost), '인프라 + AI 예상치'], ['월 예상 순이익', money(view.hud.monthlyProfit), '실제 반영은 월말 정산'],
  ];
  const last = view.hud.lastSettlement;
  return <section className="page-panel"><PageHeading eyebrow="OPERATING REPORT" title="현재 런 요약" description={`현재 M${view.hud.month} D${view.hud.dayOfMonth} · Observability ${observability.level} · 다음 CASH 정산까지 ${view.hud.daysUntilSettlement}일`} /><div className="report-grid">{cards.map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small><i /></article>)}</div>{last && <div className="settlement-summary"><span>LAST SETTLEMENT · M{last.month}</span><strong>{last.profit >= 0 ? '+' : ''}{money(last.profit)}</strong><small>매출 {money(last.revenue)} · 비용 {money(last.totalCost)} · 정산 후 CASH {money(last.cashAfter)}</small></div>}<div className="report-loads resource-report-loads">{view.service.visibleLoads.map((metric) => <LoadMini key={metric.label} metric={metric} />)}</div><div className="settlement-summary"><span>OBSERVABILITY · {observability.level}</span><strong>{observability.label}</strong><small>{observability.nextUnlock ?? '모든 관측 정보 해금 완료'}</small></div></section>;
}

function NodeInspector({ node, view, observability, onClose, onAction, controller }: { node: ServiceNodeView; view: GameView; observability: ObservabilityView; onClose: () => void; onAction: (action: () => void) => void; controller: GameController }) {
  const app = node.kind === 'application';
  const db = node.kind === 'database';
  const appServerDelta = view.infrastructureCosts.addAppServerMonthlyCostDelta;
  const dbReplicaDelta = view.infrastructureCosts.addDbReplicaMonthlyCostDelta;
  const resourceDetail = node.resourceDetail ?? null;
  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="node-drawer"><header><div className={`drawer-icon ${node.tone}`}>{node.icon}</div><div><span>{node.kind.toUpperCase()}</span><strong>{node.name}</strong></div><button onClick={onClose}>×</button></header><section className="drawer-load"><span>LIVE LOAD · {observability.level}</span><strong>{node.loadPercent}%</strong><i><b style={{ width: `${Math.min(100, node.loadPercent)}%` }} /></i><small>{resourceDetail ? `${resourceDetail} · ${node.detail}` : `${node.detail} · ${observability.nextUnlock ?? 'APM ACTIVE'}`}</small></section>
    {app && <section className="drawer-section"><label>SERVER SIZE · MONTHLY COST</label><div className="size-grid">{SIZE_ORDER.map((size) => <button key={size} className={view.appSize === size ? 'active' : ''} onClick={() => onAction(() => controller.scaleApplication(size))}><span>{SIZE_LABEL[size]}</span><small>{size}</small><em>{money(view.infrastructureCosts.appSizeMonthlyCosts[size])}/월</em></button>)}</div><div className="scale-row"><div><span>INSTANCE</span><strong>{view.appCount} / 10</strong><small>{appServerDelta !== null ? `추가 시 월 +${money(appServerDelta)}` : 'ALB 필요 또는 최대치'}</small></div><button disabled={appServerDelta === null} onClick={() => onAction(() => controller.addApplicationServer())}>＋ SERVER{appServerDelta !== null ? ` · 월 +${money(appServerDelta)}` : ''}</button></div><p>Scale-up/out은 CPU와 I/O Capacity를 함께 늘립니다. METRICS부터 두 축을 직접 비교할 수 있습니다.</p></section>}
    {db && <section className="drawer-section"><label>DATABASE SIZE · MONTHLY COST</label><div className="size-grid">{SIZE_ORDER.map((size) => <button key={size} className={view.dbSize === size ? 'active' : ''} onClick={() => onAction(() => controller.scaleDatabase(size))}><span>{SIZE_LABEL[size]}</span><small>{size}</small><em>{money(view.infrastructureCosts.dbSizeMonthlyCosts[size])}/월</em></button>)}</div><div className="replica-row"><div className="db-cylinder primary">P</div>{Array.from({ length: view.dbReplicaCount }).map((_, index) => <div className="db-cylinder" key={index}>R</div>)}</div>{view.dbReplicaCount < 3 && <button className="replica-add" onClick={() => onAction(() => controller.addDatabaseReplica())}>＋ REPLICA · 월 +{money(dbReplicaDelta ?? 0)}</button>}<p>Replica는 CPU보다 Read I/O Capacity 증가 효과가 더 큽니다. METRICS 해금 후 병목 축을 비교하세요.</p></section>}
    {node.incidentId && <section className="incident-action"><span>⚡ {node.incidentSeverity} INCIDENT</span><button onClick={() => onAction(() => controller.startIncidentResponse(node.incidentId!))}>대응 시작</button></section>}
  </aside></div>;
}

function EventOverlay({ event, view, observability, onDismiss, onRespond, onTrafficResponse }: { event: GameEventView; view: GameView; observability: ObservabilityView; onDismiss: () => void; onRespond: () => void; onTrafficResponse: (response: TrafficResponseChoice) => void }) {
  const incident = event.kind === 'incident';
  const traffic = event.kind === 'traffic';
  const diagnosisText = incident ? event.diagnosis ?? null : null;
  const viral = traffic ? view.operations.trafficSpike : null;
  const dismiss = traffic ? () => onTrafficResponse('RIDE') : onDismiss;
  return <div className="event-overlay"><article className={`event-card ${event.kind}`}><button aria-label="팝업 닫기" onClick={dismiss} className="event-close">×</button><div className="event-scan" /><span className="event-code">{event.kind === 'requirement' ? 'SYSTEM / REQUIREMENT' : incident ? `SYSTEM / INCIDENT / ${observability.level}` : traffic ? 'SYSTEM / TRAFFIC / DECISION' : 'SYSTEM'}</span><div className="event-symbol">{incident ? '⚡' : traffic ? '🔥' : event.kind === 'won' ? '◆' : event.kind === 'bankrupt' ? '×' : '＋'}</div><h2>{event.title}</h2><p>{event.message}</p>{diagnosisText && <p>{diagnosisText}</p>}{traffic && viral && <p>RIDE · 부하 ×1.80 / 성장 +5%p / 무료　·　LIMIT · 부하 ×1.15 / 성장 +1%p / 무료　·　BURST · 부하 ×1.35 / 성장 +5%p / {money(viral.burstCost)}</p>}{event.severity && <strong className="severity-chip">{event.severity}</strong>}<footer>{traffic ? <><button className="secondary" onClick={() => onTrafficResponse('RIDE')}>그냥 버틴다</button><button className="secondary" onClick={() => onTrafficResponse('THROTTLE')}>Traffic Limit</button><button className="primary" disabled={Boolean(viral && view.hud.cash < viral.burstCost)} onClick={() => onTrafficResponse('BURST')}>Emergency Burst · {money(viral?.burstCost ?? 0)}</button></> : <>{incident && <button className="secondary" onClick={onDismiss}>나중에</button>}<button className="primary" onClick={incident ? onRespond : onDismiss}>{incident ? '대응 시작' : '확인'}</button></>}</footer></article></div>;
}

function PanelTitle({ code, title, badge }: { code: string; title: string; badge: string }) {
  return <header className="panel-title"><div><span>{code}</span><strong>{title}</strong></div><b>{badge}</b></header>;
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="page-heading"><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></header>;
}
