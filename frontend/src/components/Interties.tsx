'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';


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

// Zones with multiple IESO intertie points (prices are averaged)
const AGGREGATE_ZONES: Record<string, number> = {
  'QUEBEC': 9,
  'NEW-YORK': 2,
};

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

  // Calculate flow-weighted average LMP across all interties
  const avgPrice = useMemo(() => {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const { key } of DISPLAY_ORDER) {
      const entry = flowData[key];
      const lmp = priceData[key];
      if (entry && lmp !== undefined && Math.abs(entry.mw) > 1) {
        const weight = Math.abs(entry.mw);
        weightedSum += weight * lmp;
        totalWeight += weight;
      }
    }
    return totalWeight === 0 ? null : weightedSum / totalWeight;
  }, [flowData, priceData]);

  // Compute most recent timestamp across all interties
  const latestUpdate = useMemo(() => {
    const timestamps = Object.values(flowData)
      .map(e => e.lastUpdated)
      .filter(Boolean);
    if (timestamps.length === 0) return null;
    return timestamps.sort().pop()!;
  }, [flowData]);

  return (
    <>
      {latestUpdate && (
        <div style={{ fontSize: '9px', color: '#8B949E', marginBottom: '8px', fontVariantNumeric: 'tabular-nums' }}>
          As of {new Date(latestUpdate.replace(' ', 'T') + 'Z').toLocaleString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false,
            timeZone: 'America/Toronto',
          })} EST
        </div>
      )}
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
                display: 'grid',
                gridTemplateColumns: '1fr 120px 70px',
                alignItems: 'center',
                gap: '8px',
                fontSize: '11px',
              }}
            >
              <span>{label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                {hasFlow && isExport && (
                  <span style={{ color: '#3FB950', fontSize: '11px', fontWeight: 700, lineHeight: 1 }}>›››</span>
                )}
                {hasFlow && isImport && (
                  <span style={{ color: '#F85149', fontSize: '11px', fontWeight: 700, lineHeight: 1 }}>‹‹‹</span>
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
              <span
                style={{
                  color: lmp !== undefined ? '#D29922' : '#8B949E',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                  fontSize: '10px',
                  textAlign: 'right',
                  minWidth: '52px',
                }}
              >
                {lmp !== undefined ? `${AGGREGATE_ZONES[key] ? 'Avg ' : ''}$${lmp.toFixed(2)}` : '---'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Summary row: Net Flow + Avg Price */}
      <div style={{
        borderTop: '1px solid #30363D',
        marginTop: '12px',
        paddingTop: '12px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
      }}>
        <div>
          <div style={{ fontSize: '10px', color: '#8B949E', marginBottom: '4px' }}>
            NET FLOW
          </div>
          <div style={{
            fontSize: '22px',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            color: !hasNetFlow ? '#8B949E' : netFlow >= 0 ? '#3FB950' : '#F85149',
          }}>
            {hasNetFlow ? (netFlow >= 0 ? '+' : '') : ''}{Math.round(netFlow)} MW
          </div>
        </div>
        {avgPrice !== null && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: '#8B949E', marginBottom: '4px' }}>
              AVG PRICE
            </div>
            <div style={{
              fontSize: '22px',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: '#D29922',
              textAlign: 'right',
            }}>
              ${avgPrice.toFixed(2)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
