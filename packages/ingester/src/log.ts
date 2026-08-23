/**
 * One single-line JSON object per event. No logging library.
 *
 * Never log the service role key, a full response body, or profile data.
 */
export function logEvent(event: string, runId: number | null, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, runId, ...fields }));
}
