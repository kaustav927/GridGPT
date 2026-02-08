'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@blueprintjs/core';

interface IntertieRow {
  flow_group: string;
  actual_mw: number;
  last_updated: string;
}

interface IntertiePriceRow {
  intertie_zone: string;
  lmp: number;
  timestamp: string;
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
  const [priceData, setPriceData] = useState<Record<string, number>>({});

  const fetchData = useCallback(async () => {
    try {
      // Fetch flow and price data in parallel
      const [flowRes, priceRes] = await Promise.all([
        fetch('/api/interties'),
        fetch('/api/interties/prices')
      ]);

      if (flowRes.ok) {
        const flowJson = await flowRes.json();
        const flowMap: Record<string, { mw: number; lastUpdated: string }> = {};
        for (const row of flowJson.data as IntertieRow[]) {
          flowMap[row.flow_group] = { mw: row.actual_mw, lastUpdated: row.last_updated };
        }
        setFlowData(flowMap);
      }

      if (priceRes.ok) {
        const priceJson = await priceRes.json();
        const priceMap: Record<string, number> = {};
        for (const row of priceJson.data as IntertiePriceRow[]) {
          priceMap[row.intertie_zone] = row.lmp;
        }
        setPriceData(priceMap);
      }
    } catch {
      // Keep existing data on error
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Calculate net flow from all intertie data
  const netFlow = useMemo(() => {
    return Object.values(flowData).reduce((sum, entry) => sum + entry.mw, 0);
  }, [flowData]);

  const hasNetFlow = Math.abs(netFlow) > 1;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {DISPLAY_ORDER.map(({ key, label }) => {
          // API convention: positive = export from Ontario, negative = import to Ontario
          const entry = flowData[key];
          const mw = entry?.mw ?? 0;
          const lmp = priceData[key];
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
                {lmp !== undefined && (
                  <span style={{ color: '#8B949E', fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}>
                    @ ${lmp.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary row: Net Flow + Carbon */}
      <div style={{
        display: 'flex',
        borderTop: '1px solid #30363D',
        marginTop: '12px',
        paddingTop: '12px',
        gap: '16px'
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', color: '#8B949E', marginBottom: '4px' }}>
            NET FLOW
          </div>
          <div style={{
            fontSize: '16px',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            color: !hasNetFlow ? '#8B949E' : netFlow >= 0 ? '#3FB950' : '#F85149'
          }}>
            {hasNetFlow ? (netFlow >= 0 ? '+' : '') : ''}{Math.round(netFlow)} MW
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', color: '#8B949E', marginBottom: '4px' }}>
            CARBON
          </div>
          <div style={{
            fontSize: '16px',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            color: '#8B949E'
          }}>
            28 gCO₂/kWh
          </div>
        </div>
      </div>
    </>
  );
}
