import Link from 'next/link';
import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <span className={styles.brand}>gridGPT.ca</span>
      <span className={styles.author}>Made by Kaustav Sharma</span>
      <nav className={styles.nav}>
        <Link href="/about" className={styles.navLink}>About</Link>
        <span className={styles.navSep}>&middot;</span>
        <a
          href="https://github.com/kaustav927/OntarioGridCockpit"
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
