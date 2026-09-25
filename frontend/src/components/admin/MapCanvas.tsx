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
    <section className="flex-1 w-full min-h-[300px] md:min-h-[340px] lg:min-h-[500px] flex flex-col bg-surface border border-hairline rounded-16dp overflow-hidden relative shadow-panel-dark">
      {/* Card Header Toolbar - Stacks on mobile, inline on laptop */}
      <div className="min-h-[44px] border-b border-hairline px-3 sm:px-5 py-2.5 sm:py-0 flex flex-col sm:flex-row sm:items-center justify-between bg-surfaceElevated/70 backdrop-blur-md z-10 flex-shrink-0 gap-2 sm:gap-0">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-brandTeal flex-shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-brandTeal font-display truncate">
            Geo-Spatial Telemetry Canvas
          </span>
        </div>

        {/* Badges - Non-essential mesh coverage hidden on small screens */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs text-mutedGray">
          <span className="hidden md:inline-flex font-mono bg-surfaceCard px-2.5 py-1 rounded-md border border-hairline text-[11px] text-secondaryText">
            Coverage: 14.8 km² Mesh
          </span>
          <span className="font-mono text-[11px] text-mutedGray bg-surfaceCard sm:bg-transparent px-2 sm:px-0 py-1 sm:py-0 rounded border border-hairline sm:border-none">
            Active Nodes: {activeSosCount}
          </span>
        </div>
      </div>

      {/* Map Body — relative container so the map can fill it absolutely */}
      <div className="flex-1 relative w-full h-full min-h-[200px]">
        <SosLiveMap
          sosEvents={sosEvents}
          selectedSosId={selectedSosId}
          onMarkerClick={onMarkerClick}
        />
      </div>

      {/* Sub-bar Footer - Simplified for mobile */}
      <div className="border-t border-hairline px-3 sm:px-5 py-2 bg-surface flex items-center justify-between text-xs text-mutedGray flex-shrink-0 z-10">
        <span className="flex items-center gap-1.5 text-[10px] sm:text-[11px]">
          <Info className="w-3.5 h-3.5 text-brandTeal flex-shrink-0" />
          <span className="truncate">Click a marker to open details.</span>
        </span>

        {/* Version hidden on mobile to prevent text collision */}
        <span className="hidden sm:inline-block font-mono text-[10px] text-dimGray">
          ZeroGrid UI • v3.2.0-dark
        </span>
      </div>
    </section>
  );
}