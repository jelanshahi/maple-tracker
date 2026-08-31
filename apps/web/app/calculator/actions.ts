'use server';

/**
 * Saving and loading a profile. The only path by which answers leave the
 * browser, and only when the user presses save.
 *
 * The form sends its answers here as a Profile, which is re-validated with
 * crs-rules' own profileSchema before anything is written. A Server Action's
 * argument arrives over the network like any request body, so it is untrusted
 * input by the same reasoning as everything else in this project.
 *
 * The score is recomputed here rather than accepted from the client. A total
 * the browser supplies is a number a user could set to anything, and it would
 * land in their history as fact.
 *
 * Nothing here logs a Profile or puts one in an error message.
 */
import { crsCurrent, profileSchema, score } from '@maple/crs-rules';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Profile } from '@maple/crs-rules';
import { currentUserId, fetchSavedProfile, saveProfile } from '../../src/accountQueries.ts';
import { createAuthClient } from '../../src/authClient.ts';

export type SaveResult = { status: 'saved' | 'error'; message: string };
export type LoadResult =
  | { status: 'loaded'; profile: Profile }
  | { status: 'empty' | 'error'; message: string };

const SIGNED_OUT = 'You are signed out. Sign in again and your answers are still here to save.';

export async function saveCurrentProfile(input: unknown): Promise<SaveResult> {
  const parsed = profileSchema.safeParse(input);
  // The message names no field values, only that the shape was wrong.
  if (!parsed.success) return { status: 'error', message: 'Those answers could not be read. Nothing was saved.' };

  const client = createAuthClient(await cookies());
  const userId = await currentUserId(client);
  if (userId === null) return { status: 'error', message: SIGNED_OUT };

  const result = score(parsed.data, crsCurrent);
  await saveProfile(client, userId, parsed.data, { total: result.total, ruleSetId: result.ruleSetId });

  // The history page is a server render of rows this just changed.
  revalidatePath('/history');
  return { status: 'saved', message: 'Saved to your account.' };
}

export async function loadSavedProfile(): Promise<LoadResult> {
  const client = createAuthClient(await cookies());
  const userId = await currentUserId(client);
  if (userId === null) return { status: 'error', message: SIGNED_OUT };

  const saved = await fetchSavedProfile(client, userId);
  if (saved === null) return { status: 'empty', message: 'You have not saved any answers yet.' };

  return { status: 'loaded', profile: saved.profile };
}
