'use client';

import React from 'react';
import { MapPin, Compass, Info } from 'lucide-react';

interface MapCanvasProps {
  activeSosCount: number;
}

export function MapCanvas({ activeSosCount }: MapCanvasProps) {
  return (
    <section className="flex-1 min-h-[340px] flex flex-col bg-surface border border-hairline rounded-16dp overflow-hidden relative shadow-panel-dark">
      {/* Card Header Toolbar with tactical coordinate metadata */}
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

      {/* Map Placeholder Body */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-6 bg-[#090E1A]">
        {/* Tactical dark radar coordinate grid lines background pattern */}
        <div
          className="absolute inset-0 opacity-25 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(to right, #1E293B 1px, transparent 1px), linear-gradient(to bottom, #1E293B 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        ></div>

        {/* Central Card with strict requested label: "Map Integration Pending" */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-sm px-6 py-6 bg-surfaceCard/90 backdrop-blur-md rounded-16dp border border-hairlineBright shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-brandTealDark border border-brandTeal/30 flex items-center justify-center mb-3 text-brandTeal shadow-glow-teal">
            <Compass className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-primaryText mb-1 font-display">
            Map Integration Pending
          </h3>
          <p className="text-[11px] text-mutedGray leading-relaxed mb-3">
            Container reserved for future Google Maps API integration. Real-time peer-to-peer LoRa beacon telemetry will project active SOS coordinates onto this canvas.
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-canvas/80 border border-hairline text-[10px] font-medium text-secondaryText">
            <span className="w-1.5 h-1.5 rounded-full bg-brandTeal shadow-glow-teal animate-pulse"></span>
            <span>Awaiting Google Maps SDK key binding</span>
          </div>
        </div>

        {/* Decorative mock node markers with glowing tactical pulse */}
        <div className="absolute top-10 left-16 hidden md:flex items-center gap-2 px-3 py-1.5 bg-surfaceCard/95 border border-alertRedBorder rounded-full shadow-glow-red text-[11px] text-primaryText backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-alertRed animate-ping"></span>
          <span className="font-semibold text-alertRed">Sector 4B</span>
          <span className="text-mutedGray font-mono">#sos-8921</span>
        </div>

        <div className="absolute bottom-10 right-20 hidden md:flex items-center gap-2 px-3 py-1.5 bg-surfaceCard/95 border border-hairline rounded-full shadow-panel-dark text-[11px] text-primaryText backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-brandTeal shadow-glow-teal"></span>
          <span className="font-semibold text-secondaryText">Relay Point 03</span>
          <span className="text-mutedGray font-mono">12 Nodes Connected</span>
        </div>
      </div>

      {/* Sub-bar / Mode Notice Footer */}
      <div className="border-t border-hairline px-5 py-2 bg-surface flex items-center justify-between text-xs text-mutedGray flex-shrink-0">
        <span className="flex items-center gap-1.5 text-[11px]">
          <Info className="w-3.5 h-3.5 text-brandTeal" />
          <span>Operational roles and dispatch modes can be switched at any time.</span>
        </span>
        <span className="font-mono text-[10px] text-dimGray">ZeroGrid UI • v3.2.0-dark</span>
      </div>
    </section>
  );
}

