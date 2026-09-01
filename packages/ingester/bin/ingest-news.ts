/**
 * Entrypoint for news ingestion. Thin on purpose: decide the exit code.
 *
 * "Nightly" in ARCHITECTURE.md section 9 is a scheduler's job. CLAUDE.md rules
 * out deployment and hosting config, so this is a command a human or a cron
 * runs; nothing here schedules itself.
 *
 * Sets exitCode rather than calling process.exit: killing the process while the
 * HTTP keep-alive socket is still open aborts the Node runtime on Windows,
 * which replaces the exit code with 0xC0000409 and leaves a scheduler unable to
 * tell a failed run from a crashed one.
 */

import { logEvent } from '../src/log.ts';
import { runNews } from '../src/runNews.ts';

try {
  await runNews(process.env);
  process.exitCode = 0;
} catch (error) {
  logEvent('news.crashed', null, { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
