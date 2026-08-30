import { describe, expect, it } from 'vitest';
import { parseBalanceArgs } from '../balance-cli';

describe('balance CLI', () => {
  it('parses a valid seed filter', () => {
    expect(parseBalanceArgs(['--seed', '17'])).toEqual({ seed: 17, trace: false });
  });

  it('parses a fully narrowed traced scenario', () => {
    expect(parseBalanceArgs([
      '--seed', '17',
      '--framework', 'SPRING_BOOT',
      '--db', 'POSTGRESQL',
      '--strategy', 'APM_AWARE',
      '--trace',
    ])).toEqual({
      seed: 17,
      frameworkId: 'SPRING_BOOT',
      databaseId: 'POSTGRESQL',
      strategyId: 'APM_AWARE',
      trace: true,
    });
  });

  it('rejects seeds outside the fixed 1..30 matrix', () => {
    expect(() => parseBalanceArgs(['--seed', '31'])).toThrow(/seed/i);
    expect(() => parseBalanceArgs(['--seed', '0'])).toThrow(/seed/i);
  });

  it('rejects unknown framework, database, and strategy ids without aliases', () => {
    expect(() => parseBalanceArgs(['--framework', 'SPRING'])).toThrow(/SPRING/);
    expect(() => parseBalanceArgs(['--db', 'POSTGRES'])).toThrow(/POSTGRES/);
    expect(() => parseBalanceArgs(['--strategy', 'APM'])).toThrow(/APM/);
  });

  it('rejects unknown flags and missing flag values', () => {
    expect(() => parseBalanceArgs(['--wat'])).toThrow(/--wat/);
    expect(() => parseBalanceArgs(['--seed'])).toThrow(/--seed/);
    expect(() => parseBalanceArgs(['--framework'])).toThrow(/--framework/);
  });

  it('allows trace only when filters resolve to exactly one scenario', () => {
    expect(() => parseBalanceArgs(['--trace'])).toThrow(/trace/i);
    expect(() => parseBalanceArgs(['--seed', '17', '--trace'])).toThrow(/trace/i);
    expect(() => parseBalanceArgs([
      '--seed', '17',
      '--framework', 'SPRING_BOOT',
      '--db', 'POSTGRESQL',
      '--trace',
    ])).toThrow(/trace/i);
  });
});
