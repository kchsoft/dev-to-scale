import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GameController } from '../../application/game-controller';
import { DevelopmentActionDialog } from '../DevelopmentActionDialog';
import { DevelopmentOptionDetail } from '../DevelopmentOptionDetail';

describe('shared development option primitives', () => {
  const view = new GameController({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 7,
  }).getView();

  const option = view.development.options.find((candidate) => candidate.action !== null)!;
  const action = option.action!;

  it('renders projected option details without inventing another data model', () => {
    const html = renderToStaticMarkup(
      <DevelopmentOptionDetail
        option={option}
        titleId="shared-option-title"
        onAction={vi.fn()}
      />,
    );

    expect(html).toContain(option.title);
    expect(html).toContain(option.summary);
    expect(html).toContain(option.statusLabel);
    expect(html).toContain('TIME');
    expect(html).toContain('UPFRONT');
    expect(html).toContain('MONTHLY');
    expect(html).toContain('BENEFIT');
  });

  it('renders the same app-owned confirmation contract Build and Service can share', () => {
    const html = renderToStaticMarkup(
      <DevelopmentActionDialog
        option={option}
        action={action}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('CONFIRM ACTION');
    expect(html).toContain(action.kind);
    expect(html).toContain('취소');
  });

  it('requires DevelopmentWorkbench to consume the shared primitives instead of keeping a private dialog copy', () => {
    const source = readFileSync('src/ui/DevelopmentWorkbench.tsx', 'utf8');

    expect(source).toContain("from './DevelopmentOptionDetail'");
    expect(source).toContain("from './DevelopmentActionDialog'");
    expect(source).not.toContain('function StartDevelopmentDialog(');
  });
});
