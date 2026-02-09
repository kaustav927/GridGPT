'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Icon } from '@blueprintjs/core';
import styles from './dashboard.module.css';
import FuelMix from '@/components/FuelMix';
import GenerationByResource from '@/components/GenerationByResource';
import OntarioMap from '@/components/OntarioMap';
import MarketChart from '@/components/MarketChart';
import Interties from '@/components/Interties';
import GridChat from '@/components/GridChat';
import PanelWrapper from '@/components/PanelWrapper';
import Footer from '@/components/Footer';

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
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 'inherit' }}>
          <div className={styles.brandSection}>
            <Icon icon="lightning" size={24} color="#58A6FF" />
            <h1 className={styles.title}>GridGPT</h1>
          </div>
        </Link>
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
          <PanelWrapper title="FUEL MIX" className={styles.panelFuelMix} bodyClassName={styles.fuelMixBody}>
            <FuelMix />
          </PanelWrapper>
          <PanelWrapper title="GENERATION BY RESOURCE" className={styles.panelGenByResource}>
            <GenerationByResource />
          </PanelWrapper>
        </div>

        {/* Center Panel */}
        <div className={styles.centerPanel}>
          <PanelWrapper
            title="ONTARIO ZONE MAP"
            className={styles.panelMap}
            bodyClassName={styles.mapPanelBody}
            bodyStyle={{ aspectRatio: '1 / 0.85' }}
          >
            <OntarioMap
              selectedZone={selectedZone}
              onZoneSelect={handleZoneSelect}
            />
          </PanelWrapper>
          <PanelWrapper title="MARKET OVERVIEW" className={styles.panelMarketOverview} bodyClassName={styles.chartPanelBody}>
            <MarketChart />
          </PanelWrapper>
        </div>

        {/* Right Panel */}
        <div className={styles.rightPanel}>
          <PanelWrapper title="GRID AI" className={styles.panelGridAI} bodyClassName={styles.chatPanelBody}>
            <GridChat />
          </PanelWrapper>
          <PanelWrapper title="INTERTIES" className={styles.panelInterties}>
            <Interties />
          </PanelWrapper>
        </div>
      </div>

      <Footer />
    </div>
  );
}
