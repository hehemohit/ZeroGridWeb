'use client';

import React, { useEffect, useState, use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
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
  Calendar
} from 'lucide-react';

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

interface SituationBriefResponse {
  brief?: {
    municipalActions?: string[];
    trafficDiversion?: string;
    agentAdvisory?: string;
    generatedAt?: string;
    model?: string;
  };
}

export default function AdminSosDossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user: currentUser } = useAuth();

  const [dossier, setDossier] = useState<DossierResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active tab state
  const [activeTab, setActiveTab] = useState<'TELEMETRY' | 'FAMILY' | 'HISTORY' | 'AI_BRIEF'>('TELEMETRY');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'EMERGENCY' | 'COMPLAINTS'>('ALL');

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [brief, setBrief] = useState<SituationBriefResponse['brief'] | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  // Load Dossier
  const fetchDossier = async () => {
    try {
      setLoading(true);
      setError(null);
      let targetId = id;

      // If id is a short displayId (e.g. "sos-d613" or not 24 hex chars)
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
      const res = await api.post<SituationBriefResponse>(`/api/sos/${activeSosId}/brief`, {});
      if (res?.brief) {
        setBrief(res.brief);
      }
    } catch (err: any) {
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
      <div className="min-h-screen bg-[#070B14] flex flex-col items-center justify-center p-6 text-slate-300">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-brandTeal/20 border-t-brandTeal animate-spin" />
          <Shield className="w-6 h-6 text-brandTeal absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="mt-4 font-mono text-sm tracking-wide text-brandTeal">INITIALIZING INCIDENT DOSSIER STREAM...</p>
        <p className="text-xs text-mutedGray mt-1">Aggregating family link graph, telemetry & audit logs</p>
      </div>
    );
  }

  if (error || !dossier) {
    return (
      <div className="min-h-screen bg-[#070B14] flex flex-col items-center justify-center p-6 text-slate-300">
        <div className="max-w-md w-full bg-cardDark/80 border border-crimsonRed/40 rounded-2xl p-6 text-center space-y-4">
          <AlertOctagon className="w-12 h-12 text-crimsonRed mx-auto" />
          <h2 className="text-lg font-bold text-white">Incident Dossier Unavailable</h2>
          <p className="text-xs text-mutedGray">{error || 'Could not find the requested incident beacon.'}</p>
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 rounded-xl bg-surfaceDark border border-borderDark/60 hover:border-brandTeal text-xs font-semibold text-white transition flex items-center gap-2 mx-auto"
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
    <div className="min-h-screen bg-[#070B14] text-slate-200">
      {/* Top Mission Control Command Bar */}
      <header className="sticky top-0 z-40 bg-[#0A0F1D]/90 backdrop-blur-md border-b border-borderDark/40 px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/admin')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surfaceDark/60 border border-borderDark/60 hover:border-brandTeal/60 text-xs text-slate-300 hover:text-white transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Crisis Grid</span>
          </button>

          <div className="h-5 w-px bg-borderDark/60" />

          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm text-white tracking-wide">
                #INCIDENT-{incident.id.slice(-6).toUpperCase()}
              </span>

              {/* Status Badge */}
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 border ${
                  incident.status === 'ACTIVE'
                    ? 'bg-crimsonRed/15 text-crimsonRed border-crimsonRed/30 animate-pulse'
                    : incident.status === 'ACKNOWLEDGED'
                    ? 'bg-alertAmber/15 text-alertAmber border-alertAmber/30'
                    : 'bg-brandTeal/15 text-brandTeal border-brandTeal/30'
                }`}
              >
                {incident.status === 'ACTIVE' && <span className="w-1.5 h-1.5 rounded-full bg-crimsonRed animate-ping" />}
                {incident.status}
              </span>

              {/* Classification Badge */}
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 border ${
                  isEmergency
                    ? 'bg-crimsonRed/20 text-rose-400 border-crimsonRed/40'
                    : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                }`}
              >
                {isEmergency ? (
                  <>
                    <ShieldAlert className="w-3 h-3 text-crimsonRed" />
                    EMERGENCY SOS
                  </>
                ) : (
                  <>
                    <Droplets className="w-3 h-3 text-cyan-400" />
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
              className="px-3.5 py-1.5 rounded-lg bg-alertAmber/20 hover:bg-alertAmber/30 border border-alertAmber/40 text-alertAmber text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Acknowledge Beacon
            </button>
          )}

          {incident.status !== 'RESOLVED' && (
            <button
              onClick={handleResolve}
              disabled={actionLoading}
              className="px-3.5 py-1.5 rounded-lg bg-brandTeal hover:bg-brandTeal/90 text-[#070B14] text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm shadow-brandTeal/20"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
              Mark Resolved
            </button>
          )}

          <button
            onClick={fetchDossier}
            className="p-1.5 rounded-lg bg-surfaceDark/60 border border-borderDark/60 hover:border-brandTeal/60 text-slate-400 hover:text-white transition"
            title="Refresh Dossier"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* ================= SECTION 1: 4 Top KPI Dossier Cards ================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: User Identity & Trust */}
          <div className="bg-[#0C1324]/80 border border-borderDark/60 rounded-xl p-4 shadow-sm backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-brandTeal/5 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase text-mutedGray tracking-wider flex items-center gap-1">
                <User className="w-3 h-3 text-brandTeal" /> Civilian Profile
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surfaceDark border border-borderDark text-slate-300 font-mono">
                {user?.role || 'CITIZEN'}
              </span>
            </div>

            <h3 className="font-bold text-white text-base truncate">{user?.displayName || 'Unknown Reporter'}</h3>
            <p className="text-xs text-mutedGray truncate mt-0.5">{user?.email}</p>

            <div className="mt-3 pt-3 border-t border-borderDark/40 flex items-center justify-between text-xs">
              <span className="text-mutedGray font-mono">Phone:</span>
              {user?.phoneNumber ? (
                <a
                  href={`tel:${user.phoneNumber}`}
                  className="text-brandTeal hover:underline font-mono flex items-center gap-1"
                >
                  <Phone className="w-3 h-3" /> {user.phoneNumber}
                </a>
              ) : (
                <span className="text-slate-500 text-[11px]">Unregistered</span>
              )}
            </div>

            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-mutedGray font-mono">History Ratio:</span>
              <span className="font-mono text-slate-200">
                <span className="text-crimsonRed font-bold">{history.stats.emergencySosCount} SOS</span> /{' '}
                <span className="text-cyan-400 font-bold">{history.stats.civicComplaintCount} Complaints</span>
              </span>
            </div>
          </div>

          {/* Card 2: Incident Intent & Category */}
          <div className={`bg-[#0C1324]/80 border rounded-xl p-4 shadow-sm backdrop-blur-sm relative overflow-hidden ${
            isEmergency ? 'border-crimsonRed/30' : 'border-cyan-500/30'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase text-mutedGray tracking-wider flex items-center gap-1">
                {isEmergency ? (
                  <ShieldAlert className="w-3 h-3 text-crimsonRed" />
                ) : (
                  <Droplets className="w-3 h-3 text-cyan-400" />
                )}
                Incident Intent
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                  isEmergency ? 'bg-crimsonRed/20 text-rose-300' : 'bg-cyan-500/20 text-cyan-300'
                }`}
              >
                {incident.category}
              </span>
            </div>

            <h3 className="font-bold text-white text-base truncate">{incident.intentLabel}</h3>
            <p className="text-xs text-mutedGray mt-0.5">
              {isEmergency
                ? 'High-priority distress alert. Imminent human safety triage.'
                : 'Municipal drainage / flood hazard report logged for maintenance.'}
            </p>

            <div className="mt-3 pt-3 border-t border-borderDark/40 flex items-center justify-between text-xs">
              <span className="text-mutedGray font-mono">Water Depth:</span>
              <span className="font-mono font-bold text-slate-200 flex items-center gap-1">
                <Droplets className="w-3 h-3 text-cyan-400" />
                {incident.waterDepthCm} cm
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-mutedGray font-mono">Passability:</span>
              <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-surfaceDark text-slate-300">
                {incident.passability.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          {/* Card 3: Hardware & Sensor Telemetry */}
          <div className="bg-[#0C1324]/80 border border-borderDark/60 rounded-xl p-4 shadow-sm backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase text-mutedGray tracking-wider flex items-center gap-1">
                <Activity className="w-3 h-3 text-brandTeal" /> Sensor Telemetry
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surfaceDark border border-borderDark text-brandTeal font-mono">
                {incident.transport}
              </span>
            </div>

            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1.5">
                <Battery className={`w-5 h-5 ${
                  (incident.batteryPercentage ?? 100) < 20 ? 'text-crimsonRed animate-pulse' : 'text-brandTeal'
                }`} />
                <span className="text-base font-bold font-mono text-white">
                  {incident.batteryPercentage !== null && incident.batteryPercentage !== undefined
                    ? `${incident.batteryPercentage}%`
                    : 'N/A'}
                </span>
              </div>
              <div className="h-4 w-px bg-borderDark/60" />
              <div className="flex items-center gap-1.5 text-xs text-mutedGray font-mono">
                <Radio className="w-3.5 h-3.5 text-brandTeal" />
                {incident.relayedByMule ? 'Data Mule Relayed' : 'Direct Signal'}
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-borderDark/40 flex items-center justify-between text-xs">
              <span className="text-mutedGray font-mono">Packet ID:</span>
              <span className="font-mono text-slate-300 text-[11px]">
                {incident.packetId || 'STD-IP-BROADCAST'}
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-mutedGray font-mono">Relay Status:</span>
              <span className="font-mono text-[11px] text-brandTeal">
                {incident.relayedByMule ? 'Offline Mesh Synced' : 'Cloud Direct'}
              </span>
            </div>
          </div>

          {/* Card 4: Location Coordinates */}
          <div className="bg-[#0C1324]/80 border border-borderDark/60 rounded-xl p-4 shadow-sm backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase text-mutedGray tracking-wider flex items-center gap-1">
                <MapPin className="w-3 h-3 text-alertAmber" /> Beacon Pin
              </span>
              {incident.location && (
                <a
                  href={`https://www.google.com/maps?q=${incident.location.lat},${incident.location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-brandTeal hover:underline flex items-center gap-0.5 font-mono"
                >
                  Maps <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>

            <p className="font-mono text-white text-sm font-semibold truncate">
              {incident.location ? `${incident.location.lat.toFixed(5)}, ${incident.location.lng.toFixed(5)}` : 'Location Unknown'}
            </p>
            <p className="text-xs text-mutedGray mt-0.5 font-mono">
              Accuracy: {incident.accuracyMeters ? `±${incident.accuracyMeters}m` : 'Cell Triangulated'}
            </p>

            <div className="mt-3 pt-3 border-t border-borderDark/40 flex items-center justify-between text-xs">
              <span className="text-mutedGray font-mono">Assigned Officer:</span>
              <span className="font-mono text-slate-200 truncate max-w-[120px]">
                {incident.assignedAdmin?.displayName || 'Unassigned'}
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-mutedGray font-mono">Family Circle:</span>
              <span className="font-mono text-brandTeal font-bold">
                {familyNetwork.totalLinked} Members Linked
              </span>
            </div>
          </div>
        </div>

        {/* Message Banner if Present */}
        {incident.message && (
          <div className="bg-[#0D1528] border border-brandTeal/30 rounded-xl p-4 flex items-start gap-3">
            <FileText className="w-5 h-5 text-brandTeal flex-shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-mono uppercase text-brandTeal tracking-wider">Civilian Distress Message:</span>
              <p className="text-sm text-slate-100 font-medium mt-0.5">"{incident.message}"</p>
            </div>
          </div>
        )}

        {/* ================= SECTION 2: Tab Navigation ================= */}
        <div className="flex border-b border-borderDark/60 gap-2 sm:gap-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('TELEMETRY')}
            className={`pb-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'TELEMETRY'
                ? 'border-brandTeal text-brandTeal'
                : 'border-transparent text-mutedGray hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" /> Live Telemetry & Mission Notes ({incident.notes.length})
          </button>

          <button
            onClick={() => setActiveTab('FAMILY')}
            className={`pb-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'FAMILY'
                ? 'border-brandTeal text-brandTeal'
                : 'border-transparent text-mutedGray hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" /> Family Network & Dependents ({familyNetwork.totalLinked})
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`pb-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'HISTORY'
                ? 'border-brandTeal text-brandTeal'
                : 'border-transparent text-mutedGray hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" /> Historical Dispatches ({history.stats.totalEvents})
          </button>

          <button
            onClick={() => setActiveTab('AI_BRIEF')}
            className={`pb-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'AI_BRIEF'
                ? 'border-brandTeal text-brandTeal'
                : 'border-transparent text-mutedGray hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-alertAmber" /> Autonomous Situation Brief
          </button>
        </div>

        {/* ================= SECTION 3: Tab Content Panels ================= */}

        {/* ─── TAB 1: Live Telemetry & Notes ─── */}
        {activeTab === 'TELEMETRY' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Mission Log & Notes */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-[#0C1324]/80 border border-borderDark/60 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-brandTeal" /> Responders Mission Log
                  </h3>
                  <span className="text-xs text-mutedGray font-mono">{incident.notes.length} total entries</span>
                </div>

                {/* Notes Stream */}
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                  {incident.notes.length === 0 ? (
                    <div className="text-center py-8 text-mutedGray text-xs">
                      No field notes recorded yet. Add initial assessment below.
                    </div>
                  ) : (
                    incident.notes.map((note, idx) => (
                      <div key={idx} className="bg-surfaceDark/50 border border-borderDark/40 rounded-lg p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between text-mutedGray font-mono text-[10px]">
                          <span>Responder Ref: {note.authorId?.slice(-6) || 'HQ Officer'}</span>
                          <span>{new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-slate-200 font-medium">{note.text}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="mt-4 pt-4 border-t border-borderDark/40 flex gap-2">
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Type dispatch update or field assessment..."
                    className="flex-1 bg-surfaceDark border border-borderDark/60 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brandTeal"
                  />
                  <button
                    type="submit"
                    disabled={actionLoading || !noteInput.trim()}
                    className="px-4 py-2 bg-brandTeal text-[#070B14] rounded-lg text-xs font-bold hover:bg-brandTeal/90 transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" /> Post
                  </button>
                </form>
              </div>

              {/* Acknowledged Responders List */}
              <div className="bg-[#0C1324]/80 border border-borderDark/60 rounded-xl p-5 shadow-sm">
                <h4 className="font-bold text-white text-xs uppercase font-mono text-mutedGray mb-3">
                  Safety Acknowledgments ({incident.acknowledgedByUsers.length})
                </h4>
                {incident.acknowledgedByUsers.length === 0 ? (
                  <p className="text-xs text-mutedGray">No relative or responder has acknowledged safety yet.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {incident.acknowledgedByUsers.map((ack, idx) => (
                      <div key={idx} className="bg-surfaceDark/40 border border-borderDark/40 rounded-lg p-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-brandTeal" />
                          <span className="font-medium text-slate-200">{ack.displayName || 'Family Responder'}</span>
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
            <div className="space-y-4">
              <div className="bg-[#0C1324]/80 border border-borderDark/60 rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Compass className="w-4 h-4 text-brandTeal" /> Environmental Triangulation
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center py-2 border-b border-borderDark/30">
                    <span className="text-mutedGray">Flood Height:</span>
                    <span className="font-mono font-bold text-cyan-400">{incident.waterDepthCm} cm recorded</span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-borderDark/30">
                    <span className="text-mutedGray">Vehicle Clearance:</span>
                    <span className="font-mono text-slate-200">{incident.passability.replace(/_/g, ' ')}</span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-borderDark/30">
                    <span className="text-mutedGray">Network Carrier:</span>
                    <span className="font-mono text-slate-200">{incident.transport}</span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-borderDark/30">
                    <span className="text-mutedGray">Battery Gauge:</span>
                    <span className="font-mono text-slate-200">{incident.batteryPercentage ?? 'Unknown'}%</span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-borderDark/30">
                    <span className="text-mutedGray">Mule Peer Relay:</span>
                    <span className="font-mono text-brandTeal">{incident.relayedByMule ? 'YES' : 'NO'}</span>
                  </div>
                </div>

                {/* Quick Map Directions Action */}
                {incident.location && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${incident.location.lat},${incident.location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 rounded-lg bg-surfaceDark border border-borderDark/60 hover:border-brandTeal text-xs font-semibold text-white flex items-center justify-center gap-2 transition"
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
            {/* Header info */}
            <div className="bg-[#0C1324]/80 border border-borderDark/60 rounded-xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <HeartHandshake className="w-5 h-5 text-rose-400" /> Family Circle & Linked Dependents
                </h3>
                <p className="text-xs text-mutedGray mt-1">
                  Bi-directional parent-child links registered under ZeroGrid Family Safety Mesh.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-lg bg-surfaceDark border border-borderDark text-xs font-mono text-slate-200">
                  {familyNetwork.parents.length} Parents
                </span>
                <span className="px-3 py-1 rounded-lg bg-surfaceDark border border-borderDark text-xs font-mono text-brandTeal font-bold">
                  {familyNetwork.dependents.length} Dependents
                </span>
              </div>
            </div>

            {/* Dependents / Children */}
            <div>
              <h4 className="text-xs font-bold uppercase font-mono text-brandTeal tracking-wider mb-3 flex items-center gap-1.5">
                <Users className="w-4 h-4" /> Linked Children & Dependents ({familyNetwork.dependents.length})
              </h4>

              {familyNetwork.dependents.length === 0 ? (
                <div className="bg-[#0C1324]/40 border border-borderDark/40 rounded-xl p-6 text-center text-xs text-mutedGray">
                  No dependent accounts registered for this civilian.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {familyNetwork.dependents.map((dep) => (
                    <div
                      key={dep.linkId}
                      className="bg-[#0C1324]/80 border border-borderDark/60 rounded-xl p-4 shadow-sm hover:border-brandTeal/40 transition space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-brandTeal/15 text-brandTeal flex items-center justify-center font-bold text-xs">
                            {dep.user.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-white text-sm">{dep.user.displayName}</p>
                            <span className="text-[10px] text-mutedGray font-mono">{dep.user.role}</span>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                            dep.status === 'ACCEPTED'
                              ? 'bg-brandTeal/20 text-brandTeal border border-brandTeal/30'
                              : 'bg-alertAmber/20 text-alertAmber border border-alertAmber/30'
                          }`}
                        >
                          {dep.status}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs pt-2 border-t border-borderDark/40">
                        <div className="flex items-center justify-between text-mutedGray">
                          <span>Email:</span>
                          <span className="text-slate-200 font-mono text-[11px] truncate max-w-[160px]">{dep.user.email}</span>
                        </div>
                        {dep.user.phoneNumber && (
                          <div className="flex items-center justify-between text-mutedGray">
                            <span>Phone:</span>
                            <a href={`tel:${dep.user.phoneNumber}`} className="text-brandTeal hover:underline font-mono">
                              {dep.user.phoneNumber}
                            </a>
                          </div>
                        )}
                        {dep.user.lastKnownLocation && (
                          <div className="flex items-center justify-between text-mutedGray">
                            <span>Last Ping:</span>
                            <span className="text-slate-200 font-mono text-[10px]">
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
            <div>
              <h4 className="text-xs font-bold uppercase font-mono text-mutedGray tracking-wider mb-3 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-slate-400" /> Linked Parents & Guardians ({familyNetwork.parents.length})
              </h4>

              {familyNetwork.parents.length === 0 ? (
                <div className="bg-[#0C1324]/40 border border-borderDark/40 rounded-xl p-6 text-center text-xs text-mutedGray">
                  No parent links registered for this account.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {familyNetwork.parents.map((par) => (
                    <div
                      key={par.linkId}
                      className="bg-[#0C1324]/80 border border-borderDark/60 rounded-xl p-4 shadow-sm hover:border-brandTeal/40 transition space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-200 flex items-center justify-center font-bold text-xs">
                            {par.user.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-white text-sm">{par.user.displayName}</p>
                            <span className="text-[10px] text-mutedGray font-mono">Guardian</span>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                            par.status === 'ACCEPTED'
                              ? 'bg-brandTeal/20 text-brandTeal border border-brandTeal/30'
                              : 'bg-alertAmber/20 text-alertAmber border border-alertAmber/30'
                          }`}
                        >
                          {par.status}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs pt-2 border-t border-borderDark/40">
                        <div className="flex items-center justify-between text-mutedGray">
                          <span>Email:</span>
                          <span className="text-slate-200 font-mono text-[11px] truncate max-w-[160px]">{par.user.email}</span>
                        </div>
                        {par.user.phoneNumber && (
                          <div className="flex items-center justify-between text-mutedGray">
                            <span>Phone:</span>
                            <a href={`tel:${par.user.phoneNumber}`} className="text-brandTeal hover:underline font-mono">
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
            <div>
              <h4 className="text-xs font-bold uppercase font-mono text-alertAmber tracking-wider mb-3 flex items-center gap-1.5">
                <Phone className="w-4 h-4" /> Emergency Phone Contacts ({familyNetwork.emergencyContacts.length})
              </h4>

              {familyNetwork.emergencyContacts.length === 0 ? (
                <div className="bg-[#0C1324]/40 border border-borderDark/40 rounded-xl p-6 text-center text-xs text-mutedGray">
                  No emergency contacts configured by civilian.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {familyNetwork.emergencyContacts.map((contact) => (
                    <div key={contact.id} className="bg-[#0C1324]/80 border border-borderDark/60 rounded-xl p-3.5 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-white text-xs">{contact.name}</p>
                        <span className="text-[10px] text-mutedGray font-mono">{contact.relationship}</span>
                      </div>
                      <a
                        href={`tel:${contact.phoneNumber}`}
                        className="p-2 rounded-lg bg-surfaceDark border border-borderDark/60 hover:border-brandTeal text-brandTeal transition"
                        title="Call Contact"
                      >
                        <Phone className="w-3.5 h-3.5" />
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
            <div className="bg-[#0C1324]/80 border border-borderDark/60 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHistoryFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    historyFilter === 'ALL'
                      ? 'bg-brandTeal text-[#070B14]'
                      : 'bg-surfaceDark text-mutedGray hover:text-white'
                  }`}
                >
                  All Reports ({history.stats.totalEvents})
                </button>

                <button
                  onClick={() => setHistoryFilter('EMERGENCY')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    historyFilter === 'EMERGENCY'
                      ? 'bg-crimsonRed text-white'
                      : 'bg-surfaceDark text-mutedGray hover:text-white'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Critical SOS Only ({history.stats.emergencySosCount})
                </button>

                <button
                  onClick={() => setHistoryFilter('COMPLAINTS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    historyFilter === 'COMPLAINTS'
                      ? 'bg-cyan-500 text-white'
                      : 'bg-surfaceDark text-mutedGray hover:text-white'
                  }`}
                >
                  <Droplets className="w-3.5 h-3.5" />
                  Civic Complaints ({history.stats.civicComplaintCount})
                </button>
              </div>

              <div className="text-xs font-mono text-mutedGray">
                Resolved Rate:{' '}
                <span className="text-brandTeal font-bold">
                  {history.stats.totalEvents > 0
                    ? `${Math.round((history.stats.resolvedCount / history.stats.totalEvents) * 100)}%`
                    : '100%'}
                </span>
              </div>
            </div>

            {/* Timeline Cards */}
            <div className="space-y-3">
              {filteredTimeline.length === 0 ? (
                <div className="bg-[#0C1324]/40 border border-borderDark/40 rounded-xl p-8 text-center text-xs text-mutedGray">
                  No past dispatches found matching this filter.
                </div>
              ) : (
                filteredTimeline.map((item) => (
                  <div
                    key={item.id}
                    className={`bg-[#0C1324]/80 border rounded-xl p-4 transition shadow-sm ${
                      item.isCurrentIncident
                        ? 'border-brandTeal ring-1 ring-brandTeal/30'
                        : item.isEmergencySos
                        ? 'border-crimsonRed/30 hover:border-crimsonRed/50'
                        : 'border-borderDark/60 hover:border-cyan-500/40'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        {/* Intent Icon */}
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            item.isEmergencySos
                              ? 'bg-crimsonRed/20 text-rose-400'
                              : 'bg-cyan-500/20 text-cyan-400'
                          }`}
                        >
                          {item.isEmergencySos ? (
                            <ShieldAlert className="w-4 h-4" />
                          ) : (
                            <Droplets className="w-4 h-4" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">{item.category}</span>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold uppercase ${
                                item.isEmergencySos ? 'bg-crimsonRed/20 text-rose-300' : 'bg-cyan-500/20 text-cyan-300'
                              }`}
                            >
                              {item.isEmergencySos ? 'Emergency SOS' : 'Civic Hazard'}
                            </span>
                            {item.isCurrentIncident && (
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-brandTeal/20 text-brandTeal font-mono font-bold">
                                CURRENT INCIDENT
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-mutedGray font-mono flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            {new Date(item.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Status */}
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase ${
                          item.status === 'RESOLVED'
                            ? 'bg-brandTeal/15 text-brandTeal border border-brandTeal/30'
                            : item.status === 'ACKNOWLEDGED'
                            ? 'bg-alertAmber/15 text-alertAmber border border-alertAmber/30'
                            : 'bg-crimsonRed/15 text-crimsonRed border border-crimsonRed/30'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    {item.message && (
                      <p className="text-xs text-slate-300 font-medium mt-2.5 pl-9">
                        "{item.message}"
                      </p>
                    )}

                    <div className="mt-3 pt-2 pl-9 border-t border-borderDark/30 flex flex-wrap items-center gap-4 text-[11px] font-mono text-mutedGray">
                      <span>Water Depth: <strong className="text-slate-200">{item.waterDepthCm} cm</strong></span>
                      <span>Passability: <strong className="text-slate-200">{item.passability.replace(/_/g, ' ')}</strong></span>
                      <span>Transport: <strong className="text-slate-200">{item.transport}</strong></span>
                      {item.batteryPercentage !== null && item.batteryPercentage !== undefined && (
                        <span>Battery: <strong className="text-slate-200">{item.batteryPercentage}%</strong></span>
                      )}
                      <span>Notes: <strong className="text-slate-200">{item.notesCount}</strong></span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ─── TAB 4: Autonomous Situation Brief ─── */}
        {activeTab === 'AI_BRIEF' && (
          <div className="bg-[#0C1324]/80 border border-borderDark/60 rounded-xl p-6 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Bot className="w-5 h-5 text-brandTeal" /> Autonomous Situation Brief
                </h3>
                <p className="text-xs text-mutedGray mt-0.5">
                  Powered by ZeroGrid Multi-Tier AI (Bedrock &rarr; Groq Llama-3 &rarr; Deterministic Hydrodynamics).
                </p>
              </div>

              <button
                onClick={handleGenerateBrief}
                disabled={briefLoading}
                className="px-4 py-2 bg-brandTeal text-[#070B14] rounded-lg text-xs font-bold hover:bg-brandTeal/90 transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {briefLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Generate Incident Brief
              </button>
            </div>

            {brief ? (
              <div className="space-y-4 pt-4 border-t border-borderDark/40">
                {brief.agentAdvisory && (
                  <div className="bg-surfaceDark/60 border border-brandTeal/30 rounded-xl p-4">
                    <span className="text-[10px] font-mono uppercase text-brandTeal tracking-wider flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" /> Agent Strategic Advisory
                    </span>
                    <p className="text-xs text-slate-200 mt-1 leading-relaxed">{brief.agentAdvisory}</p>
                  </div>
                )}

                {brief.trafficDiversion && (
                  <div className="bg-surfaceDark/60 border border-alertAmber/30 rounded-xl p-4">
                    <span className="text-[10px] font-mono uppercase text-alertAmber tracking-wider flex items-center gap-1">
                      <Compass className="w-3.5 h-3.5" /> Traffic Diversion Route
                    </span>
                    <p className="text-xs text-slate-200 mt-1 leading-relaxed">{brief.trafficDiversion}</p>
                  </div>
                )}

                {brief.municipalActions && brief.municipalActions.length > 0 && (
                  <div className="bg-surfaceDark/60 border border-cyan-500/30 rounded-xl p-4">
                    <span className="text-[10px] font-mono uppercase text-cyan-400 tracking-wider flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Recommended Municipal Actions
                    </span>
                    <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
                      {brief.municipalActions.map((action, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0" />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-mutedGray text-xs">
                Click "Generate Incident Brief" to activate real-time LLM incident analysis & response routing.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
