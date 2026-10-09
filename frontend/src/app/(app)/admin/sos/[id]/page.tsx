'use client';

import React, { useEffect, useState, use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { FloatingVoiceButton } from '@/components/voice/FloatingVoiceButton';
import {
  ArrowLeft,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Droplets,
  Radio,
  Battery,
  MapPin,
  Clock,
  User,
  Users,
  Phone,
  Mail,
  ExternalLink,
  Check,
  CheckCircle2,
  CheckCheck,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Bot,
  Zap,
  Activity,
  Layers,
  HeartHandshake,
  UserCheck,
  Compass,
  AlertOctagon,
  Calendar,
  ChevronRight
} from 'lucide-react';
import { AgentZeroOrchestratorWidget } from '@/components/admin/AgentZeroOrchestratorWidget';

interface IncidentNote {
  authorId: string;
  text: string;
  timestamp: string;
}

interface AssignedAdmin {
  id: string;
  displayName: string;
  email: string;
  photoUrl?: string;
}

interface IncidentData {
  id: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  category: string;
  isEmergencySos: boolean;
  intentLabel: string;
  location: { lat: number; lng: number } | null;
  accuracyMeters?: number;
  waterDepthCm: number;
  passability: 'ALL_PASSABLE' | 'HIGH_CLEARANCE_ONLY' | 'PEDESTRIAN_ONLY' | 'IMPASSABLE';
  batteryPercentage?: number | null;
  transport: 'ONLINE' | 'MESH' | 'BOTH';
  relayedByMule: boolean;
  packetId?: string | null;
  message: string;
  notes: IncidentNote[];
  acknowledgedByUsers: Array<{
    userId: string;
    displayName: string;
    confirmedSafe: boolean;
    acknowledgedAt: string;
  }>;
  assignedAdmin?: AssignedAdmin | null;
  assignedSquad?: string | null;
  affectedNodeId?: string | null;
  agentZeroAdvisory?: any;
  createdAt: string;
  updatedAt: string;
}

interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  phoneNumber?: string | null;
  role: string;
  accountType: string;
  photoUrl?: string | null;
  lastKnownLocation?: { coordinates: [number, number] } | null;
  lastLocationAt?: string | null;
  createdAt: string;
}

interface FamilyMemberNode {
  linkId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'REVOKED';
  requestedAt: string;
  respondedAt?: string | null;
  user: {
    id: string;
    displayName: string;
    email: string;
    phoneNumber?: string | null;
    role: string;
    photoUrl?: string | null;
    lastKnownLocation?: { coordinates: [number, number] } | null;
    lastLocationAt?: string | null;
  };
}

interface EmergencyContactItem {
  id: string;
  name: string;
  phoneNumber: string;
  relationship: string;
}

interface FamilyNetworkData {
  totalLinked: number;
  parents: FamilyMemberNode[];
  dependents: FamilyMemberNode[];
  emergencyContacts: EmergencyContactItem[];
}

interface HistoryItem {
  id: string;
  category: string;
  isEmergencySos: boolean;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  message: string;
  waterDepthCm: number;
  passability: string;
  transport: string;
  relayedByMule: boolean;
  packetId?: string | null;
  batteryPercentage?: number | null;
  location?: { lat: number; lng: number } | null;
  accuracyMeters?: number | null;
  createdAt: string;
  updatedAt: string;
  notesCount: number;
  acknowledgedCount: number;
  isCurrentIncident: boolean;
}

interface HistoryStats {
  totalEvents: number;
  emergencySosCount: number;
  civicComplaintCount: number;
  activeCount: number;
  acknowledgedCount: number;
  resolvedCount: number;
}

interface DossierResponse {
  incident: IncidentData;
  user: UserProfile | null;
  familyNetwork: FamilyNetworkData;
  history: {
    stats: HistoryStats;
    timeline: HistoryItem[];
  };
}

interface SituationBriefData {
  municipalActions?: string[];
  trafficDiversion?: string;
  agentAdvisory?: string;
  activeTier?: number;
  engine?: string;
  generatedAt?: string;
  model?: string;
}

interface SituationBriefResponse extends SituationBriefData {
  brief?: SituationBriefData;
}

