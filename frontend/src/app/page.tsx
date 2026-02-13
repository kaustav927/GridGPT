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
import TutorialTour from '@/components/TutorialTour';

export default function Dashboard() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTour, setShowTour] = useState(false);

  const handleZoneSelect = useCallback((zone: string | null) => {
    setSelectedZone(zone);
  }, []);

  const handleDismissTour = useCallback(() => {
    setShowTour(false);
    try { localStorage.setItem('gridgpt-tour-completed', '1'); } catch {}
  }, []);

  const handleRestartTour = useCallback(() => {
    setShowTour(true);
  }, []);

  useEffect(() => {
    setCurrentTime(new Date());
    setLastRefresh(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-trigger tour for first-time visitors
  useEffect(() => {
    const completed = localStorage.getItem('gridgpt-tour-completed');
    if (!completed) {
      const timeout = setTimeout(() => setShowTour(true), 2000);
      return () => clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    const refreshInterval = setInterval(() => {
      setLastRefresh(new Date());
    }, 60000); // Refresh every minute
    return () => clearInterval(refreshInterval);
  }, []);

  const formatTime = (date: Date | null) => {
    if (!date) return '--:--:--';
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Toronto',
      timeZoneName: 'short'
    });
  };

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.brandGroup}>
          <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 'inherit' }}>
            <div className={styles.brandSection}>
              <Icon icon="lightning" size={24} color="#58A6FF" />
              <h1 className={styles.title}>GridGPT</h1>
            </div>
          </Link>
          <nav className={styles.headerNav}>
            <Link href="/about" className={styles.headerNavLink}>About</Link>
            <a
              href="https://github.com/kaustav927/GridGPT"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.headerNavLink}
            >
              GitHub
            </a>
            <button
              onClick={handleRestartTour}
              className={styles.headerNavLink}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}
              title="Take a tour"
            >
              Tour
            </button>
          </nav>
        </div>
        <div className={styles.statusSection}>
          <div className={styles.liveStatus}>
            <div className={styles.liveDot} />
            <span>LIVE</span>
          </div>
          <div className={styles.timestampRow}>
            <span className={styles.timestamp}>Last:</span>
            <span className={styles.timestampValue}>{formatTime(lastRefresh)}</span>
            <span className={styles.timestampSep}>|</span>
            <span className={styles.timestamp}>Current:</span>
            <span className={styles.timestampValue}>{formatTime(currentTime)}</span>
          </div>
        </div>
        <button
          type="button"
          className={styles.hamburger}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menu"
        >
          <span />
          <span />
          <span />
        </button>
        {menuOpen && <div className={styles.mobileOverlay} onClick={() => setMenuOpen(false)} />}
        <nav className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ''}`}>
          <Link href="/about" className={styles.mobileMenuLink} onClick={() => setMenuOpen(false)}>
            About
          </Link>
          <a
            href="https://github.com/kaustav927/GridGPT"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.mobileMenuLink}
            onClick={() => setMenuOpen(false)}
          >
            GitHub
          </a>
          <button
            className={styles.mobileMenuLink}
            style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: "'JetBrains Mono', monospace" }}
            onClick={() => { setMenuOpen(false); handleRestartTour(); }}
          >
            Tour
          </button>
        </nav>
      </header>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Left Panel */}
        <div className={styles.leftPanel}>
          <PanelWrapper title="FUEL MIX" className={styles.panelFuelMix} bodyClassName={styles.fuelMixBody} dataTour="fuel-mix" headerTooltip={<div>Generation output by fuel type.<br/><a href="https://reports-public.ieso.ca/public/GenOutputbyFuelHourly/" target="_blank" rel="noopener noreferrer" style={{color:'#58A6FF'}}>IESO Fuel Mix Report →</a></div>}>
            <FuelMix />
          </PanelWrapper>
          <PanelWrapper title="GENERATION BY RESOURCE" className={styles.panelGenByResource} dataTour="gen-by-resource" headerTooltip={<div>Output per generating station.<br/><a href="https://reports-public.ieso.ca/public/GenOutputCapability/" target="_blank" rel="noopener noreferrer" style={{color:'#58A6FF'}}>IESO Generator Output Report →</a></div>}>
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
            dataTour="zone-map"
            headerTooltip={<div>Zonal prices, generation sites, interties, and weather overlays.<br/><a href="https://reports-public.ieso.ca/public/RealtimeZonalEnergyPrices/" target="_blank" rel="noopener noreferrer" style={{color:'#58A6FF'}}>IESO Zonal Prices Report →</a></div>}
          >
            <OntarioMap
              selectedZone={selectedZone}
              onZoneSelect={handleZoneSelect}
            />
          </PanelWrapper>
          <PanelWrapper title="MARKET OVERVIEW" className={styles.panelMarketOverview} bodyClassName={styles.chartPanelBody} dataTour="market-overview" headerTooltip={<div>Supply, demand, and price across Ontario.<br/><a href="https://reports-public.ieso.ca/public/RealtimeDemandZonal/" target="_blank" rel="noopener noreferrer" style={{color:'#58A6FF'}}>IESO Demand Report →</a><br/><a href="https://reports-public.ieso.ca/public/DAHourlyOntarioZonalPrice/" target="_blank" rel="noopener noreferrer" style={{color:'#58A6FF'}}>IESO Day-Ahead Price Report →</a></div>}>
            <MarketChart />
          </PanelWrapper>
        </div>

        {/* Right Panel */}
        <div className={styles.rightPanel}>
          <PanelWrapper title="GRID AI" className={styles.panelGridAI} bodyClassName={styles.chatPanelBody} dataTour="grid-ai" headerTooltip={<div>AI assistant that answers questions about the grid using natural language.</div>}>
            <GridChat />
          </PanelWrapper>
          <PanelWrapper title="INTERTIES" className={styles.panelInterties} dataTour="interties" headerTooltip={<div>Power flows between Ontario and neighbouring regions.<br/><a href="https://reports-public.ieso.ca/public/IntertieScheduleFlow/" target="_blank" rel="noopener noreferrer" style={{color:'#58A6FF'}}>IESO Intertie Flow Report →</a></div>}>
            <Interties />
          </PanelWrapper>
        </div>
      </div>

      <Footer />

      {showTour && <TutorialTour onDismiss={handleDismissTour} />}
    </div>
  );
}
