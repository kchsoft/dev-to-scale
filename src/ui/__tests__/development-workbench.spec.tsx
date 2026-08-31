import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GameController } from '../../application/game-controller';
import {
  DevelopmentWorkbench,
  filterDevelopmentOptions,
  groupDevelopmentOptions,
  optionIdForWorkSlot,
  shouldDismissInspector,
} from '../DevelopmentWorkbench';

describe('DevelopmentWorkbench', () => {
  it('renders a state-first decision board with filters and an empty Inspector', () => {
    const view = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 }).getView();
    const html = renderToStaticMarkup(<DevelopmentWorkbench view={view.development} onAction={vi.fn()} />);

    expect(html).toContain('DECISION BOARD');
    expect(html).toContain('IN PROGRESS');
    expect(html).toContain('AVAILABLE NOW');
    expect(html).toContain('LOCKED / NEEDS');
    expect(html).toContain('COMPLETED');
    expect(html).toContain('ALL');
    expect(html).toContain('FEATURE');
    expect(html).toContain('TECH');
    expect(html).toContain('LEARN');
    expect(html).not.toContain('DEVELOPMENT OPTIONS');
    expect(html).toContain('INSPECTOR');
    expect(html).toContain('NO SELECTION');
    expect(html).not.toContain('CONFIRM ACTION');
  });

  it('groups options by Application state without reordering within a group', () => {
    const options = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 }).getView().development.options;
    const grouped = groupDevelopmentOptions(options);

    expect(grouped.active).toEqual(options.filter(({ state }) => state === 'active'));
    expect(grouped.ready).toEqual(options.filter(({ state }) => state === 'ready'));
    expect(grouped.locked).toEqual(options.filter(({ state }) => state === 'locked'));
    expect(grouped.completed).toEqual(options.filter(({ state }) => state === 'completed'));
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

  it('renders a selected Inspector as a focusable sheet with a mobile dismiss backdrop', () => {
    const view = new GameController({ frameworkId: 'SPRING_BOOT', databaseId: 'POSTGRESQL', seed: 7 }).getView();
    const featureSlot = view.development.workSlots.find(({ id }) => id === 'feature')!;
    const selectedId = optionIdForWorkSlot(featureSlot, view.development.options);
    const html = renderToStaticMarkup(
      <DevelopmentWorkbench view={view.development} initialSelectedId={selectedId} onAction={vi.fn()} />,
    );

    expect(html).toContain('class="development-inspector-backdrop"');
    expect(html).toContain('aria-label="Inspector 닫기"');
    expect(html).toContain('tabindex="-1"');
    expect(shouldDismissInspector('Escape')).toBe(true);
    expect(shouldDismissInspector('Enter')).toBe(false);
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
