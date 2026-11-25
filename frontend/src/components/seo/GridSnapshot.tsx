// Server-rendered "Ontario grid right now" strip below the dashboard panels: grid-level stats
// (the household bar at the top covers what homes pay). Gives crawlers live numbers and links.
import Link from 'next/link';
import { getDemand, getFuelMix, getInterties, getPriceSnapshot } from '@/lib/grid-data';
import { computeCarbon } from '@/lib/carbon';
import { fmtCentsPerKwh, fmtDollarsPerMwh, fmtLocalStamp, fmtMw } from '@/lib/format';
import LinkArrow from './LinkArrow';
import styles from './seo.module.css';

export default async function GridSnapshot() {
  const [price, mix, interties, demand] = await Promise.all([
    getPriceSnapshot(),
    getFuelMix(),
    getInterties(),
    getDemand(),
  ]);
  const carbon = mix ? computeCarbon(mix.fuels) : null;

  return (
    <section className={styles.snapshot} aria-labelledby="grid-snapshot-title">
      <div className={styles.snapshotHead}>
        <h2 id="grid-snapshot-title" className={styles.snapshotTitle}>
          Ontario grid right now{price ? ` · ${fmtLocalStamp(price.lastUpdated)}` : ''}
        </h2>
        <span className={styles.snapshotHint}>Select a number for the full breakdown</span>
      </div>
      <div className={styles.stats}>
        {price && (
          <Link href="/ontario-electricity-price" className={`${styles.stat} ${styles.statLink}`}>
            <LinkArrow className={styles.statArrow} />
            <div className={styles.statLabel}>Wholesale price (avg)</div>
            <div className={styles.statValue}>{fmtDollarsPerMwh(price.average)}</div>
            <div className={styles.statSub}>{fmtCentsPerKwh(price.average)} across 9 zones</div>
          </Link>
        )}
        {demand && (
          <Link href="/ontario-electricity-demand" className={`${styles.stat} ${styles.statLink}`}>
            <LinkArrow className={styles.statArrow} />
            <div className={styles.statLabel}>Ontario demand</div>
            <div className={styles.statValue}>{fmtMw(demand.ontarioMw)}</div>
            <div className={styles.statSub}>
              {demand.todayPeak ? `today's peak ≈${fmtMw(demand.todayPeak.mw)}` : 'electricity in use now'}
            </div>
          </Link>
        )}
        {carbon && (
          <Link href="/ontario-electricity-generation-by-fuel" className={`${styles.stat} ${styles.statLink}`}>
            <LinkArrow className={styles.statArrow} />
            <div className={styles.statLabel}>Carbon intensity</div>
            <div className={styles.statValue}>{Math.round(carbon.intensity)} g/kWh</div>
            <div className={styles.statSub}>CO2 per kWh, estimated from fuel mix</div>
          </Link>
        )}
        {interties && (
          <Link href="/ontario-electricity-exports" className={`${styles.stat} ${styles.statLink}`}>
            <LinkArrow className={styles.statArrow} />
            <div className={styles.statLabel}>Net exports</div>
            <div className={`${styles.statValue} ${interties.netNowMw >= 0 ? styles.green : styles.red}`}>
              {interties.netNowMw >= 0 ? '+' : '−'}
              {fmtMw(Math.abs(interties.netNowMw))}
            </div>
            <div className={styles.statSub}>to US states &amp; provinces</div>
          </Link>
        )}
      </div>
    </section>
  );
}
