/**
 * Refreshes the session cookie on every request that could need it.
 *
 * Supabase access tokens are short-lived. Server components cannot set cookies,
 * so without this the refreshed token would be computed and then thrown away,
 * and a signed-in user would be signed out again the moment their token aged
 * out. This is the one place in a Next app that can both read the request's
 * cookies and write them onto the response.
 *
 * The file is proxy.ts rather than middleware.ts: Next 16 renamed the
 * convention and warns on the old name. Same job, current name.
 *
 * Next requires a default export here, as it does for the App Router's own
 * files. See CLAUDE.md's note on that exception.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { loadEnv } from './src/env.ts';

export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = loadEnv(process.env);

  const supabase = createServerClient(env.supabaseUrl, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser, never getSession: it verifies the token with the auth server
  // rather than trusting whatever the cookie claims. The call is the point -
  // it is what triggers the refresh - so the result is deliberately unused.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  /**
   * Everything except Next's own assets and the favicon. The draw pages are
   * public and ISR-cached, but they still render the header, which says whether
   * you are signed in - so they need a fresh session too.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
