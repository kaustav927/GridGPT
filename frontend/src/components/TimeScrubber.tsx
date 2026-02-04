'use client';

import { useEffect, useMemo } from 'react';
import { Icon } from '@blueprintjs/core';
import styles from './TimeScrubber.module.css';

interface Props {
  currentTime: Date;
  onTimeChange: (time: Date) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  onLiveClick: () => void;
  priceSource?: 'realtime' | 'day_ahead' | 'unavailable';
  showWeatherOverlay?: boolean;
}

export default function TimeScrubber({
  currentTime,
  onTimeChange,
  isPlaying,
  onPlayPause,
  onLiveClick,
  priceSource = 'realtime',
  showWeatherOverlay = false,
}: Props) {
  // Memoize time boundaries to prevent re-renders
  const { now, minTime, maxTime } = useMemo(() => {
    const nowTime = new Date();
    return {
      now: nowTime,
      minTime: new Date(nowTime.getTime() - 24 * 60 * 60 * 1000), // -24h
      maxTime: new Date(nowTime.getTime() + 24 * 60 * 60 * 1000), // +24h
    };
  }, []);

  const progress = (currentTime.getTime() - minTime.getTime()) / (maxTime.getTime() - minTime.getTime());
  const isFuture = currentTime > now;
  const isNearLive = Math.abs(currentTime.getTime() - new Date().getTime()) < 5 * 60 * 1000;

  // Check if DA market has run today (13:30 ET)
  const daAvailability = useMemo(() => {
    const nowET = new Date().toLocaleString('en-US', { timeZone: 'America/Toronto' });
    const nowETDate = new Date(nowET);
    const hour = nowETDate.getHours();
    const minute = nowETDate.getMinutes();
    const daRunTime = hour > 13 || (hour === 13 && minute >= 30);

    // Check if viewing tomorrow
    const viewingTomorrow = currentTime.toDateString() !== now.toDateString() &&
                            currentTime > now;

    return {
      hasRunToday: daRunTime,
      viewingTomorrow,
      showWarning: viewingTomorrow && !daRunTime,
    };
  }, [currentTime, now]);

  // Calculate weather data availability zones (for track visualization)
  // Weather data: past 24h (full) + future 3h (transition) + future 3h+ (GDPS only, sparse)
  const weatherZones = useMemo(() => {
    // Weather data available: past 24h to future ~3h (Open-Meteo + WMS snapping)
    // Future 3h+ has sparse GDPS forecast data (3-hour intervals)
    const totalRange = maxTime.getTime() - minTime.getTime(); // 48h

    // NOW is at 50% of the track (minTime = -24h, maxTime = +24h)
    // Weather full data zone: 0% (past 24h) to ~56.25% (NOW + 3h)
    // Weather sparse zone: 56.25% to 100%
    const weatherFullEnd = 50 + (3 / 48) * 100; // NOW + 3h as percentage

    return {
      fullZoneStart: 0,
      fullZoneEnd: weatherFullEnd, // ~56.25%
      sparseZoneStart: weatherFullEnd,
      sparseZoneEnd: 100,
    };
  }, [minTime, maxTime]);

  // Animation effect when playing
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const newTime = new Date(currentTime.getTime() + 15 * 60 * 1000);
      if (newTime > maxTime) {
        onTimeChange(minTime);
      } else {
        onTimeChange(newTime);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, currentTime, minTime, maxTime, onTimeChange]);

  const formatTime = (date: Date) => {
    return date.toLocaleString('en-CA', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Toronto',
    });
  };

  const formatShortTime = (date: Date) => {
    return date.toLocaleString('en-CA', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Toronto',
    });
  };

  // Get status label - simplified: past is HISTORICAL, future is FORECAST
  const getStatusLabel = () => {
    if (!isFuture) return 'HISTORICAL';
    if (daAvailability.showWarning) return 'FORECAST N/A';
    return 'FORECAST';
  };

  const getStatusClass = () => {
    if (!isFuture) return styles.historical;
    if (daAvailability.showWarning) return styles.unavailable;
    return styles.forecast;
  };

  return (
    <div className={styles.scrubberContainer}>
      {/* DA Availability Warning */}
      {daAvailability.showWarning && (
        <div className={styles.warning}>
          <Icon icon="warning-sign" size={12} />
          <span>Tomorrow&apos;s electricity prices available after 13:30 ET (Day-Ahead Market)</span>
        </div>
      )}

      <div className={styles.scrubber}>
        <button onClick={onPlayPause} className={styles.playBtn} title={isPlaying ? 'Pause' : 'Play'}>
          <Icon icon={isPlaying ? 'pause' : 'play'} size={12} />
        </button>

        <span className={styles.time}>{formatShortTime(minTime)}</span>

        <div className={styles.track}>
          {/* Weather data availability zones (show when any weather overlay is active) */}
          {showWeatherOverlay && (
            <>
              {/* Full weather data zone: past 24h to NOW + 3h */}
              <div
                className={styles.weatherZone}
                style={{
                  left: `${weatherZones.fullZoneStart}%`,
                  width: `${weatherZones.fullZoneEnd - weatherZones.fullZoneStart}%`,
                }}
                title="Weather data available (Open-Meteo + ECCC)"
              />
              {/* Sparse weather zone: NOW + 3h onwards (GDPS forecast only, 3-hour intervals) */}
              <div
                className={styles.weatherSparseZone}
                style={{
                  left: `${weatherZones.sparseZoneStart}%`,
                  width: `${weatherZones.sparseZoneEnd - weatherZones.sparseZoneStart}%`,
                }}
                title="Limited weather data (GDPS forecast, 3-hour intervals)"
              />
            </>
          )}

          {/* Now marker at 50% */}
          <div className={styles.nowMarker} style={{ left: '50%' }} title="NOW" />

          {/* DA availability zone (future portion after NOW marker) */}
          {daAvailability.hasRunToday && (
            <div
              className={styles.daZone}
              style={{ left: '50%', right: 0 }}
              title="Day-Ahead prices available"
            />
          )}

          {/* Progress fill showing current position */}
          <div
            className={styles.progressFill}
            style={{ width: `${progress * 100}%` }}
          />

          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={progress * 100}
            onInput={(e) => {
              const p = parseFloat((e.target as HTMLInputElement).value) / 100;
              const newTime = new Date(minTime.getTime() + p * (maxTime.getTime() - minTime.getTime()));
              onTimeChange(newTime);
            }}
            className={styles.slider}
          />
        </div>

        <span className={styles.time}>{formatShortTime(maxTime)}</span>

        <div className={styles.current}>
          <span className={getStatusClass()}>
            {getStatusLabel()}
          </span>
          <span className={styles.currentTime}>{formatTime(currentTime)}</span>
        </div>

        <button
          onClick={onLiveClick}
          className={`${styles.liveBtn} ${isNearLive ? styles.liveBtnActive : ''}`}
          title="Jump to live"
        >
          <Icon icon="record" size={10} />
          <span>LIVE</span>
        </button>
      </div>
    </div>
  );
}
