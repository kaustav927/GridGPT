'use client';

import { Card, Icon } from '@blueprintjs/core';
import styles from './Card.module.css';

import type { IconName } from '@blueprintjs/icons';

const alerts: { icon: IconName; color: string; text: string }[] = [
  { icon: 'warning-sign', color: '#D29922', text: 'SBG Watch (SW)' },
  { icon: 'tick-circle', color: '#3FB950', text: 'Reserves Normal' },
  { icon: 'dot', color: '#D29922', text: 'TOU: Mid-Peak' },
];

export default function Alerts() {
  return (
    <Card className={styles.card}>
      <h2 className={styles.header}>ALERTS</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {alerts.map((alert, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon={alert.icon} size={14} color={alert.color} />
            <span style={{ fontSize: '11px' }}>{alert.text}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
