import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GameController } from '../../application/game-controller';
import type { AlertView } from '../../application/game-view';
import { GameSetup } from '../GameSetup';
import { ServiceDashboard } from '../ServiceDashboard';

describe('focused game screens', () => {
  it('renders the setup choices and boot action from Application IDs', () => {
    const html = renderToStaticMarkup(
      <GameSetup
        frameworkId="SPRING_BOOT"
        databaseId="POSTGRESQL"
        onFrameworkChange={vi.fn()}
        onDatabaseChange={vi.fn()}
        onStart={vi.fn()}
      />,
    );

    expect(html).toContain('Spring Boot');
    expect(html).toContain('NestJS');
    expect(html).toContain('PostgreSQL');
    expect(html).toContain('MongoDB');
    expect(html).toContain('BOOT SERVICE');
  });

  it('renders the service map as the primary board with compact supporting rails', () => {
    const view = new GameController({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 7,
    }).getView();
    const html = renderToStaticMarkup(
      <ServiceDashboard
        view={view}
        observability={view.service.observability}
        onNode={vi.fn()}
        onDevelopmentSlot={vi.fn()}
      />,
    );

    expect(html).toContain('class="service-board"');
    expect(html).toContain('class="active-work-rail"');
    expect(html).toContain('class="service-board-stage"');
    expect(html).not.toContain('class="service-stage"');
    expect(html).toContain('class="actionable-alerts"');
    expect(html).toContain('Service Map');
    expect(html).toContain('Local Storage');
    expect(html).not.toContain('WORK QUEUE');
    expect(html).not.toContain('NOW / ALERT');
  });

  it('shows only the first three Application alerts and summarizes the rest without reordering them', () => {
    const baseView = new GameController({
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      seed: 7,
    }).getView();
    const alerts: readonly AlertView[] = [
      { id: 'one', tone: 'danger', title: 'FIRST', detail: 'first' },
      { id: 'two', tone: 'warning', title: 'SECOND', detail: 'second' },
      { id: 'three', tone: 'info', title: 'THIRD', detail: 'third' },
      { id: 'four', tone: 'good', title: 'FOURTH', detail: 'fourth' },
    ];
    const view = { ...baseView, alerts };
    const html = renderToStaticMarkup(
      <ServiceDashboard
        view={view}
        observability={view.service.observability}
        onNode={vi.fn()}
        onDevelopmentSlot={vi.fn()}
      />,
    );

    expect(html.match(/class="alert-card/g)).toHaveLength(3);
    expect(html.indexOf('FIRST')).toBeLessThan(html.indexOf('SECOND'));
    expect(html.indexOf('SECOND')).toBeLessThan(html.indexOf('THIRD'));
    expect(html).not.toContain('FOURTH');
    expect(html).toContain('+1 MORE');
  });
});
