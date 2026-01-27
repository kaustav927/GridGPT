'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, Tag, Icon } from '@blueprintjs/core';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import styles from './Card.module.css';

interface ZonalPrice {
  zone: string;
  price: number;
  timestamp?: string;
}

interface Props {
  selectedZone?: string | null;
  onClearSelection?: () => void;
}

// Zone display names
const ZONE_NAMES: Record<string, string> = {
  EAST: 'East',
  ESSA: 'Essa',
  NIAGARA: 'Niagara',
  NORTHEAST: 'Northeast',
  NORTHWEST: 'Northwest',
  OTTAWA: 'Ottawa',
  SOUTHWEST: 'Southwest',
  TORONTO: 'Toronto',
  WEST: 'West',
  BRUCE: 'Bruce',
};

export default function ZoneDetail({ selectedZone, onClearSelection }: Props) {
  const [prices, setPrices] = useState<ZonalPrice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const pricesRes = await fetch('/api/prices');

        if (pricesRes.ok) {
          const pricesData = await pricesRes.json();
          setPrices(pricesData.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch zone data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Calculate displayed values based on selection
  const { displayPrice, displayName, isAverage } = useMemo(() => {
    if (selectedZone) {
      const zonePrice = prices.find(p => p.zone === selectedZone);

      return {
        displayPrice: zonePrice?.price ?? null,
        displayName: ZONE_NAMES[selectedZone] || selectedZone,
        isAverage: false,
      };
    } else {
      const avgPrice = prices.length > 0
        ? prices.reduce((sum, p) => sum + p.price, 0) / prices.length
        : null;

      return {
        displayPrice: avgPrice,
        displayName: 'ONTARIO',
        isAverage: true,
      };
    }
  }, [selectedZone, prices]);

  // Generate sparkline data (simulated trend based on current price)
  const sparklineData = useMemo(() => {
    const basePrice = displayPrice ?? 100;
    return Array.from({ length: 24 }, (_, i) => ({
      value: basePrice * (0.85 + Math.sin(i / 4) * 0.15 + Math.random() * 0.1),
    }));
  }, [displayPrice]);

  // Determine price status
  const priceStatus = useMemo(() => {
    if (displayPrice === null) return { label: 'N/A', color: '#8B949E' };
    if (displayPrice < 0) return { label: 'Surplus', color: '#3FB950' };
    if (displayPrice < 50) return { label: 'Low', color: '#3FB950' };
    if (displayPrice < 100) return { label: 'Normal', color: '#58A6FF' };
    if (displayPrice < 200) return { label: 'Elevated', color: '#D29922' };
    if (displayPrice < 300) return { label: 'High', color: '#F85149' };
    return { label: 'Critical', color: '#DA3633' };
  }, [displayPrice]);

  // Get price color
  const priceColor = useMemo(() => {
    if (displayPrice === null) return '#8B949E';
    if (displayPrice < 0) return '#3FB950';
    if (displayPrice < 50) return '#3FB950';
    if (displayPrice < 100) return '#58A6FF';
    if (displayPrice < 200) return '#D29922';
    if (displayPrice < 300) return '#F85149';
    return '#DA3633';
  }, [displayPrice]);

  return (
    <Card className={styles.card}>
      <div className={styles.headerRow}>
        <h2 className={styles.header}>
          ZONE: {displayName}
          {isAverage && <span style={{ fontSize: '9px', color: '#8B949E', marginLeft: '8px' }}>(AVG)</span>}
        </h2>
        {selectedZone && onClearSelection && (
          <button
            onClick={onClearSelection}
            style={{
              background: 'transparent',
              border: '1px solid #30363D',
              color: '#8B949E',
              padding: '2px 8px',
              fontSize: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Clear selection"
          >
            <Icon icon="cross" size={10} />
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className={styles.placeholder}>Loading...</div>
      ) : (
        <>
          {/* Price Display */}
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                fontSize: '32px',
                fontWeight: 600,
                color: priceColor,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {displayPrice !== null ? `$${displayPrice.toFixed(2)}` : 'N/A'}
            </div>
            <div style={{ fontSize: '10px', color: '#8B949E' }}>
              $/MWh {isAverage ? '(Avg across all zones)' : ''}
            </div>
          </div>

          {/* Stats */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '16px',
              fontSize: '11px',
            }}
          >
            <span style={{ color: '#8B949E' }}>Status</span>
            <Tag
              minimal
              style={{
                background: priceStatus.color,
                padding: '2px 6px',
                color: '#0D1117',
                fontWeight: 600,
              }}
            >
              {priceStatus.label}
            </Tag>
          </div>

          {/* Sparkline */}
          <div style={{ height: '60px', marginBottom: '8px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData}>
                <YAxis domain={['dataMin', 'dataMax']} hide />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={priceColor}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div
            style={{
              fontSize: '10px',
              color: '#8B949E',
              textAlign: 'center',
            }}
          >
            [Price Trend 24h - Simulated]
          </div>

          {/* Zone info when selected */}
          {selectedZone && (
            <div
              style={{
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid #30363D',
                fontSize: '10px',
                color: '#8B949E',
              }}
            >
              Click another zone on the map to compare, or click the selected zone again to deselect.
            </div>
          )}
        </>
      )}
    </Card>
  );
}
