import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('GameApp service command orchestration contract', () => {
  const source = readFileSync('src/ui/GameApp.tsx', 'utf8');

  it('owns contextual Service command state above blocking overlays', () => {
    expect(source).toContain('const [serviceCommand, setServiceCommand] = useState<ServiceCommandState>(null);');
    expect(source).toContain('commandState={serviceCommand}');
    expect(source).toContain('onCommandStateChange={setServiceCommand}');
    expect(source).toContain('onDevelopmentAction={handleDevelopmentAction}');
    expect(source).toContain('development={view.development}');

    const overlaySource = source.slice(source.indexOf('{activeEvent && <EventOverlay'));
    expect(overlaySource).not.toContain('setServiceCommand');
  });

  it('hands Full Build the exact kind filter and selection instead of using generic navigation reset', () => {
    expect(source).toContain("const [developmentInitialFilter, setDevelopmentInitialFilter] = useState<DevelopmentFilter>('all');");
    expect(source).toContain('const openFullBuild = (kind: DevelopmentOptionKind, optionId: string | null) => {');
    expect(source).toContain('setDevelopmentInitialFilter(kind);');
    expect(source).toContain('setDevelopmentInitialSelectedId(optionId);');
    expect(source).toContain('onOpenFullBuild={openFullBuild}');
    expect(source).toContain('initialFilter={developmentInitialFilter}');
  });

  it('closes Service command state on normal navigation but not when confirming a development action', () => {
    const navigation = source.match(/const openPrimaryTab = \(nextTab: GameTab\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
    expect(navigation).toContain('setServiceCommand(null);');

    const actionHandler = source.match(/const handleDevelopmentAction = \(action: DevelopmentActionView\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
    expect(actionHandler).not.toContain("setTab('development')");
    expect(actionHandler).not.toContain('setServiceCommand(null)');
  });
});
