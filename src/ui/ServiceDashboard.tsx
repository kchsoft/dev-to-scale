import { useEffect, useRef, type MutableRefObject } from 'react';
import type { DevelopmentActionView, DevelopmentOptionKind, DevelopmentWorkbenchView } from '../application/development-view';
import type { AlertView, GameView, LoadMetricView, ObservabilityView, WorkSlotView } from '../application/game-view';
import { money, pct } from './game-format';
import {
  ServiceCommandRail,
  developmentKindForWorkSlot,
  serviceCommandStateForWorkSlot,
  type ServiceCommandState,
} from './ServiceCommandRail';
import { TopologyMap } from './TopologyMap';

interface ServiceDashboardProps {
  readonly view: GameView;
  readonly development: DevelopmentWorkbenchView;
  readonly observability: ObservabilityView;
  readonly commandState: ServiceCommandState;
  readonly onCommandStateChange: (next: ServiceCommandState) => void;
  readonly onDevelopmentAction: (action: DevelopmentActionView) => void;
  readonly onOpenFullBuild: (kind: DevelopmentOptionKind, optionId: string | null) => void;
  readonly onNode: (id: string) => void;
}

const MAX_VISIBLE_ALERTS = 3;

const WORK_KIND_TITLE: Readonly<Record<DevelopmentOptionKind, string>> = {
  feature: 'Feature',
  technology: 'Technology',
  learning: 'Learning',
};

