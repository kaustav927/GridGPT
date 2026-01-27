'use client';

import { useEffect, useState } from 'react';
import { Card, Spinner } from '@blueprintjs/core';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import styles from './GenerationByResource.module.css';

interface Generator {
  generator: string;
  fuel_type: string;
  output_mw: number;
}

interface ApiResponse {
  data: Generator[];
}

const FUEL_COLORS: Record<string, string> = {
  NUCLEAR: '#3FB950',
  HYDRO: '#58A6FF',
  GAS: '#D29922',
  WIND: '#39D5FF',
  SOLAR: '#D29922',
};

export default function GenerationByResource() {
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/generators?limit=10');
      const json: ApiResponse = await res.json();
      setGenerators(json.data);
    } catch (error) {
      console.error('Failed to fetch generators:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Group by fuel type
  const groupedGenerators = generators.reduce((acc, gen) => {
    if (!acc[gen.fuel_type]) acc[gen.fuel_type] = [];
    acc[gen.fuel_type].push(gen);
    return acc;
  }, {} as Record<string, Generator[]>);

  // Mock sparkline data
  const generateSparklineData = (baseValue: number) => {
    return Array.from({ length: 20 }, () => ({
      value: baseValue * (0.95 + Math.random() * 0.1)
    }));
  };

  return (
    <Card className={styles.card}>
      <h2 className={styles.header}>GENERATION BY RESOURCE</h2>
      {loading ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : (
        <div className={styles.content}>
          {Object.entries(groupedGenerators).map(([fuelType, gens]) => {
            const total = gens.reduce((sum, g) => sum + g.output_mw, 0);
            const color = FUEL_COLORS[fuelType] || '#8B949E';
            return (
              <div key={fuelType}>
                <div className={styles.sectionHeader}>
                  <span style={{ color }}>{fuelType}</span>
                  <span style={{ color }}>
                    {Math.round(total).toLocaleString()} MW
                  </span>
                </div>
                {gens.map((gen) => (
                  <div key={gen.generator} className={styles.generatorRow}>
                    <div className={styles.generatorInfo}>
                      <div className={styles.generatorName}>{gen.generator}</div>
                      <div className={styles.generatorOutput} style={{ color }}>
                        {Math.round(gen.output_mw).toLocaleString()} MW
                      </div>
                    </div>
                    <div className={styles.sparkline}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={generateSparklineData(gen.output_mw)}>
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke={color}
                            fill={color}
                            fillOpacity={0.3}
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
