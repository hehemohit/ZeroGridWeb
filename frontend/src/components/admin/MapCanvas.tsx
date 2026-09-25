'use client';

import React from 'react';
import { MapPin, Info } from 'lucide-react';
import { SosLiveMap, SosLiveMapProps } from './SosLiveMap';

interface MapCanvasProps extends SosLiveMapProps {
  activeSosCount: number;
}

export function MapCanvas({
  activeSosCount,
  sosEvents,
  selectedSosId,
  onMarkerClick,
}: MapCanvasProps) {
  return (
    <section className="flex-1 min-h-[340px] flex flex-col bg-surface border border-hairline rounded-16dp overflow-hidden relative shadow-panel-dark">
      {/* Card Header Toolbar */}
      <div className="h-11 border-b border-hairline px-5 flex items-center justify-between bg-surfaceElevated/70 backdrop-blur-md z-10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-brandTeal" />
          <span className="text-xs font-semibold uppercase tracking-wider text-brandTeal font-display">
            Geo-Spatial Telemetry Canvas
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-mutedGray">
          <span className="font-mono bg-surfaceCard px-2.5 py-1 rounded-md border border-hairline text-[11px] text-secondaryText">
            Coverage: 14.8 km² Mesh
          </span>
          <span className="font-mono text-[11px] text-mutedGray">
            Active Nodes: {activeSosCount}
          </span>
        </div>
      </div>

      {/* Map Body — relative container so the map can fill it absolutely */}
      <div className="flex-1 relative">
        <SosLiveMap
          sosEvents={sosEvents}
          selectedSosId={selectedSosId}
          onMarkerClick={onMarkerClick}
        />
      </div>

      {/* Sub-bar Footer */}
      <div className="border-t border-hairline px-5 py-2 bg-surface flex items-center justify-between text-xs text-mutedGray flex-shrink-0 z-10">
        <span className="flex items-center gap-1.5 text-[11px]">
          <Info className="w-3.5 h-3.5 text-brandTeal" />
          <span>Click a marker to open the SOS details drawer.</span>
        </span>
        <span className="font-mono text-[10px] text-dimGray">ZeroGrid UI • v3.2.0-dark</span>
      </div>
    </section>
  );
}