export function ServiceDashboard({
  view,
  development,
  observability,
  commandState,
  onCommandStateChange,
  onDevelopmentAction,
  onOpenFullBuild,
  onNode,
}: ServiceDashboardProps) {
  const health = view.service.health;
  const visibleAlerts = view.alerts.slice(0, MAX_VISIBLE_ALERTS);
  const remainingAlertCount = Math.max(0, view.alerts.length - visibleAlerts.length);
  const slotButtonRefs = useRef<Record<DevelopmentOptionKind, HTMLButtonElement | null>>({
    feature: null,
    technology: null,
    learning: null,
  });
  const lastCommandKindRef = useRef<DevelopmentOptionKind | null>(null);

  useEffect(() => {
    if (commandState !== null || !lastCommandKindRef.current) return;
    const kind = lastCommandKindRef.current;
    const frame = requestAnimationFrame(() => slotButtonRefs.current[kind]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [commandState]);

  const openCommandFromSlot = (slot: WorkSlotView) => {
    const next = serviceCommandStateForWorkSlot(slot, development.options);
    if (!next) return;
    lastCommandKindRef.current = next.kind;
    onCommandStateChange(next);
  };

  return (
    <div className={`service-board${commandState ? ' command-open' : ''}`}>
      {commandState
        ? <ServiceCommandRail
            view={development}
            state={commandState}
            onStateChange={onCommandStateChange}
            onAction={onDevelopmentAction}
            onOpenFullBuild={onOpenFullBuild}
            onClose={() => onCommandStateChange(null)}
          />
        : <ActiveWorkRail
            view={view}
            slotButtonRefs={slotButtonRefs}
            onOpenCommand={openCommandFromSlot}
          />}

      <section className="service-board-stage" aria-labelledby="service-stage-title">
        <header className="service-stage-heading">
          <div>
            <span>LIVE ARCHITECTURE · OBS {observability.level}</span>
            <strong id="service-stage-title">Service Map</strong>
          </div>
          <div className={`service-health-chip ${health.status.toLowerCase()}`}>
            <span>{view.hud.launched ? health.status : 'PRE-LAUNCH'}</span>
            <strong>{view.hud.launched ? view.service.summary.headline : observability.label}</strong>
          </div>
        </header>
        <div className="service-stage-context">
          <span>{view.hud.launched ? view.service.summary.detail : observability.nextUnlock ?? 'APM까지 해금됨'}</span>
        </div>
        <TopologyMap
          topology={view.topology}
          observability={observability}
          dau={view.hud.dau}
          launched={view.hud.launched}
          onNode={onNode}
        />
        <div className="load-strip resource-load-strip">
          {view.service.visibleLoads.map((metric) => <LoadMini key={metric.id} metric={metric} />)}
        </div>
      </section>

      <aside className="actionable-alerts" aria-label="지금 주목할 상태">
        <header className="board-rail-heading">
          <span>NOW</span>
          <strong>주목할 상태</strong>
          <b>{view.alerts.length}</b>
        </header>
        <div className="alert-list">
          {visibleAlerts.map((alert) => {
            const target = topologyNodeIdForAlert(view, alert.nodeId);
            return <AlertCard
              key={alert.id}
              alert={alert}
              disabled={!target}
              onClick={() => { if (target) onNode(target); }}
            />;
          })}
          {remainingAlertCount > 0 && <div className="remaining-alert-count">+{remainingAlertCount} MORE</div>}
        </div>
      </aside>
    </div>
  );
}

function ActiveWorkRail({
  view,
  slotButtonRefs,
  onOpenCommand,
}: {
  readonly view: GameView;
  readonly slotButtonRefs: MutableRefObject<Record<DevelopmentOptionKind, HTMLButtonElement | null>>;
  readonly onOpenCommand: (slot: WorkSlotView) => void;
}) {
  return <aside className="active-work-rail" aria-label="현재 진행 작업">
    <header className="board-rail-heading">
      <span>ACTIVE</span>
      <strong>진행 중</strong>
    </header>
    <div className="work-slot-list">
      {view.workSlots.map((slot) => {
        const kind = developmentKindForWorkSlot(slot);
        const commandLabel = kind
          ? `${WORK_KIND_TITLE[kind]} ${slot.active ? '진행 작업 열기' : '선택 열기'}`
          : 'Incident 상태';
        return <button
          key={slot.id}
          ref={kind ? (node) => { slotButtonRefs.current[kind] = node; } : undefined}
          disabled={!kind}
          aria-label={commandLabel}
          onClick={() => onOpenCommand(slot)}
          className={`work-slot ${slot.active ? 'active' : 'empty'}`}
        >
          <div><span>{slot.label}</span><b>{slot.active ? '●' : '○'}</b></div>
          <strong>{slot.title}</strong>
          <small>{slot.meta}</small>
          {slot.progress !== null && <>
            <div className="progress-track"><i style={{ width: `${pct(slot.progress)}%` }} /></div>
            <em className="progress-percent">{pct(slot.progress)}%</em>
          </>}
        </button>;
      })}
    </div>
    <div className="runway-box">
      <span>MONTHLY NET</span>
      <strong className={view.hud.monthlyProfit >= 0 ? 'ok' : 'warn'}>{money(view.hud.monthlyProfit)}</strong>
      <small>정산 D-{view.hud.daysUntilSettlement}</small>
    </div>
  </aside>;
}

function topologyNodeIdForAlert(view: GameView, alertNodeId: string | undefined): string | null {
  if (!alertNodeId) return null;
  return view.topology.nodes.some(({ id }) => id === alertNodeId) ? alertNodeId : null;
}

export function LoadMini({ metric }: { metric: LoadMetricView }) {
  return <div className={`load-mini ${metric.tone}`}><span>{metric.label}</span><strong>{metric.percent}%</strong><i><b style={{ width: `${Math.min(100, metric.percent)}%` }} /></i></div>;
}

function AlertCard({ alert, disabled, onClick }: { alert: AlertView; disabled: boolean; onClick: () => void }) {
  const symbol = alert.tone === 'danger' ? '!' : alert.tone === 'warning' ? '△' : alert.tone === 'good' ? '✓' : 'i';
  return <button disabled={disabled} onClick={onClick} className={`alert-card ${alert.tone}`}><span>{symbol}</span><div><strong>{alert.title}</strong><small>{alert.detail}</small></div>{!disabled && <b>›</b>}</button>;
}
