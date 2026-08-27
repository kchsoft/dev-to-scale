'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  ObservabilityView,
  RequestTraceView,
  TopologyEdgeView,
  TopologyView,
} from '../application/game-view';
import { layoutTopology } from './topology-layout';

interface TopologyMapProps {
  readonly topology: TopologyView;
  readonly observability: ObservabilityView;
  readonly dau: number;
  readonly launched: boolean;
  readonly onNode: (nodeId: string) => void;
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return value.toLocaleString();
}

function selectedTraceFor(
  traces: readonly RequestTraceView[],
  selectedId: string | null,
): RequestTraceView | null {
  return traces.find((trace) => trace.id === selectedId) ?? traces.at(-1) ?? null;
}

function firstEntryNodeId(topology: TopologyView): string | null {
  return topology.nodes.find((node) => node.kind === 'load-balancer')?.id
    ?? topology.nodes.find((node) => node.kind === 'server-group')?.id
    ?? null;
}

export function TopologyMap({ topology, observability, dau, launched, onNode }: TopologyMapProps) {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(
    () => topology.traces.at(-1)?.id ?? null,
  );
  const selectedTrace = selectedTraceFor(topology.traces, selectedTraceId);
  const layout = useMemo(
    () => layoutTopology(topology.nodes, topology.edges),
    [topology.nodes, topology.edges],
  );
  const positionByNode = new Map(layout.nodes.map((position) => [position.nodeId, position]));
  const pathByEdge = new Map(layout.edges.map((edge) => [edge.edgeId, edge.path]));
  const selectedTrafficByEdge = new Map(
    selectedTrace?.edges.map((edge) => [edge.edgeId, edge.trafficPercent]) ?? [],
  );
  const entryNodeId = firstEntryNodeId(topology);
  const entryPosition = entryNodeId ? positionByNode.get(entryNodeId) : undefined;
  const tracesRequests = launched && observability.tracesRequests;

  useEffect(() => {
    if (topology.traces.length === 0) {
      setSelectedTraceId(null);
      return;
    }
    if (!topology.traces.some((trace) => trace.id === selectedTraceId)) {
      setSelectedTraceId(topology.traces.at(-1)?.id ?? null);
    }
  }, [selectedTraceId, topology.traces]);

  return (
    <section className="topology-map" aria-label="서비스 요청 토폴로지">
      <header className="topology-toolbar">
        <div>
          <span>REQUEST LENS · {observability.level}</span>
          <strong>{selectedTrace ? selectedTrace.name : launched ? '요청 대기 중' : 'PRE-LAUNCH'}</strong>
          <small>
            {selectedTrace
              ? tracesRequests
                ? `${selectedTrace.successPercent}% SUCCESS · ● ≈ ${compactNumber(selectedTrace.trafficUnit)} REQUESTS`
                : '경로 구조만 표시 · APM에서 요청 입자와 실패 지점 해금'
              : launched ? '활성 워크로드가 없습니다.' : '서비스 공개 후 요청이 흐릅니다.'}
          </small>
        </div>
        {topology.traces.length > 0 && (
          <div className="workload-selector" role="group" aria-label="관찰할 워크로드">
            {topology.traces.map((trace) => (
              <button
                key={trace.id}
                className={trace.id === selectedTrace?.id ? 'active' : ''}
                aria-pressed={trace.id === selectedTrace?.id}
                onClick={() => setSelectedTraceId(trace.id)}
              >
                <span>{trace.name}</span>
                <small>{tracesRequests ? `${trace.successPercent}%` : 'ROUTE'}</small>
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="topology-canvas">
        <div className="topology-grid" />
        <div className="topology-users" style={{ left: '5%', top: '50%' }}>
          <span>◎</span><b>USERS</b><small>{launched ? `${compactNumber(dau)} DAU` : 'PRE-LAUNCH'}</small>
        </div>
        <svg
          className="topology-wires"
          viewBox={`0 0 ${layout.viewBox.width} ${layout.viewBox.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {entryPosition && (
            <path
              className="topology-ingress"
              d={`M 100 310 C 115 310, 125 ${entryPosition.y}, ${entryPosition.x - 80} ${entryPosition.y}`}
            />
          )}
          {topology.edges.map((edge) => {
            const path = pathByEdge.get(edge.id);
            if (!path) return null;
            const trafficPercent = selectedTrafficByEdge.get(edge.id);
            const selected = trafficPercent !== undefined;
            return (
              <g key={edge.id} data-edge-id={edge.id} data-edge-mode={edge.mode}>
                <path className={`topology-edge ${selected ? 'selected' : ''} ${edge.mode}`} d={path} />
                <text className="topology-edge-label">
                  <textPath href={`#label-${edge.id}`}>{edge.mode.toUpperCase()}</textPath>
                </text>
                <path id={`label-${edge.id}`} className="topology-label-path" d={path} />
                {tracesRequests && selected && trafficPercent > 0 && Array.from({ length: selectedTrace?.particleCount ?? 0 }).map((_, index) => (
                  <circle
                    className="topology-particle"
                    data-particle-edge={edge.id}
                    key={`${edge.id}:particle:${index}`}
                    r="5"
                  >
                    <animateMotion
                      path={path}
                      dur={edge.mode === 'async' ? '4.8s' : '2.8s'}
                      begin={`${index * -0.72}s`}
                      repeatCount="indefinite"
                    />
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>

        {topology.nodes.map((node) => {
          const position = positionByNode.get(node.id);
          if (!position) return null;
          const failed = selectedTrace?.failureNodeId === node.id;
          const traceNode = selectedTrace?.nodes.find((candidate) => candidate.nodeId === node.id);
          return (
            <button
              key={node.id}
              className={`topology-node ${node.kind} ${node.tone} ${failed ? 'trace-failed' : ''}`}
              style={{ left: `${position.x / layout.viewBox.width * 100}%`, top: `${position.y / layout.viewBox.height * 100}%` }}
              onClick={() => onNode(node.id)}
              data-failure-node={failed ? node.id : undefined}
            >
              <span className="topology-node-head"><i>{node.icon}</i><em>{node.kind.replace('-', ' ').toUpperCase()}</em>{node.incidentId && <b>⚡</b>}</span>
              <strong>{node.name}</strong>
              <span className="topology-node-load"><b>{node.loadPercent}%</b><i><em style={{ width: `${Math.min(100, node.loadPercent)}%` }} /></i></span>
              <small>{traceNode && tracesRequests ? `${traceNode.arrivalPercent}% IN · ${traceNode.status.toUpperCase()}` : node.detail}</small>
              {failed && tracesRequests && <i className="topology-failure-stop" aria-label="요청 실패 지점">×</i>}
            </button>
          );
        })}

        {selectedTrace?.nodes.some((node) => node.status === 'missing') && (
          <div className="topology-missing-stop"><b>×</b><span>REQUIRED NODE MISSING</span></div>
        )}
      </div>
    </section>
  );
}
