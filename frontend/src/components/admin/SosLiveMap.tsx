'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Loader2 } from 'lucide-react';
import type { SosEventUI } from './SosDrawer';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SosLiveMapProps {
  /** All SOS events from the parent (ACTIVE + ACKNOWLEDGED) */
  sosEvents: SosEventUI[];
  /** The currently selected SOS id (display id or rawId) */
  selectedSosId: string | null;
  /** Called when the user clicks a map marker */
  onMarkerClick: (id: string) => void;
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

// ─── SVG Marker Factory ───────────────────────────────────────────────────────

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

// ─── Inner Map Controller ─────────────────────────────────────────────────────

interface MapControllerProps extends SosLiveMapProps {
  onMapReady: () => void;
}

function MapController({ sosEvents, selectedSosId, onMarkerClick, onMapReady }: MapControllerProps) {
  const map = useMap();
  const markerLib = useMapsLibrary('marker');

  const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(
    new globalThis.Map()
  );
  const hasAutoFit = useRef(false);
  const [isReady, setIsReady] = useState(false);

  // Signal ready once all pieces are available
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
    if (validEvents.length === 0) return;

    if (validEvents.length === 1 && validEvents[0].coordinates) {
      map.setCenter({ lat: validEvents[0].coordinates[0], lng: validEvents[0].coordinates[1] });
      map.setZoom(14);
      hasAutoFit.current = true;
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    validEvents.forEach(e => {
      if (e.coordinates) {
        bounds.extend({ lat: e.coordinates[0], lng: e.coordinates[1] });
      }
    });
    map.fitBounds(bounds, { top: 60, right: 40, bottom: 60, left: 40 });
    hasAutoFit.current = true;
  }, [map, isReady, sosEvents]);

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

  // ── Pan + smooth zoom when a list item or marker is selected ─────────────
  useEffect(() => {
    if (!map || !selectedSosId) return;
    const target = sosEvents.find(
      e => e.id === selectedSosId || e.rawId === selectedSosId
    );
    if (target?.coordinates) {
      animateSmoothZoom(target.coordinates[0], target.coordinates[1], 16);
    }
  }, [map, selectedSosId, sosEvents, animateSmoothZoom]);

  // ── Create / update / remove markers ─────────────────────────────────────
  useEffect(() => {
    if (!map || !markerLib || !isReady) return;

    const currentKeys = new Set(markersRef.current.keys());
    const validEvents = sosEvents.filter(
      e => e.coordinates && (e.status === 'ACTIVE' || e.status === 'ACKNOWLEDGED')
    );

    validEvents.forEach(sos => {
      const key = sos.rawId || sos.id;
      const isSelected = selectedSosId === sos.id || selectedSosId === sos.rawId;

      if (markersRef.current.has(key)) {
        // Update existing marker
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
        // Create new marker
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
          onMarkerClick(sos.id);
          if (sos.coordinates) {
            animateSmoothZoom(sos.coordinates[0], sos.coordinates[1], 16);
          }
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

    // Remove stale markers
    currentKeys.forEach(key => {
      const stale = markersRef.current.get(key);
      if (stale) { stale.map = null; markersRef.current.delete(key); }
    });
  }, [map, markerLib, sosEvents, selectedSosId, onMarkerClick, isReady, animateSmoothZoom]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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

function MapHUD({ sosEvents }: { sosEvents: SosEventUI[] }) {
  const activeCount = sosEvents.filter(e => e.status === 'ACTIVE').length;
  const ackCount = sosEvents.filter(e => e.status === 'ACKNOWLEDGED').length;

  return (
    <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5 pointer-events-none">
      {activeCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surfaceCard/90 backdrop-blur-md border border-alertRedBorder rounded-full text-[11px] shadow-glow-red">
          <span className="w-2 h-2 rounded-full bg-alertRed animate-ping" />
          <span className="font-bold text-alertRed font-mono">{activeCount}</span>
          <span className="text-secondaryText">ACTIVE</span>
        </div>
      )}
      {ackCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surfaceCard/90 backdrop-blur-md border border-brandTeal/30 rounded-full text-[11px] shadow-glow-teal">
          <span className="w-2 h-2 rounded-full bg-brandTeal" />
          <span className="font-bold text-brandTeal font-mono">{ackCount}</span>
          <span className="text-secondaryText">ACK&apos;D</span>
        </div>
      )}
      {activeCount === 0 && ackCount === 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surfaceCard/90 backdrop-blur-md border border-hairline rounded-full text-[11px]">
          <span className="w-2 h-2 rounded-full bg-brandTeal/40 animate-pulse" />
          <span className="text-mutedGray">No active SOS pings</span>
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

export function SosLiveMap({ sosEvents, selectedSosId, onMarkerClick }: SosLiveMapProps) {
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

      <APIProvider apiKey={apiKey} libraries={['marker']}>
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
            selectedSosId={selectedSosId}
            onMarkerClick={onMarkerClick}
            onMapReady={handleMapReady}
          />
        </Map>

        {mapReady && <MapHUD sosEvents={sosEvents} />}
      </APIProvider>
    </>
  );
}
