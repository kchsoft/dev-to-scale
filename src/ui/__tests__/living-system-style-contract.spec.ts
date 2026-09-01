import { readFileSync } from 'node:fs';
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
    expect(board).not.toContain('.service-stage');
    expect(board).toContain('align-items: start;');
    expect(board).not.toContain('min-height: calc(100vh - 129px)');
    expect(board).not.toContain('.active-work-rail .runway-box { margin: auto');
  });
});
