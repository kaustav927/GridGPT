'use client';

import { Card } from '@blueprintjs/core';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import styles from './Card.module.css';

// Mock 24-hour demand data
const generateDemandData = () => {
  return Array.from({ length: 24 }, (_, i) => ({
    hour: `${i.toString().padStart(2, '0')}:00`,
    actual: 18000 + Math.random() * 6000,
    forecast: 18000 + Math.random() * 6000,
    yesterday: 18000 + Math.random() * 6000,
  }));
};

export default function DemandCurve() {
  const data = generateDemandData();

  return (
    <Card className={styles.card} style={{ height: 300 }}>
      <div className={styles.headerRow}>
        <h2 className={styles.header}>24-HOUR DEMAND CURVE</h2>
        <div style={{ display: 'flex', gap: '16px', fontSize: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: 12, height: 2, background: '#58A6FF' }} />
            <span>Actual</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: 12, height: 2, background: '#8B949E', borderTop: '2px dashed #8B949E' }} />
            <span>Forecast</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: 12, height: 2, background: '#6E7681', borderTop: '2px dotted #6E7681' }} />
            <span>Yesterday</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#58A6FF" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#58A6FF" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
          <XAxis dataKey="hour" stroke="#8B949E" style={{ fontSize: '10px' }} />
          <YAxis stroke="#8B949E" style={{ fontSize: '10px' }} />
          <Tooltip
            contentStyle={{
              background: '#161B22',
              border: '1px solid #30363D',
              borderRadius: 0,
              fontSize: '11px'
            }}
          />
          <Area type="monotone" dataKey="actual" stroke="#58A6FF" fill="url(#colorActual)" strokeWidth={2} />
          <Area type="monotone" dataKey="forecast" stroke="#8B949E" fill="none" strokeWidth={1} strokeDasharray="5 5" />
          <Area type="monotone" dataKey="yesterday" stroke="#6E7681" fill="none" strokeWidth={1} strokeDasharray="2 2" />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
