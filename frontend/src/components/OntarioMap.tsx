'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Card } from '@blueprintjs/core';
import styles from './Card.module.css';
import ontarioZones from '@/data/ontario-zones.geojson';
import type { ZoneData } from '@/lib/types';

// Price-to-color mapping for zone coloring
const priceToColor = (price: number): string => {
  if (price < 0) return '#3FB950';      // Negative (green) - surplus
  if (price < 30) return '#238636';     // Low (dark green)
  if (price < 50) return '#58A6FF';     // Normal (blue)
  if (price < 100) return '#1F6FEB';    // Moderate (darker blue)
  if (price < 150) return '#D29922';    // Elevated (yellow)
  if (price < 200) return '#DB6D28';    // High (orange)
  if (price < 300) return '#F85149';    // Very high (red)
  return '#DA3633';                     // Critical (dark red)
};

const priceToOpacity = (price: number): number => {
  const baseOpacity = 0.4;
  const maxOpacity = 0.8;
  const normalizedPrice = Math.min(Math.abs(price) / 200, 1);
  return baseOpacity + normalizedPrice * (maxOpacity - baseOpacity);
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
  onZoneSelect
}: {
  zonePrices: ZonePriceMap;
  selectedZone?: string | null;
  onZoneSelect?: (zone: string | null) => void;
}) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
        center: [50.0, -85.0],
        zoom: 5,
        scrollWheelZoom: true,
        zoomControl: true,
      });

      mapRef.current = map;

      // Add dark tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      }).addTo(map);

      // Add GeoJSON layer
      const geojsonLayer = L.geoJSON(ontarioZones as GeoJSON.FeatureCollection, {
        style: (feature: GeoJSON.Feature | undefined) => {
          if (!feature?.properties?.zone) {
            return {
              fillColor: '#30363D',
              fillOpacity: 0.3,
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
            fillOpacity: isSelected ? 0.9 : priceToOpacity(price),
            color: isSelected ? '#58A6FF' : '#30363D',
            weight: isSelected ? 3 : 1,
            className: isSelected ? 'zone-selected' : '',
          };
        },
        onEachFeature: (feature: GeoJSON.Feature, layer: L.Layer) => {
          const zone = feature.properties?.zone;
          if (!zone) return;

          const zoneData = zonePrices[zone];

          // Tooltip content
          const tooltipContent = `
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 8px; background: #161B22; border: 1px solid #30363D;">
              <div style="font-weight: 600; color: #E6EDF3; margin-bottom: 4px;">${feature.properties?.name || zone}</div>
              <div style="color: #D29922;">Price: $${zoneData?.price?.toFixed(2) || 'N/A'}/MWh</div>
              <div style="color: #39D5FF;">Demand: ${zoneData?.demand_mw?.toLocaleString() || 'N/A'} MW</div>
            </div>
          `;

          layer.bindTooltip(tooltipContent, {
            permanent: false,
            direction: 'auto',
            className: 'zone-tooltip',
          });

          // Click handler - toggle selection
          layer.on('click', () => {
            if (onZoneSelect) {
              // Toggle: if same zone clicked, deselect; otherwise select new zone
              onZoneSelect(zone === selectedZone ? null : zone);
            }
          });

          // Hover effects
          layer.on('mouseover', () => {
            (layer as L.Path).setStyle({
              fillOpacity: 0.9,
              weight: 2,
            });
          });

          layer.on('mouseout', () => {
            const price = zonePrices[zone]?.price || 0;
            const isSelected = zone === selectedZone;
            (layer as L.Path).setStyle({
              fillColor: priceToColor(price),
              fillOpacity: isSelected ? 0.9 : priceToOpacity(price),
              color: isSelected ? '#58A6FF' : '#30363D',
              weight: isSelected ? 3 : 1,
            });
          });
        },
      }).addTo(map);

      // Fit bounds to Ontario
      map.fitBounds(geojsonLayer.getBounds(), { padding: [20, 20] });
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

  // Update styles when prices change
  useEffect(() => {
    if (!mapRef.current) return;

    mapRef.current.eachLayer((layer) => {
      if ((layer as L.GeoJSON).feature) {
        const geoLayer = layer as L.GeoJSON;
        geoLayer.setStyle((feature) => {
          if (!feature?.properties?.zone) {
            return {
              fillColor: '#30363D',
              fillOpacity: 0.3,
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
            fillOpacity: isSelected ? 0.9 : priceToOpacity(price),
            color: isSelected ? '#58A6FF' : '#30363D',
            weight: isSelected ? 3 : 1,
          };
        });
      }
    });
  }, [zonePrices, selectedZone]);

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', width: '100%', background: '#0D1117' }}
    />
  );
}

