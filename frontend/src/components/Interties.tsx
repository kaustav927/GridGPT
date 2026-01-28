'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, Icon } from '@blueprintjs/core';
import styles from './Card.module.css';

interface IntertieRow {
  flow_group: string;
  actual_mw: number;
  last_updated: string;
}

// Display order and label mapping
const DISPLAY_ORDER: { key: string; label: string }[] = [
  { key: 'MICHIGAN', label: 'Michigan' },
  { key: 'NEW-YORK', label: 'New York' },
  { key: 'QUEBEC', label: 'Quebec' },
  { key: 'MANITOBA', label: 'Manitoba' },
  { key: 'MINNESOTA', label: 'Minnesota' },
];

export default function Interties() {
  const [flowData, setFlowData] = useState<Record<string, { mw: number; lastUpdated: string }>>({});

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/interties');
      if (!res.ok) return;
      const json = await res.json();
      const map: Record<string, { mw: number; lastUpdated: string }> = {};
      for (const row of json.data as IntertieRow[]) {
        map[row.flow_group] = { mw: row.actual_mw, lastUpdated: row.last_updated };
      }
      setFlowData(map);
    } catch {
      // Keep existing data on error
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <Card className={styles.card}>
      <h2 className={styles.header}>INTERTIES</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {DISPLAY_ORDER.map(({ key, label }) => {
          // API convention: positive = export from Ontario, negative = import to Ontario
          const entry = flowData[key];
          const mw = entry?.mw ?? 0;
          const isExport = mw > 0;
          const isImport = mw < 0;
          const hasFlow = Math.abs(mw) > 1;

          const asOfLabel = entry?.lastUpdated
            ? `as of ${new Date(entry.lastUpdated.replace(' ', 'T') + 'Z').toLocaleString(undefined, { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
            : '';

          return (
            <div
              key={key}
              title={asOfLabel}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '11px',
              }}
            >
              <span>{label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {hasFlow && isExport && (
                  <Icon icon="arrow-right" size={12} color="#3FB950" />
                )}
                {hasFlow && isImport && (
                  <Icon icon="arrow-left" size={12} color="#F85149" />
                )}
                <span
                  style={{
                    fontWeight: 600,
                    color: !hasFlow ? '#8B949E' : isExport ? '#3FB950' : '#F85149',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {hasFlow ? (isExport ? '+' : '') : ''}{Math.round(mw)} MW
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
