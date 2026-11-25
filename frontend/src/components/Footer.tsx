import Link from 'next/link';
import styles from './Footer.module.css';
import { SEO_PAGES } from '@/lib/site';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.identity}>
        <Link href="/" className={styles.brandLink}><span className={styles.brand}>GridGPT</span></Link>
        <span className={styles.author}>Made by Kaustav Sharma</span>
      </div>
      <nav className={styles.nav}>
        {SEO_PAGES.map((p) => (
          <span key={p.href} className={styles.guideItem}>
            <Link href={p.href} className={styles.navLink}>{p.label}</Link>
            <span className={styles.navSep}>&middot;</span>
          </span>
        ))}
        <Link href="/about" className={styles.navLink}>About</Link>
        <span className={styles.navSep}>&middot;</span>
        <a
          href="https://github.com/kaustav927/GridGPT"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.navLink}
        >
          GitHub
        </a>
      </nav>
    </footer>
  );
}
