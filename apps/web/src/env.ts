/**
 * Environment, validated at startup so a missing key fails the build rather
 * than a page render at 3 a.m.
 *
 * This is deliberately a near-copy of loadConfig in packages/ingester. The two
 * read different keys for different reasons and must not be merged: the whole
 * point of the boundary is that this side can never reach the service role key.
 * Two similar functions are cheaper than the abstraction that would join them.
 */
import { z } from 'zod';

const isUrl = (value: string): boolean => URL.canParse(value);

/**
 * SUPABASE_ANON_KEY is NOT prefixed NEXT_PUBLIC_, and must never be. The prefix
 * is what inlines a value into the browser bundle; without it the key stays on
 * the server. The public-read policies would make an exposed anon key
 * survivable, but not shipping it at all is strictly better.
 */
const envSchema = z.object({
  SUPABASE_URL: z.string().refine(isUrl),
  SUPABASE_ANON_KEY: z.string().min(1),
});

export type WebEnv = {
  supabaseUrl: string;
  anonKey: string;
};

export function loadEnv(env: NodeJS.ProcessEnv): WebEnv {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    // Names only, never values - an error message is the easiest place to leak a key.
    const names = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`missing or invalid environment variables: ${names}`);
  }
  return { supabaseUrl: parsed.data.SUPABASE_URL, anonKey: parsed.data.SUPABASE_ANON_KEY };
}
