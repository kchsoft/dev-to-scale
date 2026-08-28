import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GameController } from '../../application/game-controller';
import { NodeInspector } from '../NodeInspector';

function renderInspector(nodeId: string) {
  const controller = new GameController({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 31,
  });
  const view = controller.getView();
  const node = view.topology.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`Missing node ${nodeId}`);

  return renderToStaticMarkup(
    <NodeInspector
      node={node}
      observability={view.service.observability}
      onClose={vi.fn()}
      onResizeNode={vi.fn()}
      onScaleOutNode={vi.fn()}
      onIncidentResponse={vi.fn()}
    />,
  );
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
});
