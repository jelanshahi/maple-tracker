/**
 * The read client. The anon key and nothing else.
 *
 * This app has no path to the service role key: it is not in this package's
 * environment schema, not imported here, and packages/ingester - the only place
 * that holds it - is never imported by apps/web.
 */
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from './env.ts';

export type ReadClient = SupabaseClient;

/**
 * The window check stands in for the `server-only` package. It is three lines
 * against one more dependency, and it fails loudly at the moment a client
 * component tries to pull this module into the browser bundle.
 */
export function createReadClient(): ReadClient {
  if (typeof window !== 'undefined') {
    throw new Error('the Supabase read client is server-only and must not be constructed in the browser');
  }
  const env = loadEnv(process.env);
  return createClient(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
