'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, ButtonGroup, Button } from '@blueprintjs/core';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import styles from './Card.module.css';
import type { MarketHistoryResponse } from '@/lib/types';

type TimeRange = '1H' | '6H' | '24H';

const TIME_RANGE_HOURS: Record<TimeRange, number> = {
  '1H': 1,
  '6H': 6,
  '24H': 24,
};

// Interval in milliseconds for each time range
const TIME_RANGE_INTERVAL: Record<TimeRange, number> = {
  '1H': 5 * 60 * 1000,   // 5 minutes
  '6H': 15 * 60 * 1000,  // 15 minutes
  '24H': 30 * 60 * 1000, // 30 minutes
};

interface ChartDataPoint {
  timestamp: number;
  time: string;
  demand_mw: number | null;
  grid_load_mw: number | null;
  price: number | null;
  supply_mw: number | null;
}

const formatTimeLabel = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Toronto',
  });
};

const formatNumber = (value: number): string => {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

const formatPrice = (value: number): string => {
  return `$${value.toFixed(2)}`;
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey: string;
    value: number | null;
    color: string;
    name: string;
  }>;
  label?: number;
}

// Legend item with tooltip
interface LegendItemProps {
  color: string;
  label: string;
  value: number | null;
  tooltip: string;
  isPrice?: boolean;
}

