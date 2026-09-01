import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Living System Board style contract', () => {
  it('loads the report layer after the shared board/detail layers', () => {
    const layout = read('app/layout.tsx');
    expect(layout).toContain('import "./living-system-report.css";');
    expect(layout.indexOf('living-system-report.css')).toBeGreaterThan(layout.indexOf('living-system-details.css'));
  });

  it('keeps the approved palette in the global root token source', () => {
    const globals = read('app/globals.css');
    expect(globals).toContain('--bg: #080B0F;');
    expect(globals).toContain('--panel: #10161D;');
    expect(globals).toContain('--panel-2: #151D26;');
    expect(globals).toContain('--line: #26313C;');
    expect(globals).toContain('--text: #EDF4FA;');
    expect(globals).toContain('--muted: #93A2B1;');
    expect(globals).toContain('--blue: #4CA7FF;');
    expect(globals).toContain('--green: #58D68D;');
    expect(globals).toContain('--amber: #F4B860;');
    expect(globals).toContain('--red: #FF6577;');
  });

  it('does not shadow the global token source in the board adapter', () => {
    const board = read('app/living-system-board.css');
    expect(board).not.toMatch(/(^|\n):root\s*\{/);
  });

  it('removes the retired horizontally scrolling mobile KPI strip', () => {
    const mobile = read('app/mobile.css');
    expect(mobile).not.toContain('.hud-metrics');
    expect(mobile).not.toContain('scrollbar-width: none');
  });
});
