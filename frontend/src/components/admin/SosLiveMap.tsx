'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Loader2, Building2 } from 'lucide-react';
import type { SosEventUI } from './SosDrawer';

// ─── Types ──────────────────────────────────────────────────────────────────

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
  /** The currently selected SOS id (display id or rawId) */
  selectedSosId?: string | null;
  /** The currently selected HQ id */
  selectedHqId?: string | null;
  /** Optimized route dataset for tactical path overlay */
  optimizedRouteData?: any;
  /** Called when the user single-clicks an SOS map marker */
  onMarkerClick?: (id: string) => void;
  /** Called when the user double-clicks an SOS map marker */
  onMarkerDoubleClick?: (id: string) => void;
  /** Called when user clicks an HQ map marker */
  onHqMarkerClick?: (hqId: string) => void;
}

// ─── Dark / Tactical Map Style ───────────────────────────────────────────────

const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0d1424' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1424' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#64748B' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#94A3B8' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0f1e2e' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#334155' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a2740' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0f1e2e' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1e3050' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#162035' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#64748B' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#0f1e2e' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#071016' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#334155' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#071016' }] },
];

// ─── SVG Marker Factories ──────────────────────────────────────────────────────

function buildMarkerSvg(status: 'ACTIVE' | 'ACKNOWLEDGED', isSelected: boolean): string {
  const isActive = status === 'ACTIVE';
  const outerColor = isActive ? '#EF4444' : '#2DD4BF';
  const innerColor = isActive ? '#FF6B6B' : '#14B8A6';
  const ringOpacity = isSelected ? '0.45' : '0.20';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <circle cx="24" cy="24" r="22" fill="${outerColor}" opacity="${ringOpacity}" />
  <circle cx="24" cy="24" r="13" fill="${outerColor}" />
  <circle cx="24" cy="24" r="6" fill="${innerColor}" />
  ${isSelected ? `<circle cx="24" cy="24" r="21" fill="none" stroke="${outerColor}" stroke-width="2" opacity="0.8"/>` : ''}
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

export function parseHqCoords(location: any, index: number = 0): [number, number] {
  if (typeof location === 'object' && location !== null) {
    if (Array.isArray(location.coordinates) && location.coordinates.length === 2) {
      const lng = Number(location.coordinates[0]);
      const lat = Number(location.coordinates[1]);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) return [lat, lng];
    }
    const lat = Number(location.lat ?? location.latitude);
    const lng = Number(location.lng ?? location.longitude);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) return [lat, lng];
  }

  if (typeof location === 'string' && location.trim()) {
    const match = location.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (match) {
      const p1 = parseFloat(match[1]);
      const p2 = parseFloat(match[2]);
      if (!isNaN(p1) && !isNaN(p2)) {
        if (Math.abs(p1) <= 90 && Math.abs(p2) <= 180) {
          return [p1, p2]; // [lat, lng]
        }
      }
    }
  }

  // Fallback coords around default base (28.6139, 77.2090)
  const baseLat = 28.6139;
  const baseLng = 77.2090;
  const offsetLat = ((index % 5) - 2) * 0.04;
  const offsetLng = ((Math.floor(index / 5) % 5) - 2) * 0.04;
  return [baseLat + offsetLat, baseLng + offsetLng];
}

// ─── Inner Map Controller ─────────────────────────────────────────────────────

interface MapControllerProps extends SosLiveMapProps {
  onMapReady: () => void;
}

