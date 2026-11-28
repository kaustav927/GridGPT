// Page chrome for crawlable content pages: header, breadcrumb, related links, footer,
// and BreadcrumbList structured data.
import Link from 'next/link';
import { SEO_PAGES, SITE_URL } from '@/lib/site';
import JsonLd from './JsonLd';
import styles from './seo.module.css';

interface Props {
  path: string;
  crumb: string;
  parent?: { href: string; label: string };
  children: React.ReactNode;
}

export default function SeoShell({ path, crumb, parent, children }: Props) {
  const trail = [{ href: '/', label: 'Live dashboard' }, ...(parent ? [parent] : []), { href: path, label: crumb }];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M9 0L2 9h5l-1 7 7-9H8l1-7z" fill="#58A6FF" />
          </svg>
          GridGPT
        </Link>
        <nav className={styles.headerNav} aria-label="Primary">
          <Link href="/">Dashboard</Link>
          <Link href="/ontario-electricity-price">Prices</Link>
          <Link href="/about">About</Link>
        </nav>
      </header>

      <main className={styles.main}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          {trail.map((t, i) => (
            <span key={t.href}>
              {i > 0 && ' / '}
              {i < trail.length - 1 ? <Link href={t.href}>{t.label}</Link> : t.label}
            </span>
          ))}
        </nav>

        {children}

        <section className={styles.section} style={{ marginTop: 8 }}>
          <h2 className={styles.sectionTitle}>More Ontario grid data</h2>
          <nav className={styles.related} aria-label="Related pages">
            {SEO_PAGES.filter((p) => p.href !== path).map((p) => (
              <Link key={p.href} href={p.href}>
                {p.label} →
              </Link>
            ))}
            <Link href="/">Live grid dashboard →</Link>
          </nav>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>
          Data: <a href="https://www.ieso.ca/" rel="noopener noreferrer" target="_blank">IESO</a> public reports,
          updated every 5 minutes. Not affiliated with the IESO.
        </span>
        <span>
          <Link href="/about">About</Link> ·{' '}
          <a href="https://github.com/kaustav927/GridGPT" rel="noopener noreferrer" target="_blank">GitHub</a>
        </span>
      </footer>

      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: trail.map((t, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: t.label,
            item: `${SITE_URL}${t.href}`,
          })),
        }}
      />
    </div>
  );
}
