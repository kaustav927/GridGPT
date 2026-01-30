'use client';

import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@blueprintjs/core';
import styles from './dashboard.module.css';
import FuelMix from '@/components/FuelMix';
import GenerationByResource from '@/components/GenerationByResource';
import OntarioMap from '@/components/OntarioMap';
import MarketChart from '@/components/MarketChart';
import ZoneDetail from '@/components/ZoneDetail';
import Interties from '@/components/Interties';
import NetFlowCarbon from '@/components/NetFlowCarbon';
import ReserveMargin from '@/components/ReserveMargin';
import Alerts from '@/components/Alerts';

export default function Dashboard() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  const handleZoneSelect = useCallback((zone: string | null) => {
    setSelectedZone(zone);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const refreshInterval = setInterval(() => {
      setLastRefresh(new Date());
    }, 60000); // Refresh every minute
    return () => clearInterval(refreshInterval);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Toronto',
      timeZoneName: 'short'
    });
  };

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.brandSection}>
          <Icon icon="lightning" size={24} color="#58A6FF" />
          <h1 className={styles.title}>ONTARIO GRID COCKPIT</h1>
        </div>
        <div className={styles.statusSection}>
          <div className={styles.liveStatus}>
            <div className={styles.liveDot} />
            <span>LIVE</span>
          </div>
          <span className={styles.timestamp}>Last Refreshed:</span>
          <span className={styles.timestampValue}>{formatTime(lastRefresh)}</span>
          <span className={styles.timestamp}>Current:</span>
          <span className={styles.timestampValue}>{formatTime(currentTime)}</span>
        </div>
      </header>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Left Panel */}
        <div className={styles.leftPanel}>
          <FuelMix />
          <GenerationByResource />
        </div>

        {/* Center Panel */}
        <div className={styles.centerPanel}>
          <OntarioMap
            selectedZone={selectedZone}
            onZoneSelect={handleZoneSelect}
          />
          <MarketChart />
        </div>

        {/* Right Panel */}
        <div className={styles.rightPanel}>
          <ZoneDetail
            selectedZone={selectedZone}
            onClearSelection={() => handleZoneSelect(null)}
          />
          <Interties />
          <NetFlowCarbon />
          <ReserveMargin />
          <Alerts />
        </div>
      </div>
    </div>
  );
}
