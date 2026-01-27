'use client';

import { Card } from '@blueprintjs/core';
import styles from './Card.module.css';

export default function ReserveMargin() {
  return (
    <Card className={styles.card}>
      <h2 className={styles.header}>RESERVE MARGIN</h2>
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '140px'
      }}>
        <div style={{
          fontSize: '48px',
          fontWeight: 600,
          color: '#3FB950',
          fontVariantNumeric: 'tabular-nums'
        }}>
          72%
        </div>
      </div>
    </Card>
  );
}
