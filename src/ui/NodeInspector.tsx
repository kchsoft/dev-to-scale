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
  const resourceDetail = node.detail;
  const scaleOut = scaling?.scaleOut ?? null;
  const horizontalLabel = scaleOut ? scaleOutLabel(scaleOut) : null;

  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="node-drawer">
      <header>
        <div className={`drawer-icon ${node.tone}`}>{node.icon}</div>
        <div><span>{node.kind.toUpperCase()}</span><strong>{node.name}</strong></div>
        <button onClick={onClose}>×</button>
      </header>

      <section className="drawer-load">
        <span>LIVE LOAD · {observability.level}</span>
        <strong>{node.loadPercent}%</strong>
        <i><b style={{ width: `${Math.min(100, node.loadPercent)}%` }} /></i>
        <small>{resourceDetail} · 월 {money(node.monthlyCost)}</small>
      </section>

      {scaling && <section className="drawer-section">
        <label>NODE SIZE · MONTHLY COST</label>
        <div className="size-grid">
          {scaling.sizeOptions.map((option) => <button
            key={option.size}
            className={scaling.currentSize === option.size ? 'active' : ''}
            onClick={() => onResizeNode(node.id, option.size)}
          >
            <span>{SIZE_LABEL[option.size]}</span>
            <small>{option.size}</small>
            <em>{money(option.monthlyCost)}/월</em>
            <small>{capacitySummary(option)}</small>
          </button>)}
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
            disabled={!scaleOut.available}
            onClick={() => onScaleOutNode(node.id)}
          >
            ＋ {horizontalLabel}
            {scaleOut.monthlyCostDelta !== null ? ` · 월 +${money(scaleOut.monthlyCostDelta)}` : ''}
          </button>
        </div>}

        <p>{scaleOut?.kind === 'READ_REPLICA'
          ? 'Replica는 CPU보다 Read I/O Capacity 증가 효과가 더 큽니다. 각 노드의 vertical size와 별도로 관리됩니다.'
          : scaleOut?.kind === 'INSTANCE'
            ? 'Instance scale-out은 이 APP 노드에만 적용됩니다. Vertical size는 모든 플레이어 소유 노드에서 독립적으로 조정할 수 있습니다.'
            : '이 노드는 horizontal scale-out 없이 vertical size만 독립적으로 조정합니다.'}</p>
      </section>}

      {node.incidentId && <section className="incident-action">
        <span>⚡ {node.incidentSeverity} INCIDENT</span>
        <button onClick={() => onIncidentResponse(node.incidentId!)}>대응 시작</button>
      </section>}
    </aside>
  </div>;
}
