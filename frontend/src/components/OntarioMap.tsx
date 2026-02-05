'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Card, Icon } from '@blueprintjs/core';
import styles from './Card.module.css';
import ontarioZones from '@/data/ontario-zones.geojson';
import { GENERATION_SITES, FUEL_COLORS } from '@/data/generation-sites';
import { TRANSMISSION_IMAGE_URL, TRANSMISSION_BOUNDS, INTERTIES } from '@/data/transmission-lines';
import type { ZoneData, WeatherDataMap, WeatherData } from '@/lib/types';
import Tooltip from './Tooltip';
import TimeScrubber from './TimeScrubber';

// Price-to-color mapping for zone coloring (IESO-aligned 12-tier scale)
const priceToColor = (price: number | null | undefined): string => {
  if (price === null || price === undefined) return '#888888'; // Undefined
  if (price < -2000) return '#1E5AA8';  // < -$2,000 (dark blue)
  if (price < -100) return '#4A90D9';   // < -$100 (blue)
  if (price < -16) return '#7FE5E5';    // < -$16 (cyan)
  if (price < -4) return '#D4F5D4';     // < -$4 (light green)
  if (price < 0) return '#FFF8D6';      // < $0 (pale yellow)
  if (price < 10) return '#FCE88C';     // < $10 (light yellow)
  if (price < 30) return '#F8D14F';     // < $30 (yellow)
  if (price < 60) return '#F5A623';     // < $60 (light orange)
  if (price < 100) return '#E07830';    // < $100 (orange)
  if (price < 400) return '#C83C23';    // < $400 (red)
  if (price < 1200) return '#8B2913';   // < $1,200 (darker red)
  return '#5C1A0B';                     // >= $1,200 (dark brown)
};

const priceToOpacity = (price: number): number => {
  const baseOpacity = 0.12;
  const maxOpacity = 0.3;
  const normalizedPrice = Math.min(Math.abs(price) / 200, 1);
  return baseOpacity + normalizedPrice * (maxOpacity - baseOpacity);
};

// Temperature to color (cold blue → hot red)
const tempToColor = (celsius: number): string => {
  if (celsius < -20) return '#1E5AA8';  // Deep cold (dark blue)
  if (celsius < -10) return '#4A90D9';  // Very cold (blue)
  if (celsius < 0) return '#7FE5E5';    // Cold (cyan)
  if (celsius < 10) return '#A8E6CF';   // Cool (light green)
  if (celsius < 20) return '#FCE88C';   // Mild (yellow)
  if (celsius < 30) return '#F5A623';   // Warm (orange)
  return '#C83C23';                     // Hot (red)
};

// Snap time to nearest 3-hour boundary for GDPS WMS model
// GDPS model only has data at 00, 03, 06, 09, 12, 15, 18, 21 UTC
const snapToGdpsTime = (date: Date | null): string | undefined => {
  if (!date) return undefined;
  const d = new Date(date);
  const hours = d.getUTCHours();
  const snappedHour = Math.round(hours / 3) * 3;
  d.setUTCHours(snappedHour, 0, 0, 0);
  return d.toISOString().split('.')[0] + 'Z';
};

interface ZonePriceMap {
  [zone: string]: ZoneData;
}

interface Props {
  onZoneSelect?: (zone: string | null) => void;
  selectedZone?: string | null;
}

