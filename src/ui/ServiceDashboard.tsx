import type { AlertView, GameView, LoadMetricView, ObservabilityView } from '../application/game-view';
import { money, pct } from './game-format';
import { PanelTitle } from './game-panel';
import { TopologyMap } from './TopologyMap';

export type GameTab = 'technology' | 'learning' | 'service' | 'features' | 'report';

interface ServiceDashboardProps {
  readonly view: GameView;
  readonly observability: ObservabilityView;
  readonly onNode: (id: string) => void;
  readonly onTab: (tab: GameTab) => void;
}

export function ServiceDashboard({ view, observability, onNode, onTab }: ServiceDashboardProps) {
  const health = view.service.health;
  const visibleAlerts = view.alerts;
  return <div className="dashboard-layout"><aside className="work-rail panel-shell"><PanelTitle code="WORK QUEUE" title="진행 작업" badge="4 SLOTS" /><div className="work-slot-list">{view.workSlots.map((slot) => <button key={slot.id} onClick={() => slot.id === 'technology' ? onTab('technology') : slot.id === 'learning' ? onTab('learning') : slot.id === 'feature' ? onTab('features') : undefined} className={`work-slot ${slot.active ? 'active' : 'empty'}`}><div><span>{slot.label}</span><b>{slot.active ? '●' : '+'}</b></div><strong>{slot.title}</strong><small>{slot.meta}</small>{slot.progress !== null && <><div className="progress-track"><i style={{ width: `${pct(slot.progress)}%` }} /></div><em className="progress-percent">{pct(slot.progress)}%</em></>}</button>)}</div><div className="runway-box"><span>MONTHLY NET · EST</span><strong className={view.hud.monthlyProfit >= 0 ? 'ok' : 'warn'}>{money(view.hud.monthlyProfit)}</strong><small>실제 CASH 반영은 M{view.hud.month} D30 종료 시</small></div></aside><section className="service-map panel-shell"><PanelTitle code="LIVE ARCHITECTURE" title="Service Map" badge={`OBS · ${observability.level}`} />{view.hud.launched ? <div className="settlement-summary service-health-summary"><span>SERVICE HEALTH · {health.status} · {observability.label}</span><strong>{view.service.summary.headline}</strong><small>{view.service.summary.detail}</small></div> : <div className="settlement-summary service-health-summary"><span>SERVICE HEALTH · PRE-LAUNCH</span><strong>OBS · {observability.level}</strong><small>{observability.nextUnlock ?? 'APM까지 해금됨'}</small></div>}<TopologyMap topology={view.topology} observability={observability} dau={view.hud.dau} launched={view.hud.launched} onNode={onNode} /><div className="load-strip resource-load-strip">{view.service.visibleLoads.map((metric) => <LoadMini key={metric.id} metric={metric} />)}</div></section><aside className="alert-rail panel-shell"><PanelTitle code="NOW / ALERT" title="주목할 상태" badge={`${visibleAlerts.length}`} /><div className="alert-list">{visibleAlerts.map((alert) => <AlertCard key={alert.id} alert={alert} onClick={() => { const target = topologyNodeIdForAlert(view, alert.nodeId); if (target) onNode(target); }} />)}</div></aside></div>;
}

function topologyNodeIdForAlert(view: GameView, alertNodeId: string | undefined): string | null {
  if (!alertNodeId) return null;
  const exact = view.topology.nodes.find((node) => node.id === alertNodeId);
  if (exact) return exact.id;
  if (alertNodeId === 'application' || alertNodeId.startsWith('framework:')) return view.topology.nodes.find((node) => node.kind === 'server-group')?.id ?? null;
  if (alertNodeId === 'database' || alertNodeId.startsWith('database:')) return view.topology.nodes.find((node) => node.kind === 'database')?.id ?? null;
  const productId = alertNodeId.replace('technology:', '');
  return view.topology.nodes.find((node) => node.id.endsWith(`:${productId}`))?.id ?? null;
}

export function LoadMini({ metric }: { metric: LoadMetricView }) {
  return <div className={`load-mini ${metric.tone}`}><span>{metric.label}</span><strong>{metric.percent}%</strong><i><b style={{ width: `${Math.min(100, metric.percent)}%` }} /></i></div>;
}

function AlertCard({ alert, onClick }: { alert: AlertView; onClick: () => void }) {
  return <button onClick={onClick} className={`alert-card ${alert.tone}`}><span>{alert.tone === 'danger' ? '!' : alert.tone === 'warning' ? '△' : alert.tone === 'good' ? '✓' : 'i'}</span><div><strong>{alert.title}</strong><small>{alert.detail}</small></div><b>›</b></button>;
}
