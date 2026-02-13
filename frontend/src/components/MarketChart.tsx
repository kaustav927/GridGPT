'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Tooltip from './Tooltip';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import styles from './Card.module.css';
import type { MarketHistoryResponse, DayAheadResponse, PeakDemandResponse } from '@/lib/types';

type TimeRange = '1H' | 'Today';

const TIME_RANGE_HOURS: Record<TimeRange, number> = {
  '1H': 1,
  'Today': 24,
};

// Interval in milliseconds for each time range
const TIME_RANGE_INTERVAL: Record<TimeRange, number> = {
  '1H': 5 * 60 * 1000,   // 5 minutes
  'Today': 30 * 60 * 1000, // 30 minutes
};

// Get today's boundaries in Eastern timezone (00:00 to 24:00)
const getEasternDayBounds = (): { startOfDay: number; endOfDay: number } => {
  const now = new Date();
  const easternDateStr = now.toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto'
  });
  const [year, month, day] = easternDateStr.split('-').map(Number);

  // Check if DST is active by comparing current offset to standard offset
  const jan = new Date(year, 0, 1);
  const jul = new Date(year, 6, 1);
  const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  const isDST = now.getTimezoneOffset() < stdOffset;
  const utcOffsetHours = isDST ? 4 : 5; // EDT = UTC-4, EST = UTC-5

  const startOfDay = Date.UTC(year, month - 1, day, utcOffsetHours, 0, 0, 0);
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

  return { startOfDay, endOfDay };
};

interface ChartDataPoint {
  timestamp: number;
  time: string;
  demand_mw: number | null;
  grid_load_mw: number | null;
  price: number | null;
  supply_mw: number | null;
  da_demand_mw?: number | null;
  da_supply_mw?: number | null;
  da_price?: number | null;
}

