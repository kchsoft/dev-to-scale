'use client';

import { useEffect, useRef, useState } from 'react';
import { GameClock, type GameSpeed } from '../application/game-clock';
import { GameController, type GameEventView, type GameView } from '../application/game-controller';
import type { DatabaseOptionId, FrameworkOptionId, TrafficResponseChoice } from '../application/game-view';
import { EventOverlay } from './EventOverlay';
import { FeatureBoard } from './FeatureBoard';
import { GameSetup } from './GameSetup';
import { Hud } from './Hud';
import { LearningPanel } from './LearningPanel';
import { NodeInspector } from './NodeInspector';
import { ReportPanel } from './ReportPanel';
import { ServiceDashboard, type GameTab } from './ServiceDashboard';
import { TechnologyPanel } from './TechnologyPanel';
import { money } from './game-format';

export default function GameApp() {
  const [frameworkId, setFrameworkId] = useState<FrameworkOptionId>('SPRING_BOOT');
  const [databaseId, setDatabaseId] = useState<DatabaseOptionId>('POSTGRESQL');
  const [controller, setController] = useState<GameController | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [speed, setSpeedState] = useState<GameSpeed>(0);
  const [dayProgress, setDayProgress] = useState(0);
  const [tab, setTab] = useState<GameTab>('service');
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
    const timer = setTimeout(() => setToast(null), 3_600);
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
    return <GameSetup frameworkId={frameworkId} databaseId={databaseId} onFrameworkChange={setFrameworkId} onDatabaseChange={setDatabaseId} onStart={startGame} />;
  }

  const activeEvent = events[0] ?? null;
  const selected = view.topology.nodes.find((node) => node.id === selectedNode) ?? null;
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

  return <main className="game-screen">
    <Hud view={view} speed={speed} dayProgress={dayProgress} onSpeed={(next) => clockRef.current?.setSpeed(next)} onStep={() => clockRef.current?.advanceOneDay()} />
    <div className="main-shell">
      <nav className="side-nav"><div className="nav-brand">D<span>2</span>S</div>{([['service', '⌂', '서비스'], ['features', '☆', '기능'], ['technology', '⌕', '기술'], ['learning', '◇', '학습'], ['report', '▥', '리포트']] as const).map(([id, icon, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><span>{icon}</span><small>{label}</small></button>)}<button className="restart-button" onClick={restart}><span>↺</span><small>재시작</small></button></nav>
      <section className="workspace">
        {tab === 'service' && <ServiceDashboard view={view} observability={observability} onNode={setSelectedNode} onTab={setTab} />}
        {tab === 'features' && <FeatureBoard view={view} observability={observability} onFastTrack={() => run(() => controller.fastTrackCurrentFeature(), 'FAST TRACK · 기능 진행 +30% · Tech Debt 증가')} onRefactor={() => run(() => controller.startRefactor(), 'REFACTORING 시작 · 5일간 기능 개발 중단')} />}
        {tab === 'technology' && <TechnologyPanel view={view} onBuild={(tech) => run(() => controller.startTechnologyBuild(tech.id), `${tech.name} 구축 시작 · 즉시 ${money(tech.buildCost)} · 월 ${money(tech.monthlyCost)}`)} />}
        {tab === 'learning' && <LearningPanel view={view} onStudy={(skill) => run(() => controller.startLearning(skill.ref), `${skill.name} 학습 시작 · ${money(skill.cost ?? 0)}`)} />}
        {tab === 'report' && <ReportPanel view={view} observability={observability} />}
      </section>
    </div>
    {selected && <NodeInspector node={selected} view={view} observability={observability} onClose={() => setSelectedNode(null)} onScaleApplication={(size) => run(() => controller.scaleApplication(size))} onAddApplicationServer={() => run(() => controller.addApplicationServer())} onScaleDatabase={(size) => run(() => controller.scaleDatabase(size))} onAddDatabaseReplica={() => run(() => controller.addDatabaseReplica())} onIncidentResponse={(id) => run(() => controller.startIncidentResponse(id))} />}
    {activeEvent && <EventOverlay event={activeEvent} view={view} observability={observability} onDismiss={closeActiveEvent} onTrafficResponse={handleTrafficResponse} onRespond={() => { if (activeEvent.kind === 'incident') run(() => controller.startIncidentResponse(activeEvent.id), '장애 대응을 시작했습니다.'); closeActiveEvent(); }} />}
    {toast && <div className="toast">{toast}</div>}
  </main>;
}
