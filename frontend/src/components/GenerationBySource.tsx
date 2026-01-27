'use client';

import { useEffect, useState } from 'react';
import { Card, Spinner, HTMLTable } from '@blueprintjs/core';
import styles from './GenerationBySource.module.css';

interface FuelMixData {
  fuel_type: string;
  output_mw: number;
  capacity_mw: number;
  utilization: number;
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
              <th style={{ textAlign: 'right' }}>Output (MW)</th>
              <th style={{ textAlign: 'right' }}>Capacity (MW)</th>
              <th>Utilization</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const color = FUEL_COLORS[row.fuel_type] || '#8B949E';
              const utilization = Math.min(row.utilization, 100);
              return (
                <tr key={row.fuel_type}>
                  <td>
                    <span style={{ color }}>{row.fuel_type}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(row.output_mw).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(row.capacity_mw).toLocaleString()}
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
                        {Math.round(utilization)}%
                      </span>
                    </div>
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
