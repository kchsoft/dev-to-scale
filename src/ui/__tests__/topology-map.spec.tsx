import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ObservabilityView, TopologyView } from '../../application/game-view';
import { TopologyMap } from '../TopologyMap';

const observability: ObservabilityView = {
  level: 'APM',
  label: 'APM',
  nextUnlock: null,
  showsResourceSignature: true,
  tracesRequests: true,
};

const topology: TopologyView = {
  nodes: [
    { id: 'app', kind: 'server-group', name: 'Spring Boot', icon: '◈', loadPercent: 76, tone: 'busy', detail: 'CAP 100' },
    { id: 'db', kind: 'database', name: 'PostgreSQL', icon: '◉', loadPercent: 92, tone: 'incident', detail: 'CAP 80', incidentId: 'db-down', incidentSeverity: 'MAJOR' },
    { id: 'queue', kind: 'queue', name: 'Kafka', icon: '⇢', loadPercent: 41, tone: 'stable', detail: 'CAP 1000' },
  ],
  edges: [
    { id: 'edge-app-db', fromNodeId: 'app', toNodeId: 'db', mode: 'sync' },
    { id: 'edge-app-queue', fromNodeId: 'app', toNodeId: 'queue', mode: 'async' },
  ],
  traces: [
    {
      id: 'COMMENT', name: '댓글',
      nodes: [
        { nodeId: 'app', arrivalPercent: 100, status: 'healthy' },
        { nodeId: 'db', arrivalPercent: 100, status: 'healthy' },
      ],
      edges: [{ edgeId: 'edge-app-db', trafficPercent: 100 }],
      successPercent: 100, failureNodeId: null, particleCount: 1, trafficUnit: 10_000,
    },
    {
      id: 'NOTIFICATION', name: '알림',
      nodes: [
        { nodeId: 'app', arrivalPercent: 100, status: 'healthy' },
        { nodeId: 'queue', arrivalPercent: 100, status: 'slow' },
      ],
      edges: [{ edgeId: 'edge-app-queue', trafficPercent: 100 }],
      successPercent: 60, failureNodeId: 'queue', particleCount: 2, trafficUnit: 10_000,
    },
  ],
};

describe('TopologyMap', () => {
  it('renders the selected trace only on its exact async edge and stops at its failed node', () => {
    const html = renderToStaticMarkup(
      <TopologyMap
        topology={topology}
        observability={observability}
        dau={50_000}
        launched
        onNode={() => undefined}
      />,
    );

    expect(html).toContain('알림');
    expect(html).toContain('60% SUCCESS');
    expect(html).toContain('data-edge-id="edge-app-queue"');
    expect(html).toContain('data-edge-mode="async"');
    expect(html).toContain('topology-edge selected async');
    expect(html).toContain('data-failure-node="queue"');
    expect(html.match(/class="topology-particle"/g)).toHaveLength(2);
    expect(html).not.toContain('data-particle-edge="edge-app-db"');
  });

  it('keeps the infrastructure visible without request particles before launch', () => {
    const html = renderToStaticMarkup(
      <TopologyMap
        topology={{ ...topology, traces: [] }}
        observability={observability}
        dau={0}
        launched={false}
        onNode={() => undefined}
      />,
    );

    expect(html).toContain('Spring Boot');
    expect(html).toContain('PRE-LAUNCH');
    expect(html).not.toContain('class="topology-particle"');
  });
});
