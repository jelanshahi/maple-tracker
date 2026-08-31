'use server';

/**
 * Sign in, sign out, delete the account. Everything runs on the server.
 *
 * The browser never talks to Supabase in this app - see src/authClient.ts.
 * These actions are how a form reaches it, which is what keeps the anon key out
 * of the bundle and the session in an httpOnly cookie.
 *
 * Errors come back as a returned value rather than a thrown one: a failure here
 * is an ordinary thing a user needs to read, not a crash. Nothing returned ever
 * carries a key or a profile.
 */
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createAuthClient } from '../../src/authClient.ts';
import { deleteOwnAccount } from '../../src/accountQueries.ts';

export type SignInState = { status: 'idle' | 'sent' | 'error'; message: string };

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

async function client() {
  return createAuthClient(await cookies());
}

/**
 * Where the magic link comes back to. Built from a constant path and the
 * request's own origin - never from user input, which is what stops this being
 * an open redirect that an emailed link points at somebody else's site.
 */
async function confirmUrl(): Promise<string> {
  const host = (await headers()).get('host') ?? 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';
  return `${protocol}://${host}/auth/confirm`;
}

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) {
    return { status: 'error', message: 'That does not look like an email address.' };
  }

  const supabase = await client();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: await confirmUrl() },
  });

  if (error !== null) {
    return { status: 'error', message: `Could not send the link: ${error.message}` };
  }

  // Deliberately the same message whether or not that address has an account.
  // Saying "no account found" would turn this form into a way to test whether a
  // given person has one, which is not ours to disclose.
  return {
    status: 'sent',
    message: 'Check your email. If that address can be signed in, a link is on its way. It expires shortly.',
  };
}

export async function signOut(): Promise<void> {
  const supabase = await client();
  await supabase.auth.signOut();
  redirect('/account');
}

export async function deleteAccount(): Promise<void> {
  const supabase = await client();
  await deleteOwnAccount(supabase);
  // The account is gone; the cookie is not. Clearing it is what makes the
  // browser agree, rather than presenting a session for a user that no longer
  // exists until the token happens to expire.
  await supabase.auth.signOut();
  redirect('/account?deleted=1');
}
