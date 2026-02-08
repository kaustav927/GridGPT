'use client';

import Link from 'next/link';
import { Icon } from '@blueprintjs/core';
import Footer from '@/components/Footer';
import styles from './about.module.css';

const IESO_BASE = 'https://reports-public.ieso.ca/public';

const DATA_SOURCES = [
  { name: 'RealtimeZonalEnergyPrices', format: 'XML', frequency: '5-min', path: 'RealtimeZonalEnergyPrices' },
  { name: 'RealtimeDemandZonal', format: 'CSV', frequency: '5-min', path: 'RealtimeDemandZonal' },
  { name: 'GenOutputCapability', format: 'XML', frequency: '5-min', path: 'GenOutputCapability' },
  { name: 'GenOutputbyFuelHourly', format: 'XML', frequency: 'Hourly', path: 'GenOutputbyFuelHourly' },
  { name: 'IntertieScheduleFlow', format: 'XML', frequency: 'Hourly', path: 'IntertieScheduleFlow' },
];

const REVISIONS = [
  { date: '2026-02-08', description: 'Added About page, footer, and rebranded to GridGPT' },
  { date: '2026-02-07', description: 'Grid AI chat with text-to-SQL, expanding/collapsing results' },
  { date: '2026-02-06', description: 'Map overlay fixes and intertie flows on time bar' },
  { date: '2026-02-05', description: 'Weather data integration and map UI enhancements' },
  { date: '2026-02-04', description: 'DA-OZP pricing support under new OEMP market model' },
  { date: '2026-02-03', description: 'Dedup views for ClickHouse tables, improved query patterns' },
  { date: '2026-02-01', description: 'Initial dashboard launch with real-time IESO data pipeline' },
];

export default function AboutPage() {
  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <Link href="/" className={styles.brandLink}>
          <Icon icon="lightning" size={20} color="#58A6FF" />
          <h1 className={styles.brandTitle}>GridGPT</h1>
        </Link>
        <Link href="/" className={styles.backLink}>
          Back to Dashboard
        </Link>
      </header>

      {/* Content */}
      <main className={styles.content}>
        <h1 className={styles.pageTitle}>About GridGPT</h1>
        <p className={styles.byline}>By Kaustav Sharma</p>
        <hr className={styles.divider} />

        {/* Purpose */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Purpose</h2>
          <p className={styles.prose}>
            GridGPT is a real-time monitoring dashboard for Ontario&apos;s electricity grid.
            It pulls public data from the Independent Electricity System Operator (IESO) and
            presents it in a dense, analyst-grade interface inspired by Palantir&apos;s design
            language. The goal is to make Ontario&apos;s energy market transparent and
            observable to anyone &mdash; from energy traders to curious citizens.
          </p>
          <p className={styles.prose}>
            The dashboard includes zonal pricing, demand, generation by fuel type, intertie
            flows, and an AI-powered chat interface that can query the underlying data using
            natural language.
          </p>
        </section>

        {/* Data Architecture */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Data Architecture</h2>
          <p className={styles.prose}>
            Data flows through a streaming pipeline from IESO&apos;s public report servers
            into the dashboard. Each stage is designed for reliability and low latency.
          </p>

          <div className={styles.pipeline}>
            <div className={styles.pipelineStage}>
              <span className={styles.pipelineName}>IESO Reports</span>
              <span className={styles.pipelineDesc}>Public XML/CSV</span>
            </div>
            <span className={styles.pipelineArrow}>&rarr;</span>
            <div className={styles.pipelineStage}>
              <span className={styles.pipelineName}>Python Producer</span>
              <span className={styles.pipelineDesc}>Async parsers</span>
            </div>
            <span className={styles.pipelineArrow}>&rarr;</span>
            <div className={styles.pipelineStage}>
              <span className={styles.pipelineName}>Kafka / Redpanda</span>
              <span className={styles.pipelineDesc}>Event streaming</span>
            </div>
            <span className={styles.pipelineArrow}>&rarr;</span>
            <div className={styles.pipelineStage}>
              <span className={styles.pipelineName}>ClickHouse</span>
              <span className={styles.pipelineDesc}>OLAP storage</span>
            </div>
            <span className={styles.pipelineArrow}>&rarr;</span>
            <div className={styles.pipelineStage}>
              <span className={styles.pipelineName}>Next.js</span>
              <span className={styles.pipelineDesc}>Dashboard UI</span>
            </div>
          </div>

          <p className={styles.prose}>
            A <strong>Python producer</strong> fetches IESO reports every 5 minutes, parses
            XML and CSV payloads, and publishes structured records to Kafka topics via
            Redpanda. <strong>ClickHouse</strong> materialised views consume these topics
            into time-series tables with deduplication. The <strong>Next.js</strong> frontend
            queries ClickHouse directly through API routes and renders data with server-sent
            events for live updates.
          </p>
        </section>

        {/* IESO Data Sources */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>IESO Data Sources</h2>
          <p className={styles.prose}>
            All data comes from IESO&apos;s public report server. These reports are freely
            available and require no authentication.
          </p>

          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Report</th>
                <th>Format</th>
                <th>Frequency</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {DATA_SOURCES.map((src) => (
                <tr key={src.path}>
                  <td className={styles.mono}>{src.name}</td>
                  <td>{src.format}</td>
                  <td>{src.frequency}</td>
                  <td>
                    <a
                      href={`${IESO_BASE}/${src.path}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Link
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* How to Access */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>How to Access the Data</h2>
          <p className={styles.prose}>
            IESO publishes all reports at{' '}
            <a href={IESO_BASE} target="_blank" rel="noopener noreferrer">
              {IESO_BASE}
            </a>
            . Anyone can download the raw files &mdash; no API key or registration required.
            The Python producer that powers this dashboard is open source on{' '}
            <a
              href="https://github.com/kaustav927/OntarioGridCockpit"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            .
          </p>
        </section>

        {/* Revision History */}
        <section className={styles.section}>
          <h2 className={styles.revisionHeader}>Revision History</h2>
          <ul className={styles.revisionList}>
            {REVISIONS.map((rev) => (
              <li key={rev.date} className={styles.revisionItem}>
                <span className={styles.revisionDate}>{rev.date}</span>
                <span className={styles.revisionDesc}>{rev.description}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <Footer />
    </div>
  );
}
