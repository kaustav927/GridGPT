import type { Metadata } from 'next';
import Link from 'next/link';
import SeoShell from '@/components/seo/SeoShell';
import Faq from '@/components/seo/Faq';
import styles from '@/components/seo/seo.module.css';
import { getInterties, INTERTIE_LABELS } from '@/lib/grid-data';
import { fmtDollarsPerMwh, fmtLocalStamp, fmtMw, fmtMwh } from '@/lib/format';

export const revalidate = 300;

const PATH = '/ontario-electricity-exports';

export const metadata: Metadata = {
  title: 'How Much Electricity Does Ontario Export to the US? (Live Intertie Flows)',
  description:
    'Live Ontario electricity exports and imports with New York, Michigan, Minnesota, Quebec and Manitoba: megawatts flowing right now, net energy over the last 24 hours, and intertie prices.',
  alternates: { canonical: PATH },
  openGraph: { url: PATH, title: 'Ontario electricity exports and imports, live' },
};

const direction = (mw: number) => (mw >= 0 ? 'exporting' : 'importing');

export default async function ExportsPage() {
  const data = await getInterties();
  const usNow = data
    ? data.interties.filter((i) => INTERTIE_LABELS[i.flow_group]?.country === 'US').reduce((s, i) => s + i.now_mw, 0)
    : 0;

  const faq = [
    {
      q: 'How much electricity does Ontario sell to the United States?',
      a: data
        ? `Over the last 24 hours (to ${fmtLocalStamp(data.lastUpdated)}), Ontario ${data.usNetMwh24h >= 0 ? 'exported' : 'imported'} a net ${fmtMwh(data.usNetMwh24h)} ${data.usNetMwh24h >= 0 ? 'to' : 'from'} New York, Michigan and Minnesota combined. Right now Ontario is ${direction(usNow)} about ${fmtMw(Math.abs(usNow))} with the US. Historically, Ontario has been a net exporter over a year, mostly to New York and Michigan.`
        : 'Ontario trades power with New York, Michigan and Minnesota through interties and has historically been a net exporter over a year, mostly to New York and Michigan. Live flows are shown on the GridGPT dashboard.',
    },
    {
      q: 'Does Ontario import electricity from Quebec?',
      a: data
        ? (() => {
            const qc = data.interties.find((i) => i.flow_group === 'QUEBEC');
            return qc
              ? `Right now Ontario is ${direction(qc.now_mw)} about ${fmtMw(Math.abs(qc.now_mw))} with Quebec. Ontario and Quebec trade in both directions; Quebec's hydro often supplies Ontario during peaks, and Ontario sends power east when it has surplus.`
              : "Ontario and Quebec trade electricity in both directions. Quebec's hydro often supplies Ontario during peaks, and Ontario sends power east when it has surplus.";
          })()
        : "Ontario and Quebec trade electricity in both directions. Quebec's hydro often supplies Ontario during peaks, and Ontario sends power east when it has surplus.",
    },
    {
      q: 'Why does Ontario export electricity?',
      a: 'Ontario often has more low-cost nuclear and hydro output than it needs, especially overnight and in spring and fall. Selling that surplus to neighbouring markets earns revenue and avoids spilling water or cutting output. Exports are scheduled hourly through the IESO market.',
    },
    {
      q: 'What is an intertie?',
      a: "An intertie is a high-voltage transmission connection between Ontario's grid and a neighbouring one. Ontario has interties with Quebec, Manitoba, Minnesota, Michigan and New York.",
    },
  ];

  return (
    <SeoShell path={PATH} crumb="Exports & imports">
      <h1 className={styles.h1}>How much electricity does Ontario export?</h1>
      <p className={styles.lede}>
        Live electricity flows between Ontario and its neighbours (New York, Michigan, Minnesota, Quebec and
        Manitoba) from IESO intertie data. Positive values are exports from Ontario; negative values are imports.
      </p>

      {data ? (
        <>
          <div className={styles.asOf}>
            <span className={styles.liveDot} />
            Latest hour: {fmtLocalStamp(data.lastUpdated)}
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Net flow right now</div>
              <div className={`${styles.statValue} ${data.netNowMw >= 0 ? styles.green : styles.red}`}>
                {data.netNowMw >= 0 ? '+' : '−'}
                {fmtMw(Math.abs(data.netNowMw))}
              </div>
              <div className={styles.statSub}>Ontario is a net {data.netNowMw >= 0 ? 'exporter' : 'importer'}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Net, last 24 hours</div>
              <div className={styles.statValue}>{fmtMwh(data.netMwh24h)}</div>
              <div className={styles.statSub}>{data.netMwh24h >= 0 ? 'exported' : 'imported'}, all interties</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>To the US, last 24 hours</div>
              <div className={styles.statValue}>{fmtMwh(data.usNetMwh24h)}</div>
              <div className={styles.statSub}>net {data.usNetMwh24h >= 0 ? 'exported' : 'imported'} (NY + MI + MN)</div>
            </div>
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Flows by intertie</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Neighbour</th>
                    <th className={styles.num}>Now</th>
                    <th className={styles.num}>Net, 24 h</th>
                    <th className={styles.num}>Intertie price</th>
                  </tr>
                </thead>
                <tbody>
                  {data.interties.map((i) => (
                    <tr key={i.flow_group}>
                      <td>
                        {INTERTIE_LABELS[i.flow_group]?.name ?? i.flow_group}
                        <span style={{ color: 'var(--text-muted)' }}> · {INTERTIE_LABELS[i.flow_group]?.country}</span>
                      </td>
                      <td className={`${styles.num} ${i.now_mw >= 0 ? styles.green : styles.red}`}>
                        {i.now_mw >= 0 ? '+' : '−'}
                        {fmtMw(Math.abs(i.now_mw))}
                      </td>
                      <td className={styles.num}>
                        {i.net_mwh_24h >= 0 ? '+' : '−'}
                        {fmtMwh(i.net_mwh_24h)}
                      </td>
                      <td className={styles.num}>{i.price !== null ? fmtDollarsPerMwh(i.price) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.note} style={{ padding: '0 16px 12px', margin: 0 }}>
              Green (+) = Ontario exporting; red (−) = Ontario importing. “Now” is the average over the latest hour.
            </p>
          </section>
        </>
      ) : (
        <div className={styles.unavailable}>Live intertie data is temporarily unavailable.</div>
      )}

      <Link href="/" className={styles.cta}>Watch intertie flows animate on the live map →</Link>

      <Faq items={faq} />
    </SeoShell>
  );
}
