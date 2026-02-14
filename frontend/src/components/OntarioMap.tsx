"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Icon } from "@blueprintjs/core";
import styles from "./Card.module.css";
import ontarioZones from "@/data/ontario-zones.geojson";
import { GENERATION_SITES, FUEL_COLORS } from "@/data/generation-sites";
import {
  TRANSMISSION_IMAGE_URL,
  TRANSMISSION_BOUNDS,
  INTERTIES,
} from "@/data/transmission-lines";
import type { ZoneData, WeatherDataMap, WeatherData } from "@/lib/types";
import Tooltip from "./Tooltip";
import TimeScrubber from "./TimeScrubber";

// Price-to-color mapping for zone coloring (IESO-aligned 12-tier scale)
const priceToColor = (price: number | null | undefined): string => {
  if (price === null || price === undefined) return "#888888"; // Undefined
  if (price < -2000) return "#1E5AA8"; // < -$2,000 (dark blue)
  if (price < -100) return "#4A90D9"; // < -$100 (blue)
  if (price < -16) return "#7FE5E5"; // < -$16 (cyan)
  if (price < -4) return "#D4F5D4"; // < -$4 (light green)
  if (price < 0) return "#FFF8D6"; // < $0 (pale yellow)
  if (price < 10) return "#FCE88C"; // < $10 (light yellow)
  if (price < 30) return "#F8D14F"; // < $30 (yellow)
  if (price < 60) return "#F5A623"; // < $60 (light orange)
  if (price < 100) return "#E07830"; // < $100 (orange)
  if (price < 400) return "#C83C23"; // < $400 (red)
  if (price < 1200) return "#8B2913"; // < $1,200 (darker red)
  return "#5C1A0B"; // >= $1,200 (dark brown)
};

const priceToOpacity = (price: number): number => {
  const baseOpacity = 0.12;
  const maxOpacity = 0.3;
  const normalizedPrice = Math.min(Math.abs(price) / 200, 1);
  return baseOpacity + normalizedPrice * (maxOpacity - baseOpacity);
};

// Temperature to color (cold blue → hot red)
const tempToColor = (celsius: number): string => {
  if (celsius < -20) return "#1E5AA8"; // Deep cold (dark blue)
  if (celsius < -10) return "#4A90D9"; // Very cold (blue)
  if (celsius < 0) return "#7FE5E5"; // Cold (cyan)
  if (celsius < 10) return "#A8E6CF"; // Cool (light green)
  if (celsius < 20) return "#FCE88C"; // Mild (yellow)
  if (celsius < 30) return "#F5A623"; // Warm (orange)
  return "#C83C23"; // Hot (red)
};

// Snap time to nearest hour (intertie data is hourly granularity)
const snapToHour = (date: Date | null): string | null => {
  if (!date) return null;
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
};

// Compute bearing between two lat/lng points (degrees)
const getBearing = (
  lat0: number,
  lng0: number,
  lat1: number,
  lng1: number,
): number => {
  const dLng = lng1 - lng0;
  const dLat = lat1 - lat0;
  return Math.atan2(dLng, dLat) * (180 / Math.PI);
};

// Snap time to nearest 3-hour boundary for GDPS WMS model
// GDPS model only has data at 00, 03, 06, 09, 12, 15, 18, 21 UTC
const snapToGdpsTime = (date: Date | null): string | undefined => {
  if (!date) return undefined;
  const d = new Date(date);
  const hours = d.getUTCHours();
  const snappedHour = Math.round(hours / 3) * 3;
  d.setUTCHours(snappedHour, 0, 0, 0);
  return d.toISOString().split(".")[0] + "Z";
};

// Bounds covering Ontario + surrounding region to avoid global tile requests
const WMS_BOUNDS: [[number, number], [number, number]] = [
  [40, -96],
  [57, -65],
];
const WMS_URL = "https://geo.weather.gc.ca/geomet";
const WMS_CONFIGS = {
  temp: { layers: "GDPS.ETA_TT", opacity: 0.5, zIndex: 100 },
  cloud: { layers: "GDPS.ETA_NT", opacity: 0.5, zIndex: 90 },
  precip: { layers: "GDPS.ETA_PR", opacity: 0.6, zIndex: 95 },
} as const;
type WmsType = keyof typeof WMS_CONFIGS;