// Map component that renders client-side only
function MapContent({
  zonePrices,
  selectedZone,
  onZoneSelect,
  showGeneration,
  showTransmission,
  showPricing,
  showTemp,
  showCloud,
  showPrecip,
  weatherData,
  scrubTime,
}: {
  zonePrices: ZonePriceMap;
  selectedZone?: string | null;
  onZoneSelect?: (zone: string | null) => void;
  showGeneration: boolean;
  showTransmission: boolean;
  showPricing: boolean;
  showTemp: boolean;
  showCloud: boolean;
  showPrecip: boolean;
  weatherData: WeatherDataMap;
  scrubTime: Date | null;
}) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pricingLayerRef = useRef<L.GeoJSON | null>(null);
  const generationLayerRef = useRef<L.LayerGroup | null>(null);
  const transmissionLayerRef = useRef<L.LayerGroup | null>(null);
  const tempLayerRef = useRef<L.GeoJSON | null>(null);
  const cloudLayerRef = useRef<L.GeoJSON | null>(null);
  // WMS layers use double-buffering for smooth time transitions
  const tempWmsLayerRef = useRef<L.TileLayer | null>(null);
  const tempWmsBufferRef = useRef<L.TileLayer | null>(null);
  const cloudWmsLayerRef = useRef<L.TileLayer | null>(null);
  const cloudWmsBufferRef = useRef<L.TileLayer | null>(null);
  const precipLayerRef = useRef<L.TileLayer | null>(null);
  const precipBufferRef = useRef<L.TileLayer | null>(null);
  // Track current WMS time to avoid unnecessary updates (one per layer type)
  const tempTimeRef = useRef<string | undefined>(undefined);
  const cloudTimeRef = useRef<string | undefined>(undefined);
  const precipTimeRef = useRef<string | undefined>(undefined);
  const animationFrameRef = useRef<number | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;

    // Dynamically import Leaflet
    const initMap = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import('leaflet')) as any;

      // Add Leaflet CSS
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Wait for container to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      if (!containerRef.current || mapRef.current) return;

      // Create map
      const map = L.map(containerRef.current, {
        center: [49.5, -84.5],
        zoom: 6,
        scrollWheelZoom: true,
        zoomControl: true,
      });

      mapRef.current = map;

      // Add dark tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      }).addTo(map);

      // Compute Ontario bounds from GeoJSON for initial view (without adding the layer)
      const boundsLayer = L.geoJSON(ontarioZones as GeoJSON.FeatureCollection);
      map.fitBounds(boundsLayer.getBounds(), { padding: [10, 10] });

      // Signal that map is ready for layers
      setMapReady(true);
    };

    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // We only want to initialize the map once, not on every prop change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manage pricing zones layer
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    // Remove existing layer
    if (pricingLayerRef.current) {
      map.removeLayer(pricingLayerRef.current);
      pricingLayerRef.current = null;
    }

    if (!showPricing) return;

    const loadLayer = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import('leaflet')) as any;

      const geojsonLayer = L.geoJSON(ontarioZones as GeoJSON.FeatureCollection, {
        style: (feature: GeoJSON.Feature | undefined) => {
          if (!feature?.properties?.zone) {
            return {
              fillColor: '#30363D',
              fillOpacity: 0.1,
              color: '#30363D',
              weight: 1,
            };
          }

          const zone = feature.properties.zone;
          const zoneData = zonePrices[zone];
          const price = zoneData?.price || 0;
          const isSelected = zone === selectedZone;

          return {
            fillColor: priceToColor(price),
            fillOpacity: isSelected ? 0.5 : priceToOpacity(price),
            color: isSelected ? '#58A6FF' : '#30363D',
            weight: isSelected ? 2 : 1,
            className: isSelected ? 'zone-selected' : '',
          };
        },
        onEachFeature: (feature: GeoJSON.Feature, layer: L.Layer) => {
          const zone = feature.properties?.zone;
          if (!zone) return;

          const zoneData = zonePrices[zone];

          const tooltipContent = `
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 8px; background: #161B22; border: 1px solid #30363D;">
              <div style="font-weight: 600; color: #E6EDF3; margin-bottom: 4px;">${feature.properties?.name || zone}</div>
              <div style="color: #D29922;">Price: $${zoneData?.price?.toFixed(2) || 'N/A'}/MWh</div>
            </div>
          `;

          layer.bindTooltip(tooltipContent, {
            permanent: false,
            direction: 'auto',
            className: 'zone-tooltip',
          });

          layer.on('click', () => {
            if (onZoneSelect) {
              onZoneSelect(zone === selectedZone ? null : zone);
            }
          });

          layer.on('mouseover', () => {
            const el = (layer as L.Path).getElement?.();
            if (el) el.classList.add('zone-hover');
          });

          layer.on('mouseout', () => {
            const el = (layer as L.Path).getElement?.();
            if (el) el.classList.remove('zone-hover');
          });
        },
      });

      geojsonLayer.addTo(map);
      // Don't use bringToBack - let it stay above weather WMS layers
      pricingLayerRef.current = geojsonLayer;
    };

    loadLayer();
  }, [mapReady, showPricing, zonePrices, selectedZone, onZoneSelect]);

  // Manage generation site markers layer
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    // Remove existing layer
    if (generationLayerRef.current) {
      map.removeLayer(generationLayerRef.current);
      generationLayerRef.current = null;
    }

    if (!showGeneration) return;

    const loadLayer = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import('leaflet')) as any;

      const markers = GENERATION_SITES.map((site) =>
        L.circleMarker([site.lat, site.lng], {
          radius: 5,
          fillColor: FUEL_COLORS[site.fuelType],
          fillOpacity: 0.85,
          color: '#0D1117',
          weight: 1,
        }).bindTooltip(
          `<div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 8px; background: #161B22; border: 1px solid #30363D;">
            <div style="font-weight: 600; color: #E6EDF3; margin-bottom: 4px;">${site.name}</div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 8px; height: 8px; background: ${FUEL_COLORS[site.fuelType]};"></span>
              <span style="color: ${FUEL_COLORS[site.fuelType]}; text-transform: capitalize;">${site.fuelType}</span>
            </div>
          </div>`,
          { direction: 'auto', className: 'zone-tooltip' }
        )
      );

      const layerGroup = L.layerGroup(markers);
      layerGroup.addTo(map);
      generationLayerRef.current = layerGroup;
    };

    loadLayer();
  }, [mapReady, showGeneration]);

  // Manage transmission overlay layer with animated intertie flow arrows
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    // Cancel any running animation
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Remove existing layer
    if (transmissionLayerRef.current) {
      map.removeLayer(transmissionLayerRef.current);
      transmissionLayerRef.current = null;
    }

    if (!showTransmission) return;

    const loadLayer = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import('leaflet')) as any;

      const layers: L.Layer[] = [];

      // Add IESO transmission image overlay
      const imageOverlay = L.imageOverlay(TRANSMISSION_IMAGE_URL, TRANSMISSION_BOUNDS, {
        opacity: 0.85,
        interactive: false,
      });
      layers.push(imageOverlay);

      // Fetch grouped intertie flow data from API
      // API convention: positive = export from Ontario, negative = import to Ontario
      const flowByGroup: Record<string, { mw: number; lastUpdated: string }> = {};
      try {
        const res = await fetch('/api/interties');
        if (res.ok) {
          const json = await res.json();
          for (const row of json.data) {
            flowByGroup[row.flow_group] = { mw: row.actual_mw, lastUpdated: row.last_updated };
          }
        }
      } catch {
        // Fallback: no flow data, static lines only
      }

      // Helper: compute bearing between two points
      const getBearing = (lat0: number, lng0: number, lat1: number, lng1: number): number => {
        const dLng = lng1 - lng0;
        const dLat = lat1 - lat0;
        return Math.atan2(dLng, dLat) * (180 / Math.PI);
      };

      // Chevron markers for animation
      const chevronMarkers: { marker: L.Marker; from: [number, number]; to: [number, number]; offset: number }[] = [];

      // Add intertie polylines with flow-aware styling
      // API convention: positive = export from Ontario, negative = import to Ontario
      INTERTIES.forEach((intertie) => {
        const entry = flowByGroup[intertie.flowKey];
        const mw = entry?.mw ?? 0;
        const isExport = mw > 0;
        const hasFlow = Math.abs(mw) > 1;

        const lineColor = hasFlow
          ? (isExport ? '#3FB950' : '#F85149')
          : '#F0883E';

        const dirLabel = hasFlow
          ? (isExport ? 'EXPORT' : 'IMPORT')
          : 'NO FLOW';
        const dirColor = hasFlow
          ? (isExport ? '#3FB950' : '#F85149')
          : '#8B949E';

        const asOf = entry?.lastUpdated
          ? new Date(entry.lastUpdated.replace(' ', 'T') + 'Z')
              .toLocaleString(undefined, { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
          : '';

        const polyline = L.polyline(intertie.path, {
          color: lineColor,
          weight: 3,
          opacity: hasFlow ? 0.9 : 0.5,
          dashArray: hasFlow ? undefined : '8, 6',
        }).bindTooltip(
          `<div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 8px; background: #161B22; border: 1px solid #30363D;">
            <div style="font-weight: 600; color: #E6EDF3; margin-bottom: 4px;">${intertie.name}</div>
            <div style="color: ${dirColor}; font-weight: 600;">${dirLabel} ${hasFlow ? Math.abs(mw).toFixed(0) + ' MW' : ''}</div>
            ${asOf ? `<div style="color: #8B949E; font-size: 10px; margin-top: 4px;">as of ${asOf}</div>` : ''}
          </div>`,
          { direction: 'auto', className: 'zone-tooltip', sticky: true }
        );
        layers.push(polyline);

        // Create animated chevron markers for lines with flow
        if (hasFlow) {
          // path[0] = Ontario side, path[1] = external side
          // Export (positive MW) = arrows from Ontario → external (path[0] → path[1])
          // Import (negative MW) = arrows from external → Ontario (path[1] → path[0])
          const from: [number, number] = isExport ? intertie.path[0] : intertie.path[1];
          const to: [number, number] = isExport ? intertie.path[1] : intertie.path[0];

          const bearing = getBearing(from[0], from[1], to[0], to[1]);
          const chevronColor = isExport ? '#3FB950' : '#F85149';

          // Create 3 staggered chevrons per line
          for (let i = 0; i < 3; i++) {
            const icon = L.divIcon({
              html: `<span style="
                font-size: 16px;
                font-weight: bold;
                color: ${chevronColor};
                text-shadow: 0 0 4px ${chevronColor};
                transform: rotate(${bearing - 90}deg);
                display: inline-block;
                pointer-events: none;
                line-height: 1;
              ">&rsaquo;&rsaquo;&rsaquo;</span>`,
              className: '',
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            });

            const marker = L.marker(from, {
              icon,
              interactive: false,
              keyboard: false,
            });
            layers.push(marker);

            chevronMarkers.push({
              marker,
              from,
              to,
              offset: i / 3, // stagger: 0, 0.33, 0.66
            });
          }
        }
      });

      const layerGroup = L.layerGroup(layers);
      layerGroup.addTo(map);
      transmissionLayerRef.current = layerGroup;

      // Animation loop
      if (chevronMarkers.length > 0) {
        const cycleDuration = 2000; // ms per full cycle
        const startTime = performance.now();

        const animate = (now: number) => {
          const elapsed = now - startTime;

          for (const chev of chevronMarkers) {
            // Progress 0→1 over cycleDuration, offset by stagger
            const rawT = ((elapsed / cycleDuration) + chev.offset) % 1;
            const t = rawT;

            // Interpolate position
            const lat = chev.from[0] + t * (chev.to[0] - chev.from[0]);
            const lng = chev.from[1] + t * (chev.to[1] - chev.from[1]);
            chev.marker.setLatLng([lat, lng]);

            // Fade: sin curve peaks at 0.5 progress
            const opacity = Math.sin(t * Math.PI);
            const el = chev.marker.getElement();
            if (el) {
              el.style.opacity = String(opacity);
            }
          }

          animationFrameRef.current = requestAnimationFrame(animate);
        };

        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    loadLayer();

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [mapReady, showTransmission]);

  // Manage temperature overlay layer - using ECCC WMS with crossfade for smooth transitions
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (!showTemp) {
      // Remove all layers when disabled
      if (tempWmsLayerRef.current) {
        map.removeLayer(tempWmsLayerRef.current);
        tempWmsLayerRef.current = null;
      }
      if (tempWmsBufferRef.current) {
        map.removeLayer(tempWmsBufferRef.current);
        tempWmsBufferRef.current = null;
      }
      if (tempLayerRef.current) {
        map.removeLayer(tempLayerRef.current);
        tempLayerRef.current = null;
      }
      tempTimeRef.current = undefined;
      return;
    }

    const timeStr = snapToGdpsTime(scrubTime);

    // Skip if time hasn't changed
    if (timeStr === tempTimeRef.current && tempWmsLayerRef.current) {
      return;
    }

    const updateLayer = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import('leaflet')) as any;

      // Store old layer ref BEFORE creating new one
      const oldLayer = tempWmsLayerRef.current;

      const wmsOptions: Record<string, unknown> = {
        layers: 'GDPS.ETA_TT',
        format: 'image/png',
        transparent: true,
        opacity: 0.5, // Start at target opacity (no fade to avoid race conditions)
        attribution: '&copy; <a href="https://weather.gc.ca/">ECCC</a>',
      };
      if (timeStr) {
        wmsOptions.time = timeStr;
      }

      // Create new layer and add to map
      const newLayer = L.tileLayer.wms('https://geo.weather.gc.ca/geomet', wmsOptions);
      newLayer.setZIndex(100);
      newLayer.addTo(map);
      tempWmsLayerRef.current = newLayer;
      tempTimeRef.current = timeStr;

      // Remove old layer AFTER new one is added (instant swap, no animation)
      if (oldLayer && map.hasLayer(oldLayer)) {
        map.removeLayer(oldLayer);
      }
    };

    updateLayer();
  }, [mapReady, showTemp, scrubTime]);

  // Manage temperature zone markers (separate from WMS to avoid flashing)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    // Remove old markers
    if (tempLayerRef.current) {
      map.removeLayer(tempLayerRef.current);
      tempLayerRef.current = null;
    }

    if (!showTemp || Object.keys(weatherData).length === 0) return;

    const loadMarkers = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import('leaflet')) as any;

      const markers: L.Marker[] = [];
      Object.entries(weatherData).forEach(([zone, data]) => {
        const feature = (ontarioZones as GeoJSON.FeatureCollection).features
          .find(f => f.properties?.zone === zone);
        if (!feature) return;

        const bounds = L.geoJSON(feature).getBounds();
        const center = bounds.getCenter();

        const icon = L.divIcon({
          html: `
            <div style="
              font-family: 'JetBrains Mono', monospace;
              font-size: 11px;
              font-weight: 600;
              color: ${tempToColor(data.temperature)};
              background: rgba(13, 17, 23, 0.85);
              padding: 2px 5px;
              border: 1px solid #30363D;
              text-shadow: 0 0 4px rgba(0,0,0,0.8);
              white-space: nowrap;
            ">${data.temperature.toFixed(0)}°</div>
          `,
          className: '',
          iconSize: [40, 20],
          iconAnchor: [20, 10],
        });

        const marker = L.marker([center.lat, center.lng], { icon, interactive: false });
        markers.push(marker);
      });

      const markerGroup = L.layerGroup(markers);
      markerGroup.addTo(map);
      tempLayerRef.current = markerGroup;
    };

    loadMarkers();
  }, [mapReady, showTemp, weatherData]);

  // Manage cloud cover overlay layer - using ECCC WMS with crossfade
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (!showCloud) {
      if (cloudWmsLayerRef.current) {
        map.removeLayer(cloudWmsLayerRef.current);
        cloudWmsLayerRef.current = null;
      }
      if (cloudWmsBufferRef.current) {
        map.removeLayer(cloudWmsBufferRef.current);
        cloudWmsBufferRef.current = null;
      }
      if (cloudLayerRef.current) {
        map.removeLayer(cloudLayerRef.current);
        cloudLayerRef.current = null;
      }
      cloudTimeRef.current = undefined;
      return;
    }

    const timeStr = snapToGdpsTime(scrubTime);

    // Skip if time hasn't changed
    if (timeStr === cloudTimeRef.current && cloudWmsLayerRef.current) {
      return;
    }

    const updateLayer = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import('leaflet')) as any;

      // Store old layer ref BEFORE creating new one
      const oldLayer = cloudWmsLayerRef.current;

      const wmsOptions: Record<string, unknown> = {
        layers: 'GDPS.ETA_NT',
        format: 'image/png',
        transparent: true,
        opacity: 0.5, // Start at target opacity (no fade to avoid race conditions)
        attribution: '&copy; <a href="https://weather.gc.ca/">ECCC</a>',
      };
      if (timeStr) {
        wmsOptions.time = timeStr;
      }

      // Create new layer and add to map
      const newLayer = L.tileLayer.wms('https://geo.weather.gc.ca/geomet', wmsOptions);
      newLayer.setZIndex(90);
      newLayer.addTo(map);
      cloudWmsLayerRef.current = newLayer;
      cloudTimeRef.current = timeStr;

      // Remove old layer AFTER new one is added (instant swap, no animation)
      if (oldLayer && map.hasLayer(oldLayer)) {
        map.removeLayer(oldLayer);
      }
    };

    updateLayer();
  }, [mapReady, showCloud, scrubTime]);

  // Manage cloud zone markers
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (cloudLayerRef.current) {
      map.removeLayer(cloudLayerRef.current);
      cloudLayerRef.current = null;
    }

    if (!showCloud || Object.keys(weatherData).length === 0) return;

    const loadMarkers = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import('leaflet')) as any;

      const markers: L.Marker[] = [];
      Object.entries(weatherData).forEach(([zone, data]) => {
        const feature = (ontarioZones as GeoJSON.FeatureCollection).features
          .find(f => f.properties?.zone === zone);
        if (!feature) return;

        const bounds = L.geoJSON(feature).getBounds();
        const center = bounds.getCenter();

        const cloudIcon = data.cloud_cover > 75 ? '☁️' :
                          data.cloud_cover > 50 ? '⛅' :
                          data.cloud_cover > 25 ? '🌤️' : '☀️';

        const icon = L.divIcon({
          html: `
            <div style="
              font-family: 'JetBrains Mono', monospace;
              font-size: 14px;
              text-align: center;
              filter: drop-shadow(0 0 2px rgba(0,0,0,0.8));
            ">${cloudIcon}</div>
          `,
          className: '',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const marker = L.marker([center.lat, center.lng], {
          icon,
          interactive: true,
        }).bindTooltip(`
          <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 8px; background: #161B22; border: 1px solid #30363D;">
            <div style="font-weight: 600; color: #E6EDF3; margin-bottom: 4px;">${zone}</div>
            <div style="color: #8B949E;">${data.cloud_cover}% cloud cover</div>
          </div>
        `, { direction: 'auto', className: 'zone-tooltip' });

        markers.push(marker);
      });

      const markerGroup = L.layerGroup(markers);
      markerGroup.addTo(map);
      cloudLayerRef.current = markerGroup;
    };

    loadMarkers();
  }, [mapReady, showCloud, weatherData]);

  // Manage precipitation forecast WMS layer with crossfade
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (!showPrecip) {
      if (precipLayerRef.current) {
        map.removeLayer(precipLayerRef.current);
        precipLayerRef.current = null;
      }
      if (precipBufferRef.current) {
        map.removeLayer(precipBufferRef.current);
        precipBufferRef.current = null;
      }
      precipTimeRef.current = undefined;
      return;
    }

    const timeStr = snapToGdpsTime(scrubTime);

    // Skip if time hasn't changed
    if (timeStr === precipTimeRef.current && precipLayerRef.current) {
      return;
    }

    const updateLayer = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import('leaflet')) as any;

      // Store old layer ref BEFORE creating new one
      const oldLayer = precipLayerRef.current;

      const wmsOptions: Record<string, unknown> = {
        layers: 'GDPS.ETA_PR',
        format: 'image/png',
        transparent: true,
        opacity: 0.6, // Start at target opacity (no fade to avoid race conditions)
        attribution: '&copy; <a href="https://weather.gc.ca/">ECCC</a>',
      };
      if (timeStr) {
        wmsOptions.time = timeStr;
      }

      // Create new layer and add to map
      const newLayer = L.tileLayer.wms('https://geo.weather.gc.ca/geomet', wmsOptions);
      newLayer.setZIndex(95);
      newLayer.addTo(map);
      precipLayerRef.current = newLayer;
      precipTimeRef.current = timeStr;

      // Remove old layer AFTER new one is added (instant swap, no animation)
      if (oldLayer && map.hasLayer(oldLayer)) {
        map.removeLayer(oldLayer);
      }
    };

    updateLayer();
  }, [mapReady, showPrecip, scrubTime]);

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', width: '100%', background: '#0D1117' }}
    />
  );
}

