import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GameController } from '../../application/game-controller';
import { DevelopmentWorkbench, filterDevelopmentOptions, optionIdForWorkSlot } from '../DevelopmentWorkbench';

describe('DevelopmentWorkbench', () => {
  it('renders all filters, four work slots, the sorted option list, and an empty Inspector without auto-running anything', () => {
    const view = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 }).getView();
    const html = renderToStaticMarkup(<DevelopmentWorkbench view={view.development} onAction={vi.fn()} />);

    expect(html).toContain('UNIFIED WORKBENCH');
    expect(html).toContain('ALL');
    expect(html).toContain('FEATURE');
    expect(html).toContain('TECH');
    expect(html).toContain('LEARN');
    expect(html).toContain('DEVELOPMENT OPTIONS');
    expect(html).toContain('INSPECTOR');
    expect(html).toContain('NO SELECTION');
    expect(html).not.toContain('CONFIRM ACTION');
  });

  it('opens the Inspector for an initial selection requested by another screen', () => {
    const view = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 }).getView();
    const featureSlot = view.development.workSlots.find(({ id }) => id === 'feature')!;
    const initialSelectedId = optionIdForWorkSlot(featureSlot, view.development.options);

    const html = renderToStaticMarkup(
      <DevelopmentWorkbench
        view={view.development}
        initialSelectedId={initialSelectedId}
        onAction={vi.fn()}
      />,
    );

    expect(initialSelectedId).toBe('feature:COMMUNITY_MVP');
    expect(html).not.toContain('NO SELECTION');
    expect(html).toContain('<code>feature:COMMUNITY_MVP</code>');
  });

  it('filters without changing Application ordering', () => {
    const options = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 }).getView().development.options;
    const technologies = filterDevelopmentOptions(options, 'technology');

    expect(technologies.every(({ kind }) => kind === 'technology')).toBe(true);
    expect(technologies.map(({ id }) => id)).toEqual(options.filter(({ kind }) => kind === 'technology').map(({ id }) => id));
  });

  it('selects an active option from a work slot without inventing an incident development option', () => {
    const view = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 }).getView();
    const featureSlot = view.development.workSlots.find(({ id }) => id === 'feature')!;
    const incidentSlot = view.development.workSlots.find(({ id }) => id === 'incident')!;

    expect(optionIdForWorkSlot(featureSlot, view.development.options)).toBe('feature:COMMUNITY_MVP');
    expect(optionIdForWorkSlot(incidentSlot, view.development.options)).toBeNull();
  });
});
