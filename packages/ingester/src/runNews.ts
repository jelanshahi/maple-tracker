/**
 * News ingestion, orchestrated.
 *
 * Deliberately simpler than run.ts: no snapshot, no quarantine table, no
 * health checks. A news item is one row of four public fields with no
 * downstream arithmetic, so the failure modes the rounds ingester defends
 * against - a mutated cut-off, a silently dropped round - do not exist here.
 *
 * It writes NOTHING to ingestion_runs, and that is not an oversight. That
 * table feeds the staleness banner, which reads the newest finished_at of a
 * successful run to say "last confirmed against IRCC". A news run landing there
 * would refresh that claim without anyone having checked the draw data, so the
 * banner would report a freshness nobody verified - the precise failure
 * ARCHITECTURE.md section 1 exists to prevent. Giving news its own run history
 * needs a `source` column and a matching change to that banner's policy, and
 * that is its own piece of work.
 */

import { fetchNewsPayload } from './fetch.ts';
import { logEvent } from './log.ts';
import { itemsFrom, parseNewsFeed } from './news.ts';
import { insertNewItems } from './newsStore.ts';
import { createStore, loadConfig } from './store.ts';

export type NewsRunResult = { entriesSeen: number; rejected: number; inserted: number };

export async function runNews(env: NodeJS.ProcessEnv): Promise<NewsRunResult> {
  const config = loadConfig(env);
  const store = createStore(config);

  const payload = await fetchNewsPayload(config.contactUrl);
  logEvent('news.fetched', null, { url: payload.url, contentHash: payload.contentHash });

  const outcomes = parseNewsFeed(payload.body);
  const items = itemsFrom(outcomes);
  const rejected = outcomes.length - items.length;

  for (const outcome of outcomes) {
    if (!outcome.ok) logEvent('news.entry.rejected', null, { reason: outcome.reason });
  }

  // A feed that parsed to nothing is a failure, not an empty result - the same
  // rule the rounds ingester applies. IRCC publishes constantly; zero entries
  // means the shape changed under us.
  if (outcomes.length === 0) {
    throw new Error('news feed contained no entries; the payload shape has probably changed');
  }

  // Entries that all failed validation are the same failure wearing a different
  // hat, and the one the entry count cannot see: rename `link` to `href` and
  // every entry is rejected while outcomes.length stays at 50. Without this the
  // run logs {rejected: 50, inserted: 0} and exits 0, which to a nightly cron is
  // indistinguishable from a quiet night - so the queue stops filling and
  // nothing ever says why.
  if (items.length === 0) {
    throw new Error(
      `news feed had ${outcomes.length} entries and none parsed; the entry shape has probably changed`,
    );
  }

  const inserted = await insertNewItems(store, items);

  logEvent('news.run.finished', null, {
    entriesSeen: outcomes.length,
    rejected,
    inserted,
    // Everything already known is skipped, which is the ordinary quiet run.
    alreadyKnown: items.length - inserted,
  });

  return { entriesSeen: outcomes.length, rejected, inserted };
}
