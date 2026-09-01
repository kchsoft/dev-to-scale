export type GameTab = 'service' | 'development' | 'report';

export const GAME_NAV_ITEMS = [
  ['service', '⌂', 'SERVICE'],
  ['development', '⌘', 'BUILD'],
  ['report', '▥', 'REPORT'],
] as const satisfies readonly (readonly [GameTab, string, string])[];
