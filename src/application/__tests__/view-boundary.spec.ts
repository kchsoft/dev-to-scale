import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('React/Application boundary', () => {
  it('keeps React source dependent on Application instead of Core', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/ui/GameApp.tsx'), 'utf8');
    const file = ts.createSourceFile('GameApp.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imports = file.statements
      .filter(ts.isImportDeclaration)
      .map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text);

    expect(imports.filter((path) => path.includes('/core'))).toEqual([]);
  });
});