export default function OntarioMap({ onZoneSelect, selectedZone }: Props) {
  const [zonePrices, setZonePrices] = useState<ZonePriceMap>({});
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Fetch zone prices
  const fetchZonePrices = useCallback(async () => {
    try {
      const [pricesRes, demandRes] = await Promise.all([
        fetch('/api/prices'),
        fetch('/api/demand'),
      ]);

      if (!pricesRes.ok || !demandRes.ok) {
        throw new Error('Failed to fetch zone data');
      }

      const pricesData = await pricesRes.json();
      const demandData = await demandRes.json();

      // Create lookup map
      const priceMap: ZonePriceMap = {};

      // Add prices
      pricesData.data.forEach((p: { zone: string; price: number; last_updated: string }) => {
        priceMap[p.zone] = {
          zone: p.zone,
          price: p.price,
          demand_mw: 0,
          last_updated: p.last_updated,
        };
      });

      // Add demand
      demandData.data.forEach((d: { zone: string; demand_mw: number; last_updated: string }) => {
        if (priceMap[d.zone]) {
          priceMap[d.zone].demand_mw = d.demand_mw;
        } else {
          priceMap[d.zone] = {
            zone: d.zone,
            price: 0,
            demand_mw: d.demand_mw,
            last_updated: d.last_updated,
          };
        }
      });

      setZonePrices(priceMap);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching zone prices:', err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchZonePrices();
    const interval = setInterval(fetchZonePrices, 30000);
    return () => clearInterval(interval);
  }, [fetchZonePrices]);

  // Calculate province-wide average
  const avgPrice = useMemo(() => {
    const prices = Object.values(zonePrices).map(z => z.price);
    if (prices.length === 0) return null;
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }, [zonePrices]);

  return (
    <Card className={styles.card} style={{ height: 500, position: 'relative' }}>
      <div className={styles.headerRow}>
        <h2 className={styles.header}>ONTARIO ZONE MAP</h2>
        <div style={{ display: 'flex', gap: '16px', fontSize: '10px', alignItems: 'center' }}>
          {avgPrice !== null && (
            <div style={{ color: '#8B949E' }}>
              Avg Price: <span style={{ color: priceToColor(avgPrice), fontWeight: 600 }}>${avgPrice.toFixed(2)}/MWh</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#8B949E' }}>Price:</span>
            <div style={{ display: 'flex', gap: '2px' }}>
              <div style={{ width: 12, height: 12, background: '#3FB950' }} title="< $30" />
              <div style={{ width: 12, height: 12, background: '#58A6FF' }} title="$30-50" />
              <div style={{ width: 12, height: 12, background: '#D29922' }} title="$100-150" />
              <div style={{ width: 12, height: 12, background: '#F85149' }} title="> $200" />
            </div>
          </div>
        </div>
      </div>

      {!mounted || loading ? (
        <div className={styles.placeholder}>Loading map...</div>
      ) : (
        <div style={{ height: 'calc(100% - 40px)', width: '100%' }}>
          <MapContent
            zonePrices={zonePrices}
            selectedZone={selectedZone}
            onZoneSelect={onZoneSelect}
          />
        </div>
      )}

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
        .leaflet-interactive {
          cursor: pointer;
        }
      `}</style>
    </Card>
  );
}
