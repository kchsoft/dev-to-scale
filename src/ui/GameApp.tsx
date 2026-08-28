'use client';

import { useEffect, useRef, useState } from 'react';
import { GameClock, type GameSpeed } from '../application/game-clock';
import { GameController, type DevelopmentActionView, type GameEventView, type GameView } from '../application/game-controller';
import type { DatabaseOptionId, FrameworkOptionId, SkillRefView, TechnologyIdView, TrafficResponseChoice, WorkSlotView } from '../application/game-view';
import { DevelopmentWorkbench, optionIdForWorkSlot } from './DevelopmentWorkbench';
import { dispatchDevelopmentAction } from './development-action-dispatcher';
import { EventOverlay } from './EventOverlay';
import { GameSetup } from './GameSetup';
import { Hud } from './Hud';
import { NodeInspector } from './NodeInspector';
import { ReportPanel } from './ReportPanel';
import { ServiceDashboard } from './ServiceDashboard';
import { GAME_NAV_ITEMS, type GameTab } from './game-navigation';
import { money } from './game-format';

export default function GameApp() {
  const [frameworkId, setFrameworkId] = useState<FrameworkOptionId>('SPRING_BOOT');
  const [databaseId, setDatabaseId] = useState<DatabaseOptionId>('POSTGRESQL');
  const [controller, setController] = useState<GameController | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [speed, setSpeedState] = useState<GameSpeed>(0);
  const [dayProgress, setDayProgress] = useState(0);
  const [tab, setTab] = useState<GameTab>('service');
  const [developmentInitialSelectedId, setDevelopmentInitialSelectedId] = useState<string | null>(null);
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
    setDevelopmentInitialSelectedId(null);
    setTab('service');
  };

  const restart = () => {
    clockRef.current?.dispose();
    setController(null);
    setView(null);
    setEvents([]);
    setSelectedNode(null);
    setDevelopmentInitialSelectedId(null);
    setSpeedState(0);
    setDayProgress(0);
  };

  const run = (action: () => void, success?: string) => {
    try {
      action();
      if (success) setToast(success);
    } catch (error) {
      setView(controller?.getView() ?? null);
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
      setView(controller.getView());
      setToast(error instanceof Error ? error.message : 'Traffic 대응을 적용할 수 없습니다.');
    }
  };

  const handleDevelopmentAction = (action: DevelopmentActionView) => {
    dispatchDevelopmentAction(action, {
      startTechnologyBuild: (technologyId: TechnologyIdView) => {
        const technology = view.technologies.find((item) => item.id === technologyId);
        run(
          () => controller.startTechnologyBuild(technologyId),
          technology ? `${technology.name} 구축 시작 · 즉시 ${money(technology.buildCost)} · 월 ${money(technology.monthlyCost)}` : '기술 구축 시작',
        );
      },
      startLearning: (skillRef: SkillRefView) => {
        const skill = view.skills.find((item) => item.ref.category === skillRef.category && item.ref.id === skillRef.id);
        run(
          () => controller.startLearning(skillRef),
          skill ? `${skill.name} 학습 시작 · ${money(skill.cost ?? 0)}` : '학습 시작',
        );
      },
      fastTrackFeature: (featureId: string) => {
        run(() => {
          const latest = controller.getView();
          if (latest.operations.currentFeature?.id !== featureId) {
            throw new Error('기능 상태가 변경되었습니다. 최신 상태를 다시 확인해주세요.');
          }
          controller.fastTrackCurrentFeature();
        }, 'FAST TRACK · 기능 진행 +30% · Tech Debt 증가');
      },
      startRefactor: () => run(
        () => controller.startRefactor(),
        'REFACTORING 시작 · 5일간 기능 개발 중단',
      ),
    });
  };

  const openPrimaryTab = (nextTab: GameTab) => {
    if (nextTab === 'development') setDevelopmentInitialSelectedId(null);
    setTab(nextTab);
  };

  const openDevelopmentFromSlot = (slot: WorkSlotView) => {
    setDevelopmentInitialSelectedId(optionIdForWorkSlot(slot, view.development.options));
    setTab('development');
  };

  return <main className="game-screen">
    <Hud view={view} speed={speed} dayProgress={dayProgress} onSpeed={(next) => clockRef.current?.setSpeed(next)} onStep={() => clockRef.current?.advanceOneDay()} />
    <div className="main-shell">
      <nav className="side-nav"><div className="nav-brand">D<span>2</span>S</div>{GAME_NAV_ITEMS.map(([id, icon, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => openPrimaryTab(id)}><span>{icon}</span><small>{label}</small></button>)}<button className="restart-button" onClick={restart}><span>↺</span><small>재시작</small></button></nav>
      <section className="workspace">
        {tab === 'service' && <ServiceDashboard view={view} observability={observability} onNode={setSelectedNode} onDevelopmentSlot={openDevelopmentFromSlot} />}
        {tab === 'development' && <DevelopmentWorkbench view={view.development} initialSelectedId={developmentInitialSelectedId} onAction={handleDevelopmentAction} />}
        {tab === 'report' && <ReportPanel view={view} observability={observability} />}
      </section>
    </div>
    {selected && <NodeInspector node={selected} view={view} observability={observability} onClose={() => setSelectedNode(null)} onScaleApplication={(size) => run(() => controller.scaleApplication(size))} onAddApplicationServer={() => run(() => controller.addApplicationServer())} onScaleDatabase={(size) => run(() => controller.scaleDatabase(size))} onAddDatabaseReplica={() => run(() => controller.addDatabaseReplica())} onIncidentResponse={(id) => run(() => controller.startIncidentResponse(id))} />}
    {activeEvent && <EventOverlay event={activeEvent} view={view} observability={observability} onDismiss={closeActiveEvent} onTrafficResponse={handleTrafficResponse} onRespond={() => { if (activeEvent.kind === 'incident') run(() => controller.startIncidentResponse(activeEvent.id), '장애 대응을 시작했습니다.'); closeActiveEvent(); }} />}
    {toast && <div className="toast">{toast}</div>}
  </main>;
}
