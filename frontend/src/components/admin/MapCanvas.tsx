'use client';

import React from 'react';
import { MapPin, Compass, Info } from 'lucide-react';

interface MapCanvasProps {
  activeSosCount: number;
}

export function MapCanvas({ activeSosCount }: MapCanvasProps) {
  return (
    <section className="flex-1 flex flex-col min-w-0 bg-surface border border-hairline rounded-16dp overflow-hidden relative shadow-xs">
      {/* Card Header Toolbar with tactical coordinate metadata */}
      <div className="h-12 border-b border-hairline px-5 flex items-center justify-between bg-surface/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-brandTeal" />
          <span className="text-xs font-semibold uppercase tracking-wider text-brandTeal">
            Geo-Spatial Telemetry Canvas
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-mutedGray">
          <span className="font-mono bg-[#F7F7F7] px-2.5 py-1 rounded-md border border-hairline text-[11px]">
            Coverage: 14.8 km² Mesh
          </span>
          <span className="hidden sm:inline-block font-mono text-[11px]">
            Active Alerts: {activeSosCount}
          </span>
        </div>
      </div>

      {/* Map Placeholder Body */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-8 bg-[#FAFAFA]">
        {/* Subtle tactical grid lines background pattern */}
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(to right, #E5E5E5 1px, transparent 1px), linear-gradient(to bottom, #E5E5E5 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        ></div>

        {/* Central Card with strict requested label: "Map Integration Pending" */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-sm px-6 py-8 bg-surface rounded-16dp border border-hairline shadow-sm">
          <div className="w-14 h-14 rounded-full bg-brandTealLight flex items-center justify-center mb-4 text-brandTeal">
            <Compass className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-primaryText mb-1">
            Map Integration Pending
          </h3>
          <p className="text-xs text-mutedGray leading-relaxed mb-4">
            Container reserved for future Google Maps API integration. Real-time peer-to-peer LoRa beacon telemetry will project active SOS coordinates onto this canvas.
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F5F5F5] border border-hairline text-[11px] font-medium text-mutedGray">
            <span className="w-1.5 h-1.5 rounded-full bg-brandTeal animate-pulse"></span>
            <span>Awaiting Google Maps SDK key binding</span>
          </div>
        </div>

        {/* Decorative mock node markers to simulate live feed spatial presence */}
        <div className="absolute top-16 left-20 hidden md:flex items-center gap-2 px-3 py-1.5 bg-surface/90 border border-hairline rounded-full shadow-xs text-[11px] text-primaryText">
          <span className="w-2 h-2 rounded-full bg-alertRed animate-ping"></span>
          <span className="font-semibold">Sector 4B</span>
          <span className="text-mutedGray font-mono">Telemetry Active</span>
        </div>

        <div className="absolute bottom-16 right-28 hidden md:flex items-center gap-2 px-3 py-1.5 bg-surface/90 border border-hairline rounded-full shadow-xs text-[11px] text-primaryText">
          <span className="w-2 h-2 rounded-full bg-brandTeal"></span>
          <span className="font-semibold">Relay Point 03</span>
          <span className="text-mutedGray font-mono">LoRa Connected</span>
        </div>
      </div>

      {/* Sub-bar / Mode Notice Footer */}
      <div className="border-t border-hairline px-5 py-2.5 bg-surface flex items-center justify-between text-xs text-mutedGray">
        <span className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-brandTeal" />
          <span>Operational roles and dispatch modes can be switched at any time.</span>
        </span>
        <span className="font-mono text-[10px] text-mutedGray/80">ZeroGrid UI • v3.2.0-clean</span>
      </div>
    </section>
  );
}
