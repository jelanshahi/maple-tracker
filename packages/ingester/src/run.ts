/**
 * Orchestration, following the run order in ARCHITECTURE.md section 5.
 *
 * The shape of the day: on a quiet run this is one request, one hash
 * comparison, and nothing else. Step 3 is the cost model.
 */

import { fetchRoundsPayload } from './fetch.ts';
import { runHealthChecks } from './health.ts';
import type { HealthCheck } from './health.ts';
import { logEvent } from './log.ts';
import { parseRoundsPayload } from './parse.ts';
import type { CandidateRound } from './parse.ts';
import {
  closeRun, createStore, latestSnapshotHash, loadConfig, loadExistingRounds,
  openRun, quarantine, upsertRounds, writeSnapshot,
} from './store.ts';
import type { Store } from './store.ts';
import { findMutations, guardCandidate } from './validate.ts';
import type { Json } from './database.types.ts';

export type RunResult = { status: 'ok' | 'no_change'; rowsSeen: number; rowsWritten: number; checks: HealthCheck[] };

type Rejected = { reason: string; payload: Json };

/**
 * Sort candidates into rows to write and rows to quarantine.
 *
 * Quarantine, do not abort: one unmappable row must not cost the run nine good
 * rounds. Five new category streams appeared in February 2026 alone.
 */
export function sift(
  candidates: readonly CandidateRound[],
  existing: ReadonlyMap<string, { cutoff_crs: number; invitations: number; drawn_at: string }>,
): { good: CandidateRound[]; bad: Rejected[] } {
  const mutated = new Set(findMutations(candidates, existing).map((m) => m.roundNumber));
  const good: CandidateRound[] = [];
  const bad: Rejected[] = [];

  for (const candidate of candidates) {
    const failure = guardCandidate(candidate);
    if (failure !== null) {
      bad.push({ reason: failure, payload: candidate.raw });
    } else if (mutated.has(candidate.round_number)) {
      // A published round changed under us. Either IRCC corrected it or our
      // parser is wrong; both need a human, and neither should overwrite history.
      bad.push({ reason: `round ${candidate.round_number} changed after publication`, payload: candidate.raw });
    } else {
      good.push(candidate);
    }
  }
  return { good, bad };
}

async function collectHealth(store: Store, parsedRowCount: number | null, now: Date): Promise<HealthCheck[]> {
  const [lastRun, latestRound, quarantined] = await Promise.all([
    store.from('ingestion_runs').select('finished_at')
      .in('status', ['ok', 'no_change']).order('finished_at', { ascending: false }).limit(1),
    store.from('draw_rounds').select('drawn_at').order('drawn_at', { ascending: false }).limit(1),
    store.from('quarantined_rows').select('id', { count: 'exact', head: true }).is('resolved_at', null),
  ]);

  return runHealthChecks({
    parsedRowCount,
    lastSuccessfulRunAt: lastRun.data?.[0]?.finished_at ?? null,
    latestDrawnAt: latestRound.data?.[0]?.drawn_at ?? null,
    unresolvedQuarantineCount: quarantined.count ?? 0,
  }, now);
}

export async function run(env: NodeJS.ProcessEnv): Promise<RunResult> {
  const config = loadConfig(env);
  const store = createStore(config);
  const runId = await openRun(store);
  logEvent('run.started', runId);

  try {
    const payload = await fetchRoundsPayload(config.contactUrl);
    logEvent('fetch.ok', runId, { bytes: payload.body.length, contentHash: payload.contentHash });

    // Unchanged body means no parse and no write. Nothing downstream runs.
    const previousHash = await latestSnapshotHash(store, payload.url);
    if (previousHash === payload.contentHash) {
      await closeRun(store, runId, { status: 'no_change', rowsSeen: 0, rowsWritten: 0 });
      const checks = await collectHealth(store, null, new Date());
      logEvent('run.no_change', runId);
      return { status: 'no_change', rowsSeen: 0, rowsWritten: 0, checks };
    }

    // Snapshot the raw response before parsing. Always.
    await writeSnapshot(store, payload);

    const outcomes = parseRoundsPayload(payload.body);
    const parsed = outcomes.flatMap((o) => (o.ok ? [o.round] : []));
    const unparsed: Rejected[] = outcomes.flatMap((o) => (o.ok ? [] : [{ reason: o.reason, payload: o.payload }]));

    // Zero parsed rows from a changed body is a failure, not an empty result.
    if (parsed.length === 0) {
      throw new Error(`changed body produced no parsable rounds out of ${outcomes.length}`);
    }

    const { good, bad } = sift(parsed, await loadExistingRounds(store));
    const rejected = [...unparsed, ...bad];

    const rowsWritten = await upsertRounds(store, good);
    await quarantine(store, runId, rejected);

    const status = rejected.length > 0 ? 'quarantined' : 'ok';
    await closeRun(store, runId, { status, rowsSeen: outcomes.length, rowsWritten });
    logEvent('run.finished', runId, { status, rowsSeen: outcomes.length, rowsWritten, quarantined: rejected.length });

    const checks = await collectHealth(store, parsed.length, new Date());
    return { status: 'ok', rowsSeen: outcomes.length, rowsWritten, checks };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await closeRun(store, runId, { status: 'failed', error: message });
    logEvent('run.failed', runId, { error: message });
    throw error;
  }
}
