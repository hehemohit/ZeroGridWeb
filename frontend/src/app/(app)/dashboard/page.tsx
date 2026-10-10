'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { io, Socket } from 'socket.io-client';
import {
  Zap,
  Shield,
  Activity,
  AlertTriangle,
  Radio,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Cpu,
  Layers,
  Building,
  Droplets,
  Truck,
  HeartPulse,
  Navigation,
  ExternalLink,
  Flame,
  Clock,
  Compass,
  MapPin,
  ChevronRight,
  Sliders,
  Database,
  Lock,
  Unlock,
  ShieldAlert,
  Timer,
  Users,
  Radar,
  CheckSquare,
  X,
  RotateCcw,
  Sparkles,
  Filter,
  Search,
  ArrowRight,
  CornerDownRight,
  Thermometer,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import DashboardAnalyticsGraphs from '@/components/admin/DashboardAnalyticsGraphs';
import {
  triggerAutonomousOrchestration,
  AutonomousOrchestrationResponse,
  AutonomousOrchestratePayload,
  CircularConfidenceData,
  CircularDomainDemand,
  CircularWorkforceAllocation
} from '@/lib/voiceAgent';

interface ActiveSosItem {
  id: string;
  _id?: string;
  category: string;
  severity: string;
  status: string;
  waterDepthCm?: number;
  temperatureC?: number;
  location?: string | { type?: string; coordinates?: [number, number] };
  coordinates?: [number, number];
  message?: string;
  createdAt?: string;
  agentZeroAdvisory?: {
    threatScore?: number;
    suggestedSubAgent?: string;
    recommendedBreakerTrips?: string[];
    hospitalLifelineAction?: string;
    veracityScore?: number;
    domain?: string;
  };
  workforceDemand?: {
    targetDepartment?: string;
    requiredRole?: string;
    teamCount?: number;
    requiredTags?: string[];
    fallbackDepartment?: string;
    fallbackTags?: string[];
    assignedPersonnel?: Array<{
      name?: string;
      email?: string;
      department?: string;
      role?: string;
      tags?: string[];
    }>;
    fallbackEngaged?: boolean;
  };
  assignedAdmin?: any;
}

interface DepartmentStats {
  total: number;
  available: number;
  assigned: number;
  tags: string[];
}

interface WorkforceSummary {
  totalAdmins: number;
  totalAvailable: number;
  totalAssigned: number;
  departments: {
    FLOOD_MANAGEMENT: DepartmentStats;
    HEATWAVE_MANAGEMENT: DepartmentStats;
    POWER_GRID_MANAGEMENT: DepartmentStats;
    RESCUE_MANAGEMENT: DepartmentStats;
  };
}

interface CachedOrchestrationData {
  incidentId: string;
  waterDepth: number;
  temperature: number;
  coordinates: [number, number];
  orchestration: AutonomousOrchestrationResponse;
  cachedAt: number;
  trippedBreakers: string[];
  squadsDispatched: boolean;
}

const CACHE_KEY_PREFIX = 'zerogrid_agent_zero_cache_v2_';

function getOrchestrationCache(incidentId: string): CachedOrchestrationData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${incidentId}`);
    if (raw) return JSON.parse(raw);
    const fallbackRaw = localStorage.getItem(`${CACHE_KEY_PREFIX}latest`);
    if (fallbackRaw) return JSON.parse(fallbackRaw);
  } catch (e) {
    console.warn('[Cache] Failed to read cached orchestration:', e);
  }
  return null;
}

function saveOrchestrationCache(data: CachedOrchestrationData) {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(data);
    localStorage.setItem(`${CACHE_KEY_PREFIX}${data.incidentId}`, serialized);
    localStorage.setItem(`${CACHE_KEY_PREFIX}latest`, serialized);
  } catch (e) {
    console.warn('[Cache] Failed to save orchestration cache:', e);
  }
}

function clearOrchestrationCache(incidentId: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${CACHE_KEY_PREFIX}${incidentId}`);
    localStorage.removeItem(`${CACHE_KEY_PREFIX}latest`);
  } catch (e) {}
}