// Visibility state for each line
interface LineVisibility {
  demand: boolean;
  gridLoad: boolean;
  supply: boolean;
  price: boolean;
  projDemand: boolean;
  projSupply: boolean;
  projPrice: boolean;
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

// Get current hour in Eastern timezone
const getEasternHour = (): number => {
  const now = new Date();
  return parseInt(now.toLocaleString('en-US', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'America/Toronto'
  }));
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

// Legend item with tooltip and click-to-toggle
interface LegendItemProps {
  color: string;
  label: string;
  value: number | null;
  tooltip: string;
  isPrice?: boolean;
  isDotted?: boolean;
  isVisible?: boolean;
  onToggle?: () => void;
}

const LegendItem = ({ color, label, value, tooltip, isPrice, isDotted, isVisible = true, onToggle }: LegendItemProps) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        position: 'relative',
        cursor: onToggle ? 'pointer' : 'default',
        opacity: isVisible ? 1 : 0.4,
        transition: 'opacity 0.15s ease',
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        style={{
          width: 12,
          height: 2,
          background: isDotted
            ? `repeating-linear-gradient(90deg, ${color} 0, ${color} 3px, transparent 3px, transparent 6px)`
            : color,
        }}
      />
      <span style={{ color: '#8B949E', cursor: onToggle ? 'pointer' : 'help' }}>{label}</span>
      {value !== null && isVisible && (
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
          {onToggle ? `${tooltip} (click to toggle)` : tooltip}
        </div>
      )}
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload || !payload.length || label === undefined) return null;

  const d = new Date(label);
  const timeStr = d.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'America/Toronto',
  }) + ' EST';

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
              {entry.dataKey === 'price' || entry.dataKey === 'da_price'
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
  const [timeRange, setTimeRange] = useState<TimeRange>('Today');
  const [showDayAhead, setShowDayAhead] = useState(false);
  const [forecastTarget, setForecastTarget] = useState<'today' | 'tomorrow'>('today');
  const [rawData, setRawData] = useState<MarketHistoryResponse | null>(null);
  const [daData, setDaData] = useState<DayAheadResponse | null>(null);
  const [peakData, setPeakData] = useState<PeakDemandResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 900);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Check if tomorrow's forecast data is available (published after 13:00 ET)
  const isTomorrowAvailable = useMemo(() => {
    return getEasternHour() >= 13;
  }, []);

  // Line visibility state - projection demand and price ON by default
  const [visibleLines, setVisibleLines] = useState<LineVisibility>({
    demand: true,
    gridLoad: true,
    supply: true,
    price: true,
    projDemand: true,   // ON by default
    projSupply: false,  // OFF by default (less clutter)
    projPrice: true,    // ON by default
  });

  const toggleLine = (key: keyof LineVisibility) => {
    setVisibleLines(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const hours = TIME_RANGE_HOURS[timeRange];

      // Fetch main market data
      const response = await fetch(`/api/market/history?hours=${hours}`);
      if (!response.ok) {
        throw new Error('Failed to fetch market data');
      }
      const result: MarketHistoryResponse = await response.json();
      setRawData(result);

      // Fetch peak demand data
      try {
        const peakResponse = await fetch('/api/peak-demand');
        if (peakResponse.ok) {
          const peakResult: PeakDemandResponse = await peakResponse.json();
          setPeakData(peakResult);
        }
      } catch {
        // Peak data is optional, don't fail if unavailable
      }

      // Fetch day-ahead data if toggle is on
      if (showDayAhead) {
        try {
          const daResponse = await fetch(`/api/market/day-ahead?date=${forecastTarget}`);
          if (daResponse.ok) {
            const daResult: DayAheadResponse = await daResponse.json();
            setDaData(daResult);
          }
        } catch {
          // DA data is optional, don't fail if unavailable
        }
      } else {
        setDaData(null);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [timeRange, showDayAhead, forecastTarget]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Calculate chart time bounds based on time range
  const chartBounds = useMemo(() => {
    const now = Date.now();

    if (timeRange === 'Today') {
      // Fixed day: 00:00 to 24:00 Eastern
      const { startOfDay, endOfDay } = getEasternDayBounds();
      return { startTime: startOfDay, endTime: endOfDay };
    } else {
      // 1H: rolling window
      return {
        startTime: now - 60 * 60 * 1000,
        endTime: now
      };
    }
  }, [timeRange]);

  // Generate X-axis ticks based on time range
  const xAxisTicks = useMemo(() => {
    if (timeRange === 'Today') {
      // Every hour: 0, 1, 2, ... 24
      const ticks: number[] = [];
      for (let h = 0; h <= 24; h += 1) {
        ticks.push(chartBounds.startTime + h * 60 * 60 * 1000);
      }
      return ticks;
    } else {
      // 1H: Every 15 minutes
      const ticks: number[] = [];
      for (let m = 0; m <= 60; m += 15) {
        ticks.push(chartBounds.startTime + m * 60 * 1000);
      }
      return ticks;
    }
  }, [timeRange, chartBounds]);

  // Process data into unified time series
  const chartData = useMemo((): ChartDataPoint[] => {
    if (!rawData) return [];

    const interval = TIME_RANGE_INTERVAL[timeRange];
    const now = Date.now();
    const { startTime, endTime } = chartBounds;

    // Generate uniform time series
    const points: ChartDataPoint[] = [];

    // Determine max diff based on time range
    const maxDiff = interval * 1.5; // Allow 1.5x the interval for matching
    // Supply data is hourly, so always use 1 hour tolerance regardless of chart interval
    const supplyMaxDiff = 60 * 60 * 1000; // 1 hour in milliseconds

    for (let t = startTime; t <= endTime; t += interval) {
      const isFuture = t > now;

      // Only get actual data for past/present
      const demand = isFuture ? null : findNearestValue(rawData.demand, t, 'demand_mw', maxDiff);
      const gridLoad = isFuture ? null : findNearestValue(rawData.gridLoad || [], t, 'grid_load_mw', maxDiff);
      const price = isFuture ? null : findNearestValue(rawData.price, t, 'price', maxDiff);
      const supply = isFuture ? null : findNearestValue(rawData.supply, t, 'total_mw', supplyMaxDiff);

      // Add day-ahead data if available (for both past comparison and future projection)
      let da_demand: number | null = null;
      let da_supply: number | null = null;
      let da_price: number | null = null;

      if (daData?.data) {
        da_demand = findNearestValue(daData.data, t, 'da_demand_mw', supplyMaxDiff);
        da_supply = findNearestValue(daData.data, t, 'da_supply_mw', supplyMaxDiff);
        da_price = findNearestValue(daData.data, t, 'da_price', supplyMaxDiff);
      }

      points.push({
        timestamp: t,
        time: formatTimeLabel(t),
        demand_mw: demand,
        grid_load_mw: gridLoad,
        price: price,
        supply_mw: supply,
        da_demand_mw: da_demand,
        da_supply_mw: da_supply,
        da_price: da_price,
      });
    }

    return points;
  }, [rawData, daData, timeRange, chartBounds]);

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
  const hasDaData = chartData.some(d => d.da_demand_mw !== null || d.da_price !== null);


  // Dynamic chart title with date
  const chartTitle = useMemo(() => {
    const now = new Date();
    const targetDate = (showDayAhead && forecastTarget === 'tomorrow')
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
      : now;

    const dateStr = targetDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Toronto'
    });

    return dateStr;
  }, [showDayAhead, forecastTarget]);

  return (
    <>
      {/* Controls section */}
      <div className={styles.controls} style={{
        flexShrink: 0,
        overflow: 'visible',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {/* Row 1: Date + Controls + Peak Info */}
        <div className={styles.controlsRow1} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12px', color: '#E6EDF3', fontWeight: 600 }}>{chartTitle}</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <Tooltip content="Last 60 minutes of grid activity" position="bottom">
                <button
                  className={timeRange === '1H' ? styles.toggleBtnActive : styles.toggleBtn}
                  onClick={() => setTimeRange('1H')}
                >
                  1H
                </button>
              </Tooltip>
              <Tooltip content="Full day view from midnight to midnight (EST)" position="bottom">
                <button
                  className={timeRange === 'Today' ? styles.toggleBtnActive : styles.toggleBtn}
                  onClick={() => setTimeRange('Today')}
                >
                  Day
                </button>
              </Tooltip>
            </div>
            <Tooltip content="Show the Day-Ahead Market forecast — IESO's projected supply, demand, and price for the rest of the day" position="bottom">
              <button
                className={showDayAhead ? styles.toggleBtnActive : styles.toggleBtn}
                onClick={() => setShowDayAhead(v => !v)}
              >
                Forecast
              </button>
            </Tooltip>
            {showDayAhead && (
              <div style={{ display: 'flex', gap: '4px' }}>
                <Tooltip content="View today's forecasted supply, demand, and price" position="bottom">
                  <button
                    className={forecastTarget === 'today' ? styles.toggleBtnActive : styles.toggleBtn}
                    onClick={() => setForecastTarget('today')}
                  >
                    Today
                  </button>
                </Tooltip>
                <Tooltip
                  content={
                    isTomorrowAvailable
                      ? "View tomorrow's forecasted supply, demand, and price"
                      : "Tomorrow's forecast is available after 1:30 PM"
                  }
                  position="bottom"
                >
                  <button
                    className={
                      !isTomorrowAvailable
                        ? styles.toggleBtnDisabled
                        : forecastTarget === 'tomorrow'
                          ? styles.toggleBtnActive
                          : styles.toggleBtn
                    }
                    onClick={() => isTomorrowAvailable && setForecastTarget('tomorrow')}
                  >
                    Tomorrow
                  </button>
                </Tooltip>
              </div>
            )}
            {showDayAhead && forecastTarget === 'tomorrow' && !hasDaData && (
              <span style={{ color: '#D29922', fontSize: '9px' }}>
                (data pending)
              </span>
            )}
          </div>
          {peakData && (
            <div style={{ display: 'flex', gap: '12px', fontSize: '9px', color: '#8B949E' }}>
              <span>
                Peak: <span style={{ color: '#39D5FF', fontWeight: 600 }}>
                  {formatNumber(peakData.today.peakMw)} MW
                </span> @ {peakData.today.peakHour}:00
              </span>
              {peakData.tomorrow && (
                <span>
                  Tmrw: <span style={{ color: '#58A6FF', fontWeight: 600 }}>
                    {formatNumber(peakData.tomorrow.peakMw)} MW
                  </span> @ {peakData.tomorrow.peakHour}:00
                </span>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Chart area - flex to fill remaining space */}
      <div className={styles.chartArea} style={{ flex: 1, minHeight: 200 }}>
        {error ? (
          <div className={styles.placeholder} style={{ color: '#F85149' }}>
            Error: {error}
          </div>
        ) : loading && chartData.length === 0 ? (
          <div className={styles.placeholder}>Loading market data...</div>
        ) : !hasData ? (
          <div className={styles.placeholder}>No data available for selected time range</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: isMobile ? 30 : 60, left: isMobile ? 5 : 10, bottom: 0 }}>
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
              domain={[chartBounds.startTime, chartBounds.endTime]}
              scale="time"
              ticks={xAxisTicks}
              tickFormatter={(ts) => {
                if (timeRange === '1H') {
                  // Show HH:MM for 1H view
                  return new Date(ts).toLocaleString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                    timeZone: 'America/Toronto'
                  });
                } else {
                  // Show just hour for Today view (0-24)
                  const hour = new Date(ts).getHours();
                  // Handle midnight edge case: hour 0 at end = 24
                  const displayHour = (ts === chartBounds.endTime && hour === 0) ? 24 : hour;
                  return displayHour.toString();
                }
              }}
              stroke="#8B949E"
              style={{ fontSize: '9px' }}
              tickLine={false}
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
            <RechartsTooltip content={<CustomTooltip />} />

            {/* Zero line for price (negative prices are possible) */}
            <ReferenceLine
              yAxisId="right"
              y={0}
              stroke="#30363D"
              strokeDasharray="3 3"
            />

            {/* Supply area (background) - only if data exists and visible */}
            {hasSupply && visibleLines.supply && (
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

            {/* Grid Load line - only if data exists and visible */}
            {hasGridLoad && visibleLines.gridLoad && (
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

            {/* Demand line with area fill - if visible */}
            {visibleLines.demand && (
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
            )}

            {/* Price line - if visible */}
            {visibleLines.price && (
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
            )}

            {/* Day-Ahead overlay lines (dotted) - conditional on toggle and visibility */}
            {showDayAhead && hasDaData && visibleLines.projDemand && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="da_demand_mw"
                stroke="#39D5FF"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                name={forecastTarget === 'today' ? "Forecast Demand" : "Tomorrow Demand"}
                connectNulls
                isAnimationActive={false}
              />
            )}
            {showDayAhead && hasDaData && visibleLines.projSupply && (
              <Line
                yAxisId="left"
                type="stepAfter"
                dataKey="da_supply_mw"
                stroke="#3FB950"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                name={forecastTarget === 'today' ? "Forecast Supply" : "Tomorrow Supply"}
                connectNulls
                isAnimationActive={false}
              />
            )}
            {showDayAhead && hasDaData && visibleLines.projPrice && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="da_price"
                stroke="#D29922"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                name={forecastTarget === 'today' ? "Forecast Price" : "Tomorrow Price"}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </div>

      {/* Legend - placed after chart for mobile reordering */}
      <div className={styles.legend} style={{ display: 'flex', gap: '12px', fontSize: '9px', alignItems: 'center', flexWrap: 'nowrap' }}>
        <LegendItem
          color="#39D5FF"
          label="Demand"
          value={stats.currentDemand}
          tooltip="Ontario's internal electricity consumption"
          isVisible={visibleLines.demand}
          onToggle={() => toggleLine('demand')}
        />
        {hasGridLoad && (
          <LegendItem
            color="#A371F7"
            label="Grid"
            value={stats.currentGridLoad}
            tooltip="Supply minus transmission losses"
            isVisible={visibleLines.gridLoad}
            onToggle={() => toggleLine('gridLoad')}
          />
        )}
        {hasSupply && (
          <LegendItem
            color="#3FB950"
            label="Supply"
            value={stats.currentSupply}
            tooltip="Total generation dispatched to the grid"
            isVisible={visibleLines.supply}
            onToggle={() => toggleLine('supply')}
          />
        )}
        <LegendItem
          color="#D29922"
          label="Price"
          value={stats.currentPrice}
          isPrice
          tooltip="Average Ontario electricity price"
          isVisible={visibleLines.price}
          onToggle={() => toggleLine('price')}
        />
        {stats.avgPrice !== null && (
          <span style={{ color: '#8B949E' }}>
            Avg: <span style={{ fontWeight: 600 }}>{formatPrice(stats.avgPrice)}</span>
          </span>
        )}
        {showDayAhead && (
          <>
            <div style={{ width: 1, height: 10, background: '#30363D' }} />
            <LegendItem
              color="#39D5FF"
              label="Fcst Demand"
              value={null}
              tooltip={forecastTarget === 'today' ? "Today's forecasted demand (day-ahead)" : "Tomorrow's projected demand forecast"}
              isDotted
              isVisible={visibleLines.projDemand}
              onToggle={() => toggleLine('projDemand')}
            />
            <LegendItem
              color="#3FB950"
              label="Fcst Supply"
              value={null}
              tooltip={forecastTarget === 'today' ? "Today's forecasted supply (day-ahead)" : "Tomorrow's projected supply forecast"}
              isDotted
              isVisible={visibleLines.projSupply}
              onToggle={() => toggleLine('projSupply')}
            />
            <LegendItem
              color="#D29922"
              label="Fcst Price"
              value={null}
              tooltip={forecastTarget === 'today' ? "Today's forecasted price (day-ahead)" : "Tomorrow's projected average price"}
              isDotted
              isPrice
              isVisible={visibleLines.projPrice}
              onToggle={() => toggleLine('projPrice')}
            />
          </>
        )}
      </div>
    </>
  );
}
