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
  { name: 'DayAheadOntarioZonalPrice', format: 'XML', frequency: 'Daily', path: 'DayAheadOntarioZonalPrice' },
  { name: 'DayAheadIntertieLMP', format: 'XML', frequency: 'Daily', path: 'DayAheadIntertieLMP' },
  { name: 'RealtimeIntertieLMP', format: 'XML', frequency: '5-min', path: 'RealtimeIntertieLMP' },
  { name: 'AdequacyDay', format: 'XML', frequency: 'Daily', path: 'Adequacy2' },
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
        <div className={styles.badgeRow}>
          <span className={styles.badge}>TypeScript</span>
          <span className={styles.badge}>Next.js 14</span>
          <span className={styles.badge}>ClickHouse</span>
          <span className={styles.badge}>Redpanda</span>
          <span className={styles.badge}>Claude API</span>
          <span className={styles.badge}>Blueprint.js</span>
        </div>
        <hr className={styles.divider} />

        {/* Overview */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Overview</h2>
          <p className={styles.prose}>
            GridGPT is an open-source, real-time monitoring dashboard for Ontario&apos;s electricity
            grid. It ingests public data from the{' '}
            <a href="#ieso">Independent Electricity System Operator (IESO)</a> and presents it in a
            dense, analyst-grade interface across nine{' '}
            <a href="#pricing-zone">pricing zones</a>. The dashboard covers zonal pricing,
            provincial demand, generation by fuel type, <a href="#intertie">intertie</a> flows
            to neighbouring jurisdictions, weather overlays, and a{' '}
            <a href="#text-to-sql">text-to-SQL</a> AI chatbot that can query any of the underlying
            data using natural language.
          </p>
          <p className={styles.prose}>
            The project is a full-stack engineering portfolio piece built to demonstrate real-time
            data pipeline design, time-series analytics, and AI-augmented data exploration. Every
            layer &mdash; from the Python producer that parses IESO XML feeds, to the{' '}
            <a href="#clickhouse">ClickHouse</a> <a href="#olap">OLAP</a> storage, to the{' '}
            <a href="#sse">SSE</a>-streamed chat interface &mdash; is designed for low-latency
            observability of a complex, always-on system.
          </p>
        </section>

        {/* Why Blueprint.js */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Why Blueprint.js?</h2>
          <p className={styles.prose}>
            <a href="#blueprintjs">Blueprint.js</a> was chosen as the component library because
            it was purpose-built for data-dense enterprise applications &mdash; exactly the kind
            of interface an electricity grid dashboard needs.
          </p>
          <ul className={styles.bulletList}>
            <li>
              <strong>Data-dense layouts</strong> &mdash; Blueprint is designed for complex
              dashboards with tables, trees, and multi-panel views, not consumer landing pages.
              It doesn&apos;t waste space on oversized padding or rounded cards.
            </li>
            <li>
              <strong>Dark-first design</strong> &mdash; A native dark theme ships out of the box.
              No CSS override hacks, no theme provider workarounds. The dark theme is a first-class
              citizen.
            </li>
            <li>
              <strong>TypeScript native</strong> &mdash; Full type definitions for every component
              and prop, matching the strict TypeScript configuration used throughout this project.
            </li>
            <li>
              <strong>500+ icons</strong> &mdash; A comprehensive icon system for status indicators,
              navigation, fuel types, and controls without pulling in a separate icon library.
            </li>
          </ul>
        </section>

        {/* System Architecture */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>System Architecture</h2>
          <p className={styles.prose}>
            Data flows through a streaming pipeline from IESO&apos;s public report servers into
            the dashboard. Each stage is designed for reliability and low latency.
          </p>

          <div className={styles.diagram}>
            <p className={styles.diagramTitle}>Data Pipeline</p>
            <div className={styles.archFlow}>
              {/* IESO */}
              <div className={`${styles.archNode} ${styles.nodeIESO}`}>
                <div className={styles.archNodeIcon}>
                  <Icon icon="globe-network" size={20} color="#D29922" />
                </div>
                <div className={styles.archNodeContent}>
                  <span className={styles.archNodeName}>IESO Report Servers</span>
                  <span className={styles.archNodeDesc}>
                    Public XML &amp; CSV feeds for 9 report types covering prices, demand, generation,
                    interties, adequacy, and day-ahead markets
                  </span>
                  <span className={styles.archNodeTech}>reports-public.ieso.ca</span>
                </div>
              </div>

              <div className={styles.archArrow}>
                <div className={styles.archArrowLine} />
                <span className={styles.archArrowLabel}>5-min polling</span>
                <div className={styles.archArrowHead} />
              </div>

              {/* Python Producer */}
              <div className={`${styles.archNode} ${styles.nodePython}`}>
                <div className={styles.archNodeIcon}>
                  <Icon icon="code" size={20} color="#3FB950" />
                </div>
                <div className={styles.archNodeContent}>
                  <span className={styles.archNodeName}>Python Producer</span>
                  <span className={styles.archNodeDesc}>
                    Async parsers fetch, validate, and structure IESO reports into typed records.
                    Runs on a cron schedule on the backend server.
                  </span>
                  <span className={styles.archNodeTech}>aiohttp + confluent-kafka + Pydantic</span>
                </div>
              </div>

              <div className={styles.archArrow}>
                <div className={styles.archArrowLine} />
                <span className={styles.archArrowLabel}>publishes to 10 topics</span>
                <div className={styles.archArrowHead} />
              </div>

              {/* Docker Boundary */}
              <div className={styles.dockerBoundary}>
                <div className={styles.dockerLabel}>
                  <Icon icon="cube" size={12} color="#58A6FF" />
                  DOCKER COMPOSE
                </div>
                <div className={styles.dockerInner}>
                  {/* Redpanda */}
                  <div className={`${styles.archNode} ${styles.nodeKafka}`}>
                    <div className={styles.archNodeIcon}>
                      <Icon icon="flows" size={20} color="#F85149" />
                    </div>
                    <div className={styles.archNodeContent}>
                      <span className={styles.archNodeName}>Redpanda</span>
                      <span className={styles.archNodeDesc}>
                        Kafka-compatible event streaming. 10 topics carry structured records from
                        the producer to ClickHouse.
                      </span>
                      <span className={styles.archNodeTech}>redpandadata/redpanda + console</span>
                    </div>
                  </div>

                  <div className={styles.archArrow}>
                    <div className={styles.archArrowLine} />
                    <span className={styles.archArrowLabel}>Kafka Engine MVs</span>
                    <div className={styles.archArrowHead} />
                  </div>

                  {/* ClickHouse */}
                  <div className={`${styles.archNode} ${styles.nodeClickHouse}`}>
                    <div className={styles.archNodeIcon}>
                      <Icon icon="database" size={20} color="#39D5FF" />
                    </div>
                    <div className={styles.archNodeContent}>
                      <span className={styles.archNodeName}>ClickHouse</span>
                      <span className={styles.archNodeDesc}>
                        Columnar <a href="#olap">OLAP</a> database. <a href="#materialized-view">Materialized views</a>{' '}
                        consume Kafka topics into MergeTree tables. 8{' '}
                        <a href="#dedup-view">dedup views</a> eliminate duplicate rows from
                        producer backfills.
                      </span>
                      <span className={styles.archNodeTech}>
                        v_zonal_prices, v_zonal_demand, v_generator_output, v_fuel_mix,
                        v_intertie_flow, v_adequacy, v_da_ozp, v_weather
                      </span>
                    </div>
                  </div>

                  {/* Redis */}
                  <div className={styles.infraRow}>
                    <div className={`${styles.archNode} ${styles.nodeKafka}`}>
                      <div className={styles.archNodeContent}>
                        <span className={styles.archNodeName}>Redis</span>
                        <span className={styles.archNodeDesc}>Cache layer</span>
                      </div>
                    </div>
                    <div className={`${styles.archNode} ${styles.nodeKafka}`}>
                      <div className={styles.archNodeContent}>
                        <span className={styles.archNodeName}>init-kafka</span>
                        <span className={styles.archNodeDesc}>Topic provisioning</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.archArrow}>
                <div className={styles.archArrowLine} />
                <span className={styles.archArrowLabel}>HTTP SQL queries</span>
                <div className={styles.archArrowHead} />
              </div>

              {/* Next.js API */}
              <div className={`${styles.archNode} ${styles.nodeNextJS}`}>
                <div className={styles.archNodeIcon}>
                  <Icon icon="application" size={20} color="#E6EDF3" />
                </div>
                <div className={styles.archNodeContent}>
                  <span className={styles.archNodeName}>Next.js API Routes</span>
                  <span className={styles.archNodeDesc}>
                    19 routes across 5 categories: Core, Historical, Day-Ahead, Time-Scrub, and AI.
                    All routes use <code>force-dynamic</code> for real-time data.
                  </span>
                  <span className={styles.archNodeTech}>Deployed on Vercel (serverless)</span>
                </div>
              </div>

              <div className={styles.archArrow}>
                <div className={styles.archArrowLine} />
                <span className={styles.archArrowLabel}>REST + SSE</span>
                <div className={styles.archArrowHead} />
              </div>

              {/* Frontend Panels */}
              <div className={styles.archBranch}>
                <div className={`${styles.archBranchNode} ${styles.nodeFrontend}`}>
                  <span className={styles.archBranchName}>Fuel Mix</span>
                  <span className={styles.archBranchDesc}>Donut / Table / Radar</span>
                </div>
                <div className={`${styles.archBranchNode} ${styles.nodeFrontend}`}>
                  <span className={styles.archBranchName}>Generation</span>
                  <span className={styles.archBranchDesc}>Area charts per plant</span>
                </div>
                <div className={`${styles.archBranchNode} ${styles.nodeFrontend}`}>
                  <span className={styles.archBranchName}>Zone Map</span>
                  <span className={styles.archBranchDesc}>Leaflet + WMS weather</span>
                </div>
                <div className={`${styles.archBranchNode} ${styles.nodeFrontend}`}>
                  <span className={styles.archBranchName}>Market</span>
                  <span className={styles.archBranchDesc}>Dual-axis chart + DA</span>
                </div>
                <div className={`${styles.archBranchNode} ${styles.nodeFrontend}`}>
                  <span className={styles.archBranchName}>Grid AI</span>
                  <span className={styles.archBranchDesc}>Text-to-SQL chatbot</span>
                </div>
                <div className={`${styles.archBranchNode} ${styles.nodeFrontend}`}>
                  <span className={styles.archBranchName}>Interties</span>
                  <span className={styles.archBranchDesc}>Flow table + carbon</span>
                </div>
              </div>
            </div>
          </div>

          <p className={styles.prose}>
            A separate <a href="#wms">WMS</a> connection to{' '}
            <a href="#eccc">Environment and Climate Change Canada (ECCC)</a> feeds weather
            overlays (temperature, cloud cover, precipitation) directly into the map component
            via GDPS forecast layers.
          </p>
        </section>

        {/* Dashboard Panels */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Dashboard Panels</h2>
          <p className={styles.prose}>
            The dashboard is built around six panels, each showing a different facet of
            Ontario&apos;s grid in real time.
          </p>

          <div className={styles.panelCard}>
            <h3 className={styles.panelName}>Fuel Mix</h3>
            <span className={styles.panelDataSource}>v_generator_output aggregated by fuel type</span>
            <p className={styles.panelDesc}>
              Three views of Ontario&apos;s current generation: a donut chart showing the percentage
              split between <a href="#fuel-mix">fuel types</a> (nuclear ~60%, hydro ~25%, gas, wind,
              solar, biofuel), a detailed table with per-fuel output and capability numbers, and a
              radar chart for comparing fuel contributions. The inner ring shows the energy flow
              direction.
            </p>
          </div>

          <div className={styles.panelCard}>
            <h3 className={styles.panelName}>Generation by Resource</h3>
            <span className={styles.panelDataSource}>v_generator_output per plant</span>
            <p className={styles.panelDesc}>
              Area charts for each major generating station (Bruce, Darlington, Pickering, and more),
              grouped by fuel type with color coding. Each section &mdash; Renewables, Nuclear, Hydro,
              Gas &mdash; shows individual plant contributions. This table can lag ~2 hours behind
              other data sources.
            </p>
          </div>

          <div className={styles.panelCard}>
            <h3 className={styles.panelName}>Ontario Zone Map</h3>
            <span className={styles.panelDataSource}>
              v_zonal_prices + v_intertie_flow + v_generator_output + ECCC WMS
            </span>
            <p className={styles.panelDesc}>
              An interactive Leaflet map with a <a href="#pricing-zone">pricing zone</a>{' '}
              GeoJSON overlay using a 12-tier color scale, generation site markers sized by output,
              animated <a href="#intertie">intertie</a> chevrons showing flow direction, and{' '}
              <a href="#eccc">ECCC</a> weather <a href="#wms">WMS</a> layers for temperature,
              cloud cover, and precipitation. A time scrubber allows historical replay of all
              map layers simultaneously.
            </p>
          </div>

          <div className={styles.panelCard}>
            <h3 className={styles.panelName}>Market Overview</h3>
            <span className={styles.panelDataSource}>
              v_da_ozp + v_zonal_prices + v_zonal_demand + v_adequacy
            </span>
            <p className={styles.panelDesc}>
              A dual-axis Recharts chart with demand, supply, and grid load on the left{' '}
              <a href="#megawatt">MW</a> axis and price on the right{' '}
              <a href="#mwh">$/MWh</a> axis. Includes a{' '}
              <a href="#day-ahead-market">day-ahead</a> overlay for both the current day (D) and
              tomorrow (D+1), plus a peak demand display. Supports 1-hour and full-day time ranges.
            </p>
          </div>

          <div className={styles.panelCard}>
            <h3 className={styles.panelName}>Grid AI</h3>
            <span className={styles.panelDataSource}>All ClickHouse tables via /api/chat</span>
            <p className={styles.panelDesc}>
              A <a href="#text-to-sql">text-to-SQL</a> chatbot powered by the Claude API. Users ask
              natural language questions like &ldquo;What was the average price in Toronto this
              morning?&rdquo; and the system generates validated SQL, executes it against ClickHouse,
              and streams back the answer with a strategy explanation. Chat history persists in
              localStorage.
            </p>
          </div>

          <div className={styles.panelCard}>
            <h3 className={styles.panelName}>Interties</h3>
            <span className={styles.panelDataSource}>v_intertie_flow</span>
            <p className={styles.panelDesc}>
              Shows flows across Ontario&apos;s five <a href="#intertie">intertie</a> connections:
              Quebec, Michigan, Minnesota, New York, and Manitoba. Displays actual flow in{' '}
              <a href="#megawatt">MW</a>, direction (positive = export, negative = import), and
              net flow summary.
            </p>
          </div>
        </section>

        {/* Grid AI Architecture */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Grid AI: Text-to-SQL Architecture</h2>
          <p className={styles.prose}>
            Grid AI is a <a href="#context-grounded">context-grounded</a> query assistant that
            translates natural language into validated ClickHouse SQL. Rather than relying on the
            LLM&apos;s general knowledge, every query is anchored in domain expertise assembled
            from four context layers.
          </p>

          <h3 className={styles.subsectionTitle}>Context Layers</h3>
          <div className={styles.contextLayers}>
            <div className={styles.contextLayer}>
              <span className={styles.contextLayerName}>Schema Definitions</span>
              <span className={styles.contextLayerDesc}>
                8 table structures with column names, types, and relationships. The LLM knows
                exactly what columns exist and how tables relate.
              </span>
            </div>
            <div className={styles.contextLayer}>
              <span className={styles.contextLayerName}>Domain Knowledge</span>
              <span className={styles.contextLayerDesc}>
                IESO market rules, timezone handling (EST storage vs UTC queries), zone mappings,
                fuel type categories, and pricing model details.
              </span>
            </div>
            <div className={styles.contextLayer}>
              <span className={styles.contextLayerName}>Query Patterns</span>
              <span className={styles.contextLayerDesc}>
                11 validated SQL templates for common questions: current prices, demand trends,
                fuel mix breakdowns, intertie flows, and historical comparisons.
              </span>
            </div>
            <div className={styles.contextLayer}>
              <span className={styles.contextLayerName}>Temporal Context</span>
              <span className={styles.contextLayerDesc}>
                EST timestamp storage rules, UTC conversion formulas, delivery hour calculations,
                and common pitfalls around timezone boundaries.
              </span>
            </div>
          </div>

          <h3 className={styles.subsectionTitle}>Tool Loop</h3>
          <p className={styles.prose}>
            The chat API uses Claude&apos;s tool-use capability with a <code>query_clickhouse</code>{' '}
            tool. On each turn, the model generates SQL plus a plain-English strategy explanation.
            The SQL passes through a safety validator (SELECT-only, LIMIT required, no system table
            access) before executing against ClickHouse. If the query returns an error or empty
            results, the model can retry with corrected SQL for up to 5 iterations.
          </p>

          <h3 className={styles.subsectionTitle}>SSE Streaming</h3>
          <p className={styles.prose}>
            Results stream to the browser via <a href="#sse">Server-Sent Events</a>. The frontend
            receives four event types: <code>tool_use</code> (SQL + strategy),{' '}
            <code>tool_result</code> (row count + duration), <code>text_delta</code> (chunked
            natural language response), and <code>done</code>. The Grid AI component renders tool
            badges, strategy text, markdown-formatted answers, and persists conversations in
            localStorage.
          </p>

          {/* Grid AI Architecture Diagram */}
          <div className={styles.diagram}>
            <p className={styles.diagramTitle}>Grid AI Pipeline</p>
            <div className={styles.archFlow}>
              <div className={`${styles.archNode} ${styles.nodeFrontend}`}>
                <div className={styles.archNodeIcon}>
                  <Icon icon="chat" size={20} color="#58A6FF" />
                </div>
                <div className={styles.archNodeContent}>
                  <span className={styles.archNodeName}>User Question</span>
                  <span className={styles.archNodeDesc}>
                    Natural language input via GridChat component
                  </span>
                </div>
              </div>

              <div className={styles.archArrow}>
                <div className={styles.archArrowLine} />
                <div className={styles.archArrowHead} />
              </div>

              <div className={`${styles.archNode} ${styles.nodeNextJS}`}>
                <div className={styles.archNodeIcon}>
                  <Icon icon="layers" size={20} color="#E6EDF3" />
                </div>
                <div className={styles.archNodeContent}>
                  <span className={styles.archNodeName}>Context Assembly</span>
                  <span className={styles.archNodeDesc}>
                    Schema + Domain Knowledge + Query Patterns + Temporal Rules combined into a
                    single system prompt
                  </span>
                </div>
              </div>

              <div className={styles.archArrow}>
                <div className={styles.archArrowLine} />
                <div className={styles.archArrowHead} />
              </div>

              <div className={`${styles.archNode} ${styles.nodeClaude}`}>
                <div className={styles.archNodeIcon}>
                  <Icon icon="predictive-analysis" size={20} color="#D29922" />
                </div>
                <div className={styles.archNodeContent}>
                  <span className={styles.archNodeName}>Claude API</span>
                  <span className={styles.archNodeDesc}>
                    claude-sonnet-4 with query_clickhouse tool definition
                  </span>
                  <span className={styles.archNodeTech}>max_tokens: 2048, tool loop up to 5 iterations</span>
                </div>
              </div>

              <div className={styles.archArrow}>
                <div className={styles.archArrowLine} />
                <span className={styles.archArrowLabel}>SQL + strategy</span>
                <div className={styles.archArrowHead} />
              </div>

              <div className={`${styles.archNode} ${styles.nodeClickHouse}`}>
                <div className={styles.archNodeIcon}>
                  <Icon icon="shield" size={20} color="#39D5FF" />
                </div>
                <div className={styles.archNodeContent}>
                  <span className={styles.archNodeName}>Safety Validation + Execution</span>
                  <span className={styles.archNodeDesc}>
                    SELECT-only filter, LIMIT enforcement, system table blocklist. Validated SQL
                    executes against ClickHouse via HTTP.
                  </span>
                </div>
              </div>

              <div className={styles.archArrow}>
                <div className={styles.archArrowLine} />
                <span className={styles.archArrowLabel}>SSE stream</span>
                <div className={styles.archArrowHead} />
              </div>

              <div className={`${styles.archNode} ${styles.nodeSSE}`}>
                <div className={styles.archNodeIcon}>
                  <Icon icon="feed" size={20} color="#39D5FF" />
                </div>
                <div className={styles.archNodeContent}>
                  <span className={styles.archNodeName}>GridChat Component</span>
                  <span className={styles.archNodeDesc}>
                    Markdown rendering, tool badges with strategy text, localStorage persistence,
                    suggested questions
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* API Reference */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>API Reference</h2>
          <p className={styles.prose}>
            The Next.js API layer exposes 19 routes organized into five categories. All routes
            query ClickHouse directly and use <code>force-dynamic</code> for real-time data.
          </p>

          <div className={styles.apiGrid}>
            <div className={styles.apiCategory}>
              <h3 className={styles.apiCategoryTitle}>Core (6)</h3>
              <ul className={styles.apiRouteList}>
                <li className={styles.apiRoute}>/api/prices <span>Latest zonal prices</span></li>
                <li className={styles.apiRoute}>/api/demand <span>Current demand</span></li>
                <li className={styles.apiRoute}>/api/fuel-mix <span>Fuel mix breakdown</span></li>
                <li className={styles.apiRoute}>/api/generators <span>Generator output</span></li>
                <li className={styles.apiRoute}>/api/interties <span>Intertie flows</span></li>
                <li className={styles.apiRoute}>/api/weather <span>Weather by zone</span></li>
              </ul>
            </div>

            <div className={styles.apiCategory}>
              <h3 className={styles.apiCategoryTitle}>Historical (6)</h3>
              <ul className={styles.apiRouteList}>
                <li className={styles.apiRoute}>/api/prices/history</li>
                <li className={styles.apiRoute}>/api/demand/history</li>
                <li className={styles.apiRoute}>/api/supply/history</li>
                <li className={styles.apiRoute}>/api/fuel-mix/history</li>
                <li className={styles.apiRoute}>/api/generators/history</li>
                <li className={styles.apiRoute}>/api/market/history</li>
              </ul>
            </div>

            <div className={styles.apiCategory}>
              <h3 className={styles.apiCategoryTitle}>Day-Ahead (2)</h3>
              <ul className={styles.apiRouteList}>
                <li className={styles.apiRoute}>/api/market/day-ahead <span>DA forecasts</span></li>
                <li className={styles.apiRoute}>/api/peak-demand <span>Peak forecasts</span></li>
              </ul>
            </div>

            <div className={styles.apiCategory}>
              <h3 className={styles.apiCategoryTitle}>Time-Scrub (4)</h3>
              <ul className={styles.apiRouteList}>
                <li className={styles.apiRoute}>/api/prices/at-time</li>
                <li className={styles.apiRoute}>/api/weather/at-time</li>
                <li className={styles.apiRoute}>/api/interties/at-time</li>
                <li className={styles.apiRoute}>/api/interties/prices</li>
              </ul>
            </div>

            <div className={styles.apiCategory}>
              <h3 className={styles.apiCategoryTitle}>AI (1)</h3>
              <ul className={styles.apiRouteList}>
                <li className={styles.apiRoute}>/api/chat <span>Text-to-SQL via Claude</span></li>
              </ul>
            </div>
          </div>
        </section>

        {/* Weather Integration */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Weather Integration</h2>
          <p className={styles.prose}>
            The Ontario Zone Map displays weather overlays sourced from{' '}
            <a href="#eccc">ECCC</a>&apos;s Global Deterministic Prediction System (GDPS) via{' '}
            <a href="#wms">WMS</a> tile layers. Three layers are available: surface temperature,
            cloud cover, and total precipitation.
          </p>
          <p className={styles.prose}>
            Weather frames are snapped to 3-hour forecast boundaries (00Z, 03Z, 06Z, etc.) to
            match GDPS model runs. The map uses a{' '}
            <a href="#double-buffering">double-buffering</a> technique: the next forecast image
            loads in a hidden layer while the current one displays, so transitions between time
            steps are smooth instead of flickering.
          </p>
        </section>

        {/* Next.js Techniques */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Next.js Techniques</h2>
          <ul className={styles.bulletList}>
            <li>
              <strong>Dynamic imports for Leaflet</strong> &mdash; The map component uses{' '}
              <code>next/dynamic</code> with <code>ssr: false</code> to avoid{' '}
              <code>window is not defined</code> errors during server-side rendering. Leaflet
              requires a browser environment.
            </li>
            <li>
              <strong><code>force-dynamic</code> on all API routes</strong> &mdash; Every API
              route exports <code>export const dynamic = &apos;force-dynamic&apos;</code> to
              ensure fresh ClickHouse queries on every request rather than serving stale cached
              responses.
            </li>
            <li>
              <strong>Revalidation on ClickHouse fetch</strong> &mdash; The ClickHouse HTTP client
              uses <code>next: &#123; revalidate: 5 &#125;</code> to allow brief caching while
              keeping data near-real-time.
            </li>
            <li>
              <strong>Client-side <a href="#hydration">hydration</a> for suggested questions</strong>{' '}
              &mdash; The Grid AI panel renders a deterministic set of suggested questions on the
              server, then randomizes them client-side after{' '}
              <a href="#hydration">hydration</a> to avoid mismatch errors.
            </li>
          </ul>
        </section>

        {/* Hosting & Infrastructure */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Hosting &amp; Infrastructure</h2>
          <p className={styles.prose}>
            The system is split across two hosting providers, optimized for cost and reliability:
          </p>
          <ul className={styles.bulletList}>
            <li>
              <strong>Frontend on Vercel</strong> &mdash; The Next.js app runs as serverless
              functions for API routes and uses Vercel&apos;s edge CDN for static assets. This
              handles bursty user traffic with auto-scaling at near-zero idle cost.
            </li>
            <li>
              <strong>Backend on Hetzner VPS</strong> &mdash; A single VPS runs Docker Compose
              with 5 services: Redpanda, Redpanda Console, ClickHouse, Redis, and init-kafka.
              The Python producer runs on a cron schedule on the same machine. This provides
              persistent, always-on infrastructure for 24/7 data ingestion at ~$5&ndash;10/month.
            </li>
          </ul>
          <p className={styles.prose}>
            The split rationale: Vercel handles user-facing traffic cheaply with auto-scaling,
            while Hetzner provides the stable, long-running services (Kafka, ClickHouse, Redis)
            that need to be online continuously regardless of user traffic.
          </p>
        </section>

        {/* Built with Claude Code */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Built with Claude Code</h2>
          <p className={styles.prose}>
            GridGPT was developed using Claude Code as the primary development tool. The project
            leveraged several MCP (Model Context Protocol) integrations and custom Skills to
            accelerate development:
          </p>
          <ul className={styles.bulletList}>
            <li>
              <strong>ClickHouse direct queries</strong> &mdash; A custom <code>/query</code>{' '}
              Skill for running ad-hoc SQL against the live database during development, validating
              schema designs and query patterns in real time.
            </li>
            <li>
              <strong>Context7 for documentation</strong> &mdash; Used for looking up Blueprint.js
              component APIs, Recharts configuration, Leaflet plugin patterns, and Next.js App
              Router conventions.
            </li>
            <li>
              <strong>Sequential Thinking for complex logic</strong> &mdash; Applied to
              multi-step problems like the text-to-SQL context assembly, timezone conversion
              strategy, and deduplication view design.
            </li>
            <li>
              <strong>Custom Skills</strong> &mdash; <code>/dev</code> (start all infrastructure),{' '}
              <code>/query</code> (run ClickHouse SQL), and <code>/ingest</code> (trigger a
              producer run) provided one-command workflows during development.
            </li>
          </ul>
        </section>

        {/* Tech Stack */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Tech Stack</h2>
          <div className={styles.tableScroll}>
            <table className={styles.techTable}>
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Technology</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Frontend</td><td>Next.js 14 (App Router), Blueprint.js 5.x, Recharts, Nivo, Leaflet</td></tr>
                <tr><td>Language</td><td>TypeScript (strict), Python 3.11</td></tr>
                <tr><td>API</td><td>Next.js API routes, Server-Sent Events (SSE)</td></tr>
                <tr><td>Database</td><td>ClickHouse (columnar OLAP)</td></tr>
                <tr><td>Streaming</td><td>Redpanda (Kafka-compatible)</td></tr>
                <tr><td>Cache</td><td>Redis</td></tr>
                <tr><td>AI</td><td>Claude API (claude-sonnet-4, tool use)</td></tr>
                <tr><td>Weather</td><td>ECCC GDPS via WMS</td></tr>
                <tr><td>Maps</td><td>Leaflet + react-leaflet, GeoJSON, WMS tiles</td></tr>
                <tr><td>Producer</td><td>Python 3.11, aiohttp, confluent-kafka, Pydantic v2</td></tr>
                <tr><td>Infrastructure</td><td>Docker Compose, Vercel, Hetzner VPS</td></tr>
                <tr><td>Dev Tools</td><td>Claude Code, Context7, Sequential Thinking</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Quick Start */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Quick Start</h2>
          <pre className={styles.codeBlock}>{`# Start infrastructure
docker compose up -d

# Start frontend dev server
cd frontend && npm run dev

# Start producer (separate terminal, activate venv)
cd producer && source venv/bin/activate && python main.py

# Query ClickHouse directly
docker exec -it clickhouse clickhouse-client \\
  -q "SELECT zone, price FROM ieso.v_zonal_prices \\
      ORDER BY timestamp DESC LIMIT 9"`}</pre>
        </section>

        {/* IESO Data Sources */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>IESO Data Sources</h2>
          <p className={styles.prose}>
            All data comes from <a href="#ieso">IESO</a>&apos;s public report server. These
            reports are freely available and require no authentication.
          </p>

          <div className={styles.tableScroll}>
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
          </div>
        </section>

        {/* Glossary */}
        <h2 className={styles.glossaryTitle}>Glossary</h2>
        <p className={styles.glossaryIntro}>
          Plain-language definitions for terms used throughout this page.
        </p>

        <dl className={styles.glossaryList}>
          <dt id="intertie" className={styles.glossaryTerm}>Intertie</dt>
          <dd className={styles.glossaryDef}>
            A power line that connects Ontario&apos;s electricity grid to another region like
            Quebec or Michigan. Power can flow in or out through these connections.
          </dd>

          <dt id="pricing-zone" className={styles.glossaryTerm}>Pricing Zone</dt>
          <dd className={styles.glossaryDef}>
            An area of Ontario where electricity costs the same amount. Ontario has 9 pricing
            zones with names like TORONTO, OTTAWA, and NORTHWEST.
          </dd>

          <dt id="ieso" className={styles.glossaryTerm}>IESO</dt>
          <dd className={styles.glossaryDef}>
            Independent Electricity System Operator. The organization that runs Ontario&apos;s
            power grid and shares public data about it.
          </dd>

          <dt id="megawatt" className={styles.glossaryTerm}>Megawatt (MW)</dt>
          <dd className={styles.glossaryDef}>
            A unit of power. One megawatt can power about 1,000 homes at the same time.
          </dd>

          <dt id="mwh" className={styles.glossaryTerm}>$/MWh</dt>
          <dd className={styles.glossaryDef}>
            Dollars per megawatt-hour. This is how electricity prices are measured &mdash; like
            a &ldquo;price per gallon&rdquo; for electricity.
          </dd>

          <dt id="fuel-mix" className={styles.glossaryTerm}>Fuel Mix</dt>
          <dd className={styles.glossaryDef}>
            The combination of energy sources used to make electricity right now &mdash; things
            like nuclear, water (hydro), natural gas, wind, and solar.
          </dd>

          <dt id="day-ahead-market" className={styles.glossaryTerm}>Day-Ahead Market</dt>
          <dd className={styles.glossaryDef}>
            A market where electricity prices are set one day before the power is actually used.
            This helps the grid plan ahead.
          </dd>

          <dt id="da-ozp" className={styles.glossaryTerm}>DA-OZP</dt>
          <dd className={styles.glossaryDef}>
            Day-Ahead Ontario Zonal Price. The official price for electricity, decided one day
            in advance. This is what consumers actually pay.
          </dd>

          <dt id="settlement-price" className={styles.glossaryTerm}>Settlement Price</dt>
          <dd className={styles.glossaryDef}>
            The final, official price used for billing. In Ontario, this is the{' '}
            <a href="#da-ozp">DA-OZP</a> &mdash; not the real-time 5-minute price.
          </dd>

          <dt id="real-time-price" className={styles.glossaryTerm}>Real-Time Price</dt>
          <dd className={styles.glossaryDef}>
            The live electricity price, updated every 5 minutes. Used for watching the grid,
            but not for billing.
          </dd>

          <dt id="baseload" className={styles.glossaryTerm}>Baseload</dt>
          <dd className={styles.glossaryDef}>
            Power plants that run all the time, like nuclear plants. They provide steady,
            low-cost power around the clock.
          </dd>

          <dt id="peaker-plant" className={styles.glossaryTerm}>Peaker Plant</dt>
          <dd className={styles.glossaryDef}>
            A power plant that only turns on when lots of people need electricity at the same
            time. Usually gas-powered and more expensive.
          </dd>

          <dt id="clickhouse" className={styles.glossaryTerm}>ClickHouse</dt>
          <dd className={styles.glossaryDef}>
            A very fast database built for analyzing large amounts of data over time. GridGPT
            stores all IESO data here.
          </dd>

          <dt id="redpanda" className={styles.glossaryTerm}>Redpanda</dt>
          <dd className={styles.glossaryDef}>
            A streaming platform that moves data in real-time &mdash; like a conveyor belt
            carrying information from the producer to the database.
          </dd>

          <dt id="text-to-sql" className={styles.glossaryTerm}>Text-to-SQL</dt>
          <dd className={styles.glossaryDef}>
            Turning a plain English question (like &ldquo;What&apos;s the price in
            Toronto?&rdquo;) into a database query that finds the answer.
          </dd>

          <dt id="context-grounded" className={styles.glossaryTerm}>Context-Grounded</dt>
          <dd className={styles.glossaryDef}>
            An AI approach that uses specific domain knowledge (like IESO rules) instead of
            relying on general knowledge alone.
          </dd>

          <dt id="sse" className={styles.glossaryTerm}>SSE</dt>
          <dd className={styles.glossaryDef}>
            Server-Sent Events. A way for the server to push live updates to your browser
            without you needing to refresh the page.
          </dd>

          <dt id="olap" className={styles.glossaryTerm}>OLAP</dt>
          <dd className={styles.glossaryDef}>
            Online Analytical Processing. A type of database designed for fast, complex queries
            on historical data &mdash; perfect for time-series energy data.
          </dd>

          <dt id="blueprintjs" className={styles.glossaryTerm}>Blueprint.js</dt>
          <dd className={styles.glossaryDef}>
            A design system made for building data-heavy dashboards. It provides ready-made dark
            theme components like tables, icons, and buttons.
          </dd>

          <dt id="materialized-view" className={styles.glossaryTerm}>Materialized View</dt>
          <dd className={styles.glossaryDef}>
            A saved database query that updates itself automatically when new data arrives. Used
            to move data from Kafka into ClickHouse tables.
          </dd>

          <dt id="dedup-view" className={styles.glossaryTerm}>Dedup View</dt>
          <dd className={styles.glossaryDef}>
            A database view that removes duplicate rows. When the producer re-fetches data,
            these views make sure you only see one copy of each record.
          </dd>

          <dt id="wms" className={styles.glossaryTerm}>WMS</dt>
          <dd className={styles.glossaryDef}>
            Web Map Service. A standard way to serve map images over the internet. GridGPT uses
            this for weather overlays from Environment Canada.
          </dd>

          <dt id="eccc" className={styles.glossaryTerm}>ECCC</dt>
          <dd className={styles.glossaryDef}>
            Environment and Climate Change Canada. The government agency that provides weather
            forecast data used on the map.
          </dd>

          <dt id="double-buffering" className={styles.glossaryTerm}>Double-Buffering</dt>
          <dd className={styles.glossaryDef}>
            A technique where the next image loads in the background before being shown, so
            transitions look smooth instead of flickering.
          </dd>

          <dt id="hydration" className={styles.glossaryTerm}>Hydration</dt>
          <dd className={styles.glossaryDef}>
            The process where a web page that was already drawn by the server becomes interactive
            once JavaScript loads in your browser.
          </dd>
        </dl>
      </main>

      <Footer />
    </div>
  );
}
