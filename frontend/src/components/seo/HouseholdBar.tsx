// Slim one-row bar for regular people: what electricity costs right now, when it gets cheaper,
// and how clean the grid is. Plain words, no industry acronyms. Stays a single row on phones.
// Each cell links to the page that explains it. Server-rendered (crawlable); 5-minute ISR window.
import Link from 'next/link';
import { TOU_PLAIN_LABEL, formatShortTime, ratesAreCurrent, tieredMonthlyCost, touStatus } from '@/lib/rpp';
import { getFuelMix } from '@/lib/grid-data';
import { computeCarbon } from '@/lib/carbon';
import LinkArrow from './LinkArrow';
import styles from './HouseholdBar.module.css';

const Text = ({ long, short, className }: { long: string; short: string; className: string }) => (
  <span className={className}>
    <span className={styles.long}>{long}</span>
    <span className={styles.short}>{short}</span>
  </span>
);

const Cell = ({ href, title, children }: { href: string; title: string; children: React.ReactNode }) => (
  <Link href={href} className={styles.cell} title={title}>
    {children}
    <LinkArrow className={styles.arrow} />
  </Link>
);

export default async function HouseholdBar({ now = new Date(), framed = false }: { now?: Date; framed?: boolean }) {
  if (!ratesAreCurrent(now)) return null;

  const mix = await getFuelMix();
  const carbon = mix ? computeCarbon(mix.fuels) : null;
  const tou = touStatus(now);
  const cents = (c: number) => `${c.toFixed(1)}¢/kWh`;
  const ratesHref = '/ontario-electricity-price#household-rates';

  return (
    <nav
      className={framed ? `${styles.bar} ${styles.framed}` : styles.bar}
      aria-label="What Ontario homes pay for electricity right now"
      data-household-bar=""
    >
      <Cell href={ratesHref} title="See today's household electricity rates">
        <Text className={styles.label} long="Your price right now" short="Price now" />
        <span className={styles.value}>{cents(tou.price)}</span>
        <span className={styles.sub}>{TOU_PLAIN_LABEL[tou.period]}</span>
      </Cell>

      <Cell href={ratesHref} title="See when electricity is cheapest">
        {tou.nextCheaper ? (
          <>
            <Text className={styles.label} long="Gets cheaper at" short="Cheaper at" />
            <span className={`${styles.value} ${styles.green}`}>{formatShortTime(tou.nextCheaper.at, now)}</span>
            <span className={styles.sub}>{cents(tou.nextCheaper.price)}</span>
          </>
        ) : (
          <>
            <Text className={styles.label} long="Lowest rate until" short="Low until" />
            <span className={`${styles.value} ${styles.green}`}>
              {tou.nextChange ? formatShortTime(tou.nextChange.at, now) : '—'}
            </span>
            <span className={styles.sub}>{tou.nextChange ? `then ${cents(tou.nextChange.price)}` : 'lowest rate'}</span>
          </>
        )}
      </Cell>

      {carbon ? (
        <Cell href="/ontario-electricity-generation-by-fuel" title="See where Ontario's power comes from">
          <Text className={styles.label} long="Clean power right now" short="Clean power" />
          <span className={`${styles.value} ${styles.green}`}>{Math.round(carbon.cleanPercent)}%</span>
          <Text className={styles.sub} long="nuclear, hydro, wind & solar" short="emissions-free" />
        </Cell>
      ) : (
        <Cell href={ratesHref} title="See household electricity rates">
          <Text className={styles.label} long="Typical home, per month" short="Typical month" />
          <span className={styles.value}>${Math.round(tieredMonthlyCost(700))}</span>
          <Text className={styles.sub} long="electricity only, 700 kWh" short="700 kWh" />
        </Cell>
      )}
    </nav>
  );
}
