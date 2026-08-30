/**
 * Entrypoint for the one-off program_code backfill. Thin on purpose.
 */
import { logEvent } from '../src/log.ts';
import { createStore, loadConfig } from '../src/store.ts';
import { runProgramCodeBackfill } from '../src/runBackfillPrograms.ts';

try {
  const config = loadConfig(process.env);
  const store = createStore(config);
  const result = await runProgramCodeBackfill(store);
  logEvent('backfill.program_code.done', null, result);
  // A skip means a row needs a human, not a silent partial success.
  process.exit(result.skipped > 0 ? 1 : 0);
} catch (error) {
  logEvent('backfill.program_code.crashed', null, { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
}
