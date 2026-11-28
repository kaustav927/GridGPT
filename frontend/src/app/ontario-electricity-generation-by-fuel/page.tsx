import type { Metadata } from 'next';
import Link from 'next/link';
import SeoShell from '@/components/seo/SeoShell';
import Faq from '@/components/seo/Faq';
import styles from '@/components/seo/seo.module.css';
import { getFuelMix } from '@/lib/grid-data';
import { computeCarbon } from '@/lib/carbon';
import { FUEL_LABELS, fmtLocalStamp, fmtMw, fmtPct } from '@/lib/format';

export const revalidate = 300;

const PATH = '/ontario-electricity-generation-by-fuel';

export const metadata: Metadata = {
  title: 'Ontario Electricity Generation by Fuel Type (Live Nuclear, Hydro, Gas, Wind, Solar)',
  description:
    "How Ontario's electricity is generated right now: live megawatts and percentages from nuclear, hydro, natural gas, wind and solar, the share that's emissions-free, and an estimate of grid carbon intensity.",
  alternates: { canonical: PATH },
  openGraph: { url: PATH, title: 'Ontario electricity generation by fuel type' },
};

const FUEL_COLORS: Record<string, string> = {
  NUCLEAR: '#3FB950',
  HYDRO: '#58A6FF',
  GAS: '#D29922',
  WIND: '#39D5FF',
  SOLAR: '#F0C040',
  BIOFUEL: '#A371F7',
  OTHER: '#8B949E',
};

export default async function GenerationByFuelPage() {
  const mix = await getFuelMix();
  const carbon = mix ? computeCarbon(mix.fuels) : null;
  const pct = (fuel: string) => mix?.fuels.find((f) => f.fuel_type === fuel)?.percent ?? 0;

  const faq = [
    {
      q: 'How much of Ontario’s electricity comes from nuclear?',
      a: mix
        ? `As of ${fmtLocalStamp(mix.asOf)}, nuclear plants (Bruce, Darlington and Pickering) supply ${fmtPct(pct('NUCLEAR'))} of Ontario's transmission-connected generation. Nuclear is usually Ontario's largest source, typically around half of annual supply.`
        : "Nuclear plants (Bruce, Darlington and Pickering) are usually Ontario's largest source of electricity, typically around half of annual supply.",
    },
    {
      q: 'How clean is Ontario’s electricity grid?',
      a: carbon
        ? `Right now ${fmtPct(carbon.cleanPercent)} of Ontario's generation comes from emissions-free sources (nuclear, hydro, wind and solar). GridGPT estimates current grid carbon intensity at about ${Math.round(carbon.intensity)} g CO2 per kWh, mostly from natural gas plants.`
        : "Most of Ontario's electricity comes from emissions-free nuclear, hydro, wind and solar. Natural gas plants make up the rest and are used more during peak demand.",
    },
    {
      q: 'Why does Ontario use natural gas for electricity?',
      a: 'Gas plants can ramp up and down quickly, so they fill in when demand peaks (cold evenings, hot afternoons), when nuclear units are offline for refurbishment, or when wind and solar output drops. Gas output therefore varies a lot by hour and season.',
    },
    {
      q: 'Does this include rooftop solar?',
      a: "No. These figures cover generators connected to the IESO's transmission grid. Small solar and wind connected to local distribution networks (\"embedded\" generation) reduces demand on the grid and is shown separately on the GridGPT dashboard.",
    },
  ];

  return (
    <SeoShell path={PATH} crumb="Generation by fuel">
      <h1 className={styles.h1}>Ontario electricity generation by fuel type</h1>
      <p className={styles.lede}>
        Where Ontario&apos;s power is coming from right now, from the IESO&apos;s generator output reports: nuclear,
        hydro, natural gas, wind, solar and biofuel.
      </p>

      {mix && carbon ? (
        <>
          <div className={styles.asOf}>
            <span className={styles.liveDot} />
            As of {fmtLocalStamp(mix.asOf)} · IESO hourly generator output
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Total generation</div>
              <div className={styles.statValue}>{fmtMw(mix.totalMw)}</div>
              <div className={styles.statSub}>transmission-connected</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Emissions-free</div>
              <div className={`${styles.statValue} ${styles.green}`}>{fmtPct(carbon.cleanPercent)}</div>
              <div className={styles.statSub}>nuclear + hydro + wind + solar</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Carbon intensity (est.)</div>
              <div className={styles.statValue}>{Math.round(carbon.intensity)} g/kWh</div>
              <div className={styles.statSub}>CO2 per kWh generated</div>
            </div>
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Generation by fuel right now</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Fuel</th>
                    <th className={styles.num}>Output</th>
                    <th className={styles.num}>Share</th>
                    <th style={{ width: '35%' }} aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {mix.fuels.map((f) => (
                    <tr key={f.fuel_type}>
                      <td>{FUEL_LABELS[f.fuel_type] ?? f.fuel_type}</td>
                      <td className={styles.num}>{fmtMw(f.output_mw)}</td>
                      <td className={styles.num}>{fmtPct(f.percent, 1)}</td>
                      <td aria-hidden="true">
                        <div
                          className={styles.bar}
                          style={{ width: `${f.percent}%`, background: FUEL_COLORS[f.fuel_type] ?? '#8B949E' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <div className={styles.unavailable}>Live generation data is temporarily unavailable.</div>
      )}

      <Link href="/" className={styles.cta}>See every generating station on the live map →</Link>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>About Ontario&apos;s supply mix</h2>
        <div className={`${styles.sectionBody} ${styles.prose}`}>
          <p>
            <strong>Nuclear</strong> (Bruce, Darlington, Pickering) runs around the clock as baseload.{' '}
            <strong>Hydro</strong>, led by the Niagara (Beck) complex, follows demand and is the second-largest
            source. <strong>Natural gas</strong> covers peaks and gaps. <strong>Wind</strong> varies with the weather
            and is strongest in fall and winter, while transmission-connected <strong>solar</strong> peaks at midday
            in summer.
          </p>
          <p className={styles.note}>
            Carbon intensity is a GridGPT estimate: natural gas at about 450 g CO2/kWh, other sources at zero
            operational emissions. It is not an official IESO figure.
          </p>
        </div>
      </section>

      <Faq items={faq} />
    </SeoShell>
  );
}
