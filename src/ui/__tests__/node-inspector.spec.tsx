import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GameController } from '../../application/game-controller';
import type { ObservabilityView, TopologyNodeView } from '../../application/game-view';
import { NodeInspector } from '../NodeInspector';

function renderNode(node: TopologyNodeView, observability: ObservabilityView): string {
  return renderToStaticMarkup(
    <NodeInspector
      node={node}
      observability={observability}
      onClose={vi.fn()}
      onResizeNode={vi.fn()}
      onScaleOutNode={vi.fn()}
      onIncidentResponse={vi.fn()}
    />,
  );
}

function inspectorFixture() {
  const controller = new GameController({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 31,
  });
  const view = controller.getView();
  return { view, observability: view.service.observability };
}

function renderInspector(nodeId: string) {
  const { view, observability } = inspectorFixture();
  const node = view.topology.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`Missing node ${nodeId}`);
  return renderNode(node, observability);
}

describe('generic node inspector scaling', () => {
  it('renders the same four vertical size tiers for APP, DB, and storage nodes', () => {
    for (const nodeId of [
      'v1:app:SPRING_BOOT',
      'v1:database:POSTGRESQL',
      'v1:storage:OBJECT_STORAGE',
    ]) {
      const html = renderInspector(nodeId);

      expect(html).toContain('SMALL');
      expect(html).toContain('MEDIUM');
      expect(html).toContain('LARGE');
      expect(html).toContain('XLARGE');
      expect(html).toContain('/월');
    }
  });

  it('derives horizontal scale-out controls only from the selected node capability', () => {
    const appHtml = renderInspector('v1:app:SPRING_BOOT');
    const dbHtml = renderInspector('v1:database:POSTGRESQL');
    const storageHtml = renderInspector('v1:storage:OBJECT_STORAGE');

    expect(appHtml).toContain('INSTANCE');
    expect(appHtml).toContain('＋ INSTANCE');
    expect(dbHtml).toContain('READ REPLICA');
    expect(dbHtml).toContain('＋ READ REPLICA');
    expect(storageHtml).not.toContain('＋ INSTANCE');
    expect(storageHtml).not.toContain('＋ READ REPLICA');
  });

  it('uses the same vertical scaling UI for load balancer, cache, and queue node kinds', () => {
    const { view, observability } = inspectorFixture();
    const storage = view.topology.nodes.find((node) => node.id === 'v1:storage:OBJECT_STORAGE')!;
    const variants: readonly Pick<TopologyNodeView, 'id' | 'kind' | 'name' | 'icon'>[] = [
      { id: 'test:alb', kind: 'load-balancer', name: 'ALB', icon: '⇄' },
      { id: 'test:redis', kind: 'cache', name: 'Redis', icon: '◆' },
      { id: 'test:queue', kind: 'queue', name: 'Kafka', icon: '⇢' },
    ];

    for (const variant of variants) {
      const html = renderNode({ ...storage, ...variant }, observability);
      expect(html).toContain('NODE SIZE · MONTHLY COST');
      expect(html).toContain('SMALL');
      expect(html).toContain('XLARGE');
    }
  });

  it('does not render scaling controls for an external service', () => {
    const { observability } = inspectorFixture();
    const external: TopologyNodeView = {
      id: 'external:ai',
      kind: 'external-service',
      name: 'AI API',
      icon: '◇',
      loadPercent: 0,
      tone: 'stable',
      detail: 'CONNECTED',
      monthlyCost: 0,
      scaling: null,
    };

    const html = renderNode(external, observability);
    expect(html).not.toContain('NODE SIZE · MONTHLY COST');
    expect(html).not.toContain('＋ INSTANCE');
    expect(html).not.toContain('＋ READ REPLICA');
  });
});
