'use client';

import { useEffect, useState } from 'react';
import { Card, Spinner, HTMLTable } from '@blueprintjs/core';
import styles from './GenerationBySource.module.css';

interface FuelMixData {
  fuel_type: string;
  output_mw: number;
}

interface ApiResponse {
  data: FuelMixData[];
  total_mw: number;
}

const FUEL_COLORS: Record<string, string> = {
  NUCLEAR: '#3FB950',
  HYDRO: '#58A6FF',
  GAS: '#D29922',
  WIND: '#39D5FF',
  SOLAR: '#D29922',
};

export default function GenerationBySource() {
  const [data, setData] = useState<FuelMixData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/fuel-mix');
      const json: ApiResponse = await res.json();
      setData(json.data);
    } catch (error) {
      console.error('Failed to fetch fuel mix:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const renderCapacityBar = (percentage: number) => {
    const bars = Math.round(percentage / 25);
    return '█'.repeat(bars);
  };

  const renderStatusDots = (percentage: number) => {
    const dots = Math.min(6, Math.round(percentage / 16.67));
    return '●'.repeat(dots);
  };

  return (
    <Card className={styles.card}>
      <h2 className={styles.header}>GENERATION BY SOURCE</h2>
      {loading ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : (
        <HTMLTable bordered striped compact className={styles.table}>
          <thead>
            <tr>
              <th>Fuel</th>
              <th style={{ textAlign: 'right' }}>Output</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'right' }}>Capacity</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const percentage = 100; // Simplified - would need actual capacity data
              const color = FUEL_COLORS[row.fuel_type] || '#8B949E';
              return (
                <tr key={row.fuel_type}>
                  <td>
                    <span style={{ color }}>{row.fuel_type}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(row.output_mw).toLocaleString()} MW
                  </td>
                  <td
                    style={{
                      textAlign: 'center',
                      color,
                      fontSize: '8px',
                      letterSpacing: '1px'
                    }}
                  >
                    {renderStatusDots(percentage)}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      color,
                      fontSize: '11px',
                      letterSpacing: '0'
                    }}
                  >
                    {renderCapacityBar(percentage)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </HTMLTable>
      )}
    </Card>
  );
}
