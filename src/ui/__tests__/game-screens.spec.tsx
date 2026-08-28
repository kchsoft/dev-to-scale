import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GameController } from '../../application/game-controller';
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

  it('renders the complete service screen from a real Application view', () => {
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

    expect(html).toContain('WORK QUEUE');
    expect(html).toContain('Service Map');
    expect(html).toContain('Local Storage');
    expect(html).toContain('NOW / ALERT');
  });
});
