'use client';

import React from 'react';
import { MapPin, Info, Shield, User, X, ChevronRight, Clock, Building2 } from 'lucide-react';
import { SosLiveMap, SosLiveMapProps } from './SosLiveMap';

interface MapCanvasProps extends SosLiveMapProps {
  activeSosCount: number;
  onOpenDetails?: (id: string) => void;
  onClosePreview?: () => void;
}

export function MapCanvas({
  activeSosCount,
  sosEvents = [],
  headquarters = [],
  selectedSosId,
  selectedHqId,
  optimizedRouteData,
  onMarkerClick,
  onMarkerDoubleClick,
  onHqMarkerClick,
  onOpenDetails,
  onClosePreview,
}: MapCanvasProps) {
  const selectedSos = sosEvents.find(
    e => e.id === selectedSosId || e.rawId === selectedSosId
  );

  const selectedHq = headquarters.find(
    h => h.id === selectedHqId
  );

  const formatHqLocation = (loc: any) => {
    if (!loc) return 'Location Not Specified';
    if (typeof loc === 'string') return loc;
    if (typeof loc === 'object') {
      if (Array.isArray(loc.coordinates)) return `Coordinates: ${loc.coordinates[1]}, ${loc.coordinates[0]}`;
      return JSON.stringify(loc);
    }
    return String(loc);
  };

  return (
    <section className="flex-1 w-full min-h-[300px] md:min-h-[340px] lg:min-h-[480px] flex flex-col bg-surface border border-hairline rounded-16dp overflow-hidden relative shadow-panel-dark">
      {/* Card Header Toolbar */}
      <div className="min-h-[44px] border-b border-hairline px-3 sm:px-5 py-2.5 sm:py-0 flex flex-col sm:flex-row sm:items-center justify-between bg-surfaceElevated/70 backdrop-blur-md z-10 flex-shrink-0 gap-2 sm:gap-0">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-brandTeal flex-shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-brandTeal font-display truncate">
            Geo-Spatial Telemetry Canvas
          </span>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs text-mutedGray">
          {headquarters.length > 0 && (
            <span className="font-mono text-[11px] text-brandTeal bg-brandTeal/10 px-2 py-0.5 rounded border border-brandTeal/20 font-semibold">
              HQs: {headquarters.length}
            </span>
          )}
          <span className="font-mono text-[11px] text-mutedGray bg-surfaceCard sm:bg-transparent px-2 sm:px-0 py-1 sm:py-0 rounded border border-hairline sm:border-none">
            Active SOS: {activeSosCount}
          </span>
        </div>
      </div>

      {/* Map Body — relative container so the map can fill it absolutely */}
      <div className="flex-1 relative w-full h-full min-h-[220px]">
        <SosLiveMap
          sosEvents={sosEvents}
          headquarters={headquarters}
          selectedSosId={selectedSosId}
          selectedHqId={selectedHqId}
          optimizedRouteData={optimizedRouteData}
          onMarkerClick={onMarkerClick}
          onMarkerDoubleClick={onMarkerDoubleClick}
          onHqMarkerClick={onHqMarkerClick}
        />

        {/* Mini Quick-Info Card Overlay for Selected SOS */}
        {selectedSos && (
          <div className="absolute bottom-3 right-3 z-30 max-w-[280px] sm:max-w-sm w-full bg-surfaceCard/95 backdrop-blur-md border border-hairline shadow-2xl rounded-2xl p-3.5 space-y-2.5 animate-fade-in text-primaryText">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border ${
                    selectedSos.role === 'AUTHORITY'
                      ? 'bg-brandTeal/10 text-brandTeal border-brandTeal/20'
                      : 'bg-surfaceElevated text-secondaryText border-hairline'
                  }`}
                >
                  {selectedSos.role === 'AUTHORITY' ? (
                    <Shield className="w-4 h-4 text-brandTeal" />
                  ) : (
                    <User className="w-4 h-4 text-mutedGray" />
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-primaryText truncate">
                    {selectedSos.userName}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase font-mono border ${
                        selectedSos.status === 'ACTIVE'
                          ? 'bg-red-500/10 text-red-500 border-red-500/20'
                          : 'bg-brandTeal/10 text-brandTeal border-brandTeal/20'
                      }`}
                    >
                      {selectedSos.status}
                    </span>
                    <span className="text-[10px] text-mutedGray font-mono truncate">
                      #{selectedSos.id}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={onClosePreview}
                className="text-mutedGray hover:text-primaryText p-1 rounded-lg hover:bg-surfaceElevated transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-[11px] text-secondaryText space-y-1 bg-surfaceElevated p-2.5 rounded-xl border border-hairline">
              <p className="truncate font-medium">{selectedSos.location}</p>
              <div className="flex items-center justify-between text-[10px] text-mutedGray font-mono">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-brandTeal" />
                  {new Date(selectedSos.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span>Batt: {selectedSos.batteryLevel}</span>
              </div>
            </div>

            {/* Action Button to Open Full Details Drawer */}
            <button
              onClick={() => {
                if (onOpenDetails) onOpenDetails(selectedSos.id);
                else if (onMarkerDoubleClick) onMarkerDoubleClick(selectedSos.id);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-brandTeal hover:bg-brandTealGlow text-white text-xs font-bold transition-all shadow-sm group"
            >
              <span>View Details & Dispatch</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        )}

        {/* Mini Quick-Info Card Overlay for Selected HQ */}
        {selectedHq && !selectedSos && (
          <div className="absolute bottom-3 right-3 z-30 max-w-[280px] sm:max-w-sm w-full bg-surfaceCard/95 backdrop-blur-md border border-brandTeal/30 shadow-2xl rounded-2xl p-3.5 space-y-2.5 animate-fade-in text-primaryText">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-brandTeal/10 border border-brandTeal/30 flex items-center justify-center text-brandTeal shrink-0 font-bold">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-primaryText truncate">
                    {selectedHq.name}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase font-mono border ${
                        selectedHq.status === 'ACTIVE'
                          ? 'bg-brandTeal/10 text-brandTeal border-brandTeal/20'
                          : 'bg-red-500/10 text-red-500 border-red-500/20'
                      }`}
                    >
                      HQ {selectedHq.status}
                    </span>
                    <span className="text-[10px] text-mutedGray font-mono">
                      {selectedHq.assignedAdmins?.length || 0} Admins Assigned
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={onClosePreview}
                className="text-mutedGray hover:text-primaryText p-1 rounded-lg hover:bg-surfaceElevated transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-[11px] text-secondaryText space-y-1 bg-surfaceElevated p-2.5 rounded-xl border border-hairline">
              <div className="flex items-start gap-1.5 text-primaryText font-mono text-[11px]">
                <MapPin className="w-3.5 h-3.5 text-brandTeal shrink-0 mt-0.5" />
                <span>{formatHqLocation(selectedHq.location)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sub-bar Footer */}
      <div className="border-t border-hairline px-3 sm:px-5 py-2 bg-surface flex items-center justify-between text-xs text-mutedGray flex-shrink-0 z-10">
        <span className="flex items-center gap-1.5 text-[10px] sm:text-[11px]">
          <Info className="w-3.5 h-3.5 text-brandTeal flex-shrink-0" />
          <span className="truncate">HQ markers rendered live • Click any marker to view location telemetry.</span>
        </span>

        <span className="hidden sm:inline-block font-mono text-[10px] text-dimGray">
          ZeroGrid Geo-Spatial • Headquarters Engine
        </span>
      </div>
    </section>
  );
}