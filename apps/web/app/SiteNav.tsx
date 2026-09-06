'use client';

/**
 * The header links, with the current one marked.
 *
 * A client component for one reason: `usePathname`. Marking the current page is
 * the only interactive thing the header does, and knowing the path is the only
 * thing it needs to do it - nothing here reads data, and there is nothing here
 * to send anywhere.
 *
 * `aria-current` rather than colour alone, so the marking survives a screen
 * reader and a high-contrast mode.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './ui.module.css';

const LINKS: readonly { href: string; label: string }[] = [
  { href: '/', label: 'Latest' },
  { href: '/rounds', label: 'Rounds' },
  { href: '/categories', label: 'Ladder' },
  { href: '/calculator', label: 'Calculator' },
  { href: '/news', label: 'News' },
  { href: '/history', label: 'My scores' },
  { href: '/account', label: 'Account' },
];

/** `/` matches only itself; every other tab also owns its sub-pages. */
function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      {LINKS.map(({ href, label }) => {
        const current = isCurrent(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={current ? `${styles.navLink} ${styles.navLinkCurrent}` : styles.navLink}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