export default function OntarioMap({ onZoneSelect, selectedZone }: Props) {
  const [zonePrices, setZonePrices] = useState<ZonePriceMap>({});
  const [weatherData, setWeatherData] = useState<WeatherDataMap>({});
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [showGeneration, setShowGeneration] = useState(true);
  const [showTransmission, setShowTransmission] = useState(true);
  const [showPricing, setShowPricing] = useState(true);
  const [showTemp, setShowTemp] = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  const [showPrecip, setShowPrecip] = useState(false);
  const [showScrubber, setShowScrubber] = useState(true);
  const [scrubTime, setScrubTime] = useState<Date>(new Date());
  const [isPlaying, setIsPlaying] = useState(false);
  const [priceSource, setPriceSource] = useState<'realtime' | 'day_ahead' | 'unavailable'>('realtime');

  // Fetch zone prices (current or at specific time)
  const fetchZonePrices = useCallback(async (atTime?: Date) => {
    try {
      const url = atTime
        ? `/api/prices/at-time?timestamp=${atTime.toISOString()}`
        : '/api/prices';
      const pricesRes = await fetch(url);

      if (!pricesRes.ok) {
        throw new Error('Failed to fetch zone data');
      }

      const pricesData = await pricesRes.json();

      // Track the source for time scrubber display
      if (pricesData.source === 'day_ahead') {
        setPriceSource('day_ahead');
      } else if (pricesData.source === 'realtime') {
        setPriceSource('realtime');
      } else if (pricesData.data?.length === 0 && atTime && atTime > new Date()) {
        setPriceSource('unavailable');
      } else {
        setPriceSource('realtime');
      }

      // Create lookup map
      const priceMap: ZonePriceMap = {};

      pricesData.data.forEach((p: { zone: string; price: number; last_updated?: string }) => {
        priceMap[p.zone] = {
          zone: p.zone,
          price: p.price,
          demand_mw: 0,
          last_updated: p.last_updated || new Date().toISOString(),
        };
      });

      setZonePrices(priceMap);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching zone prices:', err);
      setLoading(false);
    }
  }, []);

  // Fetch weather data (current or at specific time)
  const fetchWeatherData = useCallback(async (atTime?: Date) => {
    try {
      const url = atTime
        ? `/api/weather/at-time?timestamp=${atTime.toISOString()}`
        : '/api/weather';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const map: WeatherDataMap = {};
        for (const row of json.data as WeatherData[]) {
          map[row.zone] = row;
        }
        setWeatherData(map);
      }
    } catch (err) {
      console.error('Weather fetch error:', err);
    }
  }, []);

  // Fetch data at scrubbed time when scrubber is active
  useEffect(() => {
    if (!showScrubber) return;

    // Reduced debounce for faster scrubbing response (WMS layers update immediately)
    const timeout = setTimeout(() => {
      fetchZonePrices(scrubTime);
      fetchWeatherData(scrubTime);
    }, 50);

    return () => clearTimeout(timeout);
  }, [showScrubber, scrubTime, fetchZonePrices, fetchWeatherData]);

  // Initial fetch and regular polling (only when not scrubbing)
  useEffect(() => {
    setMounted(true);
    fetchZonePrices();
    fetchWeatherData();

    // Only poll when not showing scrubber
    if (showScrubber) return;

    const priceInterval = setInterval(() => fetchZonePrices(), 30000);
    const weatherInterval = setInterval(() => fetchWeatherData(), 60000);
    return () => {
      clearInterval(priceInterval);
      clearInterval(weatherInterval);
    };
  }, [fetchZonePrices, fetchWeatherData, showScrubber]);

  // Handle live button click
  const handleLiveClick = useCallback(() => {
    setScrubTime(new Date());
    setIsPlaying(false);
  }, []);

  // Calculate province-wide average
  const avgPrice = useMemo(() => {
    const prices = Object.values(zonePrices).map(z => z.price);
    if (prices.length === 0) return null;
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }, [zonePrices]);

  return (
    <Card className={styles.card} style={{ aspectRatio: '1 / 0.85', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div className={styles.headerRow}>
        <h2 className={styles.header}>ONTARIO ZONE MAP</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '10px', alignItems: 'center' }}>
          {avgPrice !== null && (
            <div style={{ color: '#8B949E', whiteSpace: 'nowrap' }}>
              Avg: <span style={{ color: priceToColor(avgPrice), fontWeight: 600 }}>${avgPrice.toFixed(2)}</span>
            </div>
          )}
          {showPricing && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ color: '#8B949E' }}>$:</span>
              <div style={{ display: 'flex', gap: '2px' }}>
                {([
                  { color: '#1E5AA8', label: '< -$2000', desc: 'Deep Negative' },
                  { color: '#4A90D9', label: '-$2000 to -$100', desc: 'Negative' },
                  { color: '#7FE5E5', label: '-$100 to -$16', desc: 'Low Negative' },
                  { color: '#D4F5D4', label: '-$16 to -$4', desc: 'Near Zero (-)' },
                  { color: '#FFF8D6', label: '-$4 to $0', desc: 'Near Zero' },
                  { color: '#FCE88C', label: '$0 to $10', desc: 'Low' },
                  { color: '#F8D14F', label: '$10 to $30', desc: 'Normal' },
                  { color: '#F5A623', label: '$30 to $60', desc: 'Moderate' },
                  { color: '#E07830', label: '$60 to $100', desc: 'Elevated' },
                  { color: '#C83C23', label: '$100 to $400', desc: 'High' },
                  { color: '#8B2913', label: '$400 to $1200', desc: 'Very High' },
                  { color: '#5C1A0B', label: '> $1200', desc: 'Critical' },
                ] as const).map((tier) => (
                  <Tooltip
                    key={tier.color}
                    content={
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{tier.desc}</div>
                        <div style={{ color: tier.color }}>{tier.label}/MWh</div>
                      </div>
                    }
                  >
                    <div style={{ width: 10, height: 10, background: tier.color, cursor: 'default' }} />
                  </Tooltip>
                ))}
              </div>
            </div>
          )}
          {showGeneration && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ color: '#8B949E' }}>Fuel:</span>
              <div style={{ display: 'flex', gap: '3px' }}>
                {Object.entries(FUEL_COLORS).map(([fuel, color]) => (
                  <Tooltip key={fuel} content={<span style={{ textTransform: 'capitalize' }}>{fuel}</span>}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, cursor: 'default' }} />
                  </Tooltip>
                ))}
              </div>
            </div>
          )}
          {showTemp && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ color: '#8B949E' }}>°C:</span>
              <div style={{ display: 'flex', gap: '2px' }}>
                {([
                  { color: '#1E5AA8', label: '< -20°C' },
                  { color: '#4A90D9', label: '-20 to -10°C' },
                  { color: '#7FE5E5', label: '-10 to 0°C' },
                  { color: '#A8E6CF', label: '0 to 10°C' },
                  { color: '#FCE88C', label: '10 to 20°C' },
                  { color: '#F5A623', label: '20 to 30°C' },
                  { color: '#C83C23', label: '> 30°C' },
                ] as const).map((tier) => (
                  <Tooltip key={tier.color} content={tier.label}>
                    <div style={{ width: 10, height: 10, background: tier.color, cursor: 'default' }} />
                  </Tooltip>
                ))}
              </div>
            </div>
          )}
          {showPrecip && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ color: '#8B949E' }}>mm:</span>
              <div style={{ display: 'flex', gap: '2px' }}>
                {([
                  { color: '#E8F4E8', label: '0 mm', desc: 'None' },
                  { color: '#A8D5BA', label: '< 1 mm', desc: 'Trace' },
                  { color: '#7EC8E3', label: '1-2 mm', desc: 'Light' },
                  { color: '#4A90D9', label: '2-5 mm', desc: 'Moderate' },
                  { color: '#1E5AA8', label: '5-10 mm', desc: 'Heavy' },
                  { color: '#7B68EE', label: '10-25 mm', desc: 'Very Heavy' },
                  { color: '#9932CC', label: '> 25 mm', desc: 'Extreme' },
                ] as const).map((tier) => (
                  <Tooltip
                    key={tier.color}
                    content={
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{tier.desc}</div>
                        <div style={{ color: tier.color }}>{tier.label}</div>
                      </div>
                    }
                  >
                    <div style={{ width: 10, height: 10, background: tier.color, cursor: 'default' }} />
                  </Tooltip>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {!mounted || loading ? (
        <div className={styles.placeholder}>Loading map...</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative' }}>
          <MapContent
            zonePrices={zonePrices}
            selectedZone={selectedZone}
            onZoneSelect={onZoneSelect}
            showGeneration={showGeneration}
            showTransmission={showTransmission}
            showPricing={showPricing}
            showTemp={showTemp}
            showCloud={showCloud}
            showPrecip={showPrecip}
            weatherData={weatherData}
            scrubTime={showScrubber ? scrubTime : null}
          />
          {showScrubber && (
            <TimeScrubber
              currentTime={scrubTime}
              onTimeChange={setScrubTime}
              isPlaying={isPlaying}
              onPlayPause={() => setIsPlaying((v) => !v)}
              onLiveClick={handleLiveClick}
              priceSource={priceSource}
              showWeatherOverlay={showTemp || showCloud || showPrecip}
            />
          )}
        </div>
      )}

      <div className={styles.weatherBar}>
        <button
          className={showPricing ? styles.weatherBtnActive : styles.weatherBtn}
          onClick={() => setShowPricing((v) => !v)}
        >
          <Icon icon="dollar" size={12} />
          <span>Pricing</span>
        </button>
        <button
          className={showGeneration ? styles.weatherBtnActive : styles.weatherBtn}
          onClick={() => setShowGeneration((v) => !v)}
        >
          <Icon icon="flash" size={12} />
          <span>Generation</span>
        </button>
        <button
          className={showTransmission ? styles.weatherBtnActive : styles.weatherBtn}
          onClick={() => setShowTransmission((v) => !v)}
        >
          <Icon icon="route" size={12} />
          <span>Transmission</span>
        </button>
        <button
          className={showTemp ? styles.weatherBtnActive : styles.weatherBtn}
          onClick={() => setShowTemp((v) => !v)}
        >
          <Icon icon="temperature" size={12} />
          <span>Temp</span>
        </button>
        <button
          className={showCloud ? styles.weatherBtnActive : styles.weatherBtn}
          onClick={() => setShowCloud((v) => !v)}
        >
          <Icon icon="cloud" size={12} />
          <span>Cloud</span>
        </button>
        <button
          className={showPrecip ? styles.weatherBtnActive : styles.weatherBtn}
          onClick={() => setShowPrecip((v) => !v)}
        >
          <Icon icon="tint" size={12} />
          <span>Precip</span>
        </button>
        <button
          className={showScrubber ? styles.weatherBtnActive : styles.weatherBtn}
          onClick={() => {
            setShowScrubber((v) => !v);
            if (!showScrubber) {
              setScrubTime(new Date());
              setIsPlaying(false);
            }
          }}
        >
          <Icon icon="time" size={12} />
          <span>Time</span>
        </button>
      </div>

      <style jsx global>{`
        .zone-tooltip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .zone-tooltip .leaflet-tooltip-content {
          margin: 0 !important;
        }
        .leaflet-container {
          font-family: 'JetBrains Mono', monospace !important;
        }
        .leaflet-control-zoom a {
          background: #161B22 !important;
          color: #E6EDF3 !important;
          border-color: #30363D !important;
          border-radius: 0 !important;
        }
        .leaflet-control-zoom a:hover {
          background: #30363D !important;
        }
        .leaflet-control-zoom {
          border: 1px solid #30363D !important;
          border-radius: 0 !important;
        }
        .leaflet-control-attribution {
          background: rgba(13, 17, 23, 0.8) !important;
          color: #8B949E !important;
          font-size: 9px !important;
        }
        .leaflet-control-attribution a {
          color: #58A6FF !important;
        }
        /* Glow effect for selected zone */
        .zone-selected {
          filter: drop-shadow(0 0 8px rgba(88, 166, 255, 0.6)) drop-shadow(0 0 16px rgba(88, 166, 255, 0.4));
        }
        /* Inner glow border on hover */
        .zone-hover {
          stroke: #58A6FF !important;
          stroke-width: 2.5 !important;
          filter: drop-shadow(0 0 6px rgba(88, 166, 255, 0.6)) drop-shadow(0 0 12px rgba(88, 166, 255, 0.3));
        }
        .leaflet-interactive {
          cursor: pointer;
        }
        /* Smooth opacity transitions for WMS layers */
        .leaflet-tile-pane .leaflet-layer {
          transition: opacity 0.3s ease-in-out;
        }
      `}</style>
    </Card>
  );
}
