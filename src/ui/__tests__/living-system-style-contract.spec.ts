import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Living System Board style contract', () => {
  it('loads the report layer after the shared board/detail layers', () => {
    const layout = read('app/layout.tsx');
    expect(layout).toContain('import "./living-system-report.css";');
    expect(layout.indexOf('living-system-report.css')).toBeGreaterThan(layout.indexOf('living-system-details.css'));
  });

  it('keeps the approved palette in the final living-system adapter', () => {
    const board = read('app/living-system-board.css');
    expect(board).toContain('--bg: #080B0F;');
    expect(board).toContain('--panel: #10161D;');
    expect(board).toContain('--panel-2: #151D26;');
    expect(board).toContain('--line: #26313C;');
    expect(board).toContain('--text: #EDF4FA;');
    expect(board).toContain('--muted: #93A2B1;');
    expect(board).toContain('--blue: #4CA7FF;');
    expect(board).toContain('--green: #58D68D;');
    expect(board).toContain('--amber: #F4B860;');
    expect(board).toContain('--red: #FF6577;');
  });

  it('documents the final adapter as the runtime token source during legacy CSS migration', () => {
    const design = read('DESIGN.md');
    expect(design).toContain('`app/living-system-board.css`');
    expect(design).toContain('runtime token source of truth');
  });

  it('uses the new non-scrolling mobile HUD instead of the retired KPI strip', () => {
    const hud = read('src/ui/Hud.tsx');
    const board = read('app/living-system-board.css');
    expect(hud).toContain('className="hud-primary"');
    expect(hud).not.toContain('hud-metrics');
    expect(board).toContain('.hud-primary { grid-column: 1; grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(board).not.toContain('scrollbar-width: none');
  });

  it('isolates the playable service stage from setup CSS and avoids viewport-height stretching', () => {
    const dashboard = read('src/ui/ServiceDashboard.tsx');
    const board = read('app/living-system-board.css');
    const globals = read('app/globals.css');

    expect(globals).toContain('.service-stage {');
    expect(dashboard).toContain('className="service-board-stage"');
    expect(dashboard).not.toContain('className="service-stage"');
    expect(board).toContain('.service-board-stage {');
    expect(board).not.toMatch(/(^|\n)\.service-stage(?:\s|\{)/);
    expect(board).toContain('align-items: start;');
    expect(board).not.toContain('min-height: calc(100vh - 129px)');
    expect(board).not.toContain('.active-work-rail .runway-box { margin: auto');
  });

  it('caps the topology canvas on wide desktops instead of scaling height with the full stage width', () => {
    const board = read('app/living-system-board.css');
    expect(board).toContain('height: clamp(520px, 42vw, 720px);');
    expect(board).toContain('aspect-ratio: auto;');
    expect(board).toContain('.service-board-stage .topology-map { margin: 10px 12px 0;');
  });

  it('loads one command-surface stylesheet between shared details and report overrides', () => {
    const layout = read('app/layout.tsx');
    expect(existsSync('app/living-system-command.css')).toBe(true);
    expect(layout).toContain('import "./living-system-command.css";');
    expect(layout.indexOf('living-system-command.css')).toBeGreaterThan(layout.indexOf('living-system-details.css'));
    expect(layout.indexOf('living-system-command.css')).toBeLessThan(layout.indexOf('living-system-report.css'));
  });

  it('keeps the wide command rail in the first Service column without shrinking the topology below its minimum', () => {
    expect(existsSync('app/living-system-command.css')).toBe(true);
    if (!existsSync('app/living-system-command.css')) return;
    const command = read('app/living-system-command.css');

    expect(command).toContain('@media (min-width: 1181px)');
    expect(command).toContain('.service-board.command-open { grid-template-columns: clamp(340px, 24vw, 360px) minmax(560px, 1fr) minmax(190px, 224px); }');
  });

  it('uses a bounded left command drawer at medium widths without creating another shared viewport-height owner', () => {
    expect(existsSync('app/living-system-command.css')).toBe(true);
    if (!existsSync('app/living-system-command.css')) return;
    const command = read('app/living-system-command.css');

    expect(command).toContain('@media (min-width: 601px) and (max-width: 1180px)');
    expect(command).toContain('position: absolute;');
    expect(command).toContain('width: min(360px, calc(100% - 24px));');
    expect(command).toContain('overflow-y: auto;');
    expect(command).not.toMatch(/\.(?:workspace|service-board)\s*\{[\s\S]*?100d?vh/);
    expect(command).not.toContain('service-command-backdrop');
  });

  it('uses a safe-area aware mobile command sheet with its own scroll owner', () => {
    expect(existsSync('app/living-system-command.css')).toBe(true);
    if (!existsSync('app/living-system-command.css')) return;
    const command = read('app/living-system-command.css');

    expect(command).toContain('@media (max-width: 600px)');
    expect(command).toContain('position: fixed;');
    expect(command).toContain('bottom: calc(62px + env(safe-area-inset-bottom));');
    expect(command).toContain('max-height: 72dvh;');
    expect(command).toContain('overflow-y: auto;');
    expect(command).not.toContain('scrollbar-width: none');
    expect(command).not.toContain('::-webkit-scrollbar { display: none');
    expect(command).not.toContain('service-command-backdrop');
  });

  it('keeps the non-modal mobile command surface below inspectors and blocking events instead of covering navigation by z-index', () => {
    const command = read('app/living-system-command.css');
    const globals = read('app/globals.css');
    const mobile = read('app/mobile.css');

    expect(command).toContain('z-index: 32;');
    expect(globals).toContain('.drawer-backdrop { position: fixed; inset: 78px 0 0; background: rgba(3,6,9,.44); z-index: 40;');
    expect(mobile).toContain('z-index: 50;');
    expect(globals).toContain('.event-overlay { position: fixed; inset: 0; z-index: 60;');
  });

  it('documents Service as the operational play surface and Build as the complete strategic catalog', () => {
    const design = read('DESIGN.md');
    const command = read('app/living-system-command.css');

    expect(design).toContain('Service is the primary operational play surface.');
    expect(design).toContain('Build remains the complete strategic catalog.');
    expect(design).toContain('Left = development and preparation');
    expect(design).toContain('Center = live system');
    expect(design).toContain('Right = operational diagnosis');
    expect(command).not.toContain(':root');
  });
});
