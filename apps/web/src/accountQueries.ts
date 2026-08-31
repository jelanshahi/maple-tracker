/**
 * The per-user reads and writes. The only module here that touches a signed-in
 * user's own data.
 *
 * Every row these functions reach is scoped by RLS to the calling account -
 * see supabase/migrations/20260830233000_accounts.sql. The `user_id` values
 * written here are belt and braces: the `with check (auth.uid() = user_id)`
 * policy rejects a mismatched one at the database, so a bug in this file cannot
 * write a row into somebody else's account.
 *
 * Nothing here logs a Profile, and no error message includes one. ARCHITECTURE
 * section 10 - never log a profile, never put one in an exception.
 */
import type { Profile } from '@maple/crs-rules';
import { z } from 'zod';
import { assessmentSchema, savedProfileSchema } from './rows.ts';
import type { Assessment, SavedProfile } from './rows.ts';
import type { AuthedClient } from './authClient.ts';

/** How many past estimates the history page shows. Years of saving, at one a week. */
const HISTORY_LIMIT = 500;

function must<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error !== null) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null || result.data === undefined) {
    throw new Error(`${what}: succeeded but returned no data`);
  }
  return result.data;
}

/**
 * The signed-in user's id, or null.
 *
 * getUser, never getSession: it verifies the token with the auth server instead
 * of trusting what the cookie claims. Everything that follows keys off this, so
 * trusting an unverified cookie here would be trusting it everywhere.
 */
export async function currentUserId(client: AuthedClient): Promise<string | null> {
  const { data, error } = await client.auth.getUser();
  if (error !== null) return null;
  return data.user?.id ?? null;
}

/**
 * The saved profile, or null when this account has never saved one.
 *
 * Validated with crs-rules' own profileSchema on the way out. The column is
 * jsonb and holds whatever was written to it - a row written by an older
 * version of this app, or one whose shape a later migration changed, must fail
 * here rather than reach score() half-formed and quietly cost somebody points.
 */
export async function fetchSavedProfile(client: AuthedClient, userId: string): Promise<SavedProfile | null> {
  const { data, error } = await client
    .from('saved_profiles')
    .select('profile, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error !== null) throw new Error(`read saved profile: ${error.message}`);
  if (data === null) return null;
  return savedProfileSchema.parse(data);
}

/**
 * Overwrite the saved profile and record the score it produced.
 *
 * Two writes rather than one, and deliberately not wrapped in a transaction:
 * supabase-js has no client-side transaction, and the honest failure mode is
 * the mild one. If the upsert lands and the insert does not, the profile is
 * saved and one history entry is missing - visible, harmless, and fixed by
 * saving again. Doing it the other way round would record a score for a profile
 * that was never stored.
 */
export async function saveProfile(
  client: AuthedClient,
  userId: string,
  profile: Profile,
  score: { total: number; ruleSetId: string },
): Promise<void> {
  const saved = await client
    .from('saved_profiles')
    .upsert({ user_id: userId, profile, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (saved.error !== null) throw new Error(`save profile: ${saved.error.message}`);

  const recorded = await client
    .from('assessments')
    .insert({ user_id: userId, total: score.total, rule_set_id: score.ruleSetId });
  if (recorded.error !== null) throw new Error(`record assessment: ${recorded.error.message}`);
}

/** Every past estimate for this account, newest first. Ordering into history is buildHistory's job. */
export async function fetchAssessments(client: AuthedClient, userId: string): Promise<Assessment[]> {
  const rows = must(
    await client
      .from('assessments')
      .select('id, total, rule_set_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    'read assessments',
  );
  return z.array(assessmentSchema).parse(rows);
}

/**
 * Delete the account itself, and with it the saved profile and the whole
 * history - the two foreign keys cascade.
 *
 * This is a database function rather than an admin API call because apps/web
 * holds only the anon key. See the migration for why it is safe: it is
 * `security definer` with an empty search_path, and its where clause scopes it
 * to auth.uid().
 */
export async function deleteOwnAccount(client: AuthedClient): Promise<void> {
  const { error } = await client.rpc('delete_own_account');
  if (error !== null) throw new Error(`delete account: ${error.message}`);
}
