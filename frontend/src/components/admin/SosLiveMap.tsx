'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Loader2, Building2, Route, Droplets } from 'lucide-react';
import type { SosEventUI } from './SosDrawer';
import { generateHqHexHoneycomb } from '@/utils/hexUtils';

// Types
export interface HqMarkerItem {
  id: string;
  name: string;
  location: any;
  coordinates?: [number, number]; // [lat, lng]
  status: 'ACTIVE' | 'INACTIVE';
  assignedAdmins?: any[];
}

export interface SosLiveMapProps {
  /** All SOS events from the parent (ACTIVE + ACKNOWLEDGED) */
  sosEvents?: SosEventUI[];
  /** Registered Headquarters list */
  headquarters?: HqMarkerItem[];
  /** Whether to render Headquarters markers & hexagonal zones (defaults to true) */
  showHeadquarters?: boolean;
  /** The currently selected SOS id (display id or rawId) */
  selectedSosId?: string | null;
  /** The currently selected HQ id */
  selectedHqId?: string | null;
  /** Optimized route dataset for tactical path overlay */
  optimizedRouteData?: any;
  /** Detour Interactive Mode props */
  detourMode?: boolean;
  detourOrigin?: [number, number] | null;
  detourDest?: [number, number] | null;
  detourResult?: any | null;
  isDetourLoading?: boolean;
  onToggleDetour?: () => void;
  onDetourMapClick?: (lat: number, lng: number) => void;
  /** Called when the user single-clicks an SOS map marker */
  onMarkerClick?: (id: string) => void;
  /** Called when the user double-clicks an SOS map marker */
  onMarkerDoubleClick?: (id: string) => void;
  /** Called when user clicks an HQ map marker */
  onHqMarkerClick?: (id: string) => void;
  /** Open Crisis Command Modal callback */
  onOpenCrisisCommand?: () => void;
}

