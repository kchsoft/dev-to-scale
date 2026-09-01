import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GameController } from '../../application/game-controller';
import { Hud } from '../Hud';

describe('Living System Board HUD', () => {
  it('prioritizes day, DAU, cash, clock, and service pulse over equal-weight KPI cards', () => {
    const view = new GameController({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 7,
    }).getView();

    const html = renderToStaticMarkup(
      <Hud
        view={view}
        speed={0}
        dayProgress={0.35}
        onSpeed={vi.fn()}
        onStep={vi.fn()}
      />,
    );

    expect(html).toContain('class="hud-primary"');
    expect(html).toContain('class="service-pulse"');
    expect(html).toContain('MONTHLY');
    expect(html).toContain('DAU');
    expect(html).toContain('CASH');
    expect(html).not.toContain('class="hud-metrics"');
  });
});