// Generate all GDPS 3-hour time steps within ±12h of now
const getGdpsTimeSteps = (): string[] => {
  const now = Date.now();
  const THREE_H = 3 * 60 * 60 * 1000;
  const start = Math.floor((now - 12 * 60 * 60 * 1000) / THREE_H) * THREE_H;
  const end = Math.ceil((now + 12 * 60 * 60 * 1000) / THREE_H) * THREE_H;
  const steps: string[] = [];
  for (let t = start; t <= end; t += THREE_H) {
    const d = new Date(t);
    steps.push(d.toISOString().split(".")[0] + "Z");
  }
  return steps;
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
  const zonePricesRef = useRef<ZonePriceMap>(zonePrices);
  const selectedZoneRef = useRef(selectedZone);
  const generationLayerRef = useRef<L.LayerGroup | null>(null);
  // Transmission layer split: base (static) + chevrons (dynamic) + animation (independent)
  const transmissionBaseLayerRef = useRef<L.LayerGroup | null>(null);
  const transmissionChevronLayerRef = useRef<L.LayerGroup | null>(null);
  const chevronMarkersRef = useRef<
    {
      marker: L.Marker;
      from: [number, number];
      to: [number, number];
      offset: number;
    }[]
  >([]);
  const intertieFlowCacheRef = useRef<
    Map<
      string,
      {
        data: Record<string, { mw: number; lastUpdated: string }>;
        daPrices?: Record<string, number>;
        rtPrices?: Record<string, number>;
        fetchedAt: number;
      }
    >
  >(new Map());
  const lastIntertieHourRef = useRef<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineRefsRef = useRef<Map<string, { visible: any; hit: any }>>(new Map());
  const tempLayerRef = useRef<L.GeoJSON | null>(null);
  const cloudLayerRef = useRef<L.GeoJSON | null>(null);
  // WMS preload cache: all GDPS time steps × 3 layer types, keyed by ISO time string
  const wmsCacheRef = useRef<Record<WmsType, Map<string, L.TileLayer>>>({
    temp: new Map(),
    cloud: new Map(),
    precip: new Map(),
  });
  const activeWmsTimeRef = useRef<Record<WmsType, string | null>>({
    temp: null,
    cloud: null,
    precip: null,
  });
  const animationFrameRef = useRef<number | null>(null);
  const intertiePriceRef = useRef<Record<string, number>>({});
  const ontarioBoundsRef = useRef<L.LatLngBounds | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    // Dynamically import Leaflet
    const initMap = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import("leaflet")) as any;

      // Add Leaflet CSS
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      // Wait for container to be ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (!containerRef.current || mapRef.current) return;

      // Create map
      const map = L.map(containerRef.current, {
        center: [45.5, -84.5],
        zoom: 6,
        scrollWheelZoom: true,
        zoomControl: true,
      });

      mapRef.current = map;

      // Add dark tile layer
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        },
      ).addTo(map);

      // Compute Ontario bounds from GeoJSON for initial view (without adding the layer)
      const boundsLayer = L.geoJSON(ontarioZones as GeoJSON.FeatureCollection);
      ontarioBoundsRef.current = boundsLayer.getBounds();
      // Asymmetric padding: more on bottom so southern Ontario isn't cut off by time scrubber
      const isMobile = window.innerWidth <= 900;
      map.fitBounds(ontarioBoundsRef.current, {
        paddingTopLeft: isMobile ? [40, 30] : [10, 10],
        paddingBottomRight: isMobile ? [40, 120] : [10, 60],
      });

      // Signal that map is ready for layers
      setMapReady(true);
    };

    initMap();

    // Watch for container resize (e.g. PanelWrapper expand/collapse)
    // Debounced to avoid excessive invalidateSize calls during touch gestures
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, 200);
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // We only want to initialize the map once, not on every prop change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pricing Effect A — Create GeoJSON layer once (no zonePrices in deps)
  // Style function reads from zonePricesRef / selectedZoneRef (refs, not state)
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
      const L = (await import("leaflet")) as any;

      const geojsonLayer = L.geoJSON(
        ontarioZones as GeoJSON.FeatureCollection,
        {
          style: (feature: GeoJSON.Feature | undefined) => {
            if (!feature?.properties?.zone) {
              return {
                fillColor: "#30363D",
                fillOpacity: 0.1,
                color: "#30363D",
                weight: 1,
              };
            }

            const zone = feature.properties.zone;
            const zoneData = zonePricesRef.current[zone];
            const price = zoneData?.price || 0;
            const isSelected = zone === selectedZoneRef.current;

            return {
              fillColor: priceToColor(price),
              fillOpacity: isSelected ? 0.5 : priceToOpacity(price),
              color: isSelected ? "#58A6FF" : "#30363D",
              weight: isSelected ? 2 : 1,
              className: isSelected ? "zone-selected" : "",
            };
          },
          onEachFeature: (feature: GeoJSON.Feature, layer: L.Layer) => {
            const zone = feature.properties?.zone;
            if (!zone) return;

            const zoneData = zonePricesRef.current[zone];

            const tooltipContent = `
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 8px; background: #161B22; border: 1px solid #30363D;">
              <div style="font-weight: 600; color: #E6EDF3; margin-bottom: 4px;">${feature.properties?.name || zone}</div>
              <div style="color: #D29922;">Price: $${zoneData?.price?.toFixed(2) || "N/A"}/MWh</div>
            </div>
          `;

            layer.bindTooltip(tooltipContent, {
              permanent: false,
              direction: "auto",
              className: "zone-tooltip",
            });

            layer.on("click", () => {
              if (onZoneSelect) {
                onZoneSelect(zone === selectedZoneRef.current ? null : zone);
              }
            });

            layer.on("mouseover", () => {
              const el = (layer as L.Path).getElement?.();
              if (el) el.classList.add("zone-hover");
            });

            layer.on("mouseout", () => {
              const el = (layer as L.Path).getElement?.();
              if (el) el.classList.remove("zone-hover");
            });
          },
        },
      );

      geojsonLayer.addTo(map);
      pricingLayerRef.current = geojsonLayer;
    };

    loadLayer();
  }, [mapReady, showPricing, onZoneSelect]);

  // Pricing Effect B — Update styles in-place when prices or selection change
  // No layer destruction, just re-runs style function and updates tooltips
  useEffect(() => {
    zonePricesRef.current = zonePrices;
    selectedZoneRef.current = selectedZone;

    if (!pricingLayerRef.current) return;

    // Re-run style function on all features (reads from refs)
    pricingLayerRef.current.setStyle((feature: GeoJSON.Feature | undefined) => {
      if (!feature?.properties?.zone) {
        return {
          fillColor: "#30363D",
          fillOpacity: 0.1,
          color: "#30363D",
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
        color: isSelected ? "#58A6FF" : "#30363D",
        weight: isSelected ? 2 : 1,
        className: isSelected ? "zone-selected" : "",
      };
    });

    // Update tooltip content on each sublayer
    pricingLayerRef.current.eachLayer((layer: L.Layer) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const feature = (layer as any).feature as GeoJSON.Feature | undefined;
      const zone = feature?.properties?.zone;
      if (!zone) return;

      const zoneData = zonePrices[zone];
      layer.setTooltipContent(`
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 8px; background: #161B22; border: 1px solid #30363D;">
          <div style="font-weight: 600; color: #E6EDF3; margin-bottom: 4px;">${feature?.properties?.name || zone}</div>
          <div style="color: #D29922;">Price: $${zoneData?.price?.toFixed(2) || "N/A"}/MWh</div>
        </div>
      `);
    });
  }, [zonePrices, selectedZone]);

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
      const L = (await import("leaflet")) as any;

      const markers = GENERATION_SITES.map((site) =>
        L.circleMarker([site.lat, site.lng], {
          radius: 5,
          fillColor: FUEL_COLORS[site.fuelType],
          fillOpacity: 0.85,
          color: "#0D1117",
          weight: 1,
        }).bindTooltip(
          `<div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 8px; background: #161B22; border: 1px solid #30363D;">
            <div style="font-weight: 600; color: #E6EDF3; margin-bottom: 4px;">${site.name}</div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 8px; height: 8px; background: ${FUEL_COLORS[site.fuelType]};"></span>
              <span style="color: ${FUEL_COLORS[site.fuelType]}; text-transform: capitalize;">${site.fuelType}</span>
            </div>
          </div>`,
          { direction: "auto", className: "zone-tooltip" },
        ),
      );

      const layerGroup = L.layerGroup(markers);
      layerGroup.addTo(map);
      generationLayerRef.current = layerGroup;
    };

    loadLayer();
  }, [mapReady, showGeneration]);

  // Effect A — Transmission base layer (static: image overlay + polylines, created once)
  // NO scrubTime dependency — never rebuilds during scrubbing
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    // Remove existing base layer + chevron layer
    if (transmissionBaseLayerRef.current) {
      map.removeLayer(transmissionBaseLayerRef.current);
      transmissionBaseLayerRef.current = null;
    }
    if (transmissionChevronLayerRef.current) {
      map.removeLayer(transmissionChevronLayerRef.current);
      transmissionChevronLayerRef.current = null;
    }
    chevronMarkersRef.current = [];
    polylineRefsRef.current.clear();
    lastIntertieHourRef.current = null;

    if (!showTransmission) return;

    const loadBaseLayer = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import("leaflet")) as any;

      const layers: L.Layer[] = [];

      // Add IESO transmission image overlay
      const imageOverlay = L.imageOverlay(
        TRANSMISSION_IMAGE_URL,
        TRANSMISSION_BOUNDS,
        {
          opacity: 0.85,
          interactive: false,
        },
      );
      layers.push(imageOverlay);

      // Add 8 intertie polylines with default "no data" styling
      // Each intertie gets TWO polylines:
      //   visible: thin styled line (non-interactive)
      //   hit:     wide invisible line for hover detection + tooltip
      INTERTIES.forEach((intertie) => {
        const initialStyle = {
          color: "#F0883E",
          weight: 4,
          opacity: 0.5,
          dashArray: "8, 6",
        };
        const visible = L.polyline(intertie.path, {
          ...initialStyle,
          interactive: false,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (visible as any)._currentStyle = initialStyle;

        const hit = L.polyline(intertie.path, {
          weight: 24,
          opacity: 0,
          color: "#000",
        }).bindTooltip(
          `<div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 8px; background: #161B22; border: 1px solid #30363D;">
            <div style="font-weight: 600; color: #E6EDF3; margin-bottom: 4px;">${intertie.name}</div>
            <div style="color: #8B949E; font-weight: 600;">NO FLOW</div>
          </div>`,
          { direction: "auto", className: "zone-tooltip", sticky: true },
        );

        // Visual hover feedback on the visible line
        hit.on("mouseover", () => {
          visible.setStyle({ opacity: 0.9, weight: 5 });
        });
        hit.on("mouseout", () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const current = (visible as any)._currentStyle;
          visible.setStyle({
            opacity: current?.opacity ?? 0.5,
            weight: current?.weight ?? 4,
          });
        });

        layers.push(visible);
        layers.push(hit);
        polylineRefsRef.current.set(
          intertie.flowKey + ":" + intertie.name,
          { visible, hit },
        );
      });

      const layerGroup = L.layerGroup(layers);
      layerGroup.addTo(map);
      transmissionBaseLayerRef.current = layerGroup;
    };

    loadBaseLayer();
  }, [mapReady, showTransmission]);

  // Rebuild chevron markers from flow data (called by Effect B after data fetch)
  const rebuildChevrons = useCallback(
    async (
      flowByGroup: Record<string, { mw: number; lastUpdated: string }>,
      map: L.Map,
      isFuture = false,
    ) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import("leaflet")) as any;

      // Remove ONLY the chevron layer, not the base layer
      if (transmissionChevronLayerRef.current) {
        map.removeLayer(transmissionChevronLayerRef.current);
        transmissionChevronLayerRef.current = null;
      }

      // Future time: no chevrons at all — empty ref stops animation loop
      if (isFuture) {
        chevronMarkersRef.current = [];
        return;
      }

      const chevronLayers: L.Layer[] = [];
      const newChevrons: typeof chevronMarkersRef.current = [];

      INTERTIES.forEach((intertie) => {
        const entry = flowByGroup[intertie.flowKey];
        const mw = entry?.mw ?? 0;
        const isExport = mw > 0;
        const hasFlow = Math.abs(mw) > 1;

        if (!hasFlow) return;

        // path[0] = Ontario side, path[1] = external side
        const from: [number, number] = isExport
          ? intertie.path[0]
          : intertie.path[1];
        const to: [number, number] = isExport
          ? intertie.path[1]
          : intertie.path[0];
        const bearing = getBearing(from[0], from[1], to[0], to[1]);
        const chevronColor = isExport ? "#3FB950" : "#F85149";

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
            className: "",
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });

          const marker = L.marker(from, {
            icon,
            interactive: false,
            keyboard: false,
          });
          chevronLayers.push(marker);
          newChevrons.push({ marker, from, to, offset: i / 3 });
        }
      });

      if (chevronLayers.length > 0) {
        const chevronGroup = L.layerGroup(chevronLayers);
        chevronGroup.addTo(map);
        transmissionChevronLayerRef.current = chevronGroup;
      }

      // Update shared ref — animation loop automatically picks up new markers
      chevronMarkersRef.current = newChevrons;
    },
    [],
  );

  // Effect B — Flow data fetch (decoupled from rendering, snap-to-hour skip logic)
  useEffect(() => {
    if (!mapReady || !mapRef.current || !showTransmission) return;
    const map = mapRef.current;

    // Count interties per flowKey for aggregate labeling
    const intertieCountByKey: Record<string, number> = {};
    INTERTIES.forEach((i) => {
      intertieCountByKey[i.flowKey] = (intertieCountByKey[i.flowKey] || 0) + 1;
    });
    // IESO has more physical intertie points than map polylines for QC/NY
    const IESO_INTERTIE_COUNTS: Record<string, number> = {
      'QUEBEC': 9, 'NEW-YORK': 2, 'MICHIGAN': 1, 'MINNESOTA': 1, 'MANITOBA': 2,
    };

    // Update polyline styles and tooltips in-place via setStyle() and setTooltipContent()
    const updatePolylineStyles = (
      flowByGroup: Record<string, { mw: number; lastUpdated: string }>,
      isFuture = false,
      daPrices: Record<string, number> = {},
      rtPrices: Record<string, number> = {},
    ) => {
      const prices = isFuture ? daPrices : (Object.keys(rtPrices).length > 0 ? rtPrices : intertiePriceRef.current);

      INTERTIES.forEach((intertie) => {
        const ref = polylineRefsRef.current.get(
          intertie.flowKey + ":" + intertie.name,
        );
        if (!ref) return;
        const { visible, hit } = ref;

        // Future time: white dashed lines with DA LMP tooltip only
        if (isFuture) {
          const daLmp = prices[intertie.flowKey];
          const daLmpLine = daLmp !== undefined
            ? `<div style="color: #D29922; font-weight: 600; margin-top: 2px;">Forecasted Price: $${daLmp.toFixed(2)}</div>`
            : `<div style="color: #8B949E; margin-top: 2px;">Forecasted Price: N/A</div>`;

          const style = {
            color: '#FFFFFF',
            opacity: 0.6,
            dashArray: '6, 6',
            weight: 4,
          };
          visible.setStyle(style);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (visible as any)._currentStyle = style;

          hit.setTooltipContent(
            `<div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 8px; background: #161B22; border: 1px solid #30363D;">
              <div style="font-weight: 600; color: #E6EDF3; margin-bottom: 4px;">${intertie.name}</div>
              <div style="color: #8B949E; font-weight: 600;">FORECAST</div>
              ${daLmpLine}
              <div style="color: #8B949E; font-size: 9px; margin-top: 2px;">Source: IESO DAHourlyIntertieLMP</div>
            </div>`,
          );
          return;
        }

        const entry = flowByGroup[intertie.flowKey];
        const mw = entry?.mw ?? 0;
        const isExport = mw > 0;
        const hasFlow = Math.abs(mw) > 1;

        const lineColor = hasFlow
          ? isExport
            ? "#3FB950"
            : "#F85149"
          : "#F0883E";
        const dirLabel = hasFlow ? (isExport ? "EXPORT" : "IMPORT") : "NO FLOW";
        const dirColor = hasFlow
          ? isExport
            ? "#3FB950"
            : "#F85149"
          : "#8B949E";

        const asOf = entry?.lastUpdated
          ? new Date(entry.lastUpdated.replace(" ", "T") + "Z").toLocaleString(
              undefined,
              {
                timeZone: "America/Toronto",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              },
            )
          : "";

        // LMP price line
        const lmp = prices[intertie.flowKey];
        const iesoCount = IESO_INTERTIE_COUNTS[intertie.flowKey] ?? 1;
        const isAggregate = iesoCount > 1;
        const lmpLine = lmp !== undefined
          ? `<div style="color: #D29922; font-weight: 600; margin-top: 2px;">${isAggregate ? "Avg " : ""}Price: $${lmp.toFixed(2)}${isAggregate ? ` (${iesoCount} interties)` : ""}</div>`
          : "";

        const style = {
          color: lineColor,
          opacity: hasFlow ? 0.5 : 0.5,
          dashArray: hasFlow ? "6, 8" : "8, 6",
          weight: hasFlow ? 3 : 4,
        };
        visible.setStyle(style);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (visible as any)._currentStyle = style;

        hit.setTooltipContent(
          `<div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 8px; background: #161B22; border: 1px solid #30363D;">
            <div style="font-weight: 600; color: #E6EDF3; margin-bottom: 4px;">${intertie.name}</div>
            <div style="color: ${dirColor}; font-weight: 600;">${dirLabel} ${hasFlow ? (isAggregate ? "Total " : "") + Math.abs(mw).toFixed(0) + " MW" : ""}</div>
            ${hasFlow ? `<div style="color: #8B949E; font-size: 9px; margin-top: 2px;">Flow: IESO IntertieScheduleFlow</div>` : ""}
            ${lmpLine}
            ${lmpLine ? `<div style="color: #8B949E; font-size: 9px; margin-top: 2px;">Price: IESO RealTimeIntertieLMP</div>` : ""}
            ${asOf ? `<div style="color: #8B949E; font-size: 10px; margin-top: 4px;">as of ${asOf}</div>` : ""}
          </div>`,
        );
      });
    };

    // Snap scrubTime to nearest hour — intertie data is hourly granularity
    const snappedHour = snapToHour(scrubTime);
    const isFuture = scrubTime ? scrubTime > new Date() : false;

    // Include future/past in the skip key so crossing NOW triggers a re-fetch
    const hourKey = (snappedHour || "current") + (isFuture ? ":f" : ":p");

    // Skip fetch if hour + future/past state hasn't changed
    if (hourKey === lastIntertieHourRef.current) return;
    lastIntertieHourRef.current = hourKey;

    // Check cache (60s TTL)
    const cacheKey = (snappedHour || "current") + (isFuture ? ":future" : "");
    const cached = intertieFlowCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < 60000) {
      // Use cached data: update polyline styles in-place + rebuild chevrons
      updatePolylineStyles(cached.data, isFuture, cached.daPrices, cached.rtPrices);
      rebuildChevrons(cached.data, map, isFuture);
      return;
    }

    // Fetch fresh data
    const fetchFlowData = async () => {
      const flowByGroup: Record<string, { mw: number; lastUpdated: string }> =
        {};
      const daPrices: Record<string, number> = {};
      const rtPrices: Record<string, number> = {};

      try {
        if (isFuture) {
          // Future: fetch DA intertie LMP only, no flow data
          const daRes = await fetch(
            `/api/interties/prices/da?timestamp=${scrubTime!.toISOString()}`,
          );
          if (daRes.ok) {
            const daJson = await daRes.json();
            for (const row of daJson.data ?? []) {
              daPrices[row.intertie_zone] = row.lmp;
            }
          }
        } else {
          // Past/current: fetch flow + RT prices (existing behavior)
          const flowUrl = scrubTime
            ? `/api/interties/at-time?timestamp=${scrubTime.toISOString()}`
            : "/api/interties";
          const priceUrl = scrubTime
            ? `/api/interties/prices?timestamp=${scrubTime.toISOString()}`
            : "/api/interties/prices";
          const [flowRes, priceRes] = await Promise.all([
            fetch(flowUrl),
            fetch(priceUrl),
          ]);
          if (flowRes.ok) {
            const json = await flowRes.json();
            for (const row of json.data) {
              flowByGroup[row.flow_group] = {
                mw: row.mw ?? row.actual_mw ?? 0,
                lastUpdated: row.last_updated,
              };
            }
          }
          if (priceRes.ok) {
            const priceJson = await priceRes.json();
            for (const row of priceJson.data ?? []) {
              rtPrices[row.intertie_zone] = row.lmp;
            }
            intertiePriceRef.current = rtPrices;
          }
        }
      } catch {
        // Fallback: no flow data
      }

      // Cache the result (include rtPrices so cache hits don't fall back to empty ref)
      intertieFlowCacheRef.current.set(cacheKey, {
        data: flowByGroup,
        daPrices,
        rtPrices,
        fetchedAt: Date.now(),
      });

      // Update polyline styles in-place (no layer destruction)
      updatePolylineStyles(flowByGroup, isFuture, daPrices, rtPrices);

      // Rebuild only the chevron markers
      if (mapRef.current) {
        rebuildChevrons(flowByGroup, mapRef.current, isFuture);
      }
    };

    fetchFlowData();
  }, [mapReady, showTransmission, scrubTime, rebuildChevrons]);

  // Effect C — Animation loop (independent, continuous while transmission is on)
  // NO scrubTime dependency — runs continuously, reads from chevronMarkersRef each frame
  useEffect(() => {
    if (!mapReady || !showTransmission) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const cycleDuration = 2000; // ms per full cycle
    const startTime = performance.now();
    const FRAME_BUDGET = window.innerWidth <= 900 ? 50 : 0; // ~20fps on mobile, uncapped on desktop
    let lastFrame = 0;

    const animate = (now: number) => {
      if (now - lastFrame < FRAME_BUDGET) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      lastFrame = now;

      const elapsed = now - startTime;
      const markers = chevronMarkersRef.current;

      for (const chev of markers) {
        const t = (elapsed / cycleDuration + chev.offset) % 1;

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

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [mapReady, showTransmission]);

  // WMS Preload Effect — create all GDPS time step layers on mount
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    const preload = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (await import("leaflet")) as any;
      // On mobile, only preload the current time step (not all ~30) to avoid GPU overload
      const isMobile = window.innerWidth <= 900;
      const timeSteps = isMobile
        ? [snapToGdpsTime(new Date()) || getGdpsTimeSteps()[0]].filter(Boolean) as string[]
        : getGdpsTimeSteps();
      const types: WmsType[] = ["temp", "cloud", "precip"];
      const staggerDelays: ReturnType<typeof setTimeout>[] = [];
      let idx = 0;

      for (const type of types) {
        const cfg = WMS_CONFIGS[type];
        for (let i = 0; i < timeSteps.length; i++) {
          const timeStr = timeSteps[i];
          const create = () => {
            // Guard: map may have unmounted during staggered creation
            if (!mapRef.current) return;
            const layer = L.tileLayer.wms(WMS_URL, {
              layers: cfg.layers,
              format: "image/png",
              transparent: true,
              opacity: 0, // All start hidden
              attribution: '&copy; <a href="https://weather.gc.ca/">ECCC</a>',
              bounds: L.latLngBounds(WMS_BOUNDS[0], WMS_BOUNDS[1]),
              time: timeStr,
            });
            layer.setZIndex(cfg.zIndex);
            layer.addTo(map);
            wmsCacheRef.current[type].set(timeStr, layer);
          };

          // First 3 time steps per type load immediately, rest staggered
          if (i < 3) {
            create();
          } else {
            const delay = (idx - types.length * 3 + 9) * 150;
            staggerDelays.push(setTimeout(create, Math.max(0, delay)));
          }
          idx++;
        }
      }

      return staggerDelays;
    };

    // Capture ref for cleanup (React ESLint rule)
    const cacheRef = wmsCacheRef.current;

    let staggerTimers: ReturnType<typeof setTimeout>[] | undefined;
    preload().then((timers) => {
      staggerTimers = timers;
    });

    return () => {
      // Clear pending stagger timers
      if (staggerTimers) {
        staggerTimers.forEach(clearTimeout);
      }
      // Remove all cached layers from map and clear caches
      const allTypes: WmsType[] = ["temp", "cloud", "precip"];
      for (const type of allTypes) {
        const cache = cacheRef[type];
        cache.forEach((layer) => {
          if (map.hasLayer(layer)) {
            map.removeLayer(layer);
          }
        });
        cache.clear();
      }
      activeWmsTimeRef.current = { temp: null, cloud: null, precip: null };
    };
  }, [mapReady]);

  // WMS Visibility Effect — swap opacity based on toggle state and scrub time
  useEffect(() => {
    if (!mapReady) return;

    const toggles: Record<WmsType, boolean> = {
      temp: showTemp,
      cloud: showCloud,
      precip: showPrecip,
    };
    const types: WmsType[] = ["temp", "cloud", "precip"];

    for (const type of types) {
      const cache = wmsCacheRef.current[type];
      if (cache.size === 0) continue; // preload still in progress

      const targetTime = snapToGdpsTime(scrubTime ?? new Date());
      const isOn = toggles[type];

      // Early exit if nothing changed for this type
      if (
        isOn &&
        targetTime === activeWmsTimeRef.current[type]
      ) {
        continue;
      }

      const cfg = WMS_CONFIGS[type];

      cache.forEach((layer, timeStr) => {
        if (isOn && timeStr === targetTime) {
          layer.setOpacity(cfg.opacity);
        } else {
          layer.setOpacity(0);
        }
      });

      activeWmsTimeRef.current[type] = isOn ? (targetTime ?? null) : null;
    }
  }, [mapReady, showTemp, showCloud, showPrecip, scrubTime]);

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
      const L = (await import("leaflet")) as any;

      const markers: L.Marker[] = [];
      Object.entries(weatherData).forEach(([zone, data]) => {
        const feature = (
          ontarioZones as GeoJSON.FeatureCollection
        ).features.find((f) => f.properties?.zone === zone);
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
          className: "",
          iconSize: [40, 20],
          iconAnchor: [20, 10],
        });

        const marker = L.marker([center.lat, center.lng], {
          icon,
          interactive: false,
        });
        markers.push(marker);
      });

      const markerGroup = L.layerGroup(markers);
      markerGroup.addTo(map);
      tempLayerRef.current = markerGroup;
    };

    loadMarkers();
  }, [mapReady, showTemp, weatherData]);

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
      const L = (await import("leaflet")) as any;

      const markers: L.Marker[] = [];
      Object.entries(weatherData).forEach(([zone, data]) => {
        const feature = (
          ontarioZones as GeoJSON.FeatureCollection
        ).features.find((f) => f.properties?.zone === zone);
        if (!feature) return;

        const bounds = L.geoJSON(feature).getBounds();
        const center = bounds.getCenter();

        const cloudIcon =
          data.cloud_cover > 75
            ? "☁️"
            : data.cloud_cover > 50
              ? "⛅"
              : data.cloud_cover > 25
                ? "🌤️"
                : "☀️";

        const icon = L.divIcon({
          html: `
            <div style="
              font-family: 'JetBrains Mono', monospace;
              font-size: 14px;
              text-align: center;
              filter: drop-shadow(0 0 2px rgba(0,0,0,0.8));
            ">${cloudIcon}</div>
          `,
          className: "",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const marker = L.marker([center.lat, center.lng], {
          icon,
          interactive: true,
        }).bindTooltip(
          `
          <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 8px; background: #161B22; border: 1px solid #30363D;">
            <div style="font-weight: 600; color: #E6EDF3; margin-bottom: 4px;">${zone}</div>
            <div style="color: #8B949E;">${data.cloud_cover}% cloud cover</div>
          </div>
        `,
          { direction: "auto", className: "zone-tooltip" },
        );

        markers.push(marker);
      });

      const markerGroup = L.layerGroup(markers);
      markerGroup.addTo(map);
      cloudLayerRef.current = markerGroup;
    };

    loadMarkers();
  }, [mapReady, showCloud, weatherData]);

  return (
    <div
      ref={containerRef}
      style={{ height: "100%", width: "100%", background: "#0D1117" }}
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
  const [scrubTime, setScrubTime] = useState<Date | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [priceSource, setPriceSource] = useState<
    "realtime" | "day_ahead" | "unavailable"
  >("realtime");

  // Throttle refs for scrub-fetch (replaces broken debounce)
  const lastFetchTimeRef = useRef<number>(0);
  const trailingFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SCRUB_FETCH_INTERVAL = 500; // max 2 fetches/sec during play

  // Fetch zone prices (current or at specific time)
  const fetchZonePrices = useCallback(async (atTime?: Date) => {
    try {
      const url = atTime
        ? `/api/prices/at-time?timestamp=${atTime.toISOString()}`
        : "/api/prices";
      const pricesRes = await fetch(url);

      if (!pricesRes.ok) {
        throw new Error("Failed to fetch zone data");
      }

      const pricesData = await pricesRes.json();

      // Track the source for time scrubber display
      if (pricesData.source === "day_ahead") {
        setPriceSource("day_ahead");
      } else if (pricesData.source === "realtime") {
        setPriceSource("realtime");
      } else if (
        pricesData.data?.length === 0 &&
        atTime &&
        atTime > new Date()
      ) {
        setPriceSource("unavailable");
      } else {
        setPriceSource("realtime");
      }

      // Create lookup map
      const priceMap: ZonePriceMap = {};

      pricesData.data.forEach(
        (p: { zone: string; price: number; last_updated?: string }) => {
          priceMap[p.zone] = {
            zone: p.zone,
            price: p.price,
            demand_mw: 0,
            last_updated: p.last_updated || new Date().toISOString(),
          };
        },
      );

      setZonePrices(priceMap);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching zone prices:", err);
      setLoading(false);
    }
  }, []);

  // Fetch weather data (current or at specific time)
  const fetchWeatherData = useCallback(async (atTime?: Date) => {
    try {
      const url = atTime
        ? `/api/weather/at-time?timestamp=${atTime.toISOString()}`
        : "/api/weather";
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
      console.error("Weather fetch error:", err);
    }
  }, []);

  // Fetch data at scrubbed time when scrubber is active (throttled, not debounced)
  // Debounce is broken for play mode: 100ms ticks constantly reset the 300ms timer → 0 fetches.
  // Throttle guarantees periodic firing (~2/sec) during play, and a trailing call on pause.
  useEffect(() => {
    if (!showScrubber || !scrubTime) return;

    const now = Date.now();
    const elapsed = now - lastFetchTimeRef.current;

    if (trailingFetchRef.current) {
      clearTimeout(trailingFetchRef.current);
      trailingFetchRef.current = null;
    }

    if (elapsed >= SCRUB_FETCH_INTERVAL) {
      // Enough time passed — fire immediately
      lastFetchTimeRef.current = now;
      fetchZonePrices(scrubTime);
      fetchWeatherData(scrubTime);
    } else {
      // Schedule trailing call for when interval expires
      const remaining = SCRUB_FETCH_INTERVAL - elapsed;
      trailingFetchRef.current = setTimeout(() => {
        lastFetchTimeRef.current = Date.now();
        fetchZonePrices(scrubTime);
        fetchWeatherData(scrubTime);
        trailingFetchRef.current = null;
      }, remaining);
    }

    return () => {
      if (trailingFetchRef.current) {
        clearTimeout(trailingFetchRef.current);
        trailingFetchRef.current = null;
      }
    };
  }, [showScrubber, scrubTime, fetchZonePrices, fetchWeatherData]);

  // Initial fetch and regular polling (only when not scrubbing)
  useEffect(() => {
    setMounted(true);
    setScrubTime(new Date());
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
    const prices = Object.values(zonePrices).map((z) => z.price);
    if (prices.length === 0) return null;
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }, [zonePrices]);

  return (
    <>
      <div
        className={styles.legendBar}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          fontSize: "10px",
          alignItems: "center",
          padding: "8px 12px 6px 12px",
        }}
      >
        {avgPrice !== null && (
          <div style={{ color: "#8B949E", whiteSpace: "nowrap" }}>
            Avg:{" "}
            <span style={{ color: priceToColor(avgPrice), fontWeight: 600 }}>
              ${avgPrice.toFixed(2)}
            </span>
          </div>
        )}
        {showPricing && (
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <span style={{ color: "#8B949E" }}>$:</span>
            <div style={{ display: "flex", gap: "2px" }}>
              {(
                [
                  {
                    color: "#1E5AA8",
                    label: "< -$2000",
                    desc: "Deep Negative",
                  },
                  {
                    color: "#4A90D9",
                    label: "-$2000 to -$100",
                    desc: "Negative",
                  },
                  {
                    color: "#7FE5E5",
                    label: "-$100 to -$16",
                    desc: "Low Negative",
                  },
                  {
                    color: "#D4F5D4",
                    label: "-$16 to -$4",
                    desc: "Near Zero (-)",
                  },
                  { color: "#FFF8D6", label: "-$4 to $0", desc: "Near Zero" },
                  { color: "#FCE88C", label: "$0 to $10", desc: "Low" },
                  { color: "#F8D14F", label: "$10 to $30", desc: "Normal" },
                  { color: "#F5A623", label: "$30 to $60", desc: "Moderate" },
                  { color: "#E07830", label: "$60 to $100", desc: "Elevated" },
                  { color: "#C83C23", label: "$100 to $400", desc: "High" },
                  {
                    color: "#8B2913",
                    label: "$400 to $1200",
                    desc: "Very High",
                  },
                  { color: "#5C1A0B", label: "> $1200", desc: "Critical" },
                ] as const
              ).map((tier) => (
                <Tooltip
                  key={tier.color}
                  content={
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>
                        {tier.desc}
                      </div>
                      <div style={{ color: tier.color }}>{tier.label}/MWh</div>
                    </div>
                  }
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      background: tier.color,
                      cursor: "default",
                    }}
                  />
                </Tooltip>
              ))}
            </div>
          </div>
        )}
        {showGeneration && (
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <span style={{ color: "#8B949E" }}>Fuel:</span>
            <div style={{ display: "flex", gap: "3px" }}>
              {Object.entries(FUEL_COLORS).map(([fuel, color]) => (
                <Tooltip
                  key={fuel}
                  content={
                    <span style={{ textTransform: "capitalize" }}>{fuel}</span>
                  }
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: color,
                      cursor: "default",
                    }}
                  />
                </Tooltip>
              ))}
            </div>
          </div>
        )}
        {showTemp && (
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <span style={{ color: "#8B949E" }}>°C:</span>
            <div style={{ display: "flex", gap: "2px" }}>
              {(
                [
                  { color: "#1E5AA8", label: "< -20°C" },
                  { color: "#4A90D9", label: "-20 to -10°C" },
                  { color: "#7FE5E5", label: "-10 to 0°C" },
                  { color: "#A8E6CF", label: "0 to 10°C" },
                  { color: "#FCE88C", label: "10 to 20°C" },
                  { color: "#F5A623", label: "20 to 30°C" },
                  { color: "#C83C23", label: "> 30°C" },
                ] as const
              ).map((tier) => (
                <Tooltip key={tier.color} content={tier.label}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      background: tier.color,
                      cursor: "default",
                    }}
                  />
                </Tooltip>
              ))}
            </div>
          </div>
        )}
        {showPrecip && (
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <span style={{ color: "#8B949E" }}>mm:</span>
            <div style={{ display: "flex", gap: "2px" }}>
              {(
                [
                  { color: "#E8F4E8", label: "0 mm", desc: "None" },
                  { color: "#A8D5BA", label: "< 1 mm", desc: "Trace" },
                  { color: "#7EC8E3", label: "1-2 mm", desc: "Light" },
                  { color: "#4A90D9", label: "2-5 mm", desc: "Moderate" },
                  { color: "#1E5AA8", label: "5-10 mm", desc: "Heavy" },
                  { color: "#7B68EE", label: "10-25 mm", desc: "Very Heavy" },
                  { color: "#9932CC", label: "> 25 mm", desc: "Extreme" },
                ] as const
              ).map((tier) => (
                <Tooltip
                  key={tier.color}
                  content={
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>
                        {tier.desc}
                      </div>
                      <div style={{ color: tier.color }}>{tier.label}</div>
                    </div>
                  }
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      background: tier.color,
                      cursor: "default",
                    }}
                  />
                </Tooltip>
              ))}
            </div>
          </div>
        )}
      </div>

      {!mounted || loading ? (
        <div className={styles.placeholder}>Loading map...</div>
      ) : (
        <div
          className={styles.mapContainer}
          style={{ flex: 1, minHeight: 0, width: "100%", position: "relative" }}
        >
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
          {showScrubber && scrubTime && (
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

      <div className={styles.weatherBar} style={{ padding: "8px 12px 8px" }}>
        <button
          className={showPricing ? styles.weatherBtnActive : styles.weatherBtn}
          onClick={() => setShowPricing((v) => !v)}
        >
          <Icon icon="dollar" size={12} />
          <span>Pricing</span>
        </button>
        <button
          className={
            showGeneration ? styles.weatherBtnActive : styles.weatherBtn
          }
          onClick={() => setShowGeneration((v) => !v)}
        >
          <Icon icon="flash" size={12} />
          <span>Generation</span>
        </button>
        <button
          className={
            showTransmission ? styles.weatherBtnActive : styles.weatherBtn
          }
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
          font-family: "JetBrains Mono", monospace !important;
        }
        .leaflet-control-zoom a {
          background: #161b22 !important;
          color: #e6edf3 !important;
          border-color: #30363d !important;
          border-radius: 0 !important;
        }
        .leaflet-control-zoom a:hover {
          background: #30363d !important;
        }
        .leaflet-control-zoom {
          border: 1px solid #30363d !important;
          border-radius: 0 !important;
        }
        .leaflet-control-attribution {
          background: rgba(13, 17, 23, 0.8) !important;
          color: #8b949e !important;
          font-size: 9px !important;
        }
        .leaflet-control-attribution a {
          color: #58a6ff !important;
        }
        /* Glow effect for selected zone */
        .zone-selected {
          filter: drop-shadow(0 0 8px rgba(88, 166, 255, 0.6))
            drop-shadow(0 0 16px rgba(88, 166, 255, 0.4));
        }
        /* Inner glow border on hover */
        .zone-hover {
          stroke: #58a6ff !important;
          stroke-width: 2.5 !important;
          filter: drop-shadow(0 0 6px rgba(88, 166, 255, 0.6))
            drop-shadow(0 0 12px rgba(88, 166, 255, 0.3));
        }
        .leaflet-interactive {
          cursor: pointer;
        }
      `}</style>
    </>
  );
}
