/**
 * The security boundary, asserted rather than trusted.
 *
 * CLAUDE.md says the service role key is imported only inside packages/ingester
 * and that nothing else may touch it. A rule that lives only in a document is
 * one refactor away from being false, so this reads the actual source.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(directory: string): string[] {
  const entries = readdirSync(directory).map((entry) => path.join(directory, entry));
  return entries.flatMap((entry) => {
    if (statSync(entry).isDirectory()) return sourceFiles(entry);
    return /\.(ts|tsx)$/.test(entry) ? [entry] : [];
  });
}

const files = [...sourceFiles(path.join(appRoot, 'src')), ...sourceFiles(path.join(appRoot, 'app'))];

/**
 * Comments are stripped before scanning. Several of these files explain in prose
 * exactly why they must not do the thing being checked for - env.ts documents
 * why the anon key is never NEXT_PUBLIC_ prefixed - and a check that cannot tell
 * an explanation from a violation fails on its own documentation.
 *
 * The `[^:]` guard leaves `https://` alone.
 */
function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function findingsFor(pattern: RegExp): string[] {
  return files.filter((file) => pattern.test(codeOf(file))).map((file) => path.relative(appRoot, file));
}

describe('apps/web boundaries', () => {
  it('has source files to check, so a passing run means something', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('never mentions the service role key', () => {
    // The key that bypasses RLS. Its blast radius is packages/ingester and nowhere else.
    expect(findingsFor(/SERVICE_ROLE/)).toStrictEqual([]);
  });

  it('never imports from the ingester', () => {
    expect(findingsFor(/from\s+['"].*(packages\/ingester|@maple\/ingester)/)).toStrictEqual([]);
  });

  it('never prefixes an env var NEXT_PUBLIC_, which would inline it into the browser bundle', () => {
    expect(findingsFor(/NEXT_PUBLIC_/)).toStrictEqual([]);
  });

  it("never selects '*', which would pull draw_rounds.raw into a page render", () => {
    expect(findingsFor(/\.select\(\s*['"`]\s*\*/)).toStrictEqual([]);
  });
});
