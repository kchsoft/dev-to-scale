import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('unified development screen boundary', () => {
  it('does not keep obsolete feature, technology, or learning screen components', () => {
    const uiRoot = resolve(process.cwd(), 'src/ui');
    const obsolete = ['FeatureBoard.tsx', 'TechnologyPanel.tsx', 'LearningPanel.tsx']
      .filter((name) => existsSync(resolve(uiRoot, name)));

    expect(obsolete).toEqual([]);
  });
});
