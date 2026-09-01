import type {
  NodeScaleOutView,
  NodeSizeOptionView,
  ObservabilityView,
  ServerSizeView,
  TopologyNodeView,
} from '../application/game-view';
import { money } from './game-format';

const SIZE_LABEL: Record<ServerSizeView, string> = {
  SMALL: 'S',
  MEDIUM: 'M',
  LARGE: 'L',
  XLARGE: 'XL',
};

interface NodeInspectorProps {
  readonly node: TopologyNodeView;
  readonly observability: ObservabilityView;
  readonly onClose: () => void;
  readonly onResizeNode: (nodeId: string, size: ServerSizeView) => void;
  readonly onScaleOutNode: (nodeId: string) => void;
  readonly onIncidentResponse: (id: string) => void;
}

function capacitySummary(option: NodeSizeOptionView): string {
  const capacity = option.capacity;
  const values = [
    capacity.cpu !== undefined ? `CPU ${Math.round(capacity.cpu)}` : null,
    capacity.io !== undefined ? `IO ${Math.round(capacity.io)}` : null,
    capacity.throughput !== undefined ? `TPS ${Math.round(capacity.throughput)}` : null,
    capacity.storage !== undefined ? `STO ${Math.round(capacity.storage)}` : null,
  ].filter((value): value is string => Boolean(value));
  return values.join(' · ') || 'CAPACITY';
}

function scaleOutLabel(scaleOut: NodeScaleOutView): string {
  return scaleOut.kind === 'INSTANCE' ? 'INSTANCE' : 'READ REPLICA';
}

export function NodeInspector({
  node,
  observability,
  onClose,
  onResizeNode,
  onScaleOutNode,
  onIncidentResponse,
}: NodeInspectorProps) {
  const scaling = node.scaling;
  const scaleOut = scaling?.scaleOut ?? null;
  const horizontalLabel = scaleOut ? scaleOutLabel(scaleOut) : null;
  const currentSize = scaling?.currentSize ?? null;

  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="node-drawer" aria-label={`${node.name} Inspector`}>
      <header>
        <div className={`drawer-icon ${node.tone}`}>{node.icon}</div>
        <div><span>{node.kind.toUpperCase()}</span><strong>{node.name}</strong></div>
        <button type="button" aria-label="Inspector 닫기" onClick={onClose}>×</button>
      </header>

      <section className="inspector-status">
        <label>STATUS · OBS {observability.level}</label>
        <div className="inspector-status-line">
          <strong>{node.loadPercent}%</strong>
          <span className={`inspector-tone ${node.tone}`}>{node.tone.toUpperCase()}</span>
        </div>
        <div className="inspector-load-track"><i style={{ width: `${Math.min(100, node.loadPercent)}%` }} /></div>
      </section>

      <section className="inspector-why">
        <label>WHY IT MATTERS</label>
        <strong>{node.detail}</strong>
      </section>

      <section className="inspector-current">
        <label>CURRENT</label>
        <div>
          <span><small>CURRENT SIZE</small><strong>{currentSize ?? 'MANAGED'}</strong></span>
          <span><small>MONTHLY</small><strong>{money(node.monthlyCost)}</strong></span>
          {scaleOut && <span><small>{horizontalLabel}</small><strong>{scaleOut.count} / {scaleOut.maxCount}</strong></span>}
        </div>
      </section>

      {scaling && <section className="inspector-options">
        <label>OPTIONS</label>
        <div className="size-grid">
          {scaling.sizeOptions.map((option) => {
            const current = scaling.currentSize === option.size;
            return <button
              type="button"
              key={option.size}
              className={current ? 'active' : ''}
              aria-current={current ? 'true' : undefined}
              onClick={() => onResizeNode(node.id, option.size)}
            >
              <span>{SIZE_LABEL[option.size]}</span>
              <small>{option.size}</small>
              <em>{money(option.monthlyCost)}/월</em>
              <small>{capacitySummary(option)}</small>
            </button>;
          })}
        </div>

        {scaleOut && <div className="scale-row">
          <div>
            <span>{horizontalLabel}</span>
            <strong>{scaleOut.count} / {scaleOut.maxCount}</strong>
            <small>{scaleOut.monthlyCostDelta !== null
              ? `추가 시 월 +${money(scaleOut.monthlyCostDelta)}`
              : scaleOut.reason ?? '최대치'}</small>
          </div>
          <button
            type="button"
            disabled={!scaleOut.available}
            onClick={() => onScaleOutNode(node.id)}
          >
            ＋ {horizontalLabel}
            {scaleOut.monthlyCostDelta !== null ? ` · 월 +${money(scaleOut.monthlyCostDelta)}` : ''}
          </button>
        </div>}

        <p>{scaleOut?.kind === 'READ_REPLICA'
          ? 'Replica는 Read I/O capacity를 늘리는 별도 horizontal 선택입니다.'
          : scaleOut?.kind === 'INSTANCE'
            ? 'Instance scale-out은 이 APP node에만 적용되며 vertical size와 별도로 관리됩니다.'
            : '이 node는 vertical size만 독립적으로 조정합니다.'}</p>
      </section>}

      {node.incidentId && <section className="incident-action">
        <span>⚡ {node.incidentSeverity} INCIDENT</span>
        <button type="button" onClick={() => onIncidentResponse(node.incidentId!)}>대응 시작</button>
      </section>}
    </aside>
  </div>;
}
