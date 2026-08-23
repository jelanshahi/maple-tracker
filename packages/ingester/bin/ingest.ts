/**
 * Entrypoint. Thin on purpose: decide the exit code, and nothing else.
 */

import { logEvent } from '../src/log.ts';
import { run } from '../src/run.ts';

try {
  const result = await run(process.env);
  for (const check of result.checks) {
    logEvent('health.check', null, { name: check.name, ok: check.ok, detail: check.detail });
  }
  // Any failing health check exits non-zero. Silent staleness is the failure
  // mode this project exists to avoid, so it must break the scheduler loudly.
  const failed = result.checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    logEvent('health.failed', null, { failed: failed.map((c) => c.name) });
    process.exit(1);
  }
  process.exit(0);
} catch (error) {
  logEvent('ingest.crashed', null, { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
}
