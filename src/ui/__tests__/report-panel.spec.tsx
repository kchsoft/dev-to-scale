import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameController } from '../../application/game-controller';
import { ReportPanel } from '../ReportPanel';

describe('Living System Board report', () => {
  it('groups the current run into financial and system-load sections', () => {
    const view = new GameController({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 7,
    }).getView();

    const html = renderToStaticMarkup(
      <ReportPanel view={view} observability={view.service.observability} />,
    );

    expect(html).toContain('OPERATING REPORT');
    expect(html).toContain('CURRENT RUN');
    expect(html).toContain('FINANCIALS');
    expect(html).toContain('SYSTEM LOAD');
  });
});
