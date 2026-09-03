'use server';

/**
 * Recording a review decision.
 *
 * Editorship is checked here as well as by RLS. The policy is what actually
 * stops a non-editor writing - this check exists so the console gets a clear
 * answer instead of a silent no-op, and so the reviewer's id is only written
 * when it means something.
 */
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createAuthClient } from '../../src/authClient.ts';
import { currentUserId } from '../../src/accountQueries.ts';
import { isEditor, recordDecision } from '../../src/newsQueries.ts';
import { NEWS_TAGS } from '../../src/tags.ts';

export type ReviewResult = { status: 'done' | 'error'; message: string };

const decisionSchema = z.object({
  itemId: z.number().int().positive(),
  decision: z.enum(['published', 'rejected']),
  // Anything outside the vocabulary is dropped rather than stored. A server
  // action's argument arrives over the network like any request body.
  tags: z.array(z.enum(NEWS_TAGS)).max(NEWS_TAGS.length),
});

export async function review(input: unknown): Promise<ReviewResult> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { status: 'error', message: 'That decision could not be read.' };

  const client = createAuthClient(await cookies());
  const userId = await currentUserId(client);
  // A stranger and a signed-out visitor get the same answer, because telling
  // them apart tells them the console exists.
  if (userId === null || !(await isEditor(client, userId))) {
    return { status: 'error', message: 'Not found.' };
  }

  const { itemId, decision, tags } = parsed.data;
  const outcome = await recordDecision(client, itemId, decision, userId, tags);

  // Both paths revalidate: whoever won the race, this item is no longer a draft
  // and the queue on screen is out of date either way.
  revalidatePath('/review');
  revalidatePath('/news');

  if (outcome === 'already-decided') {
    return { status: 'error', message: 'Another editor has already decided this one.' };
  }

  return {
    status: 'done',
    message: decision === 'published' ? 'Published.' : 'Rejected, and it will not come back.',
  };
}