export default function AdminSosDossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user: currentUser } = useAuth();

  const [dossier, setDossier] = useState<DossierResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active tab state
  const [activeTab, setActiveTab] = useState<'TELEMETRY' | 'AGENT_ZERO' | 'FAMILY' | 'HISTORY' | 'AI_BRIEF'>('TELEMETRY');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'EMERGENCY' | 'COMPLAINTS'>('ALL');

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [brief, setBrief] = useState<SituationBriefData | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  // Load Dossier with automatic short displayId resolution
  const fetchDossier = async () => {
    try {
      setLoading(true);
      setError(null);
      let targetId = id;

      // If id is a short display tag (e.g. "sos-d613" or not 24 hex chars)
      if (targetId.startsWith('sos-') || targetId.length !== 24) {
        try {
          const feedRes = await api.get<{ sosEvents?: any[]; sos?: any[] }>('/api/admin/sos?status=ACTIVE');
          const events = feedRes.sosEvents || feedRes.sos || (Array.isArray(feedRes) ? feedRes : []);
          const cleanSuffix = targetId.replace(/^sos-/, '').toLowerCase();
          const match = events.find((e: any) => {
            const rawId = String(e._id || e.id || '').toLowerCase();
            return rawId.endsWith(cleanSuffix) || rawId === cleanSuffix || e.packetId === targetId;
          });
          if (match) {
            targetId = String(match._id || match.id);
            if (typeof window !== 'undefined') {
              window.history.replaceState(null, '', `/admin/sos/${targetId}`);
            }
          }
        } catch (feedErr) {
          console.warn('[AdminSosDossier] Active SOS list fallback lookup error:', feedErr);
        }
      }

      const res = await api.get<DossierResponse>(`/api/admin/sos/${targetId}/dossier`);
      setDossier(res);
    } catch (err: any) {
      console.error('[AdminSosDossier] Failed to load dossier:', err);
      setError(err?.message || 'Failed to load incident dossier');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDossier();
  }, [id]);

  const activeSosId = dossier?.incident?.id || id;

  // Actions
  const handleAcknowledge = async () => {
    if (!dossier) return;
    try {
      setActionLoading(true);
      await api.put(`/api/sos/${activeSosId}/acknowledge`, { confirmedSafe: true });
      await fetchDossier();
    } catch (err: any) {
      alert(err?.message || 'Failed to acknowledge incident');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!dossier) return;
    try {
      setActionLoading(true);
      await api.put(`/api/sos/${activeSosId}/resolve`, {});
      await fetchDossier();
    } catch (err: any) {
      alert(err?.message || 'Failed to resolve incident');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInput.trim()) return;
    try {
      setActionLoading(true);
      await api.post(`/api/sos/${activeSosId}/notes`, { text: noteInput.trim() });
      setNoteInput('');
      await fetchDossier();
    } catch (err: any) {
      alert(err?.message || 'Failed to add mission note');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateBrief = async () => {
    try {
      setBriefLoading(true);
      const res = await api.post<any>(`/api/sos/${activeSosId}/brief`, {});
      const resolved = (res?.brief && (res.brief.agentAdvisory || res.brief.municipalActions))
        ? res.brief
        : res;
      if (resolved && (resolved.agentAdvisory || resolved.municipalActions || resolved.trafficDiversion)) {
        setBrief(resolved);
      } else {
        alert('Could not synthesize situational brief. Please try again.');
      }
    } catch (err: any) {
      console.error('[AdminSosDossier] Brief error:', err);
      alert(err?.message || 'Failed to generate situation brief');
    } finally {
      setBriefLoading(false);
    }
  };

  // Filtered History
  const filteredTimeline = useMemo(() => {
    if (!dossier?.history?.timeline) return [];
    if (historyFilter === 'EMERGENCY') {
      return dossier.history.timeline.filter((item) => item.isEmergencySos);
    }
    if (historyFilter === 'COMPLAINTS') {
      return dossier.history.timeline.filter((item) => !item.isEmergencySos);
    }
    return dossier.history.timeline;
  }, [dossier, historyFilter]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-canvas text-primaryText transition-colors duration-200">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-brandTeal/20 border-t-brandTeal animate-spin" />
          <Shield className="w-6 h-6 text-brandTeal absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="mt-5 font-mono text-xs sm:text-sm tracking-widest text-brandTeal uppercase font-bold">
          INITIALIZING INCIDENT DOSSIER STREAM...
        </p>
        <p className="text-xs text-mutedGray mt-1">Aggregating family network, sensor telemetry & audit logs</p>
      </div>
    );
  }

  if (error || !dossier) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-canvas text-primaryText transition-colors duration-200">
        <div className="max-w-md w-full bg-surfaceCard border border-hairline rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-panel-dark">
          <div className="w-12 h-12 rounded-2xl bg-alertRed/10 border border-alertRed/20 flex items-center justify-center mx-auto">
            <AlertOctagon className="w-6 h-6 text-alertRed" />
          </div>
          <h2 className="text-lg font-bold text-primaryText">Incident Dossier Unavailable</h2>
          <p className="text-xs text-mutedGray leading-relaxed">{error || 'Could not find or decode the requested incident beacon.'}</p>
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2.5 rounded-xl bg-surfaceElevated border border-hairline hover:border-brandTeal text-xs font-semibold text-primaryText hover:text-brandTeal transition flex items-center gap-2 mx-auto shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Mission Grid
          </button>
        </div>
      </div>
    );
  }

  const { incident, user, familyNetwork, history } = dossier;
  const isEmergency = incident.isEmergencySos;

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto bg-canvas text-primaryText transition-colors duration-200">
      {/* ================= Sticky Top Command Bar ================= */}
      <header className="sticky top-0 z-30 bg-surface/85 backdrop-blur-md border-b border-hairline px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs transition-colors">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/admin')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surfaceCard border border-hairline hover:border-brandTeal/60 text-xs font-medium text-secondaryText hover:text-primaryText transition shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Crisis Grid</span>
          </button>

          <div className="h-5 w-px bg-hairline" />

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-xs sm:text-sm text-primaryText tracking-wide">
                #INCIDENT-{incident.id.slice(-6).toUpperCase()}
              </span>

              {/* Status Badge */}
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5 border font-mono ${
                  incident.status === 'ACTIVE'
                    ? 'bg-alertRed/10 text-alertRed border-alertRed/30'
                    : incident.status === 'ACKNOWLEDGED'
                    ? 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/30'
                    : 'bg-brandTeal/10 text-brandTeal border-brandTeal/30'
                }`}
              >
                {incident.status === 'ACTIVE' && <span className="w-1.5 h-1.5 rounded-full bg-alertRed animate-ping" />}
                {incident.status}
              </span>

              {/* Classification Badge */}
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5 border font-mono ${
                  isEmergency
                    ? 'bg-alertRed/10 text-alertRed border-alertRed/30'
                    : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30'
                }`}
              >
                {isEmergency ? (
                  <>
                    <ShieldAlert className="w-3 h-3 text-alertRed" />
                    EMERGENCY SOS
                  </>
                ) : (
                  <>
                    <Droplets className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                    CIVIC COMPLAINT
                  </>
                )}
              </span>
            </div>
            <p className="text-[11px] text-mutedGray font-mono mt-0.5">
              Logged {new Date(incident.createdAt).toLocaleString()} • {incident.transport} Transport
            </p>
          </div>
        </div>

        {/* Command Buttons */}
        <div className="flex items-center gap-2 ml-auto">
          {incident.status === 'ACTIVE' && (
            <button
              onClick={handleAcknowledge}
              disabled={actionLoading}
              className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 shadow-xs"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Acknowledge</span>
            </button>
          )}

          {incident.status !== 'RESOLVED' && (
            <button
              onClick={handleResolve}
              disabled={actionLoading}
              className="px-3.5 py-2 rounded-xl bg-brandTeal hover:bg-brandTealGlow text-[#070B14] text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm shadow-brandTeal/20"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
              <span>Mark Resolved</span>
            </button>
          )}

          <button
            onClick={fetchDossier}
            className="p-2 rounded-xl bg-surfaceCard border border-hairline hover:border-brandTeal/50 text-mutedGray hover:text-primaryText transition shadow-xs"
            title="Refresh Incident Dossier"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ================= Main Scrollable Workspace Container ================= */}
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1">
        
        {/* ================= SECTION 1: 4 Top KPI Dossier Cards ================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          
          {/* Card 1: Civilian Profile */}
          <div className="bg-surfaceCard border border-hairline hover:border-hairlineBright rounded-2xl p-5 shadow-xs transition-all duration-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-mono uppercase text-mutedGray tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-brandTeal" /> Civilian Profile
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-surfaceElevated border border-hairline text-secondaryText font-mono font-medium">
                  {user?.role || 'CITIZEN'}
                </span>
              </div>

              <h3 className="font-bold text-primaryText text-base sm:text-lg truncate">
                {user?.displayName || 'Unknown Reporter'}
              </h3>
              <p className="text-xs text-mutedGray truncate mt-0.5">{user?.email}</p>
            </div>

            <div className="mt-4 pt-3 border-t border-hairline space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-mutedGray font-mono">Phone:</span>
                {user?.phoneNumber ? (
                  <a
                    href={`tel:${user.phoneNumber}`}
                    className="text-brandTeal hover:underline font-mono font-semibold flex items-center gap-1"
                  >
                    <Phone className="w-3 h-3" /> {user.phoneNumber}
                  </a>
                ) : (
                  <span className="text-dimGray font-mono text-[11px]">Unregistered</span>
                )}
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-mutedGray font-mono">History Ratio:</span>
                <span className="font-mono text-secondaryText">
                  <strong className="text-alertRed font-bold">{history.stats.emergencySosCount} SOS</strong> /{' '}
                  <strong className="text-cyan-600 dark:text-cyan-400 font-bold">{history.stats.civicComplaintCount} Complaints</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Incident Classification & Intent */}
          <div className={`bg-surfaceCard border rounded-2xl p-5 shadow-xs transition-all duration-200 flex flex-col justify-between ${
            isEmergency ? 'border-alertRed/30' : 'border-cyan-500/30'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-mono uppercase text-mutedGray tracking-wider flex items-center gap-1.5">
                  {isEmergency ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-alertRed" />
                  ) : (
                    <Droplets className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  )}
                  Incident Intent
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold uppercase ${
                    isEmergency
                      ? 'bg-alertRed/15 text-alertRed'
                      : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
                  }`}
                >
                  {incident.category}
                </span>
              </div>

              <h3 className="font-bold text-primaryText text-base sm:text-lg leading-snug">
                {incident.intentLabel}
              </h3>
              <p className="text-xs text-secondaryText mt-1 line-clamp-2 leading-relaxed">
                {isEmergency
                  ? 'High-priority distress alert. Imminent human safety triage.'
                  : 'Municipal drainage / flood hazard report logged for maintenance.'}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-hairline space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-mutedGray font-mono">Water Depth:</span>
                <span className="font-mono font-bold text-primaryText flex items-center gap-1">
                  <Droplets className="w-3 h-3 text-cyan-500" />
                  {incident.waterDepthCm} cm
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-mutedGray font-mono">Passability:</span>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-surfaceElevated border border-hairline text-secondaryText">
                  {incident.passability.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Hardware & Sensor Telemetry */}
          <div className="bg-surfaceCard border border-hairline hover:border-hairlineBright rounded-2xl p-5 shadow-xs transition-all duration-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-mono uppercase text-mutedGray tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-brandTeal" /> Sensor Telemetry
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-surfaceElevated border border-hairline text-brandTeal font-mono font-bold">
                  {incident.transport}
                </span>
              </div>

              <div className="flex items-center gap-3 mt-1.5">
                <div className="flex items-center gap-1.5">
                  <Battery className={`w-5 h-5 ${
                    (incident.batteryPercentage ?? 100) < 20 ? 'text-alertRed animate-pulse' : 'text-brandTeal'
                  }`} />
                  <span className="text-lg font-bold font-mono text-primaryText">
                    {incident.batteryPercentage !== null && incident.batteryPercentage !== undefined
                      ? `${incident.batteryPercentage}%`
                      : 'N/A'}
                  </span>
                </div>
                <div className="h-4 w-px bg-hairline" />
                <div className="flex items-center gap-1.5 text-xs text-secondaryText font-mono">
                  <Radio className="w-3.5 h-3.5 text-brandTeal" />
                  {incident.relayedByMule ? 'Mule Relayed' : 'Direct Signal'}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-hairline space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-mutedGray font-mono">Packet ID:</span>
                <span className="font-mono text-secondaryText text-[11px] truncate max-w-[130px]">
                  {incident.packetId || 'STD-IP-BROADCAST'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-mutedGray font-mono">Relay Status:</span>
                <span className="font-mono text-[11px] text-brandTeal font-medium">
                  {incident.relayedByMule ? 'Offline Mesh Synced' : 'Cloud Direct'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Location Coordinates */}
          <div className="bg-surfaceCard border border-hairline hover:border-hairlineBright rounded-2xl p-5 shadow-xs transition-all duration-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-mono uppercase text-mutedGray tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-amber-500" /> Beacon Pin
                </span>
                {incident.location && (
                  <a
                    href={`https://www.google.com/maps?q=${incident.location.lat},${incident.location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-brandTeal hover:underline flex items-center gap-0.5 font-mono font-medium"
                  >
                    Maps <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>

              <p className="font-mono text-primaryText text-sm sm:text-base font-semibold truncate">
                {incident.location ? `${incident.location.lat.toFixed(5)}, ${incident.location.lng.toFixed(5)}` : 'Location Unknown'}
              </p>
              <p className="text-xs text-mutedGray mt-0.5 font-mono">
                Accuracy: {incident.accuracyMeters ? `±${incident.accuracyMeters}m` : 'Cell Triangulated'}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-hairline space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-mutedGray font-mono">Assigned Officer:</span>
                <span className="font-mono text-secondaryText truncate max-w-[120px]">
                  {incident.assignedAdmin?.displayName || 'Unassigned'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-mutedGray font-mono">Tactical Squad:</span>
                <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded ${
                  incident.assignedSquad
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                    : 'bg-surfaceElevated text-mutedGray'
                }`}>
                  {incident.assignedSquad ? incident.assignedSquad.replace('TEAM_', '').replace(/_/g, ' ') : 'Standby / Unassigned'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-mutedGray font-mono">Family Circle:</span>
                <span className="font-mono text-brandTeal font-bold">
                  {familyNetwork.totalLinked} Members Linked
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ================= Distress Message Callout ================= */}
        {incident.message && (
          <div className="bg-surfaceCard border border-brandTeal/30 rounded-2xl p-4.5 shadow-xs flex items-start gap-3.5 transition-colors">
            <div className="w-9 h-9 rounded-xl bg-brandTeal/15 text-brandTeal flex items-center justify-center flex-shrink-0 mt-0.5">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-mono uppercase text-brandTeal tracking-wider font-bold">Civilian Distress Message:</span>
              <p className="text-sm text-primaryText font-medium mt-0.5 leading-relaxed">
                "{incident.message}"
              </p>
            </div>
          </div>
        )}

        {/* ================= SECTION 2: Modern Segmented Tab Bar ================= */}
        <div className="bg-surface border border-hairline rounded-2xl p-1.5 flex flex-wrap gap-1.5 shadow-xs transition-colors">
          <button
            onClick={() => setActiveTab('TELEMETRY')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'TELEMETRY'
                ? 'bg-brandTeal text-[#070B14] shadow-sm font-bold shadow-brandTeal/20'
                : 'text-mutedGray hover:text-primaryText hover:bg-surfaceCard'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Live Telemetry & Notes ({incident.notes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('AGENT_ZERO')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'AGENT_ZERO'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-md font-bold shadow-cyan-500/30'
                : 'text-cyan-300 hover:text-white hover:bg-cyan-950/40 border border-cyan-500/30'
            }`}
          >
            <Zap className="w-4 h-4 text-cyan-400" />
            <span>Agent Zero Orchestrator</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 font-bold">
              MULTI-AGENT
            </span>
          </button>

          <button
            onClick={() => setActiveTab('FAMILY')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'FAMILY'
                ? 'bg-brandTeal text-[#070B14] shadow-sm font-bold shadow-brandTeal/20'
                : 'text-mutedGray hover:text-primaryText hover:bg-surfaceCard'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Family Network & Dependents ({familyNetwork.totalLinked})</span>
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'HISTORY'
                ? 'bg-brandTeal text-[#070B14] shadow-sm font-bold shadow-brandTeal/20'
                : 'text-mutedGray hover:text-primaryText hover:bg-surfaceCard'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Historical Dispatches ({history.stats.totalEvents})</span>
          </button>

          <button
            onClick={() => setActiveTab('AI_BRIEF')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'AI_BRIEF'
                ? 'bg-brandTeal text-[#070B14] shadow-sm font-bold shadow-brandTeal/20'
                : 'text-mutedGray hover:text-primaryText hover:bg-surfaceCard'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Autonomous Situation Brief</span>
          </button>
        </div>

        {/* ================= SECTION 3: Tab Content Panels ================= */}

        {/* ─── TAB 0: Agent Zero Autonomous Multi-Agent Orchestrator ─── */}
        {activeTab === 'AGENT_ZERO' && (
          <div className="space-y-6">
            <AgentZeroOrchestratorWidget
              incidentId={incident.id}
              incidentType={incident.category || (incident.isEmergencySos ? 'SUBSTATION_WATER_INGRESS' : 'CIVIC_HAZARD')}
              severity={incident.isEmergencySos ? 'CRITICAL' : 'HIGH'}
              coordinates={incident.location ? [incident.location.lat, incident.location.lng] : null}
              waterDepthCm={incident.waterDepthCm ?? 30}
              message={incident.message || `Incident ${incident.id} reported`}
              onApplyAdvisoryToNotes={(advisoryText) => {
                setNoteInput((prev) => (prev ? `${prev}\n\n${advisoryText}` : advisoryText));
                setActiveTab('TELEMETRY');
              }}
            />
          </div>
        )}

        {/* ─── TAB 1: Live Telemetry & Mission Notes ─── */}
        {activeTab === 'TELEMETRY' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Mission Log & Notes */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-surfaceCard border border-hairline rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-hairline">
                  <h3 className="font-bold text-primaryText text-sm sm:text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-brandTeal" /> Responders Mission Log
                  </h3>
                  <span className="text-xs text-mutedGray font-mono">{incident.notes.length} total entries</span>
                </div>

                {/* Notes Stream */}
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {incident.notes.length === 0 ? (
                    <div className="text-center py-10 text-mutedGray text-xs bg-surfaceElevated rounded-xl border border-dashed border-hairline">
                      No field notes recorded yet. Post initial assessment below.
                    </div>
                  ) : (
                    incident.notes.map((note, idx) => (
                      <div key={idx} className="bg-surfaceElevated border border-hairline rounded-xl p-3.5 text-xs space-y-1.5 shadow-xs">
                        <div className="flex items-center justify-between text-mutedGray font-mono text-[11px]">
                          <span className="font-semibold text-secondaryText">
                            Officer Ref: {note.authorId?.slice(-6) || 'HQ Dispatch'}
                          </span>
                          <span>{new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-primaryText font-medium leading-relaxed">{note.text}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="pt-3 border-t border-hairline flex gap-2 sm:gap-3">
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Type dispatch update or field assessment..."
                    className="flex-1 bg-surface border border-hairline focus:border-brandTeal focus:ring-1 focus:ring-brandTeal rounded-xl px-4 py-2.5 text-xs sm:text-sm text-primaryText placeholder:text-mutedGray outline-none transition shadow-xs"
                  />
                  <button
                    type="submit"
                    disabled={actionLoading || !noteInput.trim()}
                    className="px-4.5 py-2.5 bg-brandTeal text-[#070B14] rounded-xl text-xs sm:text-sm font-bold hover:bg-brandTealGlow transition flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" /> Post
                  </button>
                </form>
              </div>

              {/* Acknowledged Responders List */}
              <div className="bg-surfaceCard border border-hairline rounded-2xl p-5 sm:p-6 shadow-xs space-y-3">
                <h4 className="font-bold text-xs uppercase font-mono text-mutedGray tracking-wider">
                  Safety Acknowledgments ({incident.acknowledgedByUsers.length})
                </h4>
                {incident.acknowledgedByUsers.length === 0 ? (
                  <p className="text-xs text-mutedGray bg-surfaceElevated rounded-xl p-4 border border-dashed border-hairline text-center">
                    No relative or field responder has acknowledged safety yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {incident.acknowledgedByUsers.map((ack, idx) => (
                      <div key={idx} className="bg-surfaceElevated border border-hairline rounded-xl p-3 flex items-center justify-between text-xs shadow-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-brandTeal" />
                          <span className="font-semibold text-primaryText">{ack.displayName || 'Family Responder'}</span>
                        </div>
                        <span className="text-[10px] text-mutedGray font-mono">
                          {new Date(ack.acknowledgedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Col: Environmental Diagnostics */}
            <div className="space-y-6">
              <div className="bg-surfaceCard border border-hairline rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
                <h3 className="font-bold text-primaryText text-sm sm:text-base flex items-center gap-2 pb-3 border-b border-hairline">
                  <Compass className="w-4 h-4 text-brandTeal" /> Environmental Triangulation
                </h3>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between items-center py-2.5 border-b border-hairline">
                    <span className="text-mutedGray">Flood Height:</span>
                    <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">{incident.waterDepthCm} cm recorded</span>
                  </div>

                  <div className="flex justify-between items-center py-2.5 border-b border-hairline">
                    <span className="text-mutedGray">Vehicle Clearance:</span>
                    <span className="font-mono text-primaryText font-medium">{incident.passability.replace(/_/g, ' ')}</span>
                  </div>

                  <div className="flex justify-between items-center py-2.5 border-b border-hairline">
                    <span className="text-mutedGray">Network Carrier:</span>
                    <span className="font-mono text-primaryText font-medium">{incident.transport}</span>
                  </div>

                  <div className="flex justify-between items-center py-2.5 border-b border-hairline">
                    <span className="text-mutedGray">Battery Gauge:</span>
                    <span className="font-mono text-primaryText font-bold">{incident.batteryPercentage ?? 'Unknown'}%</span>
                  </div>

                  <div className="flex justify-between items-center py-2.5 border-b border-hairline">
                    <span className="text-mutedGray">Mule Peer Relay:</span>
                    <span className="font-mono text-brandTeal font-bold">{incident.relayedByMule ? 'YES' : 'NO'}</span>
                  </div>
                </div>

                {/* Quick Map Directions Action */}
                {incident.location && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${incident.location.lat},${incident.location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 rounded-xl bg-surfaceElevated border border-hairline hover:border-brandTeal text-xs font-bold text-primaryText hover:text-brandTeal flex items-center justify-center gap-2 transition shadow-xs"
                  >
                    <Compass className="w-4 h-4 text-brandTeal" /> Navigate Rescue Team
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 2: Family Network & Dependents ─── */}
        {activeTab === 'FAMILY' && (
          <div className="space-y-6">
            {/* Header info card */}
            <div className="bg-surfaceCard border border-hairline rounded-2xl p-5 sm:p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-primaryText text-base sm:text-lg flex items-center gap-2">
                  <HeartHandshake className="w-5 h-5 text-rose-500" /> Family Circle & Linked Dependents
                </h3>
                <p className="text-xs text-secondaryText mt-1">
                  Bi-directional family linkages registered under ZeroGrid Emergency Safety Mesh.
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="px-3 py-1.5 rounded-xl bg-surfaceElevated border border-hairline text-xs font-mono text-secondaryText font-medium">
                  {familyNetwork.parents.length} Parents
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-surfaceElevated border border-hairline text-xs font-mono text-brandTeal font-bold">
                  {familyNetwork.dependents.length} Dependents
                </span>
              </div>
            </div>

            {/* Dependents / Children */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase font-mono text-brandTeal tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4" /> Linked Children & Dependents ({familyNetwork.dependents.length})
              </h4>

              {familyNetwork.dependents.length === 0 ? (
                <div className="bg-surfaceCard border border-dashed border-hairline rounded-2xl p-8 text-center text-xs text-mutedGray">
                  No dependent accounts registered for this civilian.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {familyNetwork.dependents.map((dep) => (
                    <div
                      key={dep.linkId}
                      className="bg-surfaceCard border border-hairline hover:border-brandTeal/40 rounded-2xl p-5 shadow-xs transition-all duration-200 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-brandTeal/15 text-brandTeal flex items-center justify-center font-bold text-sm">
                            {dep.user.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-primaryText text-sm truncate">{dep.user.displayName}</p>
                            <span className="text-[10px] text-mutedGray font-mono">{dep.user.role}</span>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold ${
                            dep.status === 'ACCEPTED'
                              ? 'bg-brandTeal/15 text-brandTeal border border-brandTeal/30'
                              : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                          }`}
                        >
                          {dep.status}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs pt-3 border-t border-hairline">
                        <div className="flex items-center justify-between text-mutedGray">
                          <span>Email:</span>
                          <span className="text-secondaryText font-mono text-[11px] truncate max-w-[170px]">{dep.user.email}</span>
                        </div>
                        {dep.user.phoneNumber && (
                          <div className="flex items-center justify-between text-mutedGray">
                            <span>Phone:</span>
                            <a href={`tel:${dep.user.phoneNumber}`} className="text-brandTeal hover:underline font-mono font-semibold">
                              {dep.user.phoneNumber}
                            </a>
                          </div>
                        )}
                        {dep.user.lastKnownLocation && (
                          <div className="flex items-center justify-between text-mutedGray">
                            <span>Last Ping:</span>
                            <span className="text-secondaryText font-mono text-[10px]">
                              {dep.user.lastLocationAt ? new Date(dep.user.lastLocationAt).toLocaleTimeString() : 'Recent'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Parents / Guardians */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase font-mono text-mutedGray tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-mutedGray" /> Linked Parents & Guardians ({familyNetwork.parents.length})
              </h4>

              {familyNetwork.parents.length === 0 ? (
                <div className="bg-surfaceCard border border-dashed border-hairline rounded-2xl p-8 text-center text-xs text-mutedGray">
                  No parent links registered for this account.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {familyNetwork.parents.map((par) => (
                    <div
                      key={par.linkId}
                      className="bg-surfaceCard border border-hairline hover:border-brandTeal/40 rounded-2xl p-5 shadow-xs transition-all duration-200 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-surfaceElevated border border-hairline text-secondaryText flex items-center justify-center font-bold text-sm">
                            {par.user.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-primaryText text-sm truncate">{par.user.displayName}</p>
                            <span className="text-[10px] text-mutedGray font-mono">Guardian</span>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold ${
                            par.status === 'ACCEPTED'
                              ? 'bg-brandTeal/15 text-brandTeal border border-brandTeal/30'
                              : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                          }`}
                        >
                          {par.status}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs pt-3 border-t border-hairline">
                        <div className="flex items-center justify-between text-mutedGray">
                          <span>Email:</span>
                          <span className="text-secondaryText font-mono text-[11px] truncate max-w-[170px]">{par.user.email}</span>
                        </div>
                        {par.user.phoneNumber && (
                          <div className="flex items-center justify-between text-mutedGray">
                            <span>Phone:</span>
                            <a href={`tel:${par.user.phoneNumber}`} className="text-brandTeal hover:underline font-mono font-semibold">
                              {par.user.phoneNumber}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Emergency Contacts */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase font-mono text-amber-500 tracking-wider flex items-center gap-1.5">
                <Phone className="w-4 h-4" /> Emergency Phone Contacts ({familyNetwork.emergencyContacts.length})
              </h4>

              {familyNetwork.emergencyContacts.length === 0 ? (
                <div className="bg-surfaceCard border border-dashed border-hairline rounded-2xl p-8 text-center text-xs text-mutedGray">
                  No emergency contacts configured by civilian.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {familyNetwork.emergencyContacts.map((contact) => (
                    <div key={contact.id} className="bg-surfaceCard border border-hairline rounded-2xl p-4 flex items-center justify-between shadow-xs">
                      <div>
                        <p className="font-bold text-primaryText text-sm">{contact.name}</p>
                        <span className="text-[10px] text-mutedGray font-mono">{contact.relationship}</span>
                      </div>
                      <a
                        href={`tel:${contact.phoneNumber}`}
                        className="p-2.5 rounded-xl bg-surfaceElevated border border-hairline hover:border-brandTeal text-brandTeal transition shadow-xs"
                        title="Call Contact"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB 3: Historical Timeline (SOS vs Civic Complaints) ─── */}
        {activeTab === 'HISTORY' && (
          <div className="space-y-6">
            {/* Filter Pills & Summary */}
            <div className="bg-surfaceCard border border-hairline rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setHistoryFilter('ALL')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                    historyFilter === 'ALL'
                      ? 'bg-brandTeal text-[#070B14] font-bold shadow-xs'
                      : 'bg-surfaceElevated border border-hairline text-secondaryText hover:text-primaryText'
                  }`}
                >
                  All Reports ({history.stats.totalEvents})
                </button>

                <button
                  onClick={() => setHistoryFilter('EMERGENCY')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                    historyFilter === 'EMERGENCY'
                      ? 'bg-alertRed text-white font-bold shadow-xs'
                      : 'bg-surfaceElevated border border-hairline text-secondaryText hover:text-primaryText'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Critical SOS ({history.stats.emergencySosCount})
                </button>

                <button
                  onClick={() => setHistoryFilter('COMPLAINTS')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                    historyFilter === 'COMPLAINTS'
                      ? 'bg-cyan-600 text-white font-bold shadow-xs'
                      : 'bg-surfaceElevated border border-hairline text-secondaryText hover:text-primaryText'
                  }`}
                >
                  <Droplets className="w-3.5 h-3.5" />
                  Civic Complaints ({history.stats.civicComplaintCount})
                </button>
              </div>

              <div className="text-xs font-mono text-mutedGray">
                Resolved Rate:{' '}
                <strong className="text-brandTeal font-bold">
                  {history.stats.totalEvents > 0
                    ? `${Math.round((history.stats.resolvedCount / history.stats.totalEvents) * 100)}%`
                    : '100%'}
                </strong>
              </div>
            </div>

            {/* Timeline Cards */}
            <div className="space-y-3">
              {filteredTimeline.length === 0 ? (
                <div className="bg-surfaceCard border border-dashed border-hairline rounded-2xl p-10 text-center text-xs text-mutedGray">
                  No past dispatches found matching this filter.
                </div>
              ) : (
                filteredTimeline.map((item) => (
                  <div
                    key={item.id}
                    className={`bg-surfaceCard border rounded-2xl p-5 transition shadow-xs space-y-3 ${
                      item.isCurrentIncident
                        ? 'border-brandTeal ring-1 ring-brandTeal/30'
                        : item.isEmergencySos
                        ? 'border-alertRed/30 hover:border-alertRed/60'
                        : 'border-hairline hover:border-cyan-500/40'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {/* Intent Icon */}
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                            item.isEmergencySos
                              ? 'bg-alertRed/15 text-alertRed'
                              : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
                          }`}
                        >
                          {item.isEmergencySos ? (
                            <ShieldAlert className="w-4 h-4" />
                          ) : (
                            <Droplets className="w-4 h-4" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-primaryText text-xs sm:text-sm">{item.category}</span>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded-md font-mono font-bold uppercase ${
                                item.isEmergencySos
                                  ? 'bg-alertRed/15 text-alertRed'
                                  : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
                              }`}
                            >
                              {item.isEmergencySos ? 'Emergency SOS' : 'Civic Hazard'}
                            </span>
                            {item.isCurrentIncident && (
                              <span className="text-[9px] px-2 py-0.5 rounded-md bg-brandTeal/15 text-brandTeal font-mono font-bold">
                                CURRENT INCIDENT
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-mutedGray font-mono flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            {new Date(item.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Status */}
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold uppercase ${
                          item.status === 'RESOLVED'
                            ? 'bg-brandTeal/10 text-brandTeal border border-brandTeal/30'
                            : item.status === 'ACKNOWLEDGED'
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                            : 'bg-alertRed/10 text-alertRed border border-alertRed/30'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    {item.message && (
                      <p className="text-xs sm:text-sm text-secondaryText font-medium pl-11 leading-relaxed">
                        "{item.message}"
                      </p>
                    )}

                    <div className="pt-3 pl-11 border-t border-hairline flex flex-wrap items-center gap-4 text-[11px] font-mono text-mutedGray">
                      <span>Water Depth: <strong className="text-primaryText">{item.waterDepthCm} cm</strong></span>
                      <span>Passability: <strong className="text-primaryText">{item.passability.replace(/_/g, ' ')}</strong></span>
                      <span>Transport: <strong className="text-primaryText">{item.transport}</strong></span>
                      {item.batteryPercentage !== null && item.batteryPercentage !== undefined && (
                        <span>Battery: <strong className="text-primaryText">{item.batteryPercentage}%</strong></span>
                      )}
                      <span>Notes: <strong className="text-primaryText">{item.notesCount}</strong></span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ─── TAB 4: Autonomous Situation Brief ─── */}
        {activeTab === 'AI_BRIEF' && (
          <div className="bg-surfaceCard border border-hairline rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-hairline">
              <div>
                <h3 className="font-bold text-primaryText text-base sm:text-lg flex items-center gap-2">
                  <Bot className="w-5 h-5 text-brandTeal" /> Autonomous Situation Brief
                </h3>
                <p className="text-xs text-secondaryText mt-0.5">
                  Powered by ZeroGrid Multi-Tier AI (Bedrock &rarr; Groq Llama-3 &rarr; Deterministic Hydrodynamics).
                </p>
              </div>

              <button
                onClick={handleGenerateBrief}
                disabled={briefLoading}
                className="px-4.5 py-2.5 bg-brandTeal text-[#070B14] rounded-xl text-xs sm:text-sm font-bold hover:bg-brandTealGlow transition flex items-center gap-2 disabled:opacity-50 shadow-xs"
              >
                {briefLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>Generate Incident Brief</span>
              </button>
            </div>

            {brief ? (
              <div className="space-y-4">
                {brief.engine && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono px-3 py-1.5 rounded-xl bg-surfaceElevated border border-brandTeal/30 text-brandTeal font-bold flex items-center gap-1.5 shadow-xs">
                      <Zap className="w-3.5 h-3.5 text-brandTeal" />
                      {brief.engine}
                    </span>
                  </div>
                )}

                {brief.agentAdvisory && (
                  <div className="bg-surfaceElevated border border-brandTeal/30 rounded-2xl p-4.5 shadow-xs">
                    <span className="text-[10px] font-mono uppercase text-brandTeal tracking-wider font-bold flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" /> Agent Strategic Advisory
                    </span>
                    <p className="text-xs sm:text-sm text-primaryText mt-1.5 leading-relaxed">{brief.agentAdvisory}</p>
                  </div>
                )}

                {brief.trafficDiversion && (
                  <div className="bg-surfaceElevated border border-amber-500/30 rounded-2xl p-4.5 shadow-xs">
                    <span className="text-[10px] font-mono uppercase text-amber-500 tracking-wider font-bold flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5" /> Traffic Diversion Route
                    </span>
                    <p className="text-xs sm:text-sm text-primaryText mt-1.5 leading-relaxed">{brief.trafficDiversion}</p>
                  </div>
                )}

                {brief.municipalActions && brief.municipalActions.length > 0 && (
                  <div className="bg-surfaceElevated border border-cyan-500/30 rounded-2xl p-4.5 shadow-xs">
                    <span className="text-[10px] font-mono uppercase text-cyan-600 dark:text-cyan-400 tracking-wider font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Recommended Municipal Actions
                    </span>
                    <ul className="mt-2.5 space-y-2 text-xs sm:text-sm text-secondaryText">
                      {brief.municipalActions.map((action, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-2 flex-shrink-0" />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-mutedGray text-xs bg-surfaceElevated rounded-2xl border border-dashed border-hairline">
                Click "Generate Incident Brief" to activate real-time LLM incident analysis & strategic dispatch routing.
              </div>
            )}
          </div>
        )}
      </main>

      {/* Tactical Voice Dispatch Assistant */}
      <FloatingVoiceButton
        onInjectNote={(note) => setNoteInput((prev) => (prev ? `${prev} ${note}` : note))}
      />
    </div>
  );
}
