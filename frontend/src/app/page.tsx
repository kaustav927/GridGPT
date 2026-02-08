'use client';

import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@blueprintjs/core';
import styles from './dashboard.module.css';
import FuelMix from '@/components/FuelMix';
import GenerationByResource from '@/components/GenerationByResource';
import OntarioMap from '@/components/OntarioMap';
import MarketChart from '@/components/MarketChart';
import Interties from '@/components/Interties';
import GridChat from '@/components/GridChat';
import PanelWrapper from '@/components/PanelWrapper';

export default function Dashboard() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  const handleZoneSelect = useCallback((zone: string | null) => {
    setSelectedZone(zone);
  }, []);

  useEffect(() => {
    setCurrentTime(new Date());
    setLastRefresh(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const refreshInterval = setInterval(() => {
      setLastRefresh(new Date());
    }, 60000); // Refresh every minute
    return () => clearInterval(refreshInterval);
  }, []);

  const formatTime = (date: Date | null) => {
    if (!date) return '--:--';
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
          <PanelWrapper title="FUEL MIX">
            <FuelMix />
          </PanelWrapper>
          <PanelWrapper title="GENERATION BY RESOURCE">
            <GenerationByResource />
          </PanelWrapper>
        </div>

        {/* Center Panel */}
        <div className={styles.centerPanel}>
          <PanelWrapper
            title="ONTARIO ZONE MAP"
            bodyClassName={styles.mapPanelBody}
            bodyStyle={{ aspectRatio: '1 / 0.85' }}
          >
            <OntarioMap
              selectedZone={selectedZone}
              onZoneSelect={handleZoneSelect}
            />
          </PanelWrapper>
          <PanelWrapper title="MARKET OVERVIEW" bodyClassName={styles.chartPanelBody}>
            <MarketChart />
          </PanelWrapper>
        </div>

        {/* Right Panel */}
        <div className={styles.rightPanel}>
          <PanelWrapper title="GRID AI" bodyClassName={styles.chatPanelBody} style={{ flex: '1 1 0', minHeight: 0, maxHeight: '45%' }}>
            <GridChat />
          </PanelWrapper>
          <PanelWrapper title="INTERTIES">
            <Interties />
          </PanelWrapper>
        </div>
      </div>
    </div>
  );
}