const LegendItem = ({ color, label, value, tooltip, isPrice }: LegendItemProps) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div style={{ width: 12, height: 2, background: color }} />
      <span style={{ color: '#8B949E', cursor: 'help' }}>{label}</span>
      {value !== null && (
        <span style={{ color, fontWeight: 600 }}>
          {isPrice ? formatPrice(value) : `${formatNumber(value)} MW`}
        </span>
      )}
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: '6px',
            padding: '6px 10px',
            background: '#161B22',
            border: '1px solid #30363D',
            fontSize: '9px',
            color: '#8B949E',
            whiteSpace: 'nowrap',
            zIndex: 1000,
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload || !payload.length || label === undefined) return null;

  const timeStr = formatTimeLabel(label);

  return (
    <div
      style={{
        background: '#161B22',
        border: '1px solid #30363D',
        padding: '10px 14px',
        fontSize: '11px',
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      <div style={{ color: '#8B949E', marginBottom: '8px' }}>{timeStr}</div>
      {payload.map((entry) => {
        if (entry.value === null || entry.value === undefined) return null;
        return (
          <div
            key={entry.dataKey}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '16px',
              color: entry.color,
              marginBottom: '4px',
            }}
          >
            <span>{entry.name}:</span>
            <span style={{ fontWeight: 600 }}>
              {entry.dataKey === 'price'
                ? formatPrice(entry.value)
                : `${formatNumber(entry.value)} MW`}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// Find nearest value in a sorted array of {timestamp, value} objects
const findNearestValue = <T extends { timestamp: string }>(
  data: T[],
  targetTime: number,
  valueKey: keyof T,
  maxDiff: number = 10 * 60 * 1000 // 10 minutes default
): number | null => {
  if (data.length === 0) return null;

  let closest: { diff: number; value: number | null } = { diff: Infinity, value: null };

  for (const item of data) {
    const itemTime = new Date(item.timestamp).getTime();
    const diff = Math.abs(itemTime - targetTime);

    if (diff < closest.diff && diff <= maxDiff) {
      closest = { diff, value: item[valueKey] as number };
    }
  }

  return closest.value;
};

export default function MarketChart() {
  const [timeRange, setTimeRange] = useState<TimeRange>('6H');
  const [rawData, setRawData] = useState<MarketHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const hours = TIME_RANGE_HOURS[timeRange];
      const response = await fetch(`/api/market/history?hours=${hours}`);

      if (!response.ok) {
        throw new Error('Failed to fetch market data');
      }

      const result: MarketHistoryResponse = await response.json();
      setRawData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Process data into unified time series
  const chartData = useMemo((): ChartDataPoint[] => {
    if (!rawData) return [];

    const hours = TIME_RANGE_HOURS[timeRange];
    const interval = TIME_RANGE_INTERVAL[timeRange];
    const now = Date.now();
    const startTime = now - hours * 60 * 60 * 1000;

    // Generate uniform time series
    const points: ChartDataPoint[] = [];

    // Determine max diff based on time range
    const maxDiff = interval * 1.5; // Allow 1.5x the interval for matching
    // Supply data is hourly, so always use 1 hour tolerance regardless of chart interval
    const supplyMaxDiff = 60 * 60 * 1000; // 1 hour in milliseconds

    for (let t = startTime; t <= now; t += interval) {
      const demand = findNearestValue(rawData.demand, t, 'demand_mw', maxDiff);
      const gridLoad = findNearestValue(rawData.gridLoad || [], t, 'grid_load_mw', maxDiff);
      const price = findNearestValue(rawData.price, t, 'price', maxDiff);
      const supply = findNearestValue(rawData.supply, t, 'total_mw', supplyMaxDiff);

      points.push({
        timestamp: t,
        time: formatTimeLabel(t),
        demand_mw: demand,
        grid_load_mw: gridLoad,
        price: price,
        supply_mw: supply,
      });
    }

    return points;
  }, [rawData, timeRange]);

  // Calculate stats for display
  const stats = useMemo(() => {
    const validDemand = chartData.filter(d => d.demand_mw !== null);
    const validGridLoad = chartData.filter(d => d.grid_load_mw !== null);
    const validPrice = chartData.filter(d => d.price !== null);
    const validSupply = chartData.filter(d => d.supply_mw !== null);

    const currentDemand = validDemand.length > 0 ? validDemand[validDemand.length - 1]?.demand_mw : null;
    const currentGridLoad = validGridLoad.length > 0 ? validGridLoad[validGridLoad.length - 1]?.grid_load_mw : null;
    const currentPrice = validPrice.length > 0 ? validPrice[validPrice.length - 1]?.price : null;
    const currentSupply = validSupply.length > 0 ? validSupply[validSupply.length - 1]?.supply_mw : null;
    const avgPrice = validPrice.length > 0
      ? validPrice.reduce((sum, d) => sum + (d.price || 0), 0) / validPrice.length
      : null;

    return { currentDemand, currentGridLoad, currentPrice, currentSupply, avgPrice };
  }, [chartData]);

  // Check if we have any data
  const hasData = chartData.some(d => d.demand_mw !== null || d.price !== null);
  const hasGridLoad = chartData.some(d => d.grid_load_mw !== null);
  const hasSupply = chartData.some(d => d.supply_mw !== null);

  // Calculate tick count based on time range
  const tickCount = timeRange === '1H' ? 6 : timeRange === '6H' ? 8 : 12;

  return (
    <Card className={styles.card} style={{ height: 320 }}>
      <div className={styles.headerRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h2 className={styles.header}>MARKET OVERVIEW</h2>
          <ButtonGroup minimal>
            {(['1H', '6H', '24H'] as TimeRange[]).map((range) => (
              <Button
                key={range}
                text={range}
                active={timeRange === range}
                onClick={() => setTimeRange(range)}
                style={{
                  fontSize: '10px',
                  padding: '2px 8px',
                  minHeight: 'auto',
                  background: timeRange === range ? '#30363D' : 'transparent',
                  color: timeRange === range ? '#E6EDF3' : '#8B949E',
                }}
              />
            ))}
          </ButtonGroup>
        </div>
        <div style={{ display: 'flex', gap: '16px', fontSize: '10px', alignItems: 'center' }}>
          <LegendItem
            color="#39D5FF"
            label="Demand"
            value={stats.currentDemand}
            tooltip="Ontario's internal electricity consumption"
          />
          {hasGridLoad && (
            <LegendItem
              color="#A371F7"
              label="Grid Load"
              value={stats.currentGridLoad}
              tooltip="Supply minus transmission losses"
            />
          )}
          {hasSupply && (
            <LegendItem
              color="#3FB950"
              label="Supply"
              value={stats.currentSupply}
              tooltip="Total generation dispatched to the grid"
            />
          )}
          <LegendItem
            color="#D29922"
            label="Price"
            value={stats.currentPrice}
            isPrice
            tooltip="Average Ontario electricity price"
          />
          {stats.avgPrice !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#8B949E' }}>Avg:</span>
              <span style={{ color: '#8B949E', fontWeight: 600 }}>
                {formatPrice(stats.avgPrice)}
              </span>
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className={styles.placeholder} style={{ color: '#F85149' }}>
          Error: {error}
        </div>
      ) : loading && chartData.length === 0 ? (
        <div className={styles.placeholder}>Loading market data...</div>
      ) : !hasData ? (
        <div className={styles.placeholder}>No data available for selected time range</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 60, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="demandGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#39D5FF" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#39D5FF" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gridLoadGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#A371F7" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#A371F7" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="supplyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3FB950" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3FB950" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
              tickFormatter={formatTimeLabel}
              stroke="#8B949E"
              style={{ fontSize: '9px' }}
              tickLine={false}
              tickCount={tickCount}
            />
            <YAxis
              yAxisId="left"
              stroke="#8B949E"
              style={{ fontSize: '9px' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              domain={['auto', 'auto']}
              width={45}
              label={{
                value: 'MW',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: '9px', fill: '#8B949E' },
                offset: 10,
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#8B949E"
              style={{ fontSize: '9px' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `$${value.toFixed(0)}`}
              domain={['auto', 'auto']}
              width={50}
              label={{
                value: '$/MWh',
                angle: 90,
                position: 'insideRight',
                style: { fontSize: '9px', fill: '#8B949E' },
                offset: 10,
              }}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Zero line for price (negative prices are possible) */}
            <ReferenceLine
              yAxisId="right"
              y={0}
              stroke="#30363D"
              strokeDasharray="3 3"
            />

            {/* Supply area (background) - only if data exists */}
            {hasSupply && (
              <Area
                yAxisId="left"
                type="stepAfter"
                dataKey="supply_mw"
                stroke="#3FB950"
                fill="url(#supplyGradient)"
                strokeWidth={1}
                name="Supply"
                connectNulls
                isAnimationActive={false}
              />
            )}

            {/* Grid Load line - only if data exists */}
            {hasGridLoad && (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="grid_load_mw"
                stroke="#A371F7"
                fill="url(#gridLoadGradient)"
                strokeWidth={1.5}
                name="Grid Load"
                connectNulls
                isAnimationActive={false}
              />
            )}

            {/* Demand line with area fill */}
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="demand_mw"
              stroke="#39D5FF"
              fill="url(#demandGradient)"
              strokeWidth={2}
              name="Demand"
              connectNulls
              isAnimationActive={false}
            />

            {/* Price line */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="price"
              stroke="#D29922"
              strokeWidth={1.5}
              dot={false}
              name="Price"
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
