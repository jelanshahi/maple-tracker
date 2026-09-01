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

/**
 * The calculator's promise, asserted rather than trusted.
 *
 * A CRS Profile is personal information under PIPEDA, Law 25 and GDPR, and the
 * calculator page tells the user in as many words that nothing they type is
 * sent anywhere. That is only true while no client component can reach the
 * network or the database - so this reads the source and checks, exactly as the
 * service-role rule above is checked.
 */
const clientFiles = files.filter((file) => /(^|\n)\s*['"]use client['"]/.test(codeOf(file)));

function clientFindingsFor(pattern: RegExp): string[] {
  return clientFiles.filter((file) => pattern.test(codeOf(file))).map((file) => path.relative(appRoot, file));
}

describe('client components cannot send a profile anywhere', () => {
  it('has client components to check, so a passing run means something', () => {
    expect(clientFiles.length).toBeGreaterThan(3);
  });

  it('never imports the database client or the environment it needs', () => {
    // authClient and accountQueries joined this list in step 5. Both construct
    // or use a Supabase client, so both would drag the anon key into the bundle.
    expect(clientFindingsFor(/from\s+['"].*\/(supabase|queries|env|authClient|accountQueries|newsQueries)\.ts['"]/))
      .toStrictEqual([]);
  });

  it('never imports supabase-js, which would put a database call in the browser bundle', () => {
    expect(clientFindingsFor(/@supabase\/supabase-js/)).toStrictEqual([]);
  });

  it('never calls fetch, so a profile has no route off the page', () => {
    expect(clientFindingsFor(/\bfetch\s*\(/)).toStrictEqual([]);
  });

  it('never writes to browser storage, which would leave a profile on a shared computer', () => {
    // Accounts are the supported way to keep answers, and they are opt-in and
    // deletable. Browser storage is neither, on a device that may be shared.
    expect(clientFindingsFor(/localStorage|sessionStorage|indexedDB/)).toStrictEqual([]);
  });
});

/**
 * A CRS Profile is personal information under PIPEDA, Law 25 and GDPR, and
 * ARCHITECTURE.md section 10 is blunt about it: never log a profile, never put
 * one in an error message. Since step 5 the app stores them, so the rule stops
 * being theoretical.
 *
 * This looks for a profile reaching console at all. It is a coarse check on
 * purpose - the point is that nothing in this app has any business logging one,
 * so the safe number of matches is zero rather than "only the harmless ones".
 */
describe('a profile is never logged', () => {
  it('logs no variable named like a profile', () => {
    expect(findingsFor(/console\.\w+\([^)]*\bprofile\b/i)).toStrictEqual([]);
  });

  it('logs no form state, which is a profile by another name', () => {
    expect(findingsFor(/console\.\w+\([^)]*\bform\b/i)).toStrictEqual([]);
  });

  /**
   * CLAUDE.md: no stray console.log in committed code. If it is worth keeping
   * it is a structured event with a name, and apps/web has no such events -
   * every log here would be a debugging leftover, on pages handling personal
   * data.
   */
  it('leaves no console call behind at all', () => {
    expect(findingsFor(/\bconsole\.\w+\(/)).toStrictEqual([]);
  });
});
