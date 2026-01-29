'use client';

import { useEffect, useState } from 'react';
import { Card, Spinner } from '@blueprintjs/core';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import styles from './FuelMix.module.css';

interface FuelMixData {
  fuel_type: string;
  output_mw: number;
  percentage: number;
}

interface ApiResponse {
  data: FuelMixData[];
  total_mw: number;
  timestamp: string;
}

const FUEL_COLORS: Record<string, string> = {
  NUCLEAR: '#3FB950',
  HYDRO: '#58A6FF',
  GAS: '#D29922',
  WIND: '#39D5FF',
  SOLAR: '#D29922',
  BIOFUEL: '#8B949E',
};

export default function FuelMix() {
  const [data, setData] = useState<FuelMixData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedFuel, setSelectedFuel] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/fuel-mix');
      const json: ApiResponse = await res.json();
      setData(json.data);
      setTotal(json.total_mw);
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

  const displayValue = selectedFuel
    ? data.find(d => d.fuel_type === selectedFuel)?.output_mw || 0
    : total;

  const displayLabel = selectedFuel || 'Total Output';

  return (
    <Card className={styles.card}>
      <h2 className={styles.header}>FUEL MIX</h2>
      {loading ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : (
        <>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="output_mw"
                  nameKey="fuel_type"
                  cx="50%"
                  cy="50%"
                  innerRadius="45%"
                  outerRadius="70%"
                  onClick={(entry) => setSelectedFuel(
                    selectedFuel === entry.fuel_type ? null : entry.fuel_type
                  )}
                  style={{ cursor: 'pointer' }}
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={FUEL_COLORS[entry.fuel_type] || '#8B949E'}
                      opacity={selectedFuel && selectedFuel !== entry.fuel_type ? 0.3 : 1}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.centerLabel}>
              <div className={styles.centerLabelTop}>{displayLabel}</div>
              <div className={styles.centerLabelValue}>
                {Math.round(displayValue).toLocaleString()}
              </div>
              <div className={styles.centerLabelUnit}>MW</div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
