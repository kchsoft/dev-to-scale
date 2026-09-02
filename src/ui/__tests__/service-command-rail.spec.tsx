import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GameController } from '../../application/game-controller';
import {
  ServiceCommandRail,
  developmentKindForWorkSlot,
  projectServiceCommandBrowse,
  reconcileServiceCommandState,
  serviceCommandStateForWorkSlot,
} from '../ServiceCommandRail';

describe('ServiceCommandRail', () => {
  const view = new GameController({
    frameworkId: 'SPRING_BOOT',
    databaseId: 'POSTGRESQL',
    seed: 7,
  }).getView();

  it('maps work slots to contextual command state without turning incidents into development choices', () => {
    const feature = view.development.workSlots.find(({ id }) => id === 'feature')!;
    const technology = view.development.workSlots.find(({ id }) => id === 'technology')!;
    const learning = view.development.workSlots.find(({ id }) => id === 'learning')!;
    const incident = view.development.workSlots.find(({ id }) => id === 'incident')!;

    expect(developmentKindForWorkSlot(feature)).toBe('feature');
    expect(developmentKindForWorkSlot(technology)).toBe('technology');
    expect(developmentKindForWorkSlot(learning)).toBe('learning');
    expect(developmentKindForWorkSlot(incident)).toBeNull();

    expect(serviceCommandStateForWorkSlot(feature, view.development.options)).toEqual({
      kind: 'feature',
      optionId: 'feature:COMMUNITY_MVP',
    });
    expect(serviceCommandStateForWorkSlot(technology, view.development.options)).toEqual({
      kind: 'technology',
      optionId: null,
    });
    expect(serviceCommandStateForWorkSlot(incident, view.development.options)).toBeNull();
  });

  it('projects the operational subset in Application order and keeps completed history out of Service', () => {
    const kind = 'technology' as const;
    const options = view.development.options;
    const browse = projectServiceCommandBrowse(options, kind);

    expect(browse.active).toEqual(options.filter((option) => option.kind === kind && option.state === 'active'));
    expect(browse.ready).toEqual(options.filter((option) => option.kind === kind && option.state === 'ready'));
    expect(browse.lockedCount).toBe(options.filter((option) => option.kind === kind && option.state === 'locked').length);
    expect('completed' in browse).toBe(false);
  });

  it('reconciles a missing selected option back to browse for the same kind', () => {
    expect(reconcileServiceCommandState(
      { kind: 'technology', optionId: 'technology:missing' },
      view.development.options,
    )).toEqual({ kind: 'technology', optionId: null });

    expect(reconcileServiceCommandState(
      { kind: 'feature', optionId: 'feature:COMMUNITY_MVP' },
      view.development.options,
    )).toEqual({ kind: 'feature', optionId: 'feature:COMMUNITY_MVP' });
  });

  it('renders a compact browse mode instead of duplicating the full Build catalog', () => {
    const html = renderToStaticMarkup(
      <ServiceCommandRail
        view={view.development}
        state={{ kind: 'technology', optionId: null }}
        onStateChange={vi.fn()}
        onAction={vi.fn()}
        onOpenFullBuild={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain('IN PROGRESS');
    expect(html).toContain('AVAILABLE NOW');
    expect(html).toContain('LOCKED / NEEDS');
    expect(html).toContain('OPEN FULL BUILD');
    expect(html).not.toContain('COMPLETED');
    expect(html).toContain('aria-label="Technology 빠른 선택 닫기"');
  });

  it('renders selected detail with the same shared projected-detail language as Build', () => {
    const option = view.development.options.find(({ id }) => id === 'feature:COMMUNITY_MVP')!;
    const html = renderToStaticMarkup(
      <ServiceCommandRail
        view={view.development}
        state={{ kind: 'feature', optionId: option.id }}
        onStateChange={vi.fn()}
        onAction={vi.fn()}
        onOpenFullBuild={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain(option.title);
    expect(html).toContain(option.summary);
    expect(html).toContain('TIME');
    expect(html).toContain('BENEFIT');
    expect(html).toContain('전체 BUILD에서 보기');
  });
});
