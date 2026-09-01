/**
 * Where a magic link lands.
 *
 * Two shapes arrive here, and both are supported on purpose.
 *
 * `?code=` is what Supabase's stock email template produces. Its
 * `{{ .ConfirmationURL }}` sends the user to Supabase's own /verify endpoint
 * first, which then redirects back here with a PKCE authorisation code. That is
 * the default, and it works with no dashboard configuration at all.
 *
 * `?token_hash=&type=` is what a customised template produces when it uses
 * `{{ .TokenHash }}` and points straight here, skipping the round trip through
 * Supabase.
 *
 * Either way the exchange happens on the server and the session is written to
 * an httpOnly cookie, so no token is ever readable by a script on the page.
 * What this route must never accept is the implicit flow, where tokens arrive
 * in the URL fragment: a fragment never reaches the server, so handling it
 * would mean a browser-side Supabase client and the anon key in the bundle.
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

/**
 * Every failure says the same thing. An expired link, an already-used one, a
 * wrong one and a tampered one are indistinguishable to whoever is holding it,
 * because telling them apart tells them something about an account that may not
 * be theirs.
 */
function failed(request: NextRequest): NextResponse {
  const url = new URL('/account', request.url);
  url.searchParams.set('error', 'link-invalid');
  return NextResponse.redirect(url);
}

function signedIn(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL('/account', request.url));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const supabase = createAuthClient(await cookies());

  const code = params.get('code');
  if (code !== null) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error === null ? signedIn(request) : failed(request);
  }

  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  if (tokenHash !== null && type !== null && ACCEPTED_TYPES.has(type)) {
    // The cast is safe because ACCEPTED_TYPES has just confirmed the value,
    // which is the one exception CLAUDE.md allows - immediately after a
    // validator has established the shape.
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'magiclink' | 'email' | 'signup' | 'recovery' | 'invite',
      token_hash: tokenHash,
    });
    return error === null ? signedIn(request) : failed(request);
  }

  return failed(request);
}