function MapController({
  sosEvents = [],
  headquarters = [],
  selectedSosId,
  selectedHqId,
  optimizedRouteData,
  onMarkerClick,
  onMarkerDoubleClick,
  onHqMarkerClick,
  onMapReady
}: MapControllerProps) {
  const map = useMap();
  const markerLib = useMapsLibrary('marker');
  const routesLib = useMapsLibrary('routes');
  const mapsLib = useMapsLibrary('maps');
  const geometryLib = useMapsLibrary('geometry');

  const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(
    new globalThis.Map()
  );
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const originMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const stepMarkersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(
    new globalThis.Map()
  );
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoFit = useRef(false);
  const [isReady, setIsReady] = useState(false);

  // Signal ready once map & markerLib are loaded
  useEffect(() => {
    if (map && markerLib) {
      setIsReady(true);
      onMapReady();
    }
  }, [map, markerLib, onMapReady]);

  // ── Auto-fit bounds on first meaningful data load ──────────────────────────
  useEffect(() => {
    if (!map || !isReady || hasAutoFit.current) return;

    const validEvents = sosEvents.filter(
      e => e.coordinates && e.status !== 'RESOLVED'
    );
    const validHqs = headquarters.map((hq, idx) => ({
      ...hq,
      coords: hq.coordinates || parseHqCoords(hq.location, idx)
    }));

    if (validEvents.length === 0 && validHqs.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    validEvents.forEach(e => {
      if (e.coordinates) {
        bounds.extend({ lat: e.coordinates[0], lng: e.coordinates[1] });
      }
    });

    validHqs.forEach(hq => {
      bounds.extend({ lat: hq.coords[0], lng: hq.coords[1] });
    });

    if (validEvents.length === 1 && validHqs.length === 0 && validEvents[0].coordinates) {
      map.setCenter({ lat: validEvents[0].coordinates[0], lng: validEvents[0].coordinates[1] });
      map.setZoom(14);
    } else if (validHqs.length === 1 && validEvents.length === 0) {
      map.setCenter({ lat: validHqs[0].coords[0], lng: validHqs[0].coords[1] });
      map.setZoom(14);
    } else {
      map.fitBounds(bounds, { top: 60, right: 40, bottom: 60, left: 40 });
    }
    hasAutoFit.current = true;
  }, [map, isReady, sosEvents, headquarters]);

  // ── Smooth Zoom Animation Helper ───────────────────────────────────────────
  const animateSmoothZoom = useCallback(
    (targetLat: number, targetLng: number, targetZoom = 16) => {
      if (!map) return;
      map.panTo({ lat: targetLat, lng: targetLng });

      let currentZoom = map.getZoom() ?? 6;
      if (currentZoom >= targetZoom) return;

      const zoomTimer = setInterval(() => {
        currentZoom += 1;
        map.setZoom(currentZoom);
        if (currentZoom >= targetZoom) {
          clearInterval(zoomTimer);
        }
      }, 95);
    },
    [map]
  );

  const handleMarkerClick = useCallback(
    (id: string, coords?: [number, number]) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        if (onMarkerDoubleClick) {
          onMarkerDoubleClick(id);
        } else if (onMarkerClick) {
          onMarkerClick(id);
        }
      } else {
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          if (onMarkerClick) onMarkerClick(id);
          if (coords) {
            animateSmoothZoom(coords[0], coords[1], 16);
          }
        }, 280);
      }
    },
    [onMarkerClick, onMarkerDoubleClick, animateSmoothZoom]
  );

  // ── Pan + smooth zoom when a list item or marker is selected ─────────────
  useEffect(() => {
    if (!map) return;
    if (selectedSosId) {
      const target = sosEvents.find(
        e => e.id === selectedSosId || e.rawId === selectedSosId
      );
      if (target?.coordinates) {
        animateSmoothZoom(target.coordinates[0], target.coordinates[1], 16);
        return;
      }
    }
    if (selectedHqId) {
      const targetHqIdx = headquarters.findIndex(h => h.id === selectedHqId);
      if (targetHqIdx !== -1) {
        const targetHq = headquarters[targetHqIdx];
        const coords = targetHq.coordinates || parseHqCoords(targetHq.location, targetHqIdx);
        animateSmoothZoom(coords[0], coords[1], 15);
      }
    }
  }, [map, selectedSosId, selectedHqId, sosEvents, headquarters, animateSmoothZoom]);

  // ── Create / update / remove markers ─────────────────────────────────────
  useEffect(() => {
    if (!map || !markerLib || !isReady) return;

    const currentKeys = new Set(markersRef.current.keys());

    // 1. Render SOS Markers
    const validEvents = sosEvents.filter(
      e => e.coordinates && (e.status === 'ACTIVE' || e.status === 'ACKNOWLEDGED')
    );

    validEvents.forEach(sos => {
      const key = `sos-${sos.rawId || sos.id}`;
      const isSelected = selectedSosId === sos.id || selectedSosId === sos.rawId;

      if (markersRef.current.has(key)) {
        const existing = markersRef.current.get(key)!;
        const img = existing.content as HTMLImageElement;
        img.src = buildMarkerSvg(sos.status as 'ACTIVE' | 'ACKNOWLEDGED', isSelected);
        existing.zIndex = isSelected ? 999 : sos.status === 'ACTIVE' ? 10 : 5;

        if (isSelected) {
          img.style.animation = 'markerSpringBounce 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
          img.style.transform = 'scale(1.25)';
        } else if (sos.status === 'ACTIVE') {
          img.style.animation = 'sosMarkerPulse 1.8s ease-in-out infinite';
          img.style.transform = 'scale(1)';
        } else {
          img.style.animation = 'none';
          img.style.transform = 'scale(1)';
        }
        currentKeys.delete(key);
      } else {
        const img = document.createElement('img');
        img.src = buildMarkerSvg(sos.status as 'ACTIVE' | 'ACKNOWLEDGED', isSelected);
        img.style.width = '48px';
        img.style.height = '48px';
        img.style.cursor = 'pointer';
        img.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
        img.draggable = false;

        if (isSelected) {
          img.style.animation = 'markerSpringBounce 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
          img.style.transform = 'scale(1.25)';
        } else if (sos.status === 'ACTIVE') {
          img.style.animation = 'sosMarkerPulse 1.8s ease-in-out infinite';
        }

        const marker = new markerLib.AdvancedMarkerElement({
          map,
          position: { lat: sos.coordinates![0], lng: sos.coordinates![1] },
          content: img,
          title: `${sos.userName} — ${sos.status}`,
          zIndex: isSelected ? 999 : sos.status === 'ACTIVE' ? 10 : 5,
        });

        marker.addListener('click', () => {
          handleMarkerClick(sos.id, sos.coordinates);
        });

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

        markersRef.current.set(key, marker);
        currentKeys.delete(key);
      }
    });

    // 2. Render HQ Markers
    headquarters.forEach((hq, idx) => {
      const key = `hq-${hq.id}`;
      const isSelected = selectedHqId === hq.id;
      const coords = hq.coordinates || parseHqCoords(hq.location, idx);

      if (markersRef.current.has(key)) {
        const existing = markersRef.current.get(key)!;
        const img = existing.content as HTMLImageElement;
        img.src = buildHqMarkerSvg(hq.status, isSelected);
        existing.zIndex = isSelected ? 999 : 8;

        if (isSelected) {
          img.style.animation = 'markerSpringBounce 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
          img.style.transform = 'scale(1.25)';
        } else {
          img.style.animation = 'none';
          img.style.transform = 'scale(1)';
        }
        currentKeys.delete(key);
      } else {
        const img = document.createElement('img');
        img.src = buildHqMarkerSvg(hq.status, isSelected);
        img.style.width = '52px';
        img.style.height = '52px';
        img.style.cursor = 'pointer';
        img.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
        img.draggable = false;

        if (isSelected) {
          img.style.animation = 'markerSpringBounce 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
          img.style.transform = 'scale(1.25)';
        }

        const marker = new markerLib.AdvancedMarkerElement({
          map,
          position: { lat: coords[0], lng: coords[1] },
          content: img,
          title: `[Headquarters] ${hq.name} (${hq.status})`,
          zIndex: isSelected ? 999 : 8,
        });

        marker.addListener('click', () => {
          if (onHqMarkerClick) {
            onHqMarkerClick(hq.id);
          } else if (onMarkerClick) {
            onMarkerClick(hq.id);
          }
          animateSmoothZoom(coords[0], coords[1], 15);
        });

        img.addEventListener('mouseenter', () => {
          if (selectedHqId !== hq.id) img.style.transform = 'scale(1.25)';
        });
        img.addEventListener('mouseleave', () => {
          if (selectedHqId !== hq.id) img.style.transform = 'scale(1)';
        });

        markersRef.current.set(key, marker);
        currentKeys.delete(key);
      }
    });

    // 3. Remove stale markers
    currentKeys.forEach(key => {
      const stale = markersRef.current.get(key);
      if (stale) { stale.map = null; markersRef.current.delete(key); }
    });
  }, [
    map,
    markerLib,
    sosEvents,
    headquarters,
    selectedSosId,
    selectedHqId,
    onMarkerClick,
    onHqMarkerClick,
    handleMarkerClick,
    isReady,
    animateSmoothZoom
  ]);

  // ── Render / Update Tactical Route Overlay & Sequence Badges ──────────────
  useEffect(() => {
    if (!map || !markerLib || !isReady) return;

    // 1. Clean up previous directions renderer
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null);
      directionsRendererRef.current = null;
    }

    // 2. Clean up previous polyline
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    // 3. Clean up previous origin marker
    if (originMarkerRef.current) {
      originMarkerRef.current.map = null;
      originMarkerRef.current = null;
    }

    // 4. Clean up previous step markers
    stepMarkersRef.current.forEach(m => { m.map = null; });
    stepMarkersRef.current.clear();

    if (
      !optimizedRouteData ||
      !optimizedRouteData.optimizedRoute ||
      !Array.isArray(optimizedRouteData.optimizedRoute) ||
      optimizedRouteData.optimizedRoute.length === 0
    ) {
      return;
    }

    const pathPoints: google.maps.LatLngLiteral[] = [];

    // Helper to safely extract LatLng object
    const getPt = (loc: any): google.maps.LatLngLiteral | null => {
      if (!loc) return null;
      if (typeof loc === 'object') {
        const lat = Number(loc.lat ?? loc.latitude);
        const lng = Number(loc.lng ?? loc.longitude);
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) return { lat, lng };
        if (Array.isArray(loc.coordinates) && loc.coordinates.length === 2) {
          const lngC = Number(loc.coordinates[0]);
          const latC = Number(loc.coordinates[1]);
          if (!isNaN(latC) && !isNaN(lngC) && latC !== 0 && lngC !== 0) return { lat: latC, lng: lngC };
        }
      }
      return null;
    };

    // Add origin
    const origPt = getPt(optimizedRouteData.origin?.location);
    if (origPt) {
      pathPoints.push(origPt);
    }

    // Add waypoints
    optimizedRouteData.optimizedRoute.forEach((step: any) => {
      const pt = getPt(step.location);
      if (pt) pathPoints.push(pt);
    });

    if (pathPoints.length < 2) return;

    // ── Decode road-snapped polyline if backend returned one, else raw coords ────────
    let routePath: google.maps.LatLng[] | google.maps.LatLngLiteral[] = [];
    let isRealRoad = false;

    if (
      optimizedRouteData.encodedPolyline &&
      typeof optimizedRouteData.encodedPolyline === 'string' &&
      geometryLib?.encoding
    ) {
      // ✅ Real road-following path decoded from Directions API encoded polyline
      routePath = geometryLib.encoding.decodePath(optimizedRouteData.encodedPolyline);
      isRealRoad = true;
    } else {
      // ⚠️ Fallback: straight lines between raw waypoint coords
      routePath = pathPoints;
    }

    if (routePath.length < 2) return;

    // Render tactical polyline
    const PolylineClass = mapsLib?.Polyline || (typeof google !== 'undefined' && google.maps?.Polyline);
    if (PolylineClass) {
      const arrowSymbol = typeof google !== 'undefined' && google.maps?.SymbolPath ? {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        strokeColor: '#10B981',
        fillColor: '#10B981',
        fillOpacity: 1,
        scale: 3
      } : undefined;

      const polyline = new PolylineClass({
        path: routePath,
        geodesic: !isRealRoad,  // false = follow decoded points exactly; true = great-circle arc fallback
        strokeColor: '#10B981',
        strokeOpacity: 0.95,
        strokeWeight: 6,
        icons: arrowSymbol ? [{ icon: arrowSymbol, offset: '30%', repeat: '120px' }] : undefined,
        map
      });
      polylineRef.current = polyline;
    }

    // ── Origin (HQ) pin marker ─────────────────────────────────────────────────
    // origPt already declared above when building pathPoints
    if (origPt && markerLib) {
      const originName = optimizedRouteData.origin?.name || 'Headquarters';

      const hqSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="64" viewBox="0 0 56 64">
        <defs>
          <filter id="hq-shadow" x="-20%" y="-10%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.5"/>
          </filter>
        </defs>
        <path d="M28 3 C14 3 4 13.5 4 27 C4 43 28 61 28 61 C28 61 52 43 52 27 C52 13.5 42 3 28 3Z"
          fill="#0E7490" stroke="#2DD4BF" stroke-width="2.5" filter="url(#hq-shadow)"/>
        <path d="M20 38V24a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14M16 38h24M25 30h6M25 34h6M25 37h6"
          fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

      const hqEl = document.createElement('div');
      hqEl.style.cssText = 'cursor:default; filter:drop-shadow(0 0 8px #2DD4BF66);';
      hqEl.innerHTML = hqSvg;

      const label = document.createElement('div');
      label.style.cssText = [
        'position:absolute', 'bottom:-20px', 'left:50%', 'transform:translateX(-50%)',
        'white-space:nowrap', 'font-size:9px', 'font-weight:700', 'letter-spacing:0.06em',
        'color:#2DD4BF', 'font-family:monospace',
        'background:rgba(13,20,36,0.88)', 'padding:2px 5px',
        'border-radius:3px', 'border:1px solid #2DD4BF33', 'pointer-events:none'
      ].join(';');
      label.textContent = originName.toUpperCase();

      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:relative; display:inline-block;';
      wrapper.appendChild(hqEl);
      wrapper.appendChild(label);

      const originMarker = new markerLib.AdvancedMarkerElement({
        map,
        position: origPt,
        content: wrapper,
        title: `Route Origin: ${originName}`,
        zIndex: 3000
      });
      originMarkerRef.current = originMarker;
    }

    // Render Step Number Badges (1, 2, 3...)
    optimizedRouteData.optimizedRoute.forEach((step: any) => {
      const pt = getPt(step.location);
      if (!pt) return;
      const key = `step-${step.step}`;

      const img = document.createElement('img');
      img.src = buildStepMarkerSvg(step.step, step.category);
      img.style.width = '44px';
      img.style.height = '44px';
      img.style.cursor = 'pointer';

      const marker = new markerLib.AdvancedMarkerElement({
        map,
        position: pt,
        content: img,
        title: `Step ${step.step}: ${step.category} (${step.distanceFromPrevKm} km)`,
        zIndex: 2000 + step.step
      });

      stepMarkersRef.current.set(key, marker);
    });

    // Fit map bounds to show full route
    const bounds = new google.maps.LatLngBounds();
    pathPoints.forEach(pt => bounds.extend(pt));
    map.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 });
  }, [map, markerLib, routesLib, mapsLib, geometryLib, isReady, optimizedRouteData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
        directionsRendererRef.current = null;
      }
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
      if (originMarkerRef.current) {
        originMarkerRef.current.map = null;
        originMarkerRef.current = null;
      }
      stepMarkersRef.current.forEach(m => { m.map = null; });
      stepMarkersRef.current.clear();
      markersRef.current.forEach(m => { m.map = null; });
      markersRef.current.clear();
    };
  }, []);

  return null;
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function MapSkeleton() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d1424] gap-3 z-10 pointer-events-none">
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `linear-gradient(to right, #1E293B 1px, transparent 1px), linear-gradient(to bottom, #1E293B 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-brandTeal animate-spin" />
        <p className="text-xs font-semibold text-secondaryText font-mono tracking-wide">
          Loading Geo-Spatial Engine&hellip;
        </p>
        <p className="text-[11px] text-mutedGray">Binding Google Maps SDK</p>
      </div>
    </div>
  );
}

// ─── HUD Overlays ─────────────────────────────────────────────────────────────

function MapHUD({
  sosEvents = [],
  headquarters = []
}: {
  sosEvents?: SosEventUI[];
  headquarters?: HqMarkerItem[];
}) {
  const activeCount = sosEvents.filter(e => e.status === 'ACTIVE').length;
  const ackCount = sosEvents.filter(e => e.status === 'ACKNOWLEDGED').length;
  const hqActiveCount = headquarters.filter(h => h.status === 'ACTIVE').length;

  return (
    <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5 pointer-events-none">
      {hqActiveCount > 0 && (
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
      {ackCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surfaceCard/90 backdrop-blur-md border border-brandTeal/30 rounded-full text-[11px] shadow-glow-teal">
          <span className="w-2 h-2 rounded-full bg-brandTeal" />
          <span className="font-bold text-brandTeal font-mono">{ackCount}</span>
          <span className="text-secondaryText">ACK&apos;D</span>
        </div>
      )}
      {activeCount === 0 && ackCount === 0 && hqActiveCount === 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surfaceCard/90 backdrop-blur-md border border-hairline rounded-full text-[11px]">
          <span className="w-2 h-2 rounded-full bg-brandTeal/40 animate-pulse" />
          <span className="text-mutedGray">Telemetry Ready</span>
        </div>
      )}
    </div>
  );
}

// ─── Missing API Key Fallback ─────────────────────────────────────────────────

function NoApiKeyFallback() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d1424] gap-3">
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, #1E293B 1px, transparent 1px), linear-gradient(to bottom, #1E293B 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />
      <div className="relative z-10 flex flex-col items-center text-center px-6 py-5 bg-surfaceCard/90 backdrop-blur-md border border-hairlineBright rounded-2xl shadow-panel-dark max-w-xs">
        <div className="w-10 h-10 rounded-full bg-alertRedBg border border-alertRedBorder flex items-center justify-center mb-3">
          <span className="text-alertRed text-lg font-bold">!</span>
        </div>
        <p className="text-sm font-bold text-primaryText mb-1">API Key Missing</p>
        <p className="text-[11px] text-mutedGray leading-relaxed">
          Set{' '}
          <code className="font-mono text-brandTeal bg-brandTealDark px-1 rounded">
            NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          </code>{' '}
          in your <code className="font-mono text-mutedGray">.env</code> file to enable the live map.
        </p>
      </div>
    </div>
  );
}

// ─── Main SosLiveMap Component ────────────────────────────────────────────────

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 }; // India center fallback

export function SosLiveMap({
  sosEvents = [],
  headquarters = [],
  selectedSosId,
  selectedHqId,
  onMarkerClick,
  onMarkerDoubleClick,
  onHqMarkerClick
}: SosLiveMapProps) {
  const [mapReady, setMapReady] = useState(false);
  const handleMapReady = useCallback(() => setMapReady(true), []);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  if (!apiKey) {
    return <NoApiKeyFallback />;
  }

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

      <APIProvider apiKey={apiKey} libraries={['marker', 'routes', 'maps', 'geometry']}>
        {!mapReady && <MapSkeleton />}

        <Map
          defaultCenter={DEFAULT_CENTER}
          defaultZoom={6}
          mapId="zerogrid-sos-map"
          styles={DARK_MAP_STYLE}
          disableDefaultUI={false}
          gestureHandling="greedy"
          clickableIcons={false}
          className="absolute inset-0 w-full h-full"
          style={{ width: '100%', height: '100%' }}
          reuseMaps
        >
          <MapController
            sosEvents={sosEvents}
            headquarters={headquarters}
            selectedSosId={selectedSosId}
            selectedHqId={selectedHqId}
            onMarkerClick={onMarkerClick}
            onMarkerDoubleClick={onMarkerDoubleClick}
            onHqMarkerClick={onHqMarkerClick}
            onMapReady={handleMapReady}
          />
        </Map>

        {mapReady && <MapHUD sosEvents={sosEvents} headquarters={headquarters} />}
      </APIProvider>
    </>
  );
}
