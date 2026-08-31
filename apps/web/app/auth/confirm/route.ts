/**
 * Where a magic link lands.
 *
 * The email carries a token hash rather than a session. This route exchanges it
 * for one server-side and sets the session cookie, which is what lets the whole
 * app work without ever putting the anon key or the session in the browser.
 *
 * This requires the Supabase magic link email template to use `{{ .TokenHash }}`
 * and point here. The stock template uses `{{ .ConfirmationURL }}`, which
 * returns tokens in the URL fragment - a browser-only flow this app does not
 * have, and one that would hand the session to any script on the page.
 *
 * Next requires a named export per HTTP method here; see CLAUDE.md's note on
 * the App Router's own file contracts.
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAuthClient } from '../../../src/authClient.ts';

/** The OTP types this route will accept. Anything else is refused rather than passed through. */
const ACCEPTED_TYPES = new Set(['magiclink', 'email', 'signup', 'recovery', 'invite']);

function failed(request: NextRequest, reason: string): NextResponse {
  const url = new URL('/account', request.url);
  url.searchParams.set('error', reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');

  if (tokenHash === null || type === null || !ACCEPTED_TYPES.has(type)) {
    return failed(request, 'link-invalid');
  }

  const supabase = createAuthClient(await cookies());
  // The cast is safe because ACCEPTED_TYPES has just confirmed the value, which
  // is the one exception CLAUDE.md allows - immediately after a validator.
  const { error } = await supabase.auth.verifyOtp({
    type: type as 'magiclink' | 'email' | 'signup' | 'recovery' | 'invite',
    token_hash: tokenHash,
  });

  // A link that is expired, already used, or simply wrong all land here, and
  // all say the same thing. Distinguishing them tells whoever holds the link
  // something about an account that is not theirs.
  if (error !== null) return failed(request, 'link-invalid');

  return NextResponse.redirect(new URL('/account', request.url));
}
