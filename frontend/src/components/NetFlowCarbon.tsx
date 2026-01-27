'use client';

import { Card } from '@blueprintjs/core';
import styles from './Card.module.css';

export default function NetFlowCarbon() {
  return (
    <Card className={styles.card} style={{ padding: '16px !important' }}>
      <div style={{ display: 'flex', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            NET FLOW
          </div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#3FB950', fontVariantNumeric: 'tabular-nums' }}>
            +366 MW
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            CARBON
          </div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
            28 gCO₂/kWh
          </div>
        </div>
      </div>
    </Card>
  );
}
