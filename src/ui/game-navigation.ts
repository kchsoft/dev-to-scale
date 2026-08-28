export type GameTab = 'service' | 'development' | 'report';

export const GAME_NAV_ITEMS = [
  ['service', '⌂', '서비스'],
  ['development', '⌘', '개발'],
  ['report', '▥', '리포트'],
] as const satisfies readonly (readonly [GameTab, string, string])[];
