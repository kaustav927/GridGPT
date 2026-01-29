'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, Spinner } from '@blueprintjs/core';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import styles from './GenerationByResource.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Generator {
  generator: string;
  fuel_type: string;
  output_mw: number;
}

interface HistoryPoint {
  timestamp: string;
  generator: string;
  fuel_type: string;
  output_mw: number;
}

interface ChartPoint {
  timestamp: string;
  output_mw: number;
}

interface PlantData {
  name: string;
  output_mw: number;
  history: ChartPoint[];
}

// ---------------------------------------------------------------------------
// Hardcoded control-room plant configuration
// ---------------------------------------------------------------------------

interface PlantConfig {
  name: string;
  /**
   * Case-insensitive prefixes to match against generator names.
   * Empty array = aggregate ALL generators in the section's fuelTypes.
   */
  prefixes: string[];
}

interface SectionConfig {
  id: string;
  label: string;
  color: string;
  bgColor: string;
  fuelTypes: string[];
  plants: PlantConfig[];
}

const SECTIONS: SectionConfig[] = [
  {
    id: 'renewable',
    label: 'Embedded Renewable',
    color: '#3FB950',
    bgColor: 'rgba(63, 185, 80, 0.18)',
    fuelTypes: ['SOLAR', 'WIND'],
    plants: [
      { name: 'Solar', prefixes: [] },  // all SOLAR generators
      { name: 'Wind', prefixes: [] },   // all WIND generators
    ],
  },
  {
    id: 'nuclear',
    label: 'Nuclear',
    color: '#3FB950',
    bgColor: 'rgba(63, 185, 80, 0.15)',
    fuelTypes: ['NUCLEAR'],
    plants: [
      { name: 'Bruce', prefixes: ['bruce'] },
      { name: 'Pickering', prefixes: ['pickering'] },
      { name: 'Darlington', prefixes: ['darlington'] },
    ],
  },
  {
    id: 'hydro',
    label: 'Hydro',
    color: '#58A6FF',
    bgColor: 'rgba(88, 166, 255, 0.18)',
    fuelTypes: ['HYDRO'],
    plants: [
      { name: 'Total Hydro', prefixes: [] },
      { name: 'Beck Complex', prefixes: ['beck'] },
    ],
  },
  {
    id: 'gas',
    label: 'Gas',
    color: '#D29922',
    bgColor: 'rgba(139, 148, 158, 0.12)',
    fuelTypes: ['GAS'],
    plants: [
      { name: 'TA Sarnia', prefixes: ['tasarnia'] },
      { name: 'Goreway', prefixes: ['goreway', 'sithe goreway'] },
      { name: 'Atikokan', prefixes: ['atikokan'] },
      { name: 'St. Clair', prefixes: ['stclair'] },
      { name: 'Portlands', prefixes: ['portlands'] },
      { name: 'Kirkland Lake', prefixes: ['npkirkland', 'kirkland'] },
      { name: 'GSPC', prefixes: ['gspc', 'kapgs'] },
      { name: 'Halton Hills', prefixes: ['haltonhills'] },
      { name: 'York', prefixes: ['york', 'gtaa'] },
      { name: 'Greenfield', prefixes: ['greenfield'] },
      { name: 'Thorold', prefixes: ['thorold'] },
      { name: 'Lennox', prefixes: ['lennox'] },
      { name: 'Brighton Beach', prefixes: ['brighton'] },
      { name: 'East Windsor', prefixes: ['eastwindsor', 'westwindsor'] },
      { name: 'Napanee', prefixes: ['napanee'] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function matchesPlant(generatorName: string, prefixes: string[]): boolean {
  const lower = generatorName.toLowerCase();
  return prefixes.some((p) => lower.startsWith(p.toLowerCase()));
}

function matchesFuelType(fuelType: string, fuelTypes: string[]): boolean {
  return fuelTypes.includes(fuelType);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GenerationByResource() {
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [genHistory, setGenHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1920
  );

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [genRes, genHistRes] = await Promise.all([
        fetch('/api/generators?limit=500'),
        fetch('/api/generators/history?hours=4'),
      ]);
      const genJson = await genRes.json();
      const genHistJson = await genHistRes.json();

      setGenerators(genJson.data ?? []);
      setGenHistory(genHistJson.data ?? []);
    } catch (error) {
      console.error('Failed to fetch generation data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // -------------------------------------------------------------------------
  // Build section data
  // -------------------------------------------------------------------------

  const sectionData = useMemo(() => {
    return SECTIONS.map((section) => {
      const plantDataList: PlantData[] = [];

      // For renewable, each plant maps to a specific fuel type (Solar→SOLAR, Wind→WIND)
      // For others, all plants share the section's fuelTypes
      const isRenewable = section.id === 'renewable';

      for (const plant of section.plants) {
        const isAllAgg = plant.prefixes.length === 0;

        let matchedGens: Generator[];
        let matchedHist: HistoryPoint[];

        if (isRenewable) {
          // Each renewable plant aggregates ALL generators of its specific fuel type
          const fuelKey = plant.name.toUpperCase(); // "Solar"→"SOLAR", "Wind"→"WIND"
          matchedGens = generators.filter((g) => g.fuel_type === fuelKey);
          matchedHist = genHistory.filter((h) => h.fuel_type === fuelKey);
        } else {
          // Filter to section's fuel types first
          const sectionGens = generators.filter((g) =>
            matchesFuelType(g.fuel_type, section.fuelTypes),
          );
          const sectionHist = genHistory.filter((h) =>
            matchesFuelType(h.fuel_type, section.fuelTypes),
          );

          if (isAllAgg) {
            matchedGens = sectionGens;
            matchedHist = sectionHist;
          } else {
            matchedGens = sectionGens.filter((g) => matchesPlant(g.generator, plant.prefixes));
            matchedHist = sectionHist.filter((h) => matchesPlant(h.generator, plant.prefixes));
          }
        }

        const totalMw = matchedGens.reduce((s, g) => s + g.output_mw, 0);

        // Aggregate history by timestamp
        const tsMap = new Map<string, number>();
        for (const h of matchedHist) {
          tsMap.set(h.timestamp, (tsMap.get(h.timestamp) || 0) + h.output_mw);
        }
        const history: ChartPoint[] = [];
        tsMap.forEach((mw, ts) => history.push({ timestamp: ts, output_mw: mw }));
        history.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

        plantDataList.push({
          name: plant.name,
          output_mw: totalMw,
          history,
        });
      }

      // Section total: for hydro, use "Total Hydro" to avoid double-counting
      let sectionTotal: number;
      if (section.id === 'hydro') {
        const totalHydro = plantDataList.find((p) => p.name === 'Total Hydro');
        sectionTotal = totalHydro ? totalHydro.output_mw : 0;
      } else {
        sectionTotal = plantDataList.reduce((s, p) => s + p.output_mw, 0);
      }

      return { section, plants: plantDataList, total: sectionTotal };
    });
  }, [generators, genHistory]);

  // Filter out sections with no data at all
  const visibleSections = sectionData.filter(
    (s) => s.plants.some((p) => p.output_mw > 0 || p.history.length > 0),
  );

  return (
    <Card className={styles.card}>
      <h2 className={styles.header}>GENERATION BY RESOURCE</h2>
      {loading ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : (
        <div className={styles.content}>
          {visibleSections.map(({ section, plants, total }) => (
            <div key={section.id} className={styles.fuelSection}>
              <div
                className={styles.sectionHeader}
                style={{
                  background: section.bgColor,
                  borderLeft: `3px solid ${section.color}`,
                }}
              >
                <span className={styles.fuelLabel} style={{ color: section.color }}>
                  {section.label}
                </span>
                <span className={styles.fuelTotal} style={{ color: section.color }}>
                  {Math.round(total).toLocaleString()}
                </span>
              </div>
              <div className={styles.plantGrid}>
                {plants.map((plant) => (
                  <PlantChart
                    key={plant.name}
                    plant={plant}
                    color={section.color}
                    hideYAxis={viewportWidth <= 1024 && viewportWidth > 900}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Plant chart card
// ---------------------------------------------------------------------------

function PlantChart({ plant, color, hideYAxis }: { plant: PlantData; color: string; hideYAxis: boolean }) {
  const chartData =
    plant.history.length > 0
      ? plant.history
      : [{ timestamp: '', output_mw: plant.output_mw }];

  const mwValues = chartData.map((d) => d.output_mw);
  const dataMax = Math.max(...mwValues);
  // Y-axis always starts at 0 for honest scaling
  const yMax = Math.ceil(dataMax * 1.1) || 1;

  return (
    <div className={styles.plantCard}>
      <div className={styles.plantHeader}>
        <span className={styles.plantName}>{plant.name}</span>
        <span className={styles.plantMw} style={{ color }}>
          {Math.round(plant.output_mw).toLocaleString()}
        </span>
      </div>
      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height={90}>
          <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#21262D" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTime}
              tick={{
                fontSize: 8,
                fill: '#8B949E',
                fontFamily: "'JetBrains Mono', monospace",
              }}
              axisLine={{ stroke: '#30363D' }}
              tickLine={false}
              interval={0}
            />
            {!hideYAxis && (
              <YAxis
                domain={[0, yMax]}
                tick={{
                  fontSize: 8,
                  fill: '#8B949E',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
                axisLine={{ stroke: '#30363D' }}
                tickLine={false}
                width={36}
                tickFormatter={(v: number) => `${v}`}
              />
            )}
            <Tooltip
              contentStyle={{
                background: '#161B22',
                border: '1px solid #30363D',
                borderRadius: 0,
                fontSize: '10px',
              }}
              formatter={(value) => [`${Math.round(value as number).toLocaleString()} MW`, 'Output']}
            />
            <Area
              type="monotone"
              dataKey="output_mw"
              stroke={color}
              fill={color}
              fillOpacity={0.1}
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
