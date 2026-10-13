import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DailyCampaign } from '../DailyCampaign';

describe('daily founder mode', () => {
  it('renders the 90-day seeded market decision without requiring browser storage during SSR', () => {
    const html = renderToStaticMarkup(<DailyCampaign onExit={vi.fn()} />);
    expect(html).toContain('90-DAY FOUNDER');
    expect(html).toContain('DAY');
    expect(html).toContain('90');
    expect(html).toContain('사업 전략 결정');
    expect(html).toContain('스타트업');
    expect(html).not.toContain('서비스 복구 완료');
  });
});