// Marker Vector Generators
function buildMarkerSvg(sos: SosEventUI, isSelected: boolean): string {
  const isAck = sos.status === 'ACKNOWLEDGED';
  const categoryUpper = (sos.category || '').toUpperCase();
  const severityUpper = (sos.severity || '').toUpperCase();
  const msgLower = (sos.message || '').toLowerCase();
  const depth = sos.waterDepthCm ?? 0;

  // Determine crisis domain
  const isFlood =
    categoryUpper.includes('FLOOD') ||
    categoryUpper.includes('WATER') ||
    severityUpper.includes('WATERLOGGING') ||
    severityUpper.includes('SUBMERGED') ||
    severityUpper.includes('DRAINAGE') ||
    depth > 0 ||
    msgLower.includes('flood') ||
    msgLower.includes('water') ||
    msgLower.includes('submerged');

  const isPowerGrid =
    categoryUpper.includes('GRID') ||
    categoryUpper.includes('ELECTRICAL') ||
    categoryUpper.includes('POWER') ||
    categoryUpper.includes('FALLEN') ||
    msgLower.includes('grid') ||
    msgLower.includes('transformer') ||
    msgLower.includes('substation') ||
    msgLower.includes('breaker') ||
    msgLower.includes('feeder');

  const isHeatwave =
    categoryUpper.includes('HEAT') ||
    severityUpper.includes('HEAT') ||
    msgLower.includes('heat') ||
    msgLower.includes('temperature');

  let outerColor = '#EF4444'; // Red default (Medical / Trapped / Critical)
  let innerColor = '#F87171';
  let coreColor = '#DC2626';
  let glyphSvg = '';

  if (isAck) {
    outerColor = '#10B981'; // Emerald
    innerColor = '#34D399';
    coreColor = '#059669';
    glyphSvg = `<path d="M19 24l3.5 3.5 6.5-6.5" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  } else if (isFlood) {
    outerColor = '#0284C7'; // Hydro Blue
    innerColor = '#38BDF8';
    coreColor = '#0369A1';
    glyphSvg = `<path d="M24 16 C24 16 18 23.5 18 26.5 C18 29.8 20.7 32.5 24 32.5 C27.3 32.5 30 29.8 30 26.5 C30 23.5 24 16 24 16 Z" fill="#FFFFFF"/>`;
  } else if (isPowerGrid) {
    outerColor = '#F59E0B'; // Voltage Gold / Amber
    innerColor = '#FDE047';
    coreColor = '#D97706';
    glyphSvg = `<polygon points="25,15 18,24 23,24 21,33 29,22 24,22" fill="#FFFFFF"/>`;
  } else if (isHeatwave) {
    outerColor = '#EA580C'; // Flame Orange
    innerColor = '#FB923C';
    coreColor = '#C2410C';
    glyphSvg = `<circle cx="24" cy="24" r="4.5" fill="#FFFFFF"/><path d="M24 15v2M24 31v2M15 24h2M31 24h2M17.5 17.5l1.5 1.5M29 29l1.5 1.5M17.5 30.5l1.5-1.5M29 19l1.5-1.5" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>`;
  } else {
    outerColor = '#EF4444';
    innerColor = '#F87171';
    coreColor = '#DC2626';
    glyphSvg = `<path d="M22 17h4v14h-4zM17 22h14v4h-14z" fill="#FFFFFF"/>`;
  }

  const ringOpacity = isSelected ? '0.45' : '0.22';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <circle cx="24" cy="24" r="22" fill="${outerColor}" opacity="${ringOpacity}" />
  <circle cx="24" cy="24" r="14" fill="${coreColor}" stroke="${innerColor}" stroke-width="2.2" />
  ${glyphSvg}
  ${isSelected ? `<circle cx="24" cy="24" r="23" fill="none" stroke="${innerColor}" stroke-width="2.5" opacity="0.95"/>` : ''}
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildHqMarkerSvg(status: 'ACTIVE' | 'INACTIVE', isSelected: boolean): string {
  const isActive = status === 'ACTIVE';
  const outerColor = isActive ? '#0A6E6E' : '#475569';
  const innerColor = isActive ? '#2DD4BF' : '#94A3B8';
  const ringOpacity = isSelected ? '0.5' : '0.25';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52">
  <circle cx="26" cy="26" r="24" fill="${outerColor}" opacity="${ringOpacity}" />
  <circle cx="26" cy="26" r="16" fill="${outerColor}" stroke="${innerColor}" stroke-width="2.5" />
  <path d="M20 33V21a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v12M17 33h18M24 24h4M24 27h4M24 30h4" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  ${isSelected ? `<circle cx="26" cy="26" r="23" fill="none" stroke="${innerColor}" stroke-width="2.5" opacity="0.9"/>` : ''}
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildStepMarkerSvg(step: number, category: string): string {
  const bg = category === 'MEDICAL' ? '#EF4444' : category === 'TRAPPED' ? '#F59E0B' : '#10B981';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <circle cx="22" cy="22" r="20" fill="${bg}" opacity="0.35" />
  <circle cx="22" cy="22" r="14" fill="${bg}" stroke="#FFFFFF" stroke-width="2.5" />
  <text x="22" y="27" font-size="14" font-weight="900" font-family="sans-serif" fill="#FFFFFF" text-anchor="middle">${step}</text>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildDetourPinSvg(label: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">
    <path d="M18 0 C8 0 0 8 0 18 C0 31 18 46 18 46 C18 46 36 31 36 18 C36 8 28 0 18 0 Z" fill="${color}" stroke="#FFFFFF" stroke-width="2"/>
    <circle cx="18" cy="18" r="12" fill="#FFFFFF"/>
    <text x="18" y="22" font-size="11" font-weight="bold" font-family="sans-serif" fill="${color}" text-anchor="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function parseHqCoords(loc: any, index: number): [number, number] {
  if (loc && typeof loc === 'object') {
    if (Array.isArray(loc.coordinates) && loc.coordinates.length === 2) {
      const p1 = Number(loc.coordinates[0]);
      const p2 = Number(loc.coordinates[1]);
      if (!isNaN(p1) && !isNaN(p2)) {
        if (Math.abs(p1) <= 90 && Math.abs(p2) <= 180) {
          return [p1, p2];
        }
        if (Math.abs(p2) <= 90 && Math.abs(p1) <= 180) {
          return [p2, p1];
        }
      }
    }
    const lat = Number(loc.lat ?? loc.latitude);
    const lng = Number(loc.lng ?? loc.longitude);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      return [lat, lng];
    }
  }

  if (typeof loc === 'string') {
    const match = loc.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (match) {
      const p1 = parseFloat(match[1]);
      const p2 = parseFloat(match[2]);
      if (!isNaN(p1) && !isNaN(p2)) {
        if (Math.abs(p1) <= 90 && Math.abs(p2) <= 180) {
          return [p1, p2];
        }
      }
    }
  }

  const baseLat = 19.4580;
  const baseLng = 72.8140;
  const offsetLat = ((index % 5) - 2) * 0.04;
  const offsetLng = ((Math.floor(index / 5) % 5) - 2) * 0.04;
  return [baseLat + offsetLat, baseLng + offsetLng];
}

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, len = encoded.length;
  let lat = 0, lng = 0;
  while (index < len) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    // Returns [lng, lat] for MapLibre GeoJSON standard
    points.push([lng * 1e-5, lat * 1e-5]);
  }
  return points;
}

function createGeoJsonCircle(centerLng: number, centerLat: number, radiusKm: number, points = 32): [number, number][] {
  const coords: [number, number][] = [];
  const distanceX = radiusKm / (111.32 * Math.cos((centerLat * Math.PI) / 180));
  const distanceY = radiusKm / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([centerLng + x, centerLat + y]);
  }
  coords.push(coords[0]);
  return coords;
}

// Helpers for safe GeoJSON source and layer registration
function upsertGeoJsonSource(map: maplibregl.Map, id: string, data: GeoJSON.GeoJSON) {
  const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  } else {
    map.addSource(id, { type: 'geojson', data });
  }
}

// HUD Overlays
function MapHUD({
  sosEvents = [],
  headquarters = [],
  showHeadquarters = true,
  detourMode = false,
  isDetourLoading = false,
  detourOrigin = null,
  detourDest = null,
  detourResult = null,
  onToggleDetour
}: {
  sosEvents?: SosEventUI[];
  headquarters?: HqMarkerItem[];
  showHeadquarters?: boolean;
  detourMode?: boolean;
  isDetourLoading?: boolean;
  detourOrigin?: [number, number] | null;
  detourDest?: [number, number] | null;
  detourResult?: any | null;
  onToggleDetour?: () => void;
}) {
  const activeCount = sosEvents.filter(e => e.status === 'ACTIVE').length;
  const ackCount = sosEvents.filter(e => e.status === 'ACKNOWLEDGED').length;
  const hqActiveCount = headquarters.filter(h => h.status === 'ACTIVE').length;
  const floodCount = sosEvents.filter(
    e => (e.status === 'ACTIVE' || e.status === 'ACKNOWLEDGED') &&
      ((e.waterDepthCm ?? 0) > 0 || ['WATERLOGGING', 'SUBMERGED_UNDERPASS'].includes(e.severity))
  ).length;

  return (
    <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5 pointer-events-none">
      <div className="flex flex-wrap items-center gap-1.5">
        {showHeadquarters && hqActiveCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surfaceCard/90 backdrop-blur-md border border-brandTeal/30 rounded-full text-[11px] shadow-glow-teal">
            <Building2 className="w-3.5 h-3.5 text-brandTeal" />
            <span className="font-bold text-brandTeal font-mono">{hqActiveCount}</span>
            <span className="text-secondaryText">ACTIVE HQs</span>
          </div>
        )}
        {activeCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surfaceCard/90 backdrop-blur-md border border-alertRedBorder rounded-full text-[11px] shadow-glow-red">
            <span className="w-2 h-2 rounded-full bg-alertRed animate-ping" />
            <span className="font-bold text-alertRed font-mono">{activeCount}</span>
            <span className="text-secondaryText">ACTIVE SOS</span>
          </div>
        )}
        {floodCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-950/90 backdrop-blur-md border border-blue-500/40 rounded-full text-[11px] shadow-glow-blue">
            <Droplets className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-bold text-blue-300 font-mono">{floodCount}</span>
            <span className="text-blue-200">HYDRO HAZARDS</span>
          </div>
        )}
        {ackCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surfaceCard/90 backdrop-blur-md border border-brandTeal/30 rounded-full text-[11px] shadow-glow-teal">
            <span className="w-2 h-2 rounded-full bg-brandTeal" />
            <span className="font-bold text-brandTeal font-mono">{ackCount}</span>
            <span className="text-secondaryText">ACK&apos;D</span>
          </div>
        )}

        {/* Detour Mode Toggle Button */}
        {onToggleDetour && (
          <button
            onClick={onToggleDetour}
            className={`pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all shadow-md ${
              detourMode
                ? 'bg-brandTeal hover:bg-brandTealGlow text-canvas border-brandTeal shadow-glow-teal'
                : 'bg-surfaceCard/90 hover:bg-surfaceCard text-primaryText border-hairline'
            }`}
          >
            <Route className="w-3.5 h-3.5" />
            <span>{detourMode ? 'Exit Detour Mode' : 'Simulate Detour (AWS Strands)'}</span>
          </button>
        )}
      </div>

      {/* Detour Guidance Banner */}
      {detourMode && (
        <div className="pointer-events-auto mt-1 px-3 py-2 bg-canvas/95 backdrop-blur-md border border-brandTeal/40 rounded-xl text-xs text-primaryText shadow-panel-dark space-y-1 max-w-sm">
          <div className="flex items-center gap-2">
            {isDetourLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brandTeal" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-brandTeal animate-pulse" />
            )}
            <span className="font-bold text-brandTeal text-[11px]">
              {isDetourLoading
                ? 'AWS Strands Bedrock routing through flood corridor...'
                : !detourOrigin
                ? 'Step 1: Click map to place Origin (A)'
                : !detourDest
                ? 'Step 2: Click map to place Destination (B)'
                : 'Safe Detour Active: Bypassing Flood Zones'}
            </span>
          </div>
          {detourResult?.warningMessage && (
            <p className="text-[10px] text-amber-300 font-medium">{detourResult.warningMessage}</p>
          )}
          {detourResult?.agentAdvisory && (
            <p className="text-[10px] text-secondaryText leading-relaxed">{detourResult.agentAdvisory}</p>
          )}
          {detourResult?.engine && (
            <div className="pt-1 flex items-center justify-between border-t border-hairline/60 text-[9px] font-mono">
              <span className="text-mutedGray">ROUTING ENGINE:</span>
              <span className={`font-bold ${
                detourResult.activeTier === 1
                  ? 'text-emerald-400'
                  : detourResult.activeTier === 2
                  ? 'text-amber-400'
                  : 'text-brandTeal'
              }`}>
                {detourResult.engine}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Fallback when AWS Location API Key is missing
function NoApiKeyFallback({ region, mapName }: { region: string; mapName: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d1424] gap-3">
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, #1E293B 1px, transparent 1px), linear-gradient(to bottom, #1E293B 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />
      <div className="relative z-10 flex flex-col items-center text-center px-6 py-5 bg-surfaceCard/90 backdrop-blur-md border border-hairlineBright rounded-2xl shadow-panel-dark max-w-sm">
        <div className="w-10 h-10 rounded-full bg-alertRedBg border border-alertRedBorder flex items-center justify-center mb-3">
          <span className="text-alertRed text-lg font-bold">!</span>
        </div>
        <p className="text-sm font-bold text-primaryText mb-1">Amazon Location Service Key Required</p>
        <p className="text-[11px] text-mutedGray leading-relaxed mb-2">
          Set <code className="font-mono text-brandTeal bg-brandTealDark px-1 rounded">NEXT_PUBLIC_AWS_LOCATION_API_KEY</code> in your <code className="font-mono text-mutedGray">.env</code> file.
        </p>
        <div className="text-[10px] font-mono text-secondaryText bg-surfaceElevated px-2.5 py-1.5 rounded-lg border border-hairline w-full text-left space-y-0.5">
          <div>Region: <span className="text-brandTeal font-bold">{region}</span></div>
          <div>Map Resource: <span className="text-brandTeal font-bold">{mapName}</span></div>
        </div>
      </div>
    </div>
  );
}

// Main SosLiveMap Component powered by Amazon Location Service & MapLibre GL
export function SosLiveMap({
  sosEvents = [],
  headquarters = [],
  showHeadquarters = true,
  selectedSosId,
  selectedHqId,
  optimizedRouteData,
  detourMode = false,
  detourOrigin = null,
  detourDest = null,
  detourResult = null,
  isDetourLoading = false,
  onToggleDetour,
  onDetourMapClick,
  onMarkerClick,
  onMarkerDoubleClick,
  onHqMarkerClick,
}: SosLiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Markers Refs
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const originMarkerRef = useRef<maplibregl.Marker | null>(null);
  const stepMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const detourOriginMarkerRef = useRef<maplibregl.Marker | null>(null);
  const detourDestMarkerRef = useRef<maplibregl.Marker | null>(null);

  const hasAutoFit = useRef(false);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

  const region = process.env.NEXT_PUBLIC_AWS_REGION || 'ap-south-1';
  const mapName = process.env.NEXT_PUBLIC_AWS_LOCATION_MAP_NAME || 'default';
  const apiKey = process.env.NEXT_PUBLIC_AWS_LOCATION_API_KEY || '';

  // 1. Initialize MapLibre GL with Amazon Location Service
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    if (typeof window !== 'undefined') {
      maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
    }

    // Build style URL: Amazon Location Service v2 endpoint with API Key
    // Supports Monochrome Dark, Standard Dark, Hybrid, Satellite
    let styleUrl = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
    if (apiKey) {
      const validStyles = ['Monochrome', 'Standard', 'Hybrid', 'Satellite'];
      const styleName = validStyles.includes(mapName) ? mapName : 'Monochrome';
      styleUrl = `https://maps.geo.${region}.amazonaws.com/v2/styles/${styleName}/descriptor?key=${apiKey}&color-scheme=Dark`;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      center: [72.8258, 19.4564], // [lng, lat] Virar / Mumbai corridor default
      zoom: 11,
      style: styleUrl,
      transformRequest: (url: string) => {
        if (apiKey && url.includes('amazonaws.com') && !url.includes('key=')) {
          return { url: `${url}${url.includes('?') ? '&' : '?'}key=${apiKey}` };
        }
        return { url };
      },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

    map.on('load', () => {
      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [apiKey, region, mapName]);

  // 2. Detour Mode Map Click Listener & Crosshair Cursor
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    map.getCanvas().style.cursor = detourMode ? 'crosshair' : '';

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (detourMode && onDetourMapClick) {
        onDetourMapClick(e.lngLat.lat, e.lngLat.lng);
      }
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
      map.getCanvas().style.cursor = '';
    };
  }, [mapReady, detourMode, onDetourMapClick]);

  // 3. Smooth Center/Zoom Helper
  const animateSmoothZoom = useCallback((lat: number, lng: number, targetZoom = 15) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [lng, lat], zoom: targetZoom, duration: 800 });
  }, []);

  // 4. Marker Click Handler with Double-Click Simulation
  const handleMarkerClick = useCallback((id: string, coords?: [number, number]) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      if (onMarkerDoubleClick) onMarkerDoubleClick(id);
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        if (onMarkerClick) onMarkerClick(id);
        if (coords) {
          animateSmoothZoom(coords[0], coords[1], 15);
        }
      }, 250);
    }
  }, [onMarkerClick, onMarkerDoubleClick, animateSmoothZoom]);

  // 5. Auto-fit bounds on initial data load
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || hasAutoFit.current) return;

    const validEvents = sosEvents.filter(
      e => e.coordinates && e.status !== 'RESOLVED'
    );
    const validHqs = headquarters.map((hq, idx) => ({
      ...hq,
      coords: hq.coordinates || parseHqCoords(hq.location, idx)
    }));

    if (validEvents.length === 0 && validHqs.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    validEvents.forEach(e => {
      if (e.coordinates) {
        bounds.extend([e.coordinates[1], e.coordinates[0]]);
      }
    });

    if (showHeadquarters) {
      validHqs.forEach(hq => {
        bounds.extend([hq.coords[1], hq.coords[0]]);
      });
    }

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
      hasAutoFit.current = true;
    }
  }, [mapReady, sosEvents, headquarters, showHeadquarters]);

  // 6. Synchronize SOS & Headquarters Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const currentKeys = new Set(markersRef.current.keys());

    // 6.1 Render SOS Markers
    const validEvents = sosEvents.filter(
      e => e.coordinates && (e.status === 'ACTIVE' || e.status === 'ACKNOWLEDGED')
    );

    validEvents.forEach(sos => {
      const key = `sos-${sos.rawId || sos.id}`;
      const isSelected = selectedSosId === sos.id || selectedSosId === sos.rawId;
      const [lat, lng] = sos.coordinates!;

      if (markersRef.current.has(key)) {
        const marker = markersRef.current.get(key)!;
        marker.setLngLat([lng, lat]);
        const img = marker.getElement().querySelector('img') as HTMLImageElement | null;
        if (img) {
          img.src = buildMarkerSvg(sos, isSelected);
          if (isSelected) {
            img.style.transform = 'scale(1.25)';
          } else {
            img.style.transform = 'scale(1)';
          }
        }
        currentKeys.delete(key);
      } else {
        const el = document.createElement('div');
        el.style.cssText = 'width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; cursor: pointer;';

        const img = document.createElement('img');
        img.src = buildMarkerSvg(sos, isSelected);
        img.style.width = '48px';
        img.style.height = '48px';
        img.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
        img.draggable = false;

        if (isSelected) {
          img.style.transform = 'scale(1.25)';
        }

        img.addEventListener('mouseenter', () => {
          if (selectedSosId !== sos.id && selectedSosId !== sos.rawId) {
            img.style.transform = 'scale(1.25)';
          }
        });
        img.addEventListener('mouseleave', () => {
          if (selectedSosId !== sos.id && selectedSosId !== sos.rawId) {
            img.style.transform = 'scale(1)';
          }
        });

        el.addEventListener('click', (ev) => {
          if (detourMode && onDetourMapClick && sos.coordinates) {
            onDetourMapClick(sos.coordinates[0], sos.coordinates[1]);
            return;
          }
          ev.stopPropagation();
          handleMarkerClick(sos.id, sos.coordinates);
        });

        el.appendChild(img);

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lng, lat])
          .addTo(map);

        markersRef.current.set(key, marker);
        currentKeys.delete(key);
      }
    });

    // 6.2 Render HQ Markers (only if showHeadquarters is enabled)
    if (showHeadquarters) {
      headquarters.forEach((hq, idx) => {
        const key = `hq-${hq.id}`;
        const isSelected = selectedHqId === hq.id;
        const coords = hq.coordinates || parseHqCoords(hq.location, idx);
        const [lat, lng] = coords;

        if (markersRef.current.has(key)) {
          const marker = markersRef.current.get(key)!;
          marker.setLngLat([lng, lat]);
          const img = marker.getElement().querySelector('img') as HTMLImageElement | null;
          if (img) {
            img.src = buildHqMarkerSvg(hq.status, isSelected);
            if (isSelected) {
              img.style.transform = 'scale(1.25)';
            } else {
              img.style.transform = 'scale(1)';
            }
          }
          currentKeys.delete(key);
        } else {
          const el = document.createElement('div');
          el.style.cssText = 'width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; cursor: pointer;';

          const img = document.createElement('img');
          img.src = buildHqMarkerSvg(hq.status, isSelected);
          img.style.width = '52px';
          img.style.height = '52px';
          img.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
          img.draggable = false;

          if (isSelected) {
            img.style.transform = 'scale(1.25)';
          }

          img.addEventListener('mouseenter', () => {
            if (selectedHqId !== hq.id) img.style.transform = 'scale(1.25)';
          });
          img.addEventListener('mouseleave', () => {
            if (selectedHqId !== hq.id) img.style.transform = 'scale(1)';
          });

          el.addEventListener('click', (ev) => {
            if (detourMode && onDetourMapClick) {
              onDetourMapClick(lat, lng);
              return;
            }
            ev.stopPropagation();
            if (onHqMarkerClick) {
              onHqMarkerClick(hq.id);
            } else if (onMarkerClick) {
              onMarkerClick(hq.id);
            }
            animateSmoothZoom(lat, lng, 15);
          });

          el.appendChild(img);

          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([lng, lat])
            .addTo(map);

          markersRef.current.set(key, marker);
          currentKeys.delete(key);
        }
      });
    }

    // 6.3 Cleanup Stale Markers
    currentKeys.forEach(key => {
      const stale = markersRef.current.get(key);
      if (stale) {
        stale.remove();
        markersRef.current.delete(key);
      }
    });
  }, [
    mapReady,
    sosEvents,
    headquarters,
    showHeadquarters,
    selectedSosId,
    selectedHqId,
    detourMode,
    onDetourMapClick,
    onMarkerClick,
    onHqMarkerClick,
    handleMarkerClick,
    animateSmoothZoom
  ]);

  // 7. Render 10–15 km Hexagonal Zone Overlays around Headquarters (Outline only, Click-through)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!showHeadquarters || headquarters.length === 0) {
      if (map.getSource('hq-hex-zones')) {
        upsertGeoJsonSource(map, 'hq-hex-zones', { type: 'FeatureCollection', features: [] });
      }
      return;
    }

    const hexFeatures: GeoJSON.Feature[] = [];

    headquarters.forEach((hq, idx) => {
      const coords = hq.coordinates || parseHqCoords(hq.location, idx);
      const hexCells = generateHqHexHoneycomb(
        hq.id,
        hq.name,
        { lat: coords[0], lng: coords[1] },
        12.0
      );

      hexCells.forEach(cell => {
        // Build closed polygon ring [lng, lat]
        const ring: [number, number][] = [
          ...cell.path.map(p => [p.lng, p.lat] as [number, number]),
          [cell.path[0].lng, cell.path[0].lat] as [number, number]
        ];

        hexFeatures.push({
          type: 'Feature',
          properties: { id: cell.id, name: cell.name },
          geometry: {
            type: 'Polygon',
            coordinates: [ring]
          }
        });
      });
    });

    const hexGeoJson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: hexFeatures
    };

    upsertGeoJsonSource(map, 'hq-hex-zones', hexGeoJson);

    if (!map.getLayer('hq-hex-zones-outline')) {
      map.addLayer({
        id: 'hq-hex-zones-outline',
        type: 'line',
        source: 'hq-hex-zones',
        paint: {
          'line-color': '#38BDF8',
          'line-width': 2.5,
          'line-opacity': 0.90
        }
      });
    }
  }, [mapReady, showHeadquarters, headquarters]);

  // 8. Render Hydro Hazard Depth Circles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const floodEvents = sosEvents.filter(
      e => (e.status === 'ACTIVE' || e.status === 'ACKNOWLEDGED') &&
        ((e.waterDepthCm ?? 0) > 0 || ['WATERLOGGING', 'SUBMERGED_UNDERPASS'].includes(e.severity)) &&
        e.coordinates
    );

    const circleFeatures: GeoJSON.Feature[] = floodEvents.map(e => {
      const depth = e.waterDepthCm ?? 0;
      // Exact match with backend safety bounds: 120m for >=60cm, 80m for >=30cm, 50m otherwise
      const radiusMeters = depth >= 60 ? 120 : depth >= 30 ? 80 : 50;
      const radiusKm = radiusMeters / 1000;
      const ring = createGeoJsonCircle(e.coordinates![1], e.coordinates![0], radiusKm);

      return {
        type: 'Feature',
        properties: { id: e.id, depth },
        geometry: {
          type: 'Polygon',
          coordinates: [ring]
        }
      };
    });

    const hydroGeoJson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: circleFeatures
    };

    upsertGeoJsonSource(map, 'hydro-hazards', hydroGeoJson);

    if (!map.getLayer('hydro-hazards-fill')) {
      map.addLayer({
        id: 'hydro-hazards-fill',
        type: 'fill',
        source: 'hydro-hazards',
        paint: {
          'fill-color': '#0284C7',
          'fill-opacity': 0.22
        }
      });
    }
    if (!map.getLayer('hydro-hazards-outline')) {
      map.addLayer({
        id: 'hydro-hazards-outline',
        type: 'line',
        source: 'hydro-hazards',
        paint: {
          'line-color': '#38BDF8',
          'line-width': 1.8,
          'line-opacity': 0.75
        }
      });
    }
  }, [mapReady, sosEvents]);

  // 9. Render Detour Simulation Overlays (Origin A, Dest B, Red Direct Line, Safe Green Bypass)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // 9.1 Origin Marker Pin (A)
    if (detourOrigin) {
      const [lat, lng] = detourOrigin;
      if (!detourOriginMarkerRef.current) {
        const img = document.createElement('img');
        img.src = buildDetourPinSvg('A', '#10B981');
        img.style.width = '36px';
        img.style.height = '46px';
        const marker = new maplibregl.Marker({ element: img, anchor: 'bottom' })
          .setLngLat([lng, lat])
          .addTo(map);
        detourOriginMarkerRef.current = marker;
      } else {
        detourOriginMarkerRef.current.setLngLat([lng, lat]);
      }
    } else if (detourOriginMarkerRef.current) {
      detourOriginMarkerRef.current.remove();
      detourOriginMarkerRef.current = null;
    }

    // 9.2 Destination Marker Pin (B)
    if (detourDest) {
      const [lat, lng] = detourDest;
      if (!detourDestMarkerRef.current) {
        const img = document.createElement('img');
        img.src = buildDetourPinSvg('B', '#F59E0B');
        img.style.width = '36px';
        img.style.height = '46px';
        const marker = new maplibregl.Marker({ element: img, anchor: 'bottom' })
          .setLngLat([lng, lat])
          .addTo(map);
        detourDestMarkerRef.current = marker;
      } else {
        detourDestMarkerRef.current.setLngLat([lng, lat]);
      }
    } else if (detourDestMarkerRef.current) {
      detourDestMarkerRef.current.remove();
      detourDestMarkerRef.current = null;
    }

    // 9.3 Blocked Direct Route (Dashed Red Line)
    const blockedFeatures: GeoJSON.Feature[] = [];
    if (detourOrigin && detourDest) {
      blockedFeatures.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [detourOrigin[1], detourOrigin[0]],
            [detourDest[1], detourDest[0]]
          ]
        }
      });
    }

    upsertGeoJsonSource(map, 'detour-blocked-line', {
      type: 'FeatureCollection',
      features: blockedFeatures
    });

    if (!map.getLayer('detour-blocked-line-layer')) {
      map.addLayer({
        id: 'detour-blocked-line-layer',
        type: 'line',
        source: 'detour-blocked-line',
        paint: {
          'line-color': '#EF4444',
          'line-width': 3,
          'line-dasharray': [2, 2],
          'line-opacity': 0.85
        }
      });
    }

    // 9.4 Safe Detour Line (Glowing Green)
    const safeFeatures: GeoJSON.Feature[] = [];
    if (detourResult?.recommendedRouteGeoJson?.coordinates) {
      const rawCoords = detourResult.recommendedRouteGeoJson.coordinates;
      safeFeatures.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: rawCoords // Already [lng, lat]
        }
      });

      // Fit bounds to show entire safe detour
      const bounds = new maplibregl.LngLatBounds();
      rawCoords.forEach((pt: number[]) => bounds.extend([pt[0], pt[1]]));
      map.fitBounds(bounds, { padding: 70 });
    }

    upsertGeoJsonSource(map, 'detour-safe-line', {
      type: 'FeatureCollection',
      features: safeFeatures
    });

    if (!map.getLayer('detour-safe-line-layer')) {
      map.addLayer({
        id: 'detour-safe-line-layer',
        type: 'line',
        source: 'detour-safe-line',
        paint: {
          'line-color': '#22C55E',
          'line-width': 5,
          'line-opacity': 0.95
        }
      });
    }
  }, [mapReady, detourOrigin, detourDest, detourResult]);

  // 10. Render Tactical Multi-Factor Route Matrix & Waypoint Pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Clear previous step & origin markers
    if (originMarkerRef.current) {
      originMarkerRef.current.remove();
      originMarkerRef.current = null;
    }
    stepMarkersRef.current.forEach(m => m.remove());
    stepMarkersRef.current.clear();

    if (
      !optimizedRouteData ||
      !Array.isArray(optimizedRouteData.optimizedRoute) ||
      optimizedRouteData.optimizedRoute.length === 0
    ) {
      if (map.getSource('tactical-route')) {
        upsertGeoJsonSource(map, 'tactical-route', { type: 'FeatureCollection', features: [] });
      }
      return;
    }

    const pathPoints: [number, number][] = [];

    const getPt = (loc: any): [number, number] | null => {
      if (!loc) return null;
      if (typeof loc === 'object') {
        const lat = Number(loc.lat ?? loc.latitude);
        const lng = Number(loc.lng ?? loc.longitude);
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) return [lng, lat];
        if (Array.isArray(loc.coordinates) && loc.coordinates.length === 2) {
          const lngC = Number(loc.coordinates[0]);
          const latC = Number(loc.coordinates[1]);
          if (!isNaN(latC) && !isNaN(lngC) && latC !== 0 && lngC !== 0) return [lngC, latC];
        }
      }
      return null;
    };

    const origPt = getPt(optimizedRouteData.origin?.location);
    if (origPt) pathPoints.push(origPt);

    optimizedRouteData.optimizedRoute.forEach((step: any) => {
      const pt = getPt(step.location);
      if (pt) pathPoints.push(pt);
    });

    let routeCoordinates: [number, number][] = [];
    if (
      optimizedRouteData.encodedPolyline &&
      typeof optimizedRouteData.encodedPolyline === 'string'
    ) {
      routeCoordinates = decodePolyline(optimizedRouteData.encodedPolyline);
    } else {
      routeCoordinates = pathPoints;
    }

    const routeFeatures: GeoJSON.Feature[] = [];
    if (routeCoordinates.length >= 2) {
      routeFeatures.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: routeCoordinates
        }
      });
    }

    upsertGeoJsonSource(map, 'tactical-route', {
      type: 'FeatureCollection',
      features: routeFeatures
    });

    if (!map.getLayer('tactical-route-layer')) {
      map.addLayer({
        id: 'tactical-route-layer',
        type: 'line',
        source: 'tactical-route',
        paint: {
          'line-color': '#10B981',
          'line-width': 5,
          'line-opacity': 0.95
        }
      });
    }

    // Place Origin Headquarters Pin
    if (origPt) {
      const originName = optimizedRouteData.origin?.name || 'Headquarters';
      const hqSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="64" viewBox="0 0 56 64">
        <path d="M28 3 C14 3 4 13.5 4 27 C4 43 28 61 28 61 C28 61 52 43 52 27 C52 13.5 42 3 28 3Z"
          fill="#0E7490" stroke="#2DD4BF" stroke-width="2.5"/>
        <path d="M20 38V24a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14M16 38h24M25 30h6M25 34h6M25 37h6"
          fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

      const el = document.createElement('div');
      el.style.cssText = 'display:flex; flex-direction:column; align-items:center; cursor:default; filter:drop-shadow(0 0 8px #2DD4BF66);';
      el.innerHTML = hqSvg;

      const label = document.createElement('div');
      label.style.cssText = 'margin-top:2px; font-size:10px; font-weight:800; font-family:monospace; background:#0B132B; color:#2DD4BF; border:1px solid #2DD4BF88; border-radius:4px; padding:1px 6px; white-space:nowrap;';
      label.textContent = `HQ: ${originName}`;
      el.appendChild(label);

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(origPt)
        .addTo(map);

      originMarkerRef.current = marker;
    }

    // Place Step Waypoint Pins (1, 2, 3...)
    optimizedRouteData.optimizedRoute.forEach((step: any) => {
      const pt = getPt(step.location);
      if (!pt) return;

      const el = document.createElement('div');
      el.style.cssText = 'cursor:pointer;';
      const img = document.createElement('img');
      img.src = buildStepMarkerSvg(step.step, step.category || 'REGULAR');
      img.style.width = '44px';
      img.style.height = '44px';
      el.appendChild(img);

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(pt)
        .addTo(map);

      stepMarkersRef.current.set(`step-${step.step}`, marker);
    });

    // Auto-fit route bounds
    if (pathPoints.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      pathPoints.forEach(p => bounds.extend(p));
      map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
    }
  }, [mapReady, optimizedRouteData]);

  return (
    <>
      <style>{`
        @keyframes sosMarkerPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.18); opacity: 0.85; }
        }
        @keyframes markerSpringBounce {
          0% { transform: scale(1); }
          45% { transform: scale(1.4); }
          75% { transform: scale(1.1); }
          100% { transform: scale(1.25); }
        }
      `}</style>

      <div className="absolute inset-0 w-full h-full overflow-hidden">
        <div ref={mapContainerRef} className="w-full h-full" />

        {!mapReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d1424] gap-2">
            <Loader2 className="w-8 h-8 text-brandTeal animate-spin" />
            <p className="text-xs font-semibold text-primaryText">Initializing Amazon Location Service Map...</p>
            <p className="text-[11px] text-mutedGray">Binding MapLibre GL • Region {region}</p>
          </div>
        )}

        {mapReady && (
          <MapHUD
            sosEvents={sosEvents}
            headquarters={headquarters}
            showHeadquarters={showHeadquarters}
            detourMode={detourMode}
            isDetourLoading={isDetourLoading}
            detourOrigin={detourOrigin}
            detourDest={detourDest}
            detourResult={detourResult}
            onToggleDetour={onToggleDetour}
          />
        )}
      </div>
    </>
  );
}