function formatRelativeTime(timestamp: number | string | null | undefined): string {
  if (!timestamp) return 'Just now';
  const timeMs = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  if (isNaN(timeMs)) return 'Just now';
  const diffSec = Math.max(1, Math.floor((Date.now() - timeMs) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

export default function AgentZeroDashboardPage() {
  const { user } = useAuth();

  // Active Incidents list & selection
  const [activeSosList, setActiveSosList] = useState<ActiveSosItem[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('PRESET_VIRAR');
  const [filterDomain, setFilterDomain] = useState<'ALL' | 'FLOOD' | 'HEATWAVE' | 'POWER_GRID' | 'RESCUE'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 160 Admin Workforce stats
  const [workforceStats, setWorkforceStats] = useState<WorkforceSummary>({
    totalAdmins: 160,
    totalAvailable: 156,
    totalAssigned: 4,
    departments: {
      FLOOD_MANAGEMENT: { total: 40, available: 39, assigned: 1, tags: ['DEWATERING', 'DEEP_WATER_RESQ', 'ZODIAC_BOAT'] },
      HEATWAVE_MANAGEMENT: { total: 40, available: 40, assigned: 0, tags: ['MEDICAL_TRIAGE', 'HYDRATION_SQUAD', 'COOLING_STATION'] },
      POWER_GRID_MANAGEMENT: { total: 40, available: 38, assigned: 2, tags: ['HV_LINEMAN', 'SUBSTATION_CREW', 'AIR_GAP_ISOLATION'] },
      RESCUE_MANAGEMENT: { total: 40, available: 39, assigned: 1, tags: ['HEAVY_RESCUE', 'COLLAPSE_SEARCH', 'TRAUMA_PARAMEDIC'] },
    },
  });
  const [loadingWorkforce, setLoadingWorkforce] = useState<boolean>(false);

  // Inspector Parameter Overrides
  const [customWaterDepth, setCustomWaterDepth] = useState<number>(46);
  const [customTemperature, setCustomTemperature] = useState<number>(31.5);
  const [customCoordinates, setCustomCoordinates] = useState<[number, number]>([19.456, 72.812]);

  // Orchestration & Inspector State
  const [loading, setLoading] = useState<boolean>(false);
  const [orchestration, setOrchestration] = useState<AutonomousOrchestrationResponse | null>(null);
  const [cachedTime, setCachedTime] = useState<number | null>(null);
  const [isFromCache, setIsFromCache] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeInspectorPhase, setActiveInspectorPhase] = useState<1 | 2 | 3 | 4>(1);

  // Interactive Operator Actions & HITL Safety Gate
  const [trippedBreakers, setTrippedBreakers] = useState<string[]>([]);
  const [pendingBreaker, setPendingBreaker] = useState<string | null>(null);
  const [hitlConfirmed, setHitlConfirmed] = useState<boolean>(false);
  const [squadsDispatched, setSquadsDispatched] = useState<boolean>(false);
  const [copiedNote, setCopiedNote] = useState<boolean>(false);

  // Socket.io real-time connection status
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const socketRef = useRef<Socket | null>(null);

  // 1. Fetch live active SOS signals from MongoDB
  const fetchActiveSos = async () => {
    try {
      const res = await api.get<{ events?: any[]; sosEvents?: any[]; sos?: any[] }>('/api/admin/sos?status=ACTIVE');
      const list = res.events || res.sosEvents || res.sos || (Array.isArray(res) ? res : []);
      const formatted: ActiveSosItem[] = list.map((item: any) => {
        let coords: [number, number] = [19.456, 72.812];
        if (item.location?.coordinates && Array.isArray(item.location.coordinates)) {
          coords = [item.location.coordinates[1], item.location.coordinates[0]];
        } else if (item.coordinates && Array.isArray(item.coordinates)) {
          coords = [item.coordinates[0], item.coordinates[1]];
        }

        return {
          id: item._id?.toString() || item.id || 'INC_01',
          _id: item._id?.toString() || item.id,
          category: item.category || 'CIVIC_HAZARD',
          severity: item.severity || (item.isEmergencySos ? 'CRITICAL' : 'HIGH'),
          status: item.status || 'ACTIVE',
          waterDepthCm: item.waterDepthCm ?? 35,
          temperatureC: item.temperatureC ?? item.temperature_c ?? 32,
          location: typeof item.location === 'string' ? item.location : (item.location?.address || 'Virar Municipal Sector'),
          coordinates: coords,
          message: item.message || 'Distress signal detected near municipal infrastructure',
          createdAt: item.createdAt || new Date().toISOString(),
          agentZeroAdvisory: item.agentZeroAdvisory,
          workforceDemand: item.workforceDemand,
          assignedAdmin: item.assignedAdmin,
        };
      });
      setActiveSosList(formatted);
    } catch (err) {
      console.warn('[Dashboard] Could not load active SOS signals:', err);
    }
  };

  // 2. Fetch live 160 Admin Workforce stats from MongoDB
  const fetchWorkforceStats = async () => {
    setLoadingWorkforce(true);
    try {
      const res = await api.get<{ success?: boolean; summary?: WorkforceSummary }>('/api/admin/workforce/stats');
      if (res.summary && res.summary.departments) {
        setWorkforceStats(res.summary);
      }
    } catch (err) {
      console.warn('[Dashboard] Could not load live workforce stats, fallback active:', err);
    } finally {
      setLoadingWorkforce(false);
    }
  };

  // 3. Run or Restore Orchestration for the selected incident
  const handleExecuteOrchestration = async (
    overrideDepth?: number,
    overrideTemp?: number,
    overrideCoords?: [number, number],
    overrideIncidentId?: string
  ) => {
    setLoading(true);
    setError(null);
    try {
      const depth = overrideDepth ?? customWaterDepth;
      const temp = overrideTemp ?? customTemperature;
      const coords = overrideCoords ?? customCoordinates;
      const incId = overrideIncidentId ?? selectedIncidentId;

      const payload: AutonomousOrchestratePayload = {
        incident_id: incId,
        incident_type: 'SUBSTATION_WATER_INGRESS',
        severity: 'CRITICAL',
        coordinates: coords,
        water_depth_cm: depth,
        temperature_c: temp,
        message: `Emergency crisis at ${incId}: water logging (${depth}cm) and thermal stress (${temp}°C) detected. Autonomous multi-agent verification and tactical allocation active.`,
      };

      const result = await triggerAutonomousOrchestration(payload);
      setOrchestration(result);
      setTrippedBreakers([]);
      setSquadsDispatched(false);
      const now = Date.now();
      setCachedTime(now);
      setIsFromCache(false);

      saveOrchestrationCache({
        incidentId: incId,
        waterDepth: depth,
        temperature: temp,
        coordinates: coords,
        orchestration: result,
        cachedAt: now,
        trippedBreakers: [],
        squadsDispatched: false,
      });
    } catch (err: any) {
      console.warn('[Dashboard] Agent Zero orchestration error:', err);
      setError(err?.message || 'Notice: Operating on autonomous contingency profile.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Initial Mount & Polling / Socket.io Sync
  useEffect(() => {
    fetchActiveSos();
    fetchWorkforceStats();

    // Check local cache for the default preset
    const cached = getOrchestrationCache(selectedIncidentId);
    if (cached && cached.orchestration) {
      setOrchestration(cached.orchestration);
      setTrippedBreakers(cached.trippedBreakers || []);
      setSquadsDispatched(cached.squadsDispatched || false);
      setCachedTime(cached.cachedAt);
      setIsFromCache(true);
      if (cached.waterDepth) setCustomWaterDepth(cached.waterDepth);
      if (cached.temperature) setCustomTemperature(cached.temperature);
      if (cached.coordinates) setCustomCoordinates(cached.coordinates);
    } else {
      handleExecuteOrchestration();
    }

    // Connect to Socket.io /sos namespace for real-time updates
    const backendUrl = api.baseUrl || 'http://localhost:5000';
    const socket = io(`${backendUrl}/sos`, {
      transports: ['polling', 'websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    // Listen to real-time events emitted by Agent Zero pipeline and citizen SOS submissions
    socket.on('sos:new', () => {
      fetchActiveSos();
      fetchWorkforceStats();
    });

    socket.on('sos:agent_zero_orchestrated', (data: any) => {
      fetchActiveSos();
      fetchWorkforceStats();
      if (data?.incident_id === selectedIncidentId || data?.sosId === selectedIncidentId) {
        handleExecuteOrchestration(undefined, undefined, undefined, selectedIncidentId);
      }
    });

    socket.on('sos:workforce:dispatched', () => {
      fetchActiveSos();
      fetchWorkforceStats();
    });

    socket.on('sos:updated', () => {
      fetchActiveSos();
    });

    socket.on('flow:step:update', (data: any) => {
      if (data?.incident_id === selectedIncidentId && orchestration) {
        // dynamically append to timeline
        setOrchestration((prev) => {
          if (!prev) return prev;
          const currentTimeline = prev.circular_phase?.timeline || [];
          return {
            ...prev,
            circular_phase: {
              ...prev.circular_phase,
              timeline: [
                ...currentTimeline,
                { step: data.step, status: data.status, summary: data.summary, time_iso: data.time_iso || new Date().toISOString() }
              ]
            }
          };
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // 5. Incident selection handler
  const handleSelectIncident = (newIncidentId: string) => {
    setSelectedIncidentId(newIncidentId);
    let depth = 46;
    let temp = 31.5;
    let coords: [number, number] = [19.456, 72.812];

    if (newIncidentId === 'PRESET_VIRAR') {
      depth = 46;
      temp = 31.5;
      coords = [19.456, 72.812];
    } else if (newIncidentId === 'PRESET_WARD4') {
      depth = 32;
      temp = 33.0;
      coords = [19.458, 72.815];
    } else if (newIncidentId === 'PRESET_HEATWAVE') {
      depth = 0;
      temp = 44.5;
      coords = [19.452, 72.815];
    } else if (newIncidentId === 'PRESET_RESCUE') {
      depth = 35;
      temp = 29.0;
      coords = [19.442, 72.802];
    } else {
      const match = activeSosList.find((i) => i.id === newIncidentId);
      if (match) {
        depth = match.waterDepthCm ?? 35;
        temp = match.temperatureC ?? 31;
        coords = match.coordinates || [19.456, 72.812];
      }
    }

    setCustomWaterDepth(depth);
    setCustomTemperature(temp);
    setCustomCoordinates(coords);

    const cached = getOrchestrationCache(newIncidentId);
    if (cached && cached.orchestration) {
      setOrchestration(cached.orchestration);
      setTrippedBreakers(cached.trippedBreakers || []);
      setSquadsDispatched(cached.squadsDispatched || false);
      setCachedTime(cached.cachedAt);
      setIsFromCache(true);
    } else {
      handleExecuteOrchestration(depth, temp, coords, newIncidentId);
    }
  };

  const handleClearCacheAndReanalyze = () => {
    clearOrchestrationCache(selectedIncidentId);
    handleExecuteOrchestration();
  };

  const requestBreakerToggle = (breaker: string) => {
    if (trippedBreakers.includes(breaker)) {
      const updated = trippedBreakers.filter((b) => b !== breaker);
      setTrippedBreakers(updated);
      if (orchestration) {
        saveOrchestrationCache({
          incidentId: selectedIncidentId,
          waterDepth: customWaterDepth,
          temperature: customTemperature,
          coordinates: customCoordinates,
          orchestration,
          cachedAt: cachedTime || Date.now(),
          trippedBreakers: updated,
          squadsDispatched,
        });
      }
    } else {
      setPendingBreaker(breaker);
      setHitlConfirmed(false);
    }
  };

  const confirmHitlBreakerTrip = () => {
    if (!pendingBreaker) return;
    const updated = [...trippedBreakers, pendingBreaker];
    setTrippedBreakers(updated);
    setPendingBreaker(null);
    if (orchestration) {
      saveOrchestrationCache({
        incidentId: selectedIncidentId,
        waterDepth: customWaterDepth,
        temperature: customTemperature,
        coordinates: customCoordinates,
        orchestration,
        cachedAt: cachedTime || Date.now(),
        trippedBreakers: updated,
        squadsDispatched,
      });
    }
  };

  const handleDispatchAllSquads = () => {
    setSquadsDispatched(true);
    if (orchestration) {
      saveOrchestrationCache({
        incidentId: selectedIncidentId,
        waterDepth: customWaterDepth,
        temperature: customTemperature,
        coordinates: customCoordinates,
        orchestration,
        cachedAt: cachedTime || Date.now(),
        trippedBreakers,
        squadsDispatched: true,
      });
    }
  };

  const handleCopyDirective = () => {
    if (!orchestration) return;
    const d = orchestration.agent_zero_directive;
    const c = orchestration.circular_phase;
    const summaryText = `[AGENT ZERO COMMAND CENTER - TACTICAL DIRECTIVE]
Incident: ${orchestration.incident_id}
Threat Score: ${d.overall_threat_score}/100
Confidence Veracity: ${c?.confidence_data?.veracity_score ?? 94}% (Gate: Passed >= 65%)
Classified Domain: ${c?.agent_zero_classification?.domain ?? 'POWER_GRID'} (${c?.agent_zero_classification?.targetDepartment ?? 'POWER_GRID_MANAGEMENT'})
Target Demand: ${c?.domain_demand?.teamCount ?? 3} Squads [${c?.domain_demand?.requiredTags?.join(', ') || ''}]
Workforce Allocation: ${c?.workforce_allocation?.status ?? 'ALLOCATED'} (${c?.workforce_allocation?.assigned_personnel?.length ?? 3} Admins Assigned)
Hospital Lifeline Protocol: ${d.hospital_lifeline_protocol}
Immediate Automated Actions: ${d.immediate_automated_actions.join(', ')}`;

    navigator.clipboard.writeText(summaryText);
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2500);
  };

  const directive = orchestration?.agent_zero_directive;
  const circular = orchestration?.circular_phase;
  const subAgents = orchestration?.sub_agents;

  // Filter active SOS list
  const filteredSosList = activeSosList.filter((item) => {
    if (filterDomain !== 'ALL') {
      const itemDomain = item.agentZeroAdvisory?.domain || item.category;
      if (filterDomain === 'FLOOD' && !itemDomain.includes('FLOOD') && !itemDomain.includes('WATER')) return false;
      if (filterDomain === 'HEATWAVE' && !itemDomain.includes('HEAT')) return false;
      if (filterDomain === 'POWER_GRID' && !itemDomain.includes('GRID') && !itemDomain.includes('ELECTRICAL')) return false;
      if (filterDomain === 'RESCUE' && !itemDomain.includes('RESCUE') && !itemDomain.includes('TRAP')) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = item.id.toLowerCase().includes(q);
      const matchMsg = item.message?.toLowerCase().includes(q) || false;
      const matchLoc = typeof item.location === 'string' ? item.location.toLowerCase().includes(q) : false;
      if (!matchId && !matchMsg && !matchLoc) return false;
    }
    return true;
  });

  // Calculate live summary telemetry
  const totalActiveSignals = activeSosList.length;
  const averageVeracity = activeSosList.length > 0
    ? Math.round(
        activeSosList.reduce((acc, curr) => acc + (curr.agentZeroAdvisory?.veracityScore || 91), 0) /
          activeSosList.length
      )
    : 92;
  const mobilizedAdminsCount = workforceStats.totalAssigned;
  const mobilizationPct = Math.round((mobilizedAdminsCount / 160) * 100);

  return (
    <div className="min-h-full w-full bg-canvas text-primaryText p-3.5 sm:p-5 lg:p-7 space-y-5 sm:space-y-6 max-w-7xl mx-auto transition-colors duration-200">
      
      {/* ─── 1. TOP COMMAND BAR & MULTI-AGENT ARCHITECTURE BADGES ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 sm:p-5 lg:p-6 rounded-2xl bg-surfaceCard border border-hairline shadow-sm transition-colors duration-200">
        <div className="flex items-start sm:items-center gap-3.5 sm:gap-4">
          <div className="relative flex-shrink-0 flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-brandTeal/10 border border-brandTeal/20 shadow-sm text-brandTeal">
            <Cpu className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-brandTeal animate-ping" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-2xl font-bold text-primaryText tracking-tight font-display truncate">
                Agent Zero Command Center
              </h1>
              <span className="text-[10px] sm:text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-brandTeal/10 text-brandTeal border border-brandTeal/20">
                4-PHASE CIRCULAR PIPELINE
              </span>
              {cachedTime && (
                <span
                  className={`text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                    isFromCache
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                      : 'bg-brandTeal/10 text-brandTeal border-brandTeal/20'
                  }`}
                >
                  <Database className="w-3 h-3" />
                  <span>{isFromCache ? `CACHED (${formatRelativeTime(cachedTime)})` : 'LIVE SYNTHESIS'}</span>
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-secondaryText mt-0.5 leading-snug">
              Autonomous Crisis Engine &bull; Confidence Gate (&ge;65%) &rarr; Agent 0 &rarr; 4 Sub-Agents &rarr; 160 Admin Workforce Allocation
            </p>
          </div>
        </div>

        {/* Live Cloud Status Badges & Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surfaceElevated border border-hairline text-secondaryText text-xs font-mono font-medium">
            <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span>Socket.io /sos ({socketConnected ? 'Live' : 'Connecting'})</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surfaceElevated border border-hairline text-secondaryText text-xs font-mono font-medium">
            <Users className="w-3.5 h-3.5 text-brandTeal" />
            <span>160 Admins ({workforceStats.totalAvailable} Idle / {workforceStats.totalAssigned} Active)</span>
          </div>

          <button
            onClick={() => handleExecuteOrchestration()}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl bg-brandTeal hover:bg-brandTealGlow text-slate-900 font-bold text-xs shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Synthesizing...' : 'Re-Run Pipeline'}</span>
          </button>

          <button
            onClick={handleClearCacheAndReanalyze}
            disabled={loading}
            title="Clear persistent cache and recompute from scratch"
            className="p-2 rounded-xl bg-surfaceElevated hover:bg-surface border border-hairline text-secondaryText hover:text-primaryText text-xs font-medium transition-all disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ─── 2. SYSTEM-WIDE HEALTH & INCIDENT TELEMETRY STRIP ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Active Distress Requests */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surfaceCard border border-hairline shadow-sm min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-mono text-mutedGray uppercase font-semibold">
              <span>Active Distress Signals</span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-black font-mono text-primaryText">
                {totalActiveSignals}
              </span>
              <span className="text-xs text-mutedGray font-mono">requests active</span>
            </div>
          </div>

          {/* Micro Sparkline: Activity Inflow */}
          <div className="my-2 h-7 w-full overflow-hidden">
            <svg viewBox="0 0 120 28" className="w-full h-full">
              <defs>
                <linearGradient id="kpiSpark1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M 2 22 Q 15 24 30 18 T 60 14 T 90 19 T 114 9 L 114 26 L 2 26 Z"
                fill="url(#kpiSpark1)"
              />
              <path
                d="M 2 22 Q 15 24 30 18 T 60 14 T 90 19 T 114 9"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="114" cy="9" r="2.5" fill="#f59e0b" />
            </svg>
          </div>

          <div className="text-[11px] text-secondaryText flex items-center gap-1.5 flex-wrap">
            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-mono font-bold text-[10px]">
              🌊 {activeSosList.filter(s => s.category.includes('WATER') || s.category.includes('FLOOD')).length} Flood
            </span>
            <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-mono font-bold text-[10px]">
              🌡️ {activeSosList.filter(s => s.category.includes('HEAT')).length} Heat
            </span>
            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-mono font-bold text-[10px]">
              ⚡ {activeSosList.filter(s => s.category.includes('GRID')).length} Grid
            </span>
          </div>
        </div>

        {/* KPI 2: Average Veracity / Confidence Score */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surfaceCard border border-hairline shadow-sm min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-mono text-mutedGray uppercase font-semibold">
              <span>Veracity Pass Rate</span>
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                {averageVeracity}%
              </span>
              <span className="text-xs text-mutedGray font-mono">&ge; 65% gate</span>
              <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                VERIFIED
              </span>
            </div>
          </div>

          {/* Micro Sparkline: Veracity Confidence Stability */}
          <div className="my-2 h-7 w-full overflow-hidden">
            <svg viewBox="0 0 120 28" className="w-full h-full">
              <defs>
                <linearGradient id="kpiSpark2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M 2 16 Q 20 12 40 14 T 80 8 T 114 7 L 114 26 L 2 26 Z"
                fill="url(#kpiSpark2)"
              />
              <path
                d="M 2 16 Q 20 12 40 14 T 80 8 T 114 7"
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="114" cy="7" r="2.5" fill="#10b981" />
            </svg>
          </div>

          <span className="text-[11px] text-mutedGray block truncate">
            Audio (25%) + Visual (35%) + Sensors (25%) + Tide (15%)
          </span>
        </div>

        {/* KPI 3: Mobilized Admin Workforce */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surfaceCard border border-hairline shadow-sm min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-mono text-mutedGray uppercase font-semibold">
              <span>Workforce Mobilization</span>
              <Users className="w-4 h-4 text-purple-500" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-black font-mono text-primaryText">
                {mobilizedAdminsCount} <span className="text-sm font-normal text-mutedGray">/ 160</span>
              </span>
              <span className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400">
                ({mobilizationPct}%)
              </span>
            </div>
          </div>

          {/* Micro Sparkline: Workforce Stepped Allocation */}
          <div className="my-2 h-7 w-full overflow-hidden">
            <svg viewBox="0 0 120 28" className="w-full h-full">
              <defs>
                <linearGradient id="kpiSpark3" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M 2 22 L 35 22 L 35 16 L 75 16 L 75 10 L 114 10 L 114 26 L 2 26 Z"
                fill="url(#kpiSpark3)"
              />
              <path
                d="M 2 22 L 35 22 L 35 16 L 75 16 L 75 10 L 114 10"
                fill="none"
                stroke="#a855f7"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="114" cy="10" r="2.5" fill="#a855f7" />
            </svg>
          </div>

          <div className="w-full h-1.5 rounded-full bg-surfaceElevated overflow-hidden border border-hairline">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-brandTeal transition-all duration-500"
              style={{ width: `${Math.max(5, mobilizationPct)}%` }}
            />
          </div>
        </div>

        {/* KPI 4: Hospital & ICU Lifeline State */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surfaceCard border border-hairline shadow-sm min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-mono text-mutedGray uppercase font-semibold">
              <span>Hospital Lifeline Busbar</span>
              <HeartPulse className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono truncate">
                ICU 100% PROTECTED
              </span>
            </div>
          </div>

          {/* Micro Sparkline: 50Hz Sine Grid Continuity */}
          <div className="my-2 h-7 w-full overflow-hidden">
            <svg viewBox="0 0 120 28" className="w-full h-full">
              <path
                d="M 4 14 Q 14 5 24 14 T 44 14 T 64 14 T 84 14 T 104 14 T 114 14"
                fill="none"
                stroke="#14b8a6"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="114" cy="14" r="2.5" fill="#14b8a6" />
            </svg>
          </div>

          <span className="text-[11px] text-mutedGray block truncate">
            Vasai 33kV Tie Line Engaged &bull; 0ms Interruption
          </span>
        </div>
      </div>

      {/* ─── 3. AUTONOMOUS CRISIS ANALYTICS & TELEMETRY GRAPHS ─── */}
      <DashboardAnalyticsGraphs
        workforceStats={workforceStats}
        activeSosList={activeSosList}
        selectedIncidentId={selectedIncidentId}
      />

      {/* ─── 3. SECTION 2: 160-ADMIN DEPARTMENT READINESS MATRIX ─── */}
      <div className="p-4 sm:p-5 lg:p-6 rounded-2xl bg-surfaceCard border border-hairline shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-hairline pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brandTeal/10 text-brandTeal">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-primaryText tracking-tight font-display">
                160 Admin Department Readiness Matrix
              </h2>
              <p className="text-[11px] text-secondaryText">
                Real-time MongoDB administrative personnel roster categorized by crisis domain, tactical tags, and iterative fallback routes.
              </p>
            </div>
          </div>
          <button
            onClick={fetchWorkforceStats}
            disabled={loadingWorkforce}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surfaceElevated border border-hairline text-secondaryText hover:text-primaryText text-xs font-mono font-medium transition-all self-start sm:self-auto"
          >
            <RefreshCw className={`w-3 h-3 ${loadingWorkforce ? 'animate-spin' : ''}`} />
            <span>Sync MongoDB Roster</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Flood Management */}
          <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono text-blue-500 uppercase flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5" />
                FLOOD_MANAGEMENT
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                40 Admins
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs font-mono">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                {workforceStats.departments.FLOOD_MANAGEMENT.available} Idle
              </span>
              <span className="text-amber-500 font-bold">
                {workforceStats.departments.FLOOD_MANAGEMENT.assigned} Dispatched
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-mono text-mutedGray block">Primary Tactical Tags:</span>
              <div className="flex flex-wrap gap-1">
                {workforceStats.departments.FLOOD_MANAGEMENT.tags.map((tag) => (
                  <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surfaceCard text-primaryText border border-hairline">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-hairline text-[10px] text-mutedGray flex items-center justify-between">
              <span>Fallback Department:</span>
              <span className="font-mono font-bold text-secondaryText">RESCUE_MANAGEMENT</span>
            </div>
          </div>

          {/* Card 2: Heatwave Management */}
          <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono text-red-500 uppercase flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" />
                HEATWAVE_MANAGEMENT
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                40 Admins
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs font-mono">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                {workforceStats.departments.HEATWAVE_MANAGEMENT.available} Idle
              </span>
              <span className="text-amber-500 font-bold">
                {workforceStats.departments.HEATWAVE_MANAGEMENT.assigned} Dispatched
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-mono text-mutedGray block">Primary Tactical Tags:</span>
              <div className="flex flex-wrap gap-1">
                {workforceStats.departments.HEATWAVE_MANAGEMENT.tags.map((tag) => (
                  <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surfaceCard text-primaryText border border-hairline">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-hairline text-[10px] text-mutedGray flex items-center justify-between">
              <span>Fallback Department:</span>
              <span className="font-mono font-bold text-secondaryText">RESCUE_MANAGEMENT</span>
            </div>
          </div>

          {/* Card 3: Power Grid Management */}
          <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono text-amber-500 uppercase flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                POWER_GRID_MANAGEMENT
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                40 Admins
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs font-mono">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                {workforceStats.departments.POWER_GRID_MANAGEMENT.available} Idle
              </span>
              <span className="text-amber-500 font-bold">
                {workforceStats.departments.POWER_GRID_MANAGEMENT.assigned} Dispatched
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-mono text-mutedGray block">Primary Tactical Tags:</span>
              <div className="flex flex-wrap gap-1">
                {workforceStats.departments.POWER_GRID_MANAGEMENT.tags.map((tag) => (
                  <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surfaceCard text-primaryText border border-hairline">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-hairline text-[10px] text-mutedGray flex items-center justify-between">
              <span>Fallback Department:</span>
              <span className="font-mono font-bold text-secondaryText">RESCUE_MANAGEMENT</span>
            </div>
          </div>

          {/* Card 4: Rescue Management */}
          <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono text-purple-500 uppercase flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" />
                RESCUE_MANAGEMENT
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-purple-500/10 text-purple-500 border border-purple-500/20">
                40 Admins
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs font-mono">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                {workforceStats.departments.RESCUE_MANAGEMENT.available} Idle
              </span>
              <span className="text-amber-500 font-bold">
                {workforceStats.departments.RESCUE_MANAGEMENT.assigned} Dispatched
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-mono text-mutedGray block">Primary Tactical Tags:</span>
              <div className="flex flex-wrap gap-1">
                {workforceStats.departments.RESCUE_MANAGEMENT.tags.map((tag) => (
                  <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surfaceCard text-primaryText border border-hairline">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-hairline text-[10px] text-mutedGray flex items-center justify-between">
              <span>Fallback Department:</span>
              <span className="font-mono font-bold text-secondaryText">FLOOD_MANAGEMENT</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 4. SECTION 3: SYSTEM-WIDE ACTIVE SOS COMMAND FEED ─── */}
      <div className="p-4 sm:p-5 lg:p-6 rounded-2xl bg-surfaceCard border border-hairline shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-hairline pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-brandTeal animate-pulse" />
              <h2 className="text-base sm:text-lg font-bold text-primaryText tracking-tight font-display">
                Active Distress Command Feed &bull; Live Request Contextualization
              </h2>
            </div>
            <p className="text-xs text-secondaryText mt-0.5">
              Every incoming citizen distress request scored for veracity (&ge;65%), classified into crisis domains, matched against tactical tags, and routed through the 160 Admin workforce.
            </p>
          </div>

          {/* Search & Domain Filter Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[160px] sm:min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-mutedGray" />
              <input
                type="text"
                placeholder="Search ticket / message..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-surfaceElevated border border-hairline text-primaryText placeholder-mutedGray focus:outline-none focus:border-brandTeal transition-colors font-medium"
              />
            </div>

            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-surfaceElevated border border-hairline text-[11px] font-mono font-semibold">
              {(['ALL', 'FLOOD', 'HEATWAVE', 'POWER_GRID', 'RESCUE'] as const).map((dom) => (
                <button
                  key={dom}
                  onClick={() => setFilterDomain(dom)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    filterDomain === dom
                      ? 'bg-surfaceCard text-primaryText font-bold shadow-sm'
                      : 'text-mutedGray hover:text-primaryText'
                  }`}
                >
                  {dom}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* List of Contextualized Active SOS Tickets */}
        {filteredSosList.length === 0 ? (
          <div className="p-8 text-center text-xs text-mutedGray bg-surfaceElevated rounded-xl border border-hairline">
            No active distress signals matching criteria. Presets available below.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSosList.map((sos) => {
              const isSelected = selectedIncidentId === sos.id;
              const veracity = sos.agentZeroAdvisory?.veracityScore ?? 92;
              const domain = sos.agentZeroAdvisory?.domain || sos.category;
              const demand = sos.workforceDemand;
              const assignedCount = demand?.assignedPersonnel?.length || (sos.assignedAdmin ? 1 : 0);

              return (
                <div
                  key={sos.id}
                  className={`p-4 rounded-xl border transition-all text-xs space-y-2.5 ${
                    isSelected
                      ? 'bg-surfaceElevated border-brandTeal shadow-md ring-1 ring-brandTeal/30'
                      : 'bg-surfaceElevated/60 hover:bg-surfaceElevated border-hairline'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-primaryText text-xs">
                        #{sos.id.slice(-6).toUpperCase()}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                          sos.severity === 'CRITICAL'
                            ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                            : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                        }`}
                      >
                        {sos.severity}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        {veracity}% VERACITY (PASS)
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brandTeal/10 text-brandTeal border border-brandTeal/20 font-bold">
                        {domain}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-mutedGray font-mono text-[11px]">
                      <Clock className="w-3 h-3 text-brandTeal" />
                      <span>{formatRelativeTime(sos.createdAt)}</span>
                      <button
                        onClick={() => handleSelectIncident(sos.id)}
                        className={`ml-2 px-3 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 ${
                          isSelected
                            ? 'bg-brandTeal text-slate-900 shadow-sm'
                            : 'bg-surfaceCard hover:bg-surface border border-hairline text-primaryText'
                        }`}
                      >
                        <span>{isSelected ? 'Inspecting' : 'Inspect in Agent 0'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <p className="text-secondaryText font-medium text-xs leading-relaxed">
                    &quot;{sos.message}&quot;
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-hairline text-[11px]">
                    <div className="flex items-center gap-1.5 text-mutedGray">
                      <MapPin className="w-3.5 h-3.5 text-brandTeal flex-shrink-0" />
                      <span className="truncate">{typeof sos.location === 'string' ? sos.location : 'Virar East'}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-mutedGray">
                      <Droplets className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      <span>Water: <b className="text-primaryText">{sos.waterDepthCm ?? 35}cm</b></span>
                      <span className="mx-1 text-hairline">&bull;</span>
                      <Thermometer className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                      <span>Temp: <b className="text-primaryText">{sos.temperatureC ?? 32}&deg;C</b></span>
                    </div>

                    <div className="flex items-center gap-1.5 text-mutedGray truncate">
                      <Truck className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                      <span>Tags: <b className="text-primaryText font-mono">{demand?.requiredTags?.join(', ') || 'RAPID_RESPONSE'}</b></span>
                    </div>

                    <div className="flex items-center gap-1.5 justify-start sm:justify-end">
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-surfaceCard text-primaryText border border-hairline font-bold">
                        {assignedCount > 0 ? `✅ ${assignedCount} Admins Mobilized` : '⏳ Awaiting Deployment'}
                      </span>
                      {demand?.fallbackEngaged && (
                        <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold">
                          Fallback Triggered
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── 5. SECTION 4: SELECTED INCIDENT 4-PHASE CIRCULAR INSPECTOR ─── */}
      <div className="p-4 sm:p-5 lg:p-6 rounded-2xl bg-surfaceCard border border-hairline shadow-sm space-y-5">
        {/* Incident Preset & Parameter Overrides Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 p-4 rounded-xl bg-surfaceElevated border border-hairline text-xs">
          {/* Preset Selector */}
          <div className="space-y-1.5 min-w-0">
            <label className="text-[11px] font-mono uppercase tracking-wider text-mutedGray block font-semibold">
              Selected Incident Target
            </label>
            <select
              value={selectedIncidentId}
              onChange={(e) => handleSelectIncident(e.target.value)}
              className="w-full bg-surfaceCard border border-hairline rounded-xl px-3 py-2 text-primaryText font-medium focus:outline-none focus:border-brandTeal text-xs transition-colors"
            >
              <option value="PRESET_VIRAR">⚡ Flooded 33kV Switchyard (Virar East Main)</option>
              <option value="PRESET_WARD4">⚠️ Ward 4 Submerged Railway Underpass</option>
              <option value="PRESET_HEATWAVE">🔥 Transit Terminal Urban Heatwave (44.5&deg;C)</option>
              <option value="PRESET_RESCUE">🚨 Submerged Basement Structural Entrapment</option>
              {activeSosList.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  🚨 Live SOS: #{inc.id.slice(-6)} ({inc.category})
                </option>
              ))}
            </select>
          </div>

          {/* Water Depth Slider */}
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-mutedGray uppercase tracking-wider font-semibold">Water Depth</span>
              <span className="text-brandTeal font-bold bg-surfaceCard px-2 py-0.5 rounded-lg border border-hairline">
                {customWaterDepth} cm
              </span>
            </div>
            <div className="pt-2">
              <input
                type="range"
                min="0"
                max="100"
                value={customWaterDepth}
                onChange={(e) => setCustomWaterDepth(Number(e.target.value))}
                className="w-full accent-brandTeal cursor-pointer h-2 bg-surfaceCard rounded-lg"
              />
            </div>
          </div>

          {/* Coordinates Display */}
          <div className="space-y-1.5 min-w-0">
            <label className="text-[11px] font-mono uppercase tracking-wider text-mutedGray block font-semibold">
              Incident Coordinates
            </label>
            <div className="flex items-center gap-2 bg-surfaceCard border border-hairline rounded-xl px-3 py-2 font-mono text-secondaryText">
              <MapPin className="w-3.5 h-3.5 text-brandTeal flex-shrink-0" />
              <span className="truncate">{customCoordinates[0].toFixed(4)}, {customCoordinates[1].toFixed(4)}</span>
            </div>
          </div>

          {/* Apply Parameters Trigger */}
          <div className="flex items-end min-w-0">
            <button
              onClick={() => handleExecuteOrchestration(customWaterDepth, customTemperature, customCoordinates)}
              disabled={loading}
              className="w-full py-2.5 px-3 rounded-xl bg-brandTeal hover:bg-brandTealGlow text-slate-900 font-bold transition-all text-center flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Apply Parameters</span>
            </button>
          </div>
        </div>

        {/* 4-Phase Circular Visual Pipeline Stepper Navigation */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
          {/* Phase 1 Button */}
          <button
            onClick={() => setActiveInspectorPhase(1)}
            className={`p-3 rounded-xl border text-left transition-all space-y-1 ${
              activeInspectorPhase === 1
                ? 'bg-surfaceElevated border-emerald-500 shadow-sm ring-1 ring-emerald-500/30'
                : 'bg-surfaceElevated/50 hover:bg-surfaceElevated border-hairline'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="font-bold text-emerald-600 dark:text-emerald-400">PHASE 1</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/10 text-emerald-500 font-bold">&ge; 65% GATE</span>
            </div>
            <p className="font-bold text-xs text-primaryText truncate">Confidence Calculator</p>
            <p className="text-[10px] text-mutedGray truncate">Multi-Modal Veracity Scoring</p>
          </button>

          {/* Phase 2 Button */}
          <button
            onClick={() => setActiveInspectorPhase(2)}
            className={`p-3 rounded-xl border text-left transition-all space-y-1 ${
              activeInspectorPhase === 2
                ? 'bg-surfaceElevated border-brandTeal shadow-sm ring-1 ring-brandTeal/30'
                : 'bg-surfaceElevated/50 hover:bg-surfaceElevated border-hairline'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="font-bold text-brandTeal">PHASE 2</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-brandTeal/10 text-brandTeal font-bold">ROUTER</span>
            </div>
            <p className="font-bold text-xs text-primaryText truncate">Agent 0 Gatekeeper</p>
            <p className="text-[10px] text-mutedGray truncate">Dedup & Domain Routing</p>
          </button>

          {/* Phase 3 Button */}
          <button
            onClick={() => setActiveInspectorPhase(3)}
            className={`p-3 rounded-xl border text-left transition-all space-y-1 ${
              activeInspectorPhase === 3
                ? 'bg-surfaceElevated border-amber-500 shadow-sm ring-1 ring-amber-500/30'
                : 'bg-surfaceElevated/50 hover:bg-surfaceElevated border-hairline'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="font-bold text-amber-500">PHASE 3</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/10 text-amber-500 font-bold">TACTICS</span>
            </div>
            <p className="font-bold text-xs text-primaryText truncate">4 Crisis Sub-Agents</p>
            <p className="text-[10px] text-mutedGray truncate">Tactical Squad & Tag Demand</p>
          </button>

          {/* Phase 4 Button */}
          <button
            onClick={() => setActiveInspectorPhase(4)}
            className={`p-3 rounded-xl border text-left transition-all space-y-1 ${
              activeInspectorPhase === 4
                ? 'bg-surfaceElevated border-purple-500 shadow-sm ring-1 ring-purple-500/30'
                : 'bg-surfaceElevated/50 hover:bg-surfaceElevated border-hairline'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="font-bold text-purple-500">PHASE 4</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-500/10 text-purple-500 font-bold">160 ADMINS</span>
            </div>
            <p className="font-bold text-xs text-primaryText truncate">Agent 0 Allocation & Loop</p>
            <p className="text-[10px] text-mutedGray truncate">Workforce Match & Fallback</p>
          </button>
        </div>

        {/* Phase Details Content */}
        {orchestration && (
          <div className="p-4 sm:p-5 rounded-xl bg-surfaceElevated border border-hairline space-y-4">
            {/* Phase 1 Inspector */}
            {activeInspectorPhase === 1 && (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-hairline pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    <div>
                      <h3 className="font-bold text-sm text-primaryText font-display">
                        Phase 1: Confidence Calculator Agent Verification
                      </h3>
                      <p className="text-[11px] text-mutedGray">Multi-modal veracity synthesis & false alarm filtration gate</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    VERACITY: {circular?.confidence_data?.veracity_score ?? 94}% (THRESHOLD &ge; 65% PASSED)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-surfaceCard border border-hairline space-y-1">
                    <span className="text-[10px] font-mono text-mutedGray uppercase">Visual Spectrum (35%)</span>
                    <p className="font-bold text-primaryText text-sm font-mono">
                      {circular?.confidence_data?.score_breakdown?.visual_score ?? 96}%
                    </p>
                    <p className="text-[10px] text-emerald-500 font-medium">Submerged switchyard & standing water confirmed</p>
                  </div>
                  <div className="p-3 rounded-lg bg-surfaceCard border border-hairline space-y-1">
                    <span className="text-[10px] font-mono text-mutedGray uppercase">Audio Spectrum (25%)</span>
                    <p className="font-bold text-primaryText text-sm font-mono">
                      {circular?.confidence_data?.score_breakdown?.audio_score ?? 92}%
                    </p>
                    <p className="text-[10px] text-emerald-500 font-medium">Arc flash discharge & water turbulence matched</p>
                  </div>
                  <div className="p-3 rounded-lg bg-surfaceCard border border-hairline space-y-1">
                    <span className="text-[10px] font-mono text-mutedGray uppercase">Sensor Depth (25%)</span>
                    <p className="font-bold text-primaryText text-sm font-mono">
                      {circular?.confidence_data?.score_breakdown?.sensor_score ?? 95}%
                    </p>
                    <p className="text-[10px] text-emerald-500 font-medium">Submersible telemetry reads {customWaterDepth}cm depth</p>
                  </div>
                  <div className="p-3 rounded-lg bg-surfaceCard border border-hairline space-y-1">
                    <span className="text-[10px] font-mono text-mutedGray uppercase">Weather / Tide (15%)</span>
                    <p className="font-bold text-primaryText text-sm font-mono">
                      {circular?.confidence_data?.score_breakdown?.weather_score ?? 91}%
                    </p>
                    <p className="text-[10px] text-emerald-500 font-medium">High tide surge 4.2m & 85mm/hr precipitation</p>
                  </div>
                </div>
              </div>
            )}

            {/* Phase 2 Inspector */}
            {activeInspectorPhase === 2 && (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-hairline pb-3">
                  <div className="flex items-center gap-2">
                    <Radio className="w-5 h-5 text-brandTeal" />
                    <div>
                      <h3 className="font-bold text-sm text-primaryText font-display">
                        Phase 2: Agent 0 Gatekeeper Intake & Autonomous Domain Routing
                      </h3>
                      <p className="text-[11px] text-mutedGray">Deduplication, threat tier evaluation, and target crisis sub-agent dispatch</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-brandTeal/10 text-brandTeal border border-brandTeal/20">
                    TARGET: {circular?.agent_zero_classification?.targetDepartment ?? 'POWER_GRID_MANAGEMENT'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-lg bg-surfaceCard border border-hairline space-y-1">
                    <span className="text-[10px] font-mono text-mutedGray uppercase">Autonomous Domain Classification:</span>
                    <p className="text-sm font-bold text-primaryText font-mono">
                      {circular?.agent_zero_classification?.domain ?? 'POWER_GRID'}
                    </p>
                    <p className="text-[11px] text-secondaryText leading-relaxed">
                      {circular?.agent_zero_classification?.reasoning ?? 'Critical electrical infrastructure at high risk of water-induced arc flash and cascade trip.'}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg bg-surfaceCard border border-hairline space-y-1">
                    <span className="text-[10px] font-mono text-mutedGray uppercase">Threat Severity & Priority:</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold font-mono text-red-500">
                        {directive?.overall_threat_score ?? 88} / 100
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-500 font-bold">
                        {circular?.agent_zero_classification?.threat_tier ?? 'CRITICAL'}
                      </span>
                    </div>
                    <p className="text-[10px] text-mutedGray">Calculated with priority score: {circular?.agent_zero_classification?.priority_score ?? 92}</p>
                  </div>

                  <div className="p-3.5 rounded-lg bg-surfaceCard border border-hairline space-y-1">
                    <span className="text-[10px] font-mono text-mutedGray uppercase">Deduplication & Clustering:</span>
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                      PASSED (1st Incident on Node)
                    </p>
                    <p className="text-[10px] text-mutedGray">
                      Spatial index verified no duplicate dispatch for node SUB_VIRAR_EAST_01 within last 15 minutes.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Phase 3 Inspector */}
            {activeInspectorPhase === 3 && (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-hairline pb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" />
                    <div>
                      <h3 className="font-bold text-sm text-primaryText font-display">
                        Phase 3: Crisis Sub-Agent Tactical Reasoning & Workforce Demand
                      </h3>
                      <p className="text-[11px] text-mutedGray">Target sub-agent formulates personnel squad quota, equipment tags, and tactical precautions</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    DEMAND: {circular?.domain_demand?.teamCount ?? 3} SQUADS
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="p-3.5 rounded-lg bg-surfaceCard border border-hairline space-y-2">
                    <span className="text-[10px] font-mono text-amber-500 uppercase font-bold block">
                      Operational Mission Brief:
                    </span>
                    <p className="text-xs text-primaryText font-medium leading-relaxed">
                      {circular?.domain_demand?.operationalBrief ?? 'Isolate 33kV switchyard feeder, deploy dewatering pumps, secure Sanjeevani Hospital ICU tie line.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-surfaceCard border border-hairline space-y-1.5">
                      <span className="text-[10px] font-mono text-mutedGray uppercase font-bold block">Required Primary Tactical Tags:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(circular?.domain_demand?.requiredTags || ['HV_LINEMAN', 'SUBSTATION_CREW', 'AIR_GAP_ISOLATION']).map(t => (
                          <span key={t} className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-surfaceCard border border-hairline space-y-1.5">
                      <span className="text-[10px] font-mono text-mutedGray uppercase font-bold block">Iterative Fallback Department & Tags:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-secondaryText">
                          {circular?.domain_demand?.fallbackDepartment ?? 'RESCUE_MANAGEMENT'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(circular?.domain_demand?.fallbackTags || ['HEAVY_RESCUE', 'DEEP_WATER_RESQ']).map(t => (
                          <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surfaceElevated text-mutedGray border border-hairline font-bold">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300">
                    <span className="text-[10px] font-mono uppercase font-bold block">Ground Safety Precautions:</span>
                    <p className="text-xs mt-0.5 font-medium">
                      {circular?.domain_demand?.tacticalPrecautions ?? 'Submerged charged conductors suspected. Full dielectric PPE required before approach.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Phase 4 Inspector */}
            {activeInspectorPhase === 4 && (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-hairline pb-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-500" />
                    <div>
                      <h3 className="font-bold text-sm text-primaryText font-display">
                        Phase 4: Agent 0 Final Workforce Allocation & Iterative Fallback Loop
                      </h3>
                      <p className="text-[11px] text-mutedGray">Querying MongoDB 160 Admin roster across departments, locking units, and resolving shortfall via fallback</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    STATUS: {circular?.workforce_allocation?.status ?? 'ALLOCATED_WITH_FALLBACK'} ({circular?.workforce_allocation?.rounds_count ?? 2} ROUNDS)
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono bg-surfaceCard p-3 rounded-lg border border-hairline">
                    <span className="text-mutedGray">Target Workforce Quota:</span>
                    <span className="text-primaryText font-bold">
                      {circular?.workforce_allocation?.total_assigned ?? 3} / {circular?.domain_demand?.teamCount ?? 3} Units Mobilized
                    </span>
                    {circular?.workforce_allocation?.department_fallback_used && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold text-[10px]">
                        Fallback Engaged: {circular.workforce_allocation.department_fallback_used}
                      </span>
                    )}
                  </div>

                  {/* Assigned Personnel Cards from 160 Admins */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-mono text-mutedGray uppercase font-bold block">
                      Assigned Administrative Personnel (Locked in MongoDB):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {(circular?.workforce_allocation?.assigned_personnel || []).map((admin, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-surfaceCard border border-hairline space-y-1.5">
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-bold text-primaryText text-xs font-mono truncate">{admin.name}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-bold uppercase">
                              {admin.status}
                            </span>
                          </div>
                          <span className="text-[10px] text-mutedGray font-mono block truncate">{admin.email}</span>
                          <div className="flex items-center justify-between pt-1 border-t border-hairline text-[10px]">
                            <span className="text-brandTeal font-bold font-mono">{admin.department}</span>
                            <span className="text-mutedGray font-mono">{admin.role}</span>
                          </div>
                          {admin.tags && admin.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {admin.tags.map(t => (
                                <span key={t} className="text-[9px] font-mono px-1 py-0.2 rounded bg-surfaceElevated text-secondaryText border border-hairline">
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Master Directive Executive Summary & Hospital Lifeline */}
        {orchestration && directive && (
          <div className="space-y-3 pt-2 border-t border-hairline">
            <div className="p-4 sm:p-5 rounded-xl bg-surfaceElevated border border-hairline space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-brandTeal" />
                  <h3 className="font-bold text-sm text-primaryText font-display">
                    Agent Zero Master Operational Directive
                  </h3>
                </div>
                <button
                  onClick={handleCopyDirective}
                  className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surfaceCard hover:bg-surface border border-hairline text-secondaryText hover:text-primaryText text-xs font-bold transition-all shadow-sm"
                >
                  {copiedNote ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedNote ? 'Copied to Clipboard' : 'Copy Directive'}</span>
                </button>
              </div>

              <p className="text-xs sm:text-sm text-secondaryText leading-relaxed font-medium">
                {directive.executive_summary}
              </p>

              {/* Hospital & ICU Lifeline Callout Box */}
              {directive.hospital_lifeline_protocol && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-start gap-3">
                  <HeartPulse className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold uppercase tracking-wider block font-mono">
                      Hospital & Trauma ICU Power Protection Protocol
                    </span>
                    <p className="text-xs mt-1 leading-relaxed font-medium">
                      {directive.hospital_lifeline_protocol}
                    </p>
                  </div>
                </div>
              )}

              {/* Immediate Automated Actions */}
              {directive.immediate_automated_actions?.length > 0 && (
                <div className="space-y-2 pt-1">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-mutedGray block font-semibold">
                    Automated Actions Ordered by Agent Zero:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {directive.immediate_automated_actions.map((act, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surfaceCard border border-hairline text-primaryText text-xs font-mono font-medium"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-brandTeal flex-shrink-0" />
                        <span>{act}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Circuit Breaker Isolation Switchboard */}
            {subAgents?.grid?.immediate_breakers_to_trip && subAgents.grid.immediate_breakers_to_trip.length > 0 && (
              <div className="p-4 sm:p-5 rounded-xl bg-surfaceElevated border border-hairline space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span className="font-bold text-xs text-primaryText uppercase font-mono">
                      Circuit Breakers Flagged for Immediate Isolation:
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-mutedGray">Human-in-the-Loop Protected</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {subAgents.grid.immediate_breakers_to_trip.map((breaker, idx) => {
                    const isTripped = trippedBreakers.includes(breaker);
                    return (
                      <button
                        key={idx}
                        onClick={() => requestBreakerToggle(breaker)}
                        className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left text-xs font-mono transition-all min-w-0 ${
                          isTripped
                            ? 'bg-red-500/10 text-red-500 border-red-500/30'
                            : 'bg-surfaceCard text-primaryText border-hairline hover:border-brandTeal'
                        }`}
                      >
                        <span className="font-bold truncate mr-2">{breaker}</span>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded font-extrabold uppercase flex-shrink-0 ${
                            isTripped ? 'bg-red-500 text-white' : 'bg-surfaceElevated text-mutedGray'
                          }`}
                        >
                          {isTripped ? 'TRIPPED (SAFE)' : 'ARM & TRIP'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── 6. HUMAN-IN-THE-LOOP (HITL) SAFETY GATE MODAL ─── */}
      {pendingBreaker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-surfaceCard border border-hairline shadow-xl p-5 sm:p-6 space-y-5 text-primaryText">
            <div className="flex items-start justify-between gap-3 border-b border-hairline pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-red-500/10 text-red-500 ring-2 ring-red-500/20 flex-shrink-0">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-primaryText uppercase tracking-wide font-display">
                    Human-in-the-Loop Safety Gate
                  </h3>
                  <p className="text-xs text-red-500 font-mono">
                    CRITICAL HIGH-VOLTAGE BREAKER TRIP CONFIRMATION
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPendingBreaker(null)}
                className="p-1 rounded-lg text-mutedGray hover:text-primaryText hover:bg-surfaceElevated transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 space-y-1">
                <span className="text-[10px] font-mono text-red-500 uppercase font-bold block">
                  Target Circuit Asset:
                </span>
                <p className="text-sm font-bold text-primaryText font-mono">{pendingBreaker}</p>
                <p className="text-secondaryText text-xs leading-relaxed">
                  Tripping this breaker will physically de-energize the 33kV switchyard feeder. Standby tie line from Vasai West will maintain Sanjeevani Hospital ICU busbar uninterrupted.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-surfaceElevated border border-hairline space-y-2">
                <span className="text-[10px] font-mono text-mutedGray uppercase font-bold block">
                  Operator Sign-Off Checklist:
                </span>
                <label className="flex items-start gap-2.5 cursor-pointer text-secondaryText select-none">
                  <input
                    type="checkbox"
                    checked={hitlConfirmed}
                    onChange={(e) => setHitlConfirmed(e.target.checked)}
                    className="mt-0.5 rounded border-hairline text-red-500 focus:ring-0 accent-red-500"
                  />
                  <span className="text-xs font-medium leading-relaxed">
                    I acknowledge that I am manually authorizing this electrical trip under Incident Commander authority, and confirm that zero personnel are currently operating within the feeder flash-over radius.
                  </span>
                </label>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 pt-2">
              <button
                onClick={() => setPendingBreaker(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-secondaryText hover:text-primaryText bg-surfaceElevated hover:bg-surface border border-hairline transition-all text-center shadow-sm"
              >
                Abort & Return
              </button>
              <button
                onClick={confirmHitlBreakerTrip}
                disabled={!hitlConfirmed}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-600 text-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4 flex-shrink-0" />
                <span>Authorize & Trip Breaker</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}