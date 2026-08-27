import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('React/Application boundary', () => {
  it('keeps every UI source dependent on Application instead of Core', () => {
    const uiRoot = resolve(process.cwd(), 'src/ui');
    const sources = readdirSync(uiRoot, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
      .map((entry) => resolve(entry.parentPath, entry.name));
    const imports = sources.flatMap((sourcePath) => {
      const source = readFileSync(sourcePath, 'utf8');
      const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, sourcePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      return file.statements
        .filter(ts.isImportDeclaration)
        .map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text);
    });

    expect(imports.filter((path) => path.includes('/core'))).toEqual([]);
  });
});
