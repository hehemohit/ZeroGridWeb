'use client';

import React from 'react';
import {
  Shield,
  User,
  X,
  Crosshair,
  Check,
  CheckCheck,
  FileText,
  Loader2,
} from 'lucide-react';

export interface NoteItem {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface SosEventUI {
  id: string;
  rawId: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: 'AUTHORITY' | 'REGULAR';
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  severity: string;
  location: string;
  coordinates?: [number, number];
  timestamp: string;
  batteryLevel: string;
  peerNodesInRange: number;
  message?: string;
  notes: NoteItem[];
}

interface SosDrawerProps {
  sos: SosEventUI | null;
  isLoadingDetails: boolean;
  actionLoading: boolean;
  noteInput: string;
  onSetNoteInput: (val: string) => void;
  onClose: () => void;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
  onAddNote: (e: React.FormEvent) => void;
  formatTime: (isoString: string) => string;
}

export function SosDrawer({
  sos,
  isLoadingDetails,
  actionLoading,
  noteInput,
  onSetNoteInput,
  onClose,
  onAcknowledge,
  onResolve,
  onAddNote,
  formatTime,
}: SosDrawerProps) {
  if (!sos) return null;

  const isAuthority = sos.role === 'AUTHORITY';
  const isEmergencyActive = sos.status === 'ACTIVE';

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity animate-fade-in">
      <div className="w-full max-w-lg bg-surface h-full border-l border-hairlineBright shadow-2xl flex flex-col overflow-hidden">
        {/* Drawer Header */}
        <div className="p-5 border-b border-hairline flex items-center justify-between bg-surfaceElevated">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-surfaceCard text-mutedGray border border-hairline">
                GET /api/sos/{sos.rawId || sos.id}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono ${
                  isEmergencyActive
                    ? 'bg-alertRedBg text-alertRed border border-alertRedBorder shadow-glow-red'
                    : sos.status === 'ACKNOWLEDGED'
                    ? 'bg-brandTealDark text-brandTeal border border-brandTeal/30'
                    : 'bg-surfaceElevated text-mutedGray border border-hairline'
                }`}
              >
                {sos.status}
              </span>
            </div>
            <h3 className="text-lg font-bold text-primaryText mt-1 font-display">
              Emergency Event Details
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-hairline hover:bg-surfaceCard flex items-center justify-center text-mutedGray hover:text-primaryText transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Body - Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-canvas">
          {isLoadingDetails ? (
            <div className="h-48 flex items-center justify-center text-brandTeal">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <>
              {/* Originating User Profile Card */}
              <div className="p-4 bg-surfaceCard rounded-16dp border border-hairline">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${
                      isAuthority
                        ? 'bg-brandTealDark text-brandTeal border border-brandTeal/40 shadow-glow-teal'
                        : 'bg-surfaceElevated text-secondaryText border border-hairline'
                    }`}
                  >
                    {isAuthority ? (
                      <Shield className="w-6 h-6 text-brandTeal" />
                    ) : (
                      <User className="w-6 h-6 text-mutedGray" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-bold text-primaryText">{sos.userName}</h4>
                      <span className="text-[11px] font-mono text-mutedGray">User: {sos.userId}</span>
                    </div>
                    <p className="text-xs text-brandTeal font-medium mt-0.5">
                      {isAuthority
                        ? 'Authority & Rescue Node Operator'
                        : 'Civilian Regular Node (Citizen Telemetry)'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-hairline text-xs">
                  <div>
                    <span className="text-mutedGray block text-[11px]">Reported Time</span>
                    <span className="font-semibold text-primaryText">
                      {new Date(sos.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-mutedGray block text-[11px]">Hardware Battery</span>
                    <span className="font-semibold text-brandTeal font-mono">{sos.batteryLevel}</span>
                  </div>
                  <div>
                    <span className="text-mutedGray block text-[11px]">Direct LoRa Mesh Peers</span>
                    <span className="font-semibold text-secondaryText font-mono">
                      {sos.peerNodesInRange} nodes in range
                    </span>
                  </div>
                  <div>
                    <span className="text-mutedGray block text-[11px]">Urgency Classification</span>
                    <span className="font-semibold text-alertRed font-mono">{sos.severity}</span>
                  </div>
                </div>
              </div>

              {/* Geolocation Specs */}
              <div className="p-4 bg-surfaceCard rounded-16dp border border-hairline">
                <h5 className="text-xs font-bold text-brandTeal uppercase tracking-wider mb-2 flex items-center gap-1.5 font-display">
                  <Crosshair className="w-3.5 h-3.5" />
                  Reported Location Telemetry
                </h5>
                <p className="text-sm font-medium text-primaryText">{sos.location}</p>
                {sos.message && (
                  <p className="text-xs italic text-secondaryText mt-2 bg-canvas p-2.5 rounded-lg border border-hairline">
                    &quot;{sos.message}&quot;
                  </p>
                )}
                <p className="text-[11px] text-mutedGray mt-1">
                  ZeroGrid Decentralized Mesh packet received via 868MHz relay gateway.
                </p>
              </div>

              {/* Action Buttons (Strict API: PUT /api/sos/:id/acknowledge, PUT /api/sos/:id/resolve) */}
              <div className="p-4 bg-surfaceCard rounded-16dp border border-hairline">
                <h5 className="text-xs font-bold text-primaryText uppercase tracking-wider mb-3 font-display">
                  Dispatch Action Controls
                </h5>

                <div className="grid grid-cols-2 gap-3">
                  {/* Acknowledge Action Button */}
                  <button
                    disabled={
                      actionLoading ||
                      sos.status === 'ACKNOWLEDGED' ||
                      sos.status === 'RESOLVED'
                    }
                    onClick={() => onAcknowledge(sos.id)}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-16dp text-xs font-semibold border transition-all ${
                      sos.status === 'ACKNOWLEDGED'
                        ? 'bg-brandTealDark text-brandTeal/60 border-brandTeal/20 cursor-not-allowed'
                        : 'bg-surfaceElevated hover:bg-brandTealDark text-brandTeal border-brandTeal/40 hover:border-brandTeal shadow-panel-dark'
                    }`}
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-brandTeal" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>
                      {sos.status === 'ACKNOWLEDGED' ? 'Acknowledged' : 'PUT /api/sos/acknowledge'}
                    </span>
                  </button>

                  {/* Resolve Action Button */}
                  <button
                    disabled={actionLoading || sos.status === 'RESOLVED'}
                    onClick={() => onResolve(sos.id)}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-16dp text-xs font-semibold transition-all ${
                      sos.status === 'RESOLVED'
                        ? 'bg-surfaceElevated text-dimGray border border-hairline cursor-not-allowed'
                        : 'bg-alertRed hover:bg-red-600 text-white shadow-glow-red'
                    }`}
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <CheckCheck className="w-4 h-4" />
                    )}
                    <span>
                      {sos.status === 'RESOLVED' ? 'Resolved' : 'PUT /api/sos/resolve'}
                    </span>
                  </button>
                </div>
                <p className="text-[10px] text-mutedGray mt-2 text-center">
                  *Red action button strictly reserved for resolving genuine live SOS incidents.
                </p>
              </div>

              {/* Operational Notes Section (POST /api/sos/:id/notes) */}
              <div className="p-4 bg-surfaceCard rounded-16dp border border-hairline">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-xs font-bold text-primaryText uppercase tracking-wider flex items-center gap-1.5 font-display">
                    <FileText className="w-3.5 h-3.5 text-brandTeal" />
                    Incident Log Notes
                  </h5>
                  <span className="text-[10px] font-mono text-mutedGray">
                    POST /api/sos/{sos.rawId || sos.id}/notes
                  </span>
                </div>

                {/* Existing notes list */}
                <div className="space-y-2.5 mb-3 max-h-48 overflow-y-auto">
                  {sos.notes.length === 0 ? (
                    <p className="text-xs text-mutedGray italic py-2 text-center bg-canvas rounded-lg border border-hairline">
                      No dispatch notes recorded yet.
                    </p>
                  ) : (
                    sos.notes.map((n) => (
                      <div key={n.id} className="p-2.5 rounded-lg bg-canvas border border-hairline text-xs">
                        <div className="flex items-center justify-between text-[11px] text-mutedGray mb-1">
                          <span className="font-semibold text-brandTeal">{n.author}</span>
                          <span className="font-mono text-dimGray">{formatTime(n.createdAt)}</span>
                        </div>
                        <p className="text-secondaryText">{n.text}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Add note form */}
                <form onSubmit={onAddNote} className="flex gap-2">
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => onSetNoteInput(e.target.value)}
                    placeholder="Append dispatch telemetry notes..."
                    className="flex-1 bg-canvas border border-hairline rounded-xl px-3 py-1.5 text-xs text-primaryText placeholder-dimGray focus:outline-none focus:border-brandTeal focus:ring-1 focus:ring-brandTeal"
                  />
                  <button
                    type="submit"
                    disabled={!noteInput.trim() || actionLoading}
                    className="px-3 py-1.5 bg-brandTeal hover:bg-brandTealGlow text-canvas font-bold rounded-xl text-xs transition-colors disabled:opacity-50"
                  >
                    Add
                  </button>
                </form>
              </div>
            </>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-hairline bg-surface flex items-center justify-between text-xs text-mutedGray">
          <span>Emergency Record Active</span>
          <button
            onClick={onClose}
            className="font-medium text-secondaryText hover:text-brandTeal"
          >
            Close Drawer
          </button>
        </div>
      </div>
    </div>
  );
}

