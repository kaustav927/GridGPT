'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Spinner, HTMLTable } from '@blueprintjs/core';
import { ResponsivePie } from '@nivo/pie';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Dot,
} from 'recharts';
import styles from './FuelMix.module.css';
import cardStyles from './Card.module.css';
import Tooltip from './Tooltip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FuelMixData {
  fuel_type: string;
  output_mw: number;
  percentage: number;
  capacity_mw?: number;
  utilization?: number;
}

interface ApiResponse {
  data: FuelMixData[];
  total_mw: number;
  data_timestamp: string;
  is_approximate: boolean;
}

interface IntertieData {
  flow_group: string;
  actual_mw: number;
}

interface MarketHistoryResponse {
  demand: { timestamp: string; demand_mw: number }[];
  supply: { timestamp: string; total_mw: number }[];
}

interface NivoPieData {
  id: string;
  label: string;
  value: number;
  color: string;
  percentage?: number;
}

interface RadarDataPoint {
  fuel: string;
  fuelType: string;
  output: number;
  fullMark: number;
}

type ViewMode = 'donut' | 'table' | 'radar';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FUEL_COLORS: Record<string, string> = {
  NUCLEAR: '#3FB950',
  HYDRO: '#58A6FF',
  GAS: '#D29922',
  WIND: '#39D5FF',
  SOLAR: '#F0883E',  // Distinct orange for Solar (different from Gas)
  BIOFUEL: '#8B949E',
  OTHER: '#6E7681',
};

const FUEL_LABELS: Record<string, string> = {
  NUCLEAR: 'Nuclear',
  HYDRO: 'Hydro',
  GAS: 'Gas',
  WIND: 'Wind',
  SOLAR: 'Solar',
  BIOFUEL: 'Biofuel',
  OTHER: 'Other',
};

// Reverse mapping: label -> fuel_type
const LABEL_TO_FUEL: Record<string, string> = Object.fromEntries(
  Object.entries(FUEL_LABELS).map(([k, v]) => [v, k])
);

const ENERGY_FLOW_COLORS = {
  consumption: '#3FB950',  // Green
  exports: '#58A6FF',      // Blue
  losses: '#6E7681',       // Gray
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAsOfTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-CA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Toronto',
  }) + ' EST';
}

