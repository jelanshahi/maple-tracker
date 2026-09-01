'use client';

/**
 * One item in the queue: IRCC's words, a link to the source, and a decision.
 *
 * There is deliberately no way to edit the title or the summary. They render
 * exactly as IRCC published them, beside a link to the release - rewriting a
 * summary and leaving the IRCC link attached would misrepresent the department
 * on a page about immigration.
 */
import { useState, useTransition } from 'react';
import { formatDate } from '../../src/format.ts';
import type { NewsItem } from '../../src/newsRows.ts';
import { NEWS_TAGS, TAG_LABELS, knownTags } from '../../src/tags.ts';
import type { NewsTag } from '../../src/tags.ts';
import { review } from './actions.ts';
import styles from '../ui.module.css';

export function ReviewItem({ item }: { item: NewsItem }) {
  const [tags, setTags] = useState<NewsTag[]>(() => knownTags(item.tags));
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();

  const toggle = (tag: NewsTag) => {
    setTags(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);
  };

  const decide = (decision: 'published' | 'rejected') => {
    startTransition(async () => {
      const result = await review({ itemId: item.id, decision, tags });
      setMessage(result.message);
    });
  };

  return (
    <li className={styles.newsItem}>
      <p className={styles.newsMeta}>{formatDate(item.published_at)}</p>
      <h2 className={styles.newsTitle}>
        <a href={item.url}>{item.title}</a>
      </h2>
      {item.summary === null ? null : <p className={styles.muted}>{item.summary}</p>}

      <fieldset className={styles.tagPicker}>
        <legend>Tags</legend>
        {NEWS_TAGS.map((tag) => (
          <span key={tag} className={styles.checkboxLabel}>
            <input
              id={`tag-${item.id}-${tag}`}
              type="checkbox"
              checked={tags.includes(tag)}
              disabled={pending}
              onChange={() => toggle(tag)}
            />
            <label htmlFor={`tag-${item.id}-${tag}`}>{TAG_LABELS[tag]}</label>
          </span>
        ))}
      </fieldset>

      <p className={styles.actions}>
        <button type="button" className={styles.reset} disabled={pending} onClick={() => decide('published')}>
          Publish
        </button>
        <button type="button" className={styles.danger} disabled={pending} onClick={() => decide('rejected')}>
          Reject
        </button>
      </p>

      {message === '' ? null : <p className={styles.privacy} role="status">{message}</p>}
    </li>
  );
}
