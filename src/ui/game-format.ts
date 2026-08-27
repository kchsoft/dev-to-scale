export function money(value: number): string {
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${sign}₩${(absolute / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${sign}₩${(absolute / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${sign}₩${Math.round(absolute / 1_000)}K`;
  return `${sign}₩${absolute.toLocaleString()}`;
}

export function number(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return value.toLocaleString();
}

export function pct(progress: number | null): number {
  return progress === null ? 0 : Math.max(0, Math.min(100, Math.round(progress * 100)));
}