// Nivo theme for Palantir dark style
const nivoTheme = {
  background: 'transparent',
  text: {
    fontSize: 11,
    fill: '#C9D1D9',
  },
  tooltip: {
    container: {
      background: '#161B22',
      border: '1px solid #30363D',
      borderRadius: 0,
      color: '#C9D1D9',
      fontSize: '11px',
      padding: '8px 12px',
    },
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FuelMix() {
  const [data, setData] = useState<FuelMixData[]>([]);
  const [total, setTotal] = useState(0);
  const [dataTimestamp, setDataTimestamp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFuel, setSelectedFuel] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('donut');

  // Energy flow data for inner ring
  const [demandMw, setDemandMw] = useState(0);
  const [exportMw, setExportMw] = useState(0);  // Gross exports (positive flows)
  const [importMw, setImportMw] = useState(0);  // Gross imports (negative flows as positive)

  const fetchData = async () => {
    try {
      const [fuelRes, intertieRes, marketRes] = await Promise.all([
        fetch('/api/fuel-mix'),
        fetch('/api/interties'),
        fetch('/api/market/history?hours=1'),
      ]);

      const fuelJson: ApiResponse = await fuelRes.json();
      setData(fuelJson.data);
      setTotal(fuelJson.total_mw);
      setDataTimestamp(fuelJson.data_timestamp);

      // Get exports and imports from interties
      // IESO convention: positive = export from Ontario, negative = import into Ontario
      const intertieJson: { data: IntertieData[] } = await intertieRes.json();
      const totalExports = intertieJson.data
        .filter((d) => d.actual_mw > 0)
        .reduce((sum, d) => sum + d.actual_mw, 0);
      const totalImports = intertieJson.data
        .filter((d) => d.actual_mw < 0)
        .reduce((sum, d) => sum + Math.abs(d.actual_mw), 0);
      setExportMw(totalExports);
      setImportMw(totalImports);

      // Get latest demand
      const marketJson: MarketHistoryResponse = await marketRes.json();
      if (marketJson.demand && marketJson.demand.length > 0) {
        const latestDemand = marketJson.demand[marketJson.demand.length - 1];
        setDemandMw(latestDemand.demand_mw);
      }
    } catch (error) {
      console.error('Failed to fetch fuel mix data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Calculate net exports and losses
  // Energy balance: Supply = Demand + Net_Exports + Losses
  // Net Exports = Exports - Imports (positive = net exporter, negative = net importer)
  const netExportMw = useMemo(() => exportMw - importMw, [exportMw, importMw]);

  // Losses = Supply - Demand - Net_Exports
  const lossesMw = useMemo(() => {
    const calculated = total - demandMw - netExportMw;
    // Ensure non-negative (data timing differences can cause small negatives)
    return Math.max(0, calculated);
  }, [total, demandMw, netExportMw]);

  // Transform data for Nivo outer ring (fuel mix)
  const outerPieData: NivoPieData[] = useMemo(() => {
    return data.map((d) => {
      const baseColor = FUEL_COLORS[d.fuel_type] || '#8B949E';
      const color =
        selectedFuel && selectedFuel !== d.fuel_type
          ? baseColor + '4D' // ~30% opacity
          : baseColor;
      return {
        id: d.fuel_type,
        label: FUEL_LABELS[d.fuel_type] || d.fuel_type,
        value: d.output_mw,
        color,
        percentage: d.percentage,
      };
    });
  }, [data, selectedFuel]);

  // Transform data for Nivo inner ring (energy flow)
  // Shows: Ontario Consumption, Net Exports (or Net Imports if negative), and Losses
  const innerPieData: NivoPieData[] = useMemo(() => {
    const items: NivoPieData[] = [
      {
        id: 'Consumption',
        label: 'Ontario Consumption',
        value: demandMw,
        color: ENERGY_FLOW_COLORS.consumption,
      },
    ];

    // Add net exports or net imports depending on direction
    if (netExportMw > 0) {
      items.push({
        id: 'Net Exports',
        label: 'Net Exports',
        value: netExportMw,
        color: ENERGY_FLOW_COLORS.exports,
      });
    } else if (netExportMw < 0) {
      // Net imports - Ontario is receiving more than sending
      items.push({
        id: 'Net Imports',
        label: 'Net Imports',
        value: Math.abs(netExportMw),
        color: '#A371F7',  // Purple for imports (distinct from exports blue)
      });
    }

    // Add losses if positive
    if (lossesMw > 0) {
      items.push({
        id: 'Losses',
        label: 'Transmission Losses',
        value: lossesMw,
        color: ENERGY_FLOW_COLORS.losses,
      });
    }

    return items.filter((d) => d.value > 0);
  }, [demandMw, netExportMw, lossesMw]);

  // Radar chart data - include fuelType for click handling
  const radarData: RadarDataPoint[] = useMemo(() => {
    return data.map((d) => ({
      fuel: FUEL_LABELS[d.fuel_type] || d.fuel_type,
      fuelType: d.fuel_type,
      output: d.output_mw,
      fullMark: Math.max(...data.map((x) => x.output_mw)) * 1.1,
    }));
  }, [data]);

  const displayValue = selectedFuel
    ? data.find((d) => d.fuel_type === selectedFuel)?.output_mw || 0
    : total;

  const displayLabel = selectedFuel
    ? FUEL_LABELS[selectedFuel] || selectedFuel
    : 'Total Output';

  const handlePieClick = (node: { id: string | number }) => {
    const fuelType = String(node.id);
    setSelectedFuel(selectedFuel === fuelType ? null : fuelType);
  };

  // Handle click on card background to deselect
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // Only deselect if clicking directly on the card content area (not on charts/buttons)
    const target = e.target as HTMLElement;
    if (
      target.classList.contains(styles.chartContainer) ||
      target.classList.contains(styles.radarContainer) ||
      target.classList.contains(styles.contentArea)
    ) {
      setSelectedFuel(null);
    }
  }, []);

  // Handle radar point click
  const handleRadarClick = useCallback((fuelLabel: string) => {
    const fuelType = LABEL_TO_FUEL[fuelLabel];
    if (fuelType) {
      setSelectedFuel(selectedFuel === fuelType ? null : fuelType);
    }
  }, [selectedFuel]);

  // Custom dot renderer for radar chart with click handling
  const renderCustomDot = useCallback((props: {
    cx?: number;
    cy?: number;
    payload?: RadarDataPoint;
    index?: number;
  }) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy || !payload) return null;

    const isSelected = selectedFuel === payload.fuelType;
    const color = FUEL_COLORS[payload.fuelType] || '#3FB950';

    return (
      <Dot
        cx={cx}
        cy={cy}
        r={isSelected ? 8 : 5}
        fill={isSelected ? color : '#3FB950'}
        stroke={isSelected ? '#fff' : 'none'}
        strokeWidth={isSelected ? 2 : 0}
        style={{ cursor: 'pointer' }}
        onClick={() => handleRadarClick(payload.fuel)}
      />
    );
  }, [selectedFuel, handleRadarClick]);

  // ---------------------------------------------------------------------------
  // Render Views
  // ---------------------------------------------------------------------------

  const renderDonutView = () => (
    <div className={styles.donutWrapper}>
      <div className={styles.chartContainer} onClick={handleCardClick}>
        {/* Outer ring - Fuel Mix */}
        <ResponsivePie
          data={outerPieData}
          id="id"
          value="value"
          innerRadius={0.55}
          padAngle={0.5}
          cornerRadius={0}
          colors={{ datum: 'data.color' }}
          borderWidth={0}
          enableArcLabels={false}
          enableArcLinkLabels={false}
          isInteractive={true}
          onClick={handlePieClick}
          activeOuterRadiusOffset={0}  // Fixed: no overflow on hover
          theme={nivoTheme}
          animate={true}
          motionConfig="gentle"
          tooltip={({ datum }) => {
            const pct = datum.data.percentage ?? (datum.value / total) * 100;
            return (
              <div
                style={{
                  background: '#161B22',
                  border: '1px solid #30363D',
                  padding: '8px 12px',
                  color: '#C9D1D9',
                  fontSize: '11px',
                }}
              >
                <strong style={{ color: FUEL_COLORS[datum.id] || '#8B949E' }}>
                  {datum.label}
                </strong>
                <br />
                {Math.round(datum.value).toLocaleString()} MW ({pct.toFixed(1)}%)
              </div>
            );
          }}
        />

        {/* Inner ring - Energy Flow (positioned absolutely) */}
        {innerPieData.length > 0 && (
          <div className={styles.innerRingContainer}>
            <ResponsivePie
              data={innerPieData}
              id="id"
              value="value"
              innerRadius={0.45}
              padAngle={1}
              cornerRadius={0}
              colors={{ datum: 'data.color' }}
              borderWidth={0}
              enableArcLabels={false}
              enableArcLinkLabels={false}
              isInteractive={true}
              activeOuterRadiusOffset={0}
              theme={nivoTheme}
              animate={true}
              motionConfig="gentle"
              margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
              tooltip={({ datum }) => {
                const pct = (datum.value / total) * 100;
                return (
                  <div
                    style={{
                      background: '#161B22',
                      border: '1px solid #30363D',
                      padding: '8px 12px',
                      color: '#C9D1D9',
                      fontSize: '11px',
                    }}
                  >
                    <strong style={{ color: datum.data.color }}>{datum.label}</strong>
                    <br />
                    {Math.round(datum.value).toLocaleString()} MW ({pct.toFixed(1)}%)
                  </div>
                );
              }}
            />
          </div>
        )}
      </div>

      {/* Output label below chart (2 lines like radar) */}
      <div className={styles.outputLabel}>
        <span className={styles.outputLabelText}>{displayLabel}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className={styles.outputLabelValue}>
            ~{Math.round(displayValue).toLocaleString()} MW
          </span>
          {!selectedFuel && (
            <Tooltip content="IESO-registered generators only — excludes embedded generation (rooftop solar, small plants) included in Market Overview supply." position="top">
              <span style={{ fontSize: '11px', color: '#8B949E', cursor: 'help', opacity: 0.6 }}>ℹ</span>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );

  const renderTableView = () => (
    <div className={styles.tableContainer}>
      <HTMLTable bordered striped compact className={styles.table}>
        <thead>
          <tr>
            <th>Fuel</th>
            <th style={{ textAlign: 'center' }}>Output</th>
            <th style={{ textAlign: 'center' }} className={styles.capacityColumn}>
              Capacity
            </th>
            <th>Utilization</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const color = FUEL_COLORS[row.fuel_type] || '#8B949E';
            const utilization = Math.min(row.utilization || 0, 100);
            return (
              <tr key={row.fuel_type}>
                <td>
                  <span style={{ color }}>{FUEL_LABELS[row.fuel_type] || row.fuel_type}</span>
                </td>
                <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(row.output_mw).toLocaleString()}
                </td>
                <td
                  style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
                  className={styles.capacityColumn}
                >
                  {row.capacity_mw ? Math.round(row.capacity_mw).toLocaleString() : '—'}
                </td>
                <td>
                  <div className={styles.utilizationCell}>
                    <div className={styles.utilizationBar}>
                      <div
                        className={styles.utilizationFill}
                        style={{
                          width: `${utilization}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                    <span className={styles.utilizationText}>
                      {utilization > 0 ? `${Math.round(utilization)}%` : '—'}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </HTMLTable>

      {/* Energy flow summary below table */}
      <div className={styles.energyFlowSummary}>
        <div className={styles.flowItem}>
          <span
            className={styles.flowDot}
            style={{ backgroundColor: ENERGY_FLOW_COLORS.consumption }}
          />
          <span className={styles.flowLabel}>Consumption</span>
          <span className={styles.flowValue}>
            {Math.round(demandMw).toLocaleString()} MW
          </span>
        </div>
        <div className={styles.flowItem}>
          <span
            className={styles.flowDot}
            style={{ backgroundColor: netExportMw >= 0 ? ENERGY_FLOW_COLORS.exports : '#A371F7' }}
          />
          <span className={styles.flowLabel}>
            {netExportMw >= 0 ? 'Net Exports' : 'Net Imports'}
          </span>
          <span className={styles.flowValue}>
            {Math.round(Math.abs(netExportMw)).toLocaleString()} MW
          </span>
        </div>
        <div className={styles.flowItem}>
          <span
            className={styles.flowDot}
            style={{ backgroundColor: ENERGY_FLOW_COLORS.losses }}
          />
          <span className={styles.flowLabel}>Losses</span>
          <span className={styles.flowValue}>
            {Math.round(lossesMw).toLocaleString()} MW
          </span>
        </div>
      </div>
    </div>
  );

  const renderRadarView = () => (
    <div className={styles.radarContainer} onClick={handleCardClick}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="#30363D" />
          <PolarAngleAxis
            dataKey="fuel"
            tick={({ x, y, payload }) => {
              const fuelType = LABEL_TO_FUEL[payload.value];
              const isSelected = selectedFuel === fuelType;
              return (
                <text
                  x={x}
                  y={y}
                  fill={isSelected ? '#fff' : '#C9D1D9'}
                  fontSize={isSelected ? 11 : 10}
                  fontWeight={isSelected ? 600 : 400}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleRadarClick(payload.value)}
                >
                  {payload.value}
                </text>
              );
            }}
            tickLine={false}
          />
          <Radar
            name="Output (MW)"
            dataKey="output"
            stroke={selectedFuel ? FUEL_COLORS[selectedFuel] || '#3FB950' : '#3FB950'}
            fill={selectedFuel ? FUEL_COLORS[selectedFuel] || '#3FB950' : '#3FB950'}
            fillOpacity={0.25}
            strokeWidth={2}
            dot={renderCustomDot}
          />
          <RechartsTooltip
            contentStyle={{
              background: '#161B22',
              border: '1px solid #30363D',
              borderRadius: 0,
              fontSize: '11px',
              color: '#C9D1D9',
            }}
            formatter={(value) => [
              `${Math.round(Number(value)).toLocaleString()} MW`,
              'Output',
            ]}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Output label below radar */}
      <div className={styles.outputLabel}>
        <span className={styles.outputLabelText}>{displayLabel}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className={styles.outputLabelValue}>
            ~{Math.round(displayValue).toLocaleString()} MW
          </span>
          {!selectedFuel && (
            <Tooltip content="IESO-registered generators only — excludes embedded generation (rooftop solar, small plants) included in Market Overview supply." position="top">
              <span style={{ fontSize: '11px', color: '#8B949E', cursor: 'help', opacity: 0.6 }}>ℹ</span>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className={styles.headerRight}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Tooltip content="Pie chart showing generation by fuel type" position="bottom">
            <button
              className={viewMode === 'donut' ? cardStyles.toggleBtnActive : cardStyles.toggleBtn}
              onClick={() => setViewMode('donut')}
            >
              Donut
            </button>
          </Tooltip>
          <Tooltip content="Detailed table with output, capacity, and utilization" position="bottom">
            <button
              className={viewMode === 'table' ? cardStyles.toggleBtnActive : cardStyles.toggleBtn}
              onClick={() => setViewMode('table')}
            >
              Table
            </button>
          </Tooltip>
          <Tooltip content="Radar chart comparing fuel type contributions" position="bottom">
            <button
              className={viewMode === 'radar' ? cardStyles.toggleBtnActive : cardStyles.toggleBtn}
              onClick={() => setViewMode('radar')}
            >
              Radar
            </button>
          </Tooltip>
        </div>
        {dataTimestamp && (
          <span className={styles.asOfTime}>As of {formatAsOfTime(dataTimestamp)}</span>
        )}
      </div>

      {loading ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : (
        <div className={styles.contentArea}>
          {viewMode === 'donut' && renderDonutView()}
          {viewMode === 'table' && renderTableView()}
          {viewMode === 'radar' && renderRadarView()}
        </div>
      )}
    </>
  );
}
