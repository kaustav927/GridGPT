'use client';

import { Card, Icon } from '@blueprintjs/core';
import styles from './Card.module.css';

const intertieData = [
  { name: 'Michigan', flow: 285, direction: 'export' },
  { name: 'New York', flow: 156, direction: 'export' },
  { name: 'Quebec', flow: -202, direction: 'import' },
  { name: 'Manitoba', flow: 128, direction: 'export' },
  { name: 'Minnesota', flow: 0, direction: 'none' },
];

export default function Interties() {
  return (
    <Card className={styles.card}>
      <h2 className={styles.header}>INTERTIES</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {intertieData.map((tie) => (
          <div
            key={tie.name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px'
            }}
          >
            <span>{tie.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {tie.direction === 'export' && (
                <Icon icon="arrow-right" size={12} color={tie.flow > 0 ? '#3FB950' : '#8B949E'} />
              )}
              {tie.direction === 'import' && (
                <Icon icon="arrow-left" size={12} color="#F85149" />
              )}
              <span
                style={{
                  fontWeight: 600,
                  color: tie.flow === 0 ? '#8B949E' : tie.flow > 0 ? '#3FB950' : '#F85149',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {tie.flow > 0 ? '+' : ''}{tie.flow} MW
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
