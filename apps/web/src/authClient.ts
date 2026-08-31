/**
 * The Supabase client for a signed-in request. The anon key and nothing else.
 *
 * The browser never talks to Supabase in this app. Sign-in, sign-out, save,
 * load and delete all run in Server Actions, and the magic link lands on one
 * route handler - so the anon key stays in server environment and is never
 * NEXT_PUBLIC_ prefixed, exactly as CLAUDE.md requires. The session lives in
 * httpOnly cookies that this client reads and writes here, which no script on
 * the page can reach.
 *
 * This app still has no path to the service role key: it is not in env.ts, not
 * imported here, and packages/ingester - the only place that holds it - is
 * never imported by apps/web.
 */
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from './env.ts';

export type AuthedClient = SupabaseClient;

/** What Next's cookie store gives us, narrowed to what createServerClient needs. */
export type CookieStore = {
  getAll: () => { name: string; value: string }[];
  set: (name: string, value: string, options: Record<string, unknown>) => void;
};

/**
 * The window check stands in for the `server-only` package, matching
 * supabase.ts. Three lines against one more dependency, and it fails loudly at
 * the moment a client component tries to pull this module into the browser
 * bundle - which would put the anon key in there with it.
 */
export function createAuthClient(cookies: CookieStore): AuthedClient {
  if (typeof window !== 'undefined') {
    throw new Error('the Supabase auth client is server-only and must not be constructed in the browser');
  }
  const env = loadEnv(process.env);
  return createServerClient(env.supabaseUrl, env.anonKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      /**
       * Server components may not set cookies. Next throws when they try, and
       * the middleware is what actually refreshes the session, so a failure
       * here is expected rather than exceptional - swallowing it is the
       * documented pattern. Narrowed to that one case: anything else rethrows,
       * because an empty catch is how a real cookie bug hides for a month.
       */
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookies.set(name, value, options);
        } catch (error) {
          if (!isReadonlyCookieStoreError(error)) throw error;
        }
      },
    },
  });
}

function isReadonlyCookieStoreError(error: unknown): boolean {
  return error instanceof Error && /cookies can only be modified|read-?only/i.test(error.message);
}
