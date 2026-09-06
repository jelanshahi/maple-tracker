/**
 * The three faces the design asks for, self-hosted.
 *
 * The design file loads these from fonts.googleapis.com. CLAUDE.md forbids that
 * outright - no outbound requests from the browser, no CDN fonts - so they come
 * through next/font instead: Next fetches the faces at build time and serves
 * them from this origin, which is the same typography with none of the third
 * party. No new dependency either; next/font ships inside next.
 *
 * The cost is that a cold `next build` needs network access to fetch the faces
 * once. `pnpm test` already needs one for its audit step, so this adds no new
 * class of requirement.
 *
 * Every face declares a fallback stack. A blocked or failed fetch must still
 * leave the page readable rather than invisible.
 */
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from 'next/font/google';

/** Headings only. Instrument Serif ships a single weight; the design uses it at one. */
export const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-serif',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

export const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-sans',
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

/**
 * Every figure on the site: cut-offs, invitation counts, totals, deltas. A
 * proportional face makes a column of four-digit scores impossible to scan.
 */
export const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
  fallback: ['ui-monospace', 'Cascadia Mono', 'Consolas', 'monospace'],
});

/** Applied to <html> so the variables are in scope for globals.css and every module. */
export const fontVariables = `${serif.variable} ${sans.variable} ${mono.variable}`;
