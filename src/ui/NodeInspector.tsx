import { SERVER_SIZE_VALUES, type GameView, type ObservabilityView, type ServerSizeView, type TopologyNodeView } from '../application/game-view';
import { money } from './game-format';

const SIZE_LABEL: Record<ServerSizeView, string> = { SMALL: 'S', MEDIUM: 'M', LARGE: 'L', XLARGE: 'XL' };

interface NodeInspectorProps {
  readonly node: TopologyNodeView;
  readonly view: GameView;
  readonly observability: ObservabilityView;
  readonly onClose: () => void;
  readonly onScaleApplication: (size: ServerSizeView) => void;
  readonly onAddApplicationServer: () => void;
  readonly onScaleDatabase: (size: ServerSizeView) => void;
  readonly onAddDatabaseReplica: () => void;
  readonly onIncidentResponse: (id: string) => void;
}

export function NodeInspector({ node, view, observability, onClose, onScaleApplication, onAddApplicationServer, onScaleDatabase, onAddDatabaseReplica, onIncidentResponse }: NodeInspectorProps) {
  const app = node.kind === 'server-group';
  const db = node.kind === 'database';
  const appServerDelta = view.infrastructureCosts.addAppServerMonthlyCostDelta;
  const dbReplicaDelta = view.infrastructureCosts.addDbReplicaMonthlyCostDelta;
  const resourceDetail = node.detail;
  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="node-drawer"><header><div className={`drawer-icon ${node.tone}`}>{node.icon}</div><div><span>{node.kind.toUpperCase()}</span><strong>{node.name}</strong></div><button onClick={onClose}>×</button></header><section className="drawer-load"><span>LIVE LOAD · {observability.level}</span><strong>{node.loadPercent}%</strong><i><b style={{ width: `${Math.min(100, node.loadPercent)}%` }} /></i><small>{resourceDetail ? `${resourceDetail} · ${node.detail}` : `${node.detail} · ${observability.nextUnlock ?? 'APM ACTIVE'}`}</small></section>{app && <section className="drawer-section"><label>SERVER SIZE · MONTHLY COST</label><div className="size-grid">{SERVER_SIZE_VALUES.map((size) => <button key={size} className={view.appSize === size ? 'active' : ''} onClick={() => onScaleApplication(size)}><span>{SIZE_LABEL[size]}</span><small>{size}</small><em>{money(view.infrastructureCosts.appSizeMonthlyCosts[size])}/월</em></button>)}</div><div className="scale-row"><div><span>INSTANCE</span><strong>{view.appCount} / 10</strong><small>{appServerDelta !== null ? `추가 시 월 +${money(appServerDelta)}` : 'ALB 필요 또는 최대치'}</small></div><button disabled={appServerDelta === null} onClick={onAddApplicationServer}>＋ SERVER{appServerDelta !== null ? ` · 월 +${money(appServerDelta)}` : ''}</button></div><p>Scale-up/out은 CPU와 I/O Capacity를 함께 늘립니다. METRICS부터 두 축을 직접 비교할 수 있습니다.</p></section>}{db && <section className="drawer-section"><label>DATABASE SIZE · MONTHLY COST</label><div className="size-grid">{SERVER_SIZE_VALUES.map((size) => <button key={size} className={view.dbSize === size ? 'active' : ''} onClick={() => onScaleDatabase(size)}><span>{SIZE_LABEL[size]}</span><small>{size}</small><em>{money(view.infrastructureCosts.dbSizeMonthlyCosts[size])}/월</em></button>)}</div><div className="replica-row"><div className="db-cylinder primary">P</div>{Array.from({ length: view.dbReplicaCount }).map((_, index) => <div className="db-cylinder" key={index}>R</div>)}</div>{view.dbReplicaCount < 3 && <button className="replica-add" onClick={onAddDatabaseReplica}>＋ REPLICA · 월 +{money(dbReplicaDelta ?? 0)}</button>}<p>Replica는 CPU보다 Read I/O Capacity 증가 효과가 더 큽니다. METRICS 해금 후 병목 축을 비교하세요.</p></section>}{node.incidentId && <section className="incident-action"><span>⚡ {node.incidentSeverity} INCIDENT</span><button onClick={() => onIncidentResponse(node.incidentId!)}>대응 시작</button></section>}</aside></div>;
}
