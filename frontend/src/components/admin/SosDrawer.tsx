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
  UserCheck,
  Compass
} from 'lucide-react';
import { AdminUserUI } from './UserManagementModal';

export interface NoteItem {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface AssignedAdminUI {
  id: string;
  displayName: string;
  email: string;
  photoUrl?: string;
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
  assignedAdmin?: AssignedAdminUI | string | null;
}

interface SosDrawerProps {
  sos: SosEventUI | null;
  isLoadingDetails: boolean;
  actionLoading: boolean;
  noteInput: string;
  admins?: AdminUserUI[];
  currentUserId?: string;
  onSetNoteInput: (val: string) => void;
  onClose: () => void;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
  onAddNote: (e: React.FormEvent) => void;
  onAssignAdmin?: (sosId: string, adminId: string | null) => void;
  onAutoAssignNearest?: () => void;
  formatTime: (isoString: string) => string;
}

export function SosDrawer({
  sos,
  isLoadingDetails,
  actionLoading,
  noteInput,
  admins = [],
  currentUserId,
  onSetNoteInput,
  onClose,
  onAcknowledge,
  onResolve,
  onAddNote,
  onAssignAdmin,
  onAutoAssignNearest,
  formatTime,
}: SosDrawerProps) {
  if (!sos) return null;

  const isAuthority = sos.role === 'AUTHORITY';
  const isEmergencyActive = sos.status === 'ACTIVE';

  const assignedAdminObj =
    typeof sos.assignedAdmin === 'object' && sos.assignedAdmin !== null
      ? (sos.assignedAdmin as AssignedAdminUI)
      : null;

  const isAssignedToMe = Boolean(
    assignedAdminObj &&
      currentUserId &&
      (assignedAdminObj.id === currentUserId || (assignedAdminObj as any)._id === currentUserId)
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity animate-fade-in">
      {/* Drawer Container - 100% width on mobile, max 512px on desktop */}
      <div className="w-full sm:max-w-md md:max-w-lg bg-surface h-full border-l border-hairlineBright shadow-2xl flex flex-col overflow-hidden">

        {/* Drawer Header - Stacks tags and title on narrow screens */}
        <div className="p-4 sm:p-5 border-b border-hairline flex items-start justify-between bg-surfaceElevated gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] sm:text-xs font-mono px-2 py-0.5 rounded bg-surfaceCard text-mutedGray border border-hairline truncate max-w-[120px] sm:max-w-[200px]">
                GET /api/sos/{sos.rawId || sos.id}
              </span>
              <span
                className={`text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono whitespace-nowrap ${isEmergencyActive
                    ? 'bg-alertRedBg text-alertRed border border-alertRedBorder shadow-glow-red'
                    : sos.status === 'ACKNOWLEDGED'
                      ? 'bg-brandTealDark text-brandTeal border border-brandTeal/30'
                      : 'bg-surfaceElevated text-mutedGray border border-hairline'
                  }`}
              >
                {sos.status}
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-primaryText mt-1.5 font-display truncate">
              Emergency Event Details
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-full border border-hairline hover:bg-surfaceCard flex items-center justify-center text-mutedGray hover:text-primaryText transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Body - Adaptive padding and spacing */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 bg-canvas">
          {isLoadingDetails ? (
            <div className="h-48 flex items-center justify-center text-brandTeal">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <>
              {/* Originating User Profile Card */}
              <div className="p-3 sm:p-4 bg-surfaceCard rounded-16dp border border-hairline">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold text-sm ${isAuthority
                        ? 'bg-brandTealDark text-brandTeal border border-brandTeal/40 shadow-glow-teal'
                        : 'bg-surfaceElevated text-secondaryText border border-hairline'
                      }`}
                  >
                    {isAuthority ? (
                      <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-brandTeal" />
                    ) : (
                      <User className="w-5 h-5 sm:w-6 sm:h-6 text-mutedGray" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 sm:gap-2">
                      <h4 className="text-sm sm:text-base font-bold text-primaryText truncate">{sos.userName}</h4>
                      <span className="text-[10px] sm:text-[11px] font-mono text-mutedGray truncate">
                        ID: {sos.userId}
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-brandTeal font-medium mt-0.5 truncate">
                      {isAuthority
                        ? 'Authority & Rescue Node Operator'
                        : 'Civilian Regular Node'}
                    </p>
                  </div>
                </div>

                {/* Specs Grid: 2 columns with clear vertical spacing */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-3 border-t border-hairline text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-mutedGray text-[11px]">Reported Time</span>
                    <span className="font-semibold text-primaryText text-xs">
                      {new Date(sos.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-mutedGray text-[11px]">Hardware Battery</span>
                    <span className="font-semibold text-brandTeal font-mono text-xs">{sos.batteryLevel}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-mutedGray text-[11px]">Direct Mesh Peers</span>
                    <span className="font-semibold text-secondaryText font-mono text-xs">
                      {sos.peerNodesInRange} nodes
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-mutedGray text-[11px]">Urgency Class</span>
                    <span className="font-semibold text-alertRed font-mono text-xs">{sos.severity}</span>
                  </div>
                </div>
              </div>

              {/* Geolocation Specs */}
              <div className="p-3 sm:p-4 bg-surfaceCard rounded-16dp border border-hairline">
                <h5 className="text-[11px] sm:text-xs font-bold text-brandTeal uppercase tracking-wider mb-2 flex items-center gap-1.5 font-display">
                  <Crosshair className="w-3.5 h-3.5 flex-shrink-0" />
                  Reported Location Telemetry
                </h5>
                <p className="text-xs sm:text-sm font-medium text-primaryText">{sos.location}</p>
                {sos.message && (
                  <p className="text-xs italic text-secondaryText mt-2 bg-canvas p-2.5 rounded-lg border border-hairline">
                    &quot;{sos.message}&quot;
                  </p>
                )}
                <p className="text-[10px] sm:text-[11px] text-mutedGray mt-2">
                  ZeroGrid Decentralized Mesh packet received via 868MHz relay gateway.
                </p>
              </div>

              {/* Dispatch Ownership & Assignment */}
              <div className="p-3 sm:p-4 bg-surfaceCard rounded-16dp border border-hairline">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-[11px] sm:text-xs font-bold text-primaryText uppercase tracking-wider flex items-center gap-1.5 font-display">
                    <UserCheck className="w-3.5 h-3.5 text-brandTeal" />
                    Dispatch Ownership & Assignment
                  </h5>
                  <span
                    className={`text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono border ${
                      assignedAdminObj
                        ? 'bg-brandTealDark text-brandTeal border-brandTeal/30'
                        : 'bg-surfaceElevated text-mutedGray border-hairline'
                    }`}
                  >
                    {assignedAdminObj ? 'Assigned' : 'Unassigned'}
                  </span>
                </div>

                {/* Current Assignee Badge */}
                <div className="p-2.5 sm:p-3 rounded-xl bg-canvas border border-hairline mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border ${
                        assignedAdminObj
                          ? 'bg-brandTeal/10 text-brandTeal border-brandTeal/20'
                          : 'bg-surfaceElevated text-mutedGray border-hairline'
                      }`}
                    >
                      {assignedAdminObj ? (
                        <Shield className="w-4 h-4 text-brandTeal" />
                      ) : (
                        <User className="w-4 h-4 text-mutedGray" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-primaryText truncate">
                        {assignedAdminObj
                          ? assignedAdminObj.displayName || assignedAdminObj.email || 'Admin'
                          : 'Unassigned Alert'}
                      </p>
                      <p className="text-[10px] text-mutedGray truncate">
                        {assignedAdminObj
                          ? assignedAdminObj.email || `ID: ${assignedAdminObj.id}`
                          : 'No dispatch lead has taken ownership'}
                      </p>
                    </div>
                  </div>
                  {isAssignedToMe && (
                    <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-brandTeal/10 text-brandTeal border border-brandTeal/20">
                      YOU
                    </span>
                  )}
                </div>

                {/* Assignment Controls */}
                {onAssignAdmin && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        disabled={actionLoading || isAssignedToMe || !currentUserId}
                        onClick={() => currentUserId && onAssignAdmin(sos.id, currentUserId)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                          isAssignedToMe
                            ? 'bg-brandTealDark text-brandTeal/70 border-brandTeal/30 cursor-not-allowed'
                            : 'bg-brandTeal hover:bg-brandTealGlow text-canvas border-brandTeal shadow-sm'
                        }`}
                      >
                        {actionLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserCheck className="w-3.5 h-3.5" />
                        )}
                        <span className="truncate">
                          {isAssignedToMe ? 'Assigned to You' : 'Assign to Me'}
                        </span>
                      </button>

                      {onAutoAssignNearest && (
                        <button
                          disabled={actionLoading}
                          onClick={onAutoAssignNearest}
                          className="px-2.5 py-2 bg-brandTeal/10 hover:bg-brandTeal/20 text-brandTeal border border-brandTeal/20 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 shrink-0"
                          title="Auto-assign nearest admin responder by distance"
                        >
                          <Compass className="w-3.5 h-3.5" />
                          <span>Auto-Assign</span>
                        </button>
                      )}

                      {assignedAdminObj && (
                        <button
                          disabled={actionLoading}
                          onClick={() => onAssignAdmin(sos.id, null)}
                          className="px-3 py-2 bg-surfaceElevated hover:bg-surfaceCard text-mutedGray hover:text-alertRed border border-hairline rounded-xl text-xs font-semibold transition-colors"
                          title="Unassign current lead"
                        >
                          Unassign
                        </button>
                      )}
                    </div>

                    {/* Admin Dropdown Selector */}
                    {admins && admins.length > 0 && (
                      <div className="relative mt-1">
                        <select
                          disabled={actionLoading}
                          value={assignedAdminObj ? assignedAdminObj.id : ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            onAssignAdmin(sos.id, val ? val : null);
                          }}
                          className="w-full bg-canvas border border-hairline rounded-xl px-3 py-2 text-xs text-primaryText focus:outline-none focus:border-brandTeal font-medium appearance-none cursor-pointer"
                        >
                          <option value="">-- Reassign to another Admin --</option>
                          {admins.map((adm) => (
                            <option key={adm.id} value={adm.id}>
                              {adm.name} ({adm.email}) {adm.id === currentUserId ? '• You' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons: Stack on mobile, side-by-side on laptop */}
              <div className="p-3 sm:p-4 bg-surfaceCard rounded-16dp border border-hairline">
                <h5 className="text-[11px] sm:text-xs font-bold text-primaryText uppercase tracking-wider mb-3 font-display">
                  Dispatch Action Controls
                </h5>

                <div className="flex flex-col sm:grid sm:grid-cols-2 gap-2.5 sm:gap-3">
                  <button
                    disabled={
                      actionLoading ||
                      sos.status === 'ACKNOWLEDGED' ||
                      sos.status === 'RESOLVED'
                    }
                    onClick={() => onAcknowledge(sos.id)}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-12dp sm:rounded-16dp text-[11px] sm:text-xs font-semibold border transition-all ${sos.status === 'ACKNOWLEDGED'
                        ? 'bg-brandTealDark text-brandTeal/60 border-brandTeal/20 cursor-not-allowed'
                        : 'bg-surfaceElevated hover:bg-brandTealDark text-brandTeal border-brandTeal/40 hover:border-brandTeal shadow-panel-dark'
                      }`}
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-brandTeal flex-shrink-0" />
                    ) : (
                      <Check className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span className="truncate">
                      {sos.status === 'ACKNOWLEDGED' ? 'Acknowledged' : 'Acknowledge Event'}
                    </span>
                  </button>

                  <button
                    disabled={actionLoading || sos.status === 'RESOLVED'}
                    onClick={() => onResolve(sos.id)}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-12dp sm:rounded-16dp text-[11px] sm:text-xs font-semibold transition-all ${sos.status === 'RESOLVED'
                        ? 'bg-surfaceElevated text-dimGray border border-hairline cursor-not-allowed'
                        : 'bg-alertRed hover:bg-red-600 text-white shadow-glow-red'
                      }`}
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white flex-shrink-0" />
                    ) : (
                      <CheckCheck className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span className="truncate">
                      {sos.status === 'RESOLVED' ? 'Resolved' : 'Resolve Event'}
                    </span>
                  </button>
                </div>
                <p className="text-[9px] sm:text-[10px] text-mutedGray mt-2.5 text-center leading-tight">
                  *Red action button strictly reserved for resolving genuine live SOS incidents.
                </p>
              </div>

              {/* Operational Notes Section */}
              <div className="p-3 sm:p-4 bg-surfaceCard rounded-16dp border border-hairline">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0 mb-3">
                  <h5 className="text-[11px] sm:text-xs font-bold text-primaryText uppercase tracking-wider flex items-center gap-1.5 font-display">
                    <FileText className="w-3.5 h-3.5 text-brandTeal" />
                    Incident Log Notes
                  </h5>
                  <span className="text-[9px] sm:text-[10px] font-mono text-mutedGray truncate max-w-[200px]">
                    POST /api/sos/{sos.rawId || sos.id}/notes
                  </span>
                </div>

                <div className="space-y-2.5 mb-3 max-h-40 sm:max-h-48 overflow-y-auto pr-1">
                  {sos.notes.length === 0 ? (
                    <p className="text-[11px] sm:text-xs text-mutedGray italic py-3 text-center bg-canvas rounded-lg border border-hairline">
                      No dispatch notes recorded yet.
                    </p>
                  ) : (
                    sos.notes.map((n) => (
                      <div key={n.id} className="p-2 sm:p-2.5 rounded-lg bg-canvas border border-hairline text-xs">
                        <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-mutedGray mb-1">
                          <span className="font-semibold text-brandTeal truncate pr-2">{n.author}</span>
                          <span className="font-mono text-dimGray flex-shrink-0">
                            {formatTime(n.createdAt)}
                          </span>
                        </div>
                        <p className="text-[11px] sm:text-xs text-secondaryText leading-relaxed">
                          {n.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={onAddNote} className="flex gap-2">
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => onSetNoteInput(e.target.value)}
                    placeholder="Append dispatch telemetry notes..."
                    className="flex-1 bg-canvas border border-hairline rounded-xl px-3 py-2 sm:py-1.5 text-[11px] sm:text-xs text-primaryText placeholder-dimGray focus:outline-none focus:border-brandTeal focus:ring-1 focus:ring-brandTeal"
                  />
                  <button
                    type="submit"
                    disabled={!noteInput.trim() || actionLoading}
                    className="px-3 py-2 sm:py-1.5 bg-brandTeal hover:bg-brandTealGlow text-canvas font-bold rounded-xl text-[11px] sm:text-xs transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    Add
                  </button>
                </form>
              </div>
            </>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-3 sm:p-4 border-t border-hairline bg-surface flex items-center justify-between text-[11px] sm:text-xs text-mutedGray">
          <span>Emergency Record Active</span>
          <button
            onClick={onClose}
            className="font-medium text-secondaryText hover:text-brandTeal p-1"
          >
            Close Drawer
          </button>
        </div>
      </div>
    </div>
  );
}