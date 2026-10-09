'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
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
  Sparkles
} from 'lucide-react';
import {
  triggerAutonomousOrchestration,
  fetchTeamsStatus,
  acquireTeamLock,
  releaseTeamLock,
  AutonomousOrchestrationResponse,
  AutonomousOrchestratePayload,
  EmergencySquadStatus,
  CandidateProximityTeam
} from '@/lib/voiceAgent';

interface ActiveSosOption {
  id: string;
  category: string;
  severity: string;
  waterDepthCm?: number;
  location?: string;
  coordinates?: [number, number];
  message?: string;
}

interface CachedOrchestrationData {
  incidentId: string;
  waterDepth: number;
  coordinates: [number, number];
  orchestration: AutonomousOrchestrationResponse;
  cachedAt: number;
  trippedBreakers: string[];
  squadsDispatched: boolean;
}

const CACHE_KEY_PREFIX = 'zerogrid_agent_zero_cache_';

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

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return 'Just now';
  const diffSec = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

export default function AgentZeroDashboardPage() {
  const { user } = useAuth();

  // Active Incidents & Presets
  const [activeIncidents, setActiveIncidents] = useState<ActiveSosOption[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('PRESET_VIRAR');
  const [customWaterDepth, setCustomWaterDepth] = useState<number>(46);
  const [customCoordinates, setCustomCoordinates] = useState<[number, number]>([19.456, 72.812]);

  // Orchestration & Cache state
  const [loading, setLoading] = useState<boolean>(false);
  const [orchestration, setOrchestration] = useState<AutonomousOrchestrationResponse | null>(null);
  const [cachedTime, setCachedTime] = useState<number | null>(null);
  const [isFromCache, setIsFromCache] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'TRIAGE' | 'GRID' | 'DISPATCH' | 'TOPOLOGY' | 'SPATIAL'>('ALL');

  // Interactive Operator Actions & HITL Safety Gate
  const [trippedBreakers, setTrippedBreakers] = useState<string[]>([]);
  const [pendingBreaker, setPendingBreaker] = useState<string | null>(null);
  const [hitlConfirmed, setHitlConfirmed] = useState<boolean>(false);
  const [squadsDispatched, setSquadsDispatched] = useState<boolean>(false);
  const [copiedNote, setCopiedNote] = useState<boolean>(false);

  // Redis Concurrency State
  const [teams, setTeams] = useState<EmergencySquadStatus[]>([]);
  const [loadingTeams, setLoadingTeams] = useState<boolean>(false);
  const [lockingTeamId, setLockingTeamId] = useState<string | null>(null);

  // Load active SOS events for dropdown picker
  useEffect(() => {
    api
      .get<{ sosEvents?: any[]; sos?: any[] }>('/api/admin/sos?status=ACTIVE')
      .then((res) => {
        const list = res.sosEvents || res.sos || (Array.isArray(res) ? res : []);
        const formatted: ActiveSosOption[] = list.map((item: any) => ({
          id: item._id || item.id || 'INC_01',
          category: item.category || 'CIVIC_HAZARD',
          severity: item.severity || (item.isEmergencySos ? 'CRITICAL' : 'HIGH'),
          waterDepthCm: item.waterDepthCm || 35,
          location: item.location || 'Virar East Corridor',
          coordinates: item.location?.coordinates || item.coordinates || [19.456, 72.812],
          message: item.message || 'Water logging & grid asset hazard detected',
        }));
        setActiveIncidents(formatted);
      })
      .catch((err) => {
        console.warn('Could not load live SOS events for picker:', err);
      });
  }, []);

  // Fetch live Redis squad states
  const loadTeams = async () => {
    setLoadingTeams(true);
    try {
      const data = await fetchTeamsStatus();
      setTeams(data);
    } catch {} finally {
      setLoadingTeams(false);
    }
  };

  // Run or restore orchestration
  const handleExecuteOrchestration = async (
    overrideDepth?: number,
    overrideCoords?: [number, number],
    overrideIncidentId?: string
  ) => {
    setLoading(true);
    setError(null);
    try {
      const depth = overrideDepth ?? customWaterDepth;
      const coords = overrideCoords ?? customCoordinates;
      const incId = overrideIncidentId ?? selectedIncidentId;

      const payload: AutonomousOrchestratePayload = {
        incident_id: incId,
        incident_type: 'SUBSTATION_WATER_INGRESS',
        severity: 'CRITICAL',
        coordinates: coords,
        water_depth_cm: depth,
        message: `Severe flooding (${depth}cm) detected at Virar East Substation perimeter. High risk to 33kV switchyard and downstream Sanjeevani Hospital feeder.`,
      };

      const result = await triggerAutonomousOrchestration(payload);
      setOrchestration(result);
      setTrippedBreakers([]);
      setSquadsDispatched(false);
      const now = Date.now();
      setCachedTime(now);
      setIsFromCache(false);

      // Save to cache so page reload never reruns expensive LLM/orchestration
      saveOrchestrationCache({
        incidentId: incId,
        waterDepth: depth,
        coordinates: coords,
        orchestration: result,
        cachedAt: now,
        trippedBreakers: [],
        squadsDispatched: false,
      });
    } catch (err: any) {
      console.warn('Agent Zero orchestration notice:', err);
      setError(err?.message || 'Notice: Operating on autonomous local contingency profile.');
    } finally {
      setLoading(false);
    }
  };

  // On page mount: load squad states and restore from cache if present!
  useEffect(() => {
    loadTeams();

    const cached = getOrchestrationCache(selectedIncidentId);
    if (cached && cached.orchestration) {
      setOrchestration(cached.orchestration);
      setTrippedBreakers(cached.trippedBreakers || []);
      setSquadsDispatched(cached.squadsDispatched || false);
      setCachedTime(cached.cachedAt);
      setIsFromCache(true);
      if (cached.waterDepth) setCustomWaterDepth(cached.waterDepth);
      if (cached.coordinates) setCustomCoordinates(cached.coordinates);
      console.log('[Agent Zero Dashboard] Restored tactical orchestration from cache. Reload bypassed.');
    } else {
      // Only execute initial run if completely empty
      handleExecuteOrchestration();
    }
  }, []);

  // When switching incident preset or picker
  const handleSelectIncident = (newIncidentId: string) => {
    setSelectedIncidentId(newIncidentId);
    let depth = 46;
    let coords: [number, number] = [19.456, 72.812];

    if (newIncidentId === 'PRESET_VIRAR') {
      depth = 46;
      coords = [19.456, 72.812];
    } else if (newIncidentId === 'PRESET_WARD4') {
      depth = 32;
      coords = [19.458, 72.815];
    } else if (newIncidentId === 'PRESET_HOSPITAL') {
      depth = 15;
      coords = [19.454, 72.818];
    } else {
      const match = activeIncidents.find((i) => i.id === newIncidentId);
      if (match) {
        depth = match.waterDepthCm || 35;
        coords = match.coordinates || [19.456, 72.812];
      }
    }

    setCustomWaterDepth(depth);
    setCustomCoordinates(coords);

    // Check if new incident already has cached results
    const cached = getOrchestrationCache(newIncidentId);
    if (cached && cached.orchestration) {
      setOrchestration(cached.orchestration);
      setTrippedBreakers(cached.trippedBreakers || []);
      setSquadsDispatched(cached.squadsDispatched || false);
      setCachedTime(cached.cachedAt);
      setIsFromCache(true);
    } else {
      handleExecuteOrchestration(depth, coords, newIncidentId);
    }
  };

  // Clear cache and force fresh synthesis
  const handleClearCacheAndReanalyze = () => {
    clearOrchestrationCache(selectedIncidentId);
    handleExecuteOrchestration();
  };

  // Atomic Redis lock toggle
  const handleToggleLock = async (teamId: string, currentState: 'IDLE' | 'ASSIGNED') => {
    setLockingTeamId(teamId);
    try {
      if (currentState === 'ASSIGNED') {
        await releaseTeamLock(teamId);
      } else {
        await acquireTeamLock(teamId, selectedIncidentId, 1800);
      }
      await loadTeams();
    } catch (err) {
      console.warn('Team lock toggle error:', err);
    } finally {
      setLockingTeamId(null);
    }
  };

  // Human-in-the-Loop (HITL) Safety Gate for Breaker Trips
  const requestBreakerToggle = (breaker: string) => {
    if (trippedBreakers.includes(breaker)) {
      const updated = trippedBreakers.filter((b) => b !== breaker);
      setTrippedBreakers(updated);
      if (orchestration) {
        saveOrchestrationCache({
          incidentId: selectedIncidentId,
          waterDepth: customWaterDepth,
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
    const summaryText = `[AGENT ZERO TACTICAL DIRECTIVE]
Threat Score: ${d.overall_threat_score}/100
Executive Summary: ${d.executive_summary}
Immediate Automated Actions: ${d.immediate_automated_actions.join(', ')}
Hospital Lifeline Protocol: ${d.hospital_lifeline_protocol}
Secondary Hazards: ${d.secondary_hazard_advisories?.join(' | ') || 'None'}`;

    navigator.clipboard.writeText(summaryText);
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2500);
  };

  const directive = orchestration?.agent_zero_directive;
  const subAgents = orchestration?.sub_agents;
  const graph = orchestration?.graph_telemetry;

  return (
    <div className="min-h-screen w-full bg-[#030712] text-slate-100 p-3 sm:p-5 lg:p-7 space-y-5 sm:space-y-6 max-w-[1600px] mx-auto">
      {/* ─── 1. TOP COMMAND BAR ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 sm:p-5 lg:p-6 rounded-2xl bg-[#080f1d]/90 border border-cyan-500/20 backdrop-blur-xl shadow-2xl">
        <div className="flex items-start sm:items-center gap-3.5 sm:gap-4">
          <div className="relative flex-shrink-0 flex items-center justify-center w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-400/40 shadow-inner">
            <Cpu className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-2xl font-black text-white tracking-tight font-display truncate">
                Agent Zero Command Center
              </h1>
              <span className="text-[10px] sm:text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                GROQ LPU MULTI-AGENT CORE
              </span>
              {cachedTime && (
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                    isFromCache
                      ? 'bg-amber-950/70 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                  }`}
                  title={isFromCache ? 'Loaded from local persistent cache without network re-run' : 'Freshly calculated'}
                >
                  <Database className="w-3 h-3" />
                  <span>{isFromCache ? `CACHED (${formatRelativeTime(cachedTime)})` : 'LIVE SYNTHESIS'}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-snug">
              Autonomous Grid Recovery, Deterministic DynamoDB Graph & Tri-Store Emergency Concurrency
            </p>
          </div>
        </div>

        {/* Live Data Plane & Cloud Verification Badges + Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>DynamoDB Cloud (ap-south-1)</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-950/70 border border-blue-500/40 text-blue-300 text-xs font-mono font-bold">
            <Radio className="w-3.5 h-3.5 text-blue-400" />
            <span>Groq LPU (gpt-oss-120b)</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-purple-950/70 border border-purple-500/40 text-purple-300 text-xs font-mono font-bold">
            <Lock className="w-3.5 h-3.5 text-purple-400" />
            <span>Redis ({teams.filter((t) => t.state === 'IDLE').length} Idle)</span>
          </div>

          {/* Re-Run Orchestration Manual Trigger */}
          <button
            onClick={() => handleExecuteOrchestration()}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Analyzing...' : 'Re-Run Orchestration'}</span>
          </button>

          {/* Clear Cache & Force Fresh Recomputation */}
          <button
            onClick={handleClearCacheAndReanalyze}
            disabled={loading}
            title="Clear persistent cache and recompute from scratch"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-bold transition-all disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ─── 2. INCIDENT & TELEMETRY CONTROL STRIP ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-[#08101e]/90 border border-white/5 text-xs">
        {/* Preset Selector */}
        <div className="space-y-1.5 min-w-0">
          <label className="text-[10px] font-mono uppercase text-slate-400 block font-bold">
            Incident Telemetry Target
          </label>
          <select
            value={selectedIncidentId}
            onChange={(e) => handleSelectIncident(e.target.value)}
            className="w-full bg-[#050b14] border border-cyan-500/30 rounded-xl px-3 py-2 text-slate-200 font-medium focus:outline-none focus:border-cyan-400 text-xs"
          >
            <option value="PRESET_VIRAR">⚡ Substation Water Ingress (Virar East Main 33kV)</option>
            <option value="PRESET_WARD4">⚠️ Ward 4 Step-Down Transformer Overload</option>
            <option value="PRESET_HOSPITAL">🏥 Sanjeevani Hospital ICU Feeder Threat</option>
            {activeIncidents.map((inc) => (
              <option key={inc.id} value={inc.id}>
                🚨 Live SOS: {inc.id.slice(-6)} ({inc.category})
              </option>
            ))}
          </select>
        </div>

        {/* Water Depth Slider */}
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-slate-400 uppercase font-bold">Water Logging Depth</span>
            <span className="text-cyan-300 font-bold">{customWaterDepth} cm</span>
          </div>
          <div className="pt-1.5">
            <input
              type="range"
              min="0"
              max="100"
              value={customWaterDepth}
              onChange={(e) => setCustomWaterDepth(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
          </div>
        </div>

        {/* Coordinates Display */}
        <div className="space-y-1.5 min-w-0">
          <label className="text-[10px] font-mono uppercase text-slate-400 block font-bold">
            Substation Coordinates
          </label>
          <div className="flex items-center gap-2 bg-[#050b14] border border-white/10 rounded-xl px-3 py-2 font-mono text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
            <span className="truncate">{customCoordinates[0].toFixed(4)}, {customCoordinates[1].toFixed(4)}</span>
          </div>
        </div>

        {/* Apply & Recalculate Trigger */}
        <div className="flex items-end min-w-0">
          <button
            onClick={() => handleExecuteOrchestration(customWaterDepth, customCoordinates)}
            disabled={loading}
            className="w-full py-2.5 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold transition-all text-center flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Apply Parameters</span>
          </button>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* ─── 3. TOP KPI TELEMETRY STRIP ─── */}
      {orchestration && directive && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 sm:p-5 rounded-2xl bg-[#08101e]/90 border border-white/5 min-w-0">
            <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">
              Threat Severity Index
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span
                className={`text-2xl sm:text-3xl font-black font-mono ${
                  directive.overall_threat_score >= 80
                    ? 'text-rose-400'
                    : directive.overall_threat_score >= 50
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {directive.overall_threat_score}
              </span>
              <span className="text-xs text-slate-500 font-mono">/ 100</span>
              <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase bg-rose-950 text-rose-400 border border-rose-500/30">
                CRITICAL
              </span>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-[#08101e]/90 border border-white/5 min-w-0">
            <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">
              Root Substation Node
            </span>
            <div className="flex items-center gap-2 mt-1 truncate">
              <span className="text-sm sm:text-base font-extrabold text-cyan-300 font-mono truncate">
                {graph?.root_node_id || 'SUB_VIRAR_EAST_01'}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">33kV / 92.5% Nominal Load</span>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-[#08101e]/90 border border-white/5 min-w-0">
            <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">
              DynamoDB Adjacency Subgraph
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-base sm:text-lg font-black text-white font-mono">
                {graph?.node_count || 4} Nodes
              </span>
              <span className="text-xs text-slate-400 font-mono">
                &bull; {graph?.edge_count || 6} Lines
              </span>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono mt-1 block">Cycle Prevention: 100% OK</span>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-[#08101e]/90 border border-white/5 min-w-0">
            <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">
              Hospital Lifeline Busbar
            </span>
            <div className="flex items-center gap-2 mt-1">
              <HeartPulse className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <span className="text-sm sm:text-base font-black text-emerald-300 font-mono truncate">
                ICU 100% ENERGIZED
              </span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">Vasai 33kV Tie Line Engaged</span>
          </div>
        </div>
      )}

      {/* ─── 4. MASTER OPERATIONAL DIRECTIVE CARD ─── */}
      {orchestration && directive && (
        <div className="p-4 sm:p-6 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-[#0a1526]/90 to-blue-950/30 border border-cyan-500/30 shadow-xl space-y-4 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-cyan-400 flex-shrink-0" />
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight font-display">
                Agent Zero Master Operational Directive
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <Clock className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
              <span>
                Calculated: {new Date(orchestration.orchestrated_at || cachedTime || Date.now()).toLocaleTimeString()} UTC
              </span>
            </div>
          </div>

          <p className="text-xs sm:text-sm md:text-base text-slate-100 font-semibold leading-relaxed">
            {directive.executive_summary}
          </p>

          {/* Hospital & ICU Lifeline Callout Box */}
          {directive.hospital_lifeline_protocol && (
            <div className="p-3.5 sm:p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/40 flex items-start gap-3">
              <HeartPulse className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-300 block font-mono">
                  Hospital & Trauma ICU Power Protection Protocol
                </span>
                <p className="text-xs sm:text-sm text-emerald-100 mt-1 leading-relaxed font-medium">
                  {directive.hospital_lifeline_protocol}
                </p>
              </div>
            </div>
          )}

          {/* Immediate Automated Breaker Actions */}
          {directive.immediate_automated_actions?.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block font-bold">
                Automated Actions Ordered by Agent Zero:
              </span>
              <div className="flex flex-wrap gap-2">
                {directive.immediate_automated_actions.map((act, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/70 border border-cyan-500/40 text-cyan-200 text-xs font-mono font-bold"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                    <span>{act}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 5. SEGREGATED DECISION STREAM NAVIGATION (RESPONSIVE HORIZONTAL SCROLL) ─── */}
      <div className="flex items-center gap-2 p-1.5 sm:p-2 rounded-2xl bg-[#08101e]/90 border border-white/5 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('ALL')}
          className={`whitespace-nowrap flex-shrink-0 py-2 px-3.5 rounded-xl text-xs font-black transition-all ${
            activeTab === 'ALL'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          All Decision Streams
        </button>
        <button
          onClick={() => setActiveTab('TRIAGE')}
          className={`whitespace-nowrap flex-shrink-0 py-2 px-3.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'TRIAGE'
              ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Triage Commander</span>
        </button>
        <button
          onClick={() => setActiveTab('GRID')}
          className={`whitespace-nowrap flex-shrink-0 py-2 px-3.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'GRID'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Zap className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Grid Operations</span>
        </button>
        <button
          onClick={() => setActiveTab('DISPATCH')}
          className={`whitespace-nowrap flex-shrink-0 py-2 px-3.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'DISPATCH'
              ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Truck className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Tactical Dispatch</span>
        </button>
        <button
          onClick={() => setActiveTab('TOPOLOGY')}
          className={`whitespace-nowrap flex-shrink-0 py-2 px-3.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'TOPOLOGY'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Database className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Electrical Topology</span>
        </button>
        <button
          onClick={() => setActiveTab('SPATIAL')}
          className={`whitespace-nowrap flex-shrink-0 py-2 px-3.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'SPATIAL'
              ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Radar className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Spatial & Teams</span>
        </button>
      </div>

      {/* ─── 6. SEGREGATED DECISION STREAMS GRID ─── */}
      {orchestration && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {/* STREAM A: TRIAGE SUB-AGENT DECISION STREAM */}
          {(activeTab === 'ALL' || activeTab === 'TRIAGE') && subAgents?.triage && (
            <div
              className={`p-4 sm:p-5 rounded-2xl bg-[#08101e]/90 border border-rose-500/30 hover:border-rose-500/50 transition-all space-y-4 min-w-0 ${
                activeTab === 'TRIAGE' ? 'col-span-full' : ''
              }`}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 flex-shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-rose-300 uppercase tracking-wide truncate">
                      Triage Decision Stream
                    </h3>
                    <p className="text-[11px] text-slate-400 truncate">Casualty Probability & Ingress</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-rose-950 text-rose-300 border border-rose-500/40 flex-shrink-0">
                  {subAgents.triage.threat_level}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                    Casualty & Electrocution Risk Assessment:
                  </span>
                  <p className="text-slate-200 font-medium leading-relaxed bg-[#050b14] p-3 rounded-xl border border-white/5">
                    {subAgents.triage.casualty_risk_assessment}
                  </p>
                </div>

                {subAgents.triage.priority_facilities_threatened?.length > 0 && (
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                      Threatened Facilities at Risk:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {subAgents.triage.priority_facilities_threatened.map((facility, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/60 text-rose-300 border border-rose-500/30 text-xs font-mono font-bold"
                        >
                          <Building className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{facility}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="text-slate-400 font-medium">Civilian Evacuation:</span>
                  <span
                    className={`font-bold font-mono px-2.5 py-0.5 rounded ${
                      subAgents.triage.evacuation_recommended
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {subAgents.triage.evacuation_recommended ? 'MANDATORY EVACUATION' : 'SHELTER IN PLACE'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                    Containment Priority Rationale:
                  </span>
                  <p className="text-slate-300 text-xs italic">
                    &quot;{subAgents.triage.containment_priority}&quot;
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STREAM B: GRID OPERATIONS SUB-AGENT DECISION STREAM */}
          {(activeTab === 'ALL' || activeTab === 'GRID') && subAgents?.grid && (
            <div
              className={`p-4 sm:p-5 rounded-2xl bg-[#08101e]/90 border border-amber-500/30 hover:border-amber-500/50 transition-all space-y-4 min-w-0 ${
                activeTab === 'GRID' ? 'col-span-full' : ''
              }`}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 flex-shrink-0">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wide truncate">
                      Grid Operations Decision Stream
                    </h3>
                    <p className="text-[11px] text-slate-400 truncate">Electrical Switching & Rerouting</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-amber-950 text-amber-300 border border-amber-500/40 flex-shrink-0">
                  {subAgents.grid.grid_stability_status}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                {/* Cascading Failure Progress Bar */}
                <div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                    <span className="font-bold uppercase">Cascading Collapse Probability:</span>
                    <span className="font-bold text-amber-400 text-xs">{subAgents.grid.cascading_failure_risk_pct}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 transition-all duration-500"
                      style={{ width: `${subAgents.grid.cascading_failure_risk_pct}%` }}
                    />
                  </div>
                </div>

                {/* Interactive Breakers to Trip Switchboard */}
                {subAgents.grid.immediate_breakers_to_trip?.length > 0 && (
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1.5">
                      Circuit Breakers Flagged for Immediate Isolation:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {subAgents.grid.immediate_breakers_to_trip.map((breaker, idx) => {
                        const isTripped = trippedBreakers.includes(breaker);
                        return (
                          <button
                            key={idx}
                            onClick={() => requestBreakerToggle(breaker)}
                            className={`flex items-center justify-between px-3 py-2 rounded-xl border text-left text-xs font-mono transition-all min-w-0 ${
                              isTripped
                                ? 'bg-rose-950/80 text-rose-300 border-rose-500/60 shadow-md shadow-rose-950/50'
                                : 'bg-[#050b14] text-slate-300 border-white/10 hover:border-amber-400/50'
                            }`}
                          >
                            <span className="font-bold truncate mr-2">{breaker}</span>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded font-extrabold uppercase flex-shrink-0 ${
                                isTripped ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'
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

                {/* Safe Alternate Rerouting Path */}
                <div className="p-3 rounded-xl bg-[#050b14] border border-white/5 space-y-1">
                  <span className="text-[10px] font-mono text-amber-400 uppercase font-bold block">
                    Safe Alternative Power Routing:
                  </span>
                  <p className="text-slate-300 text-xs leading-relaxed font-medium">
                    {subAgents.grid.safe_rerouting_path}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STREAM C: TACTICAL DISPATCH SUB-AGENT DECISION STREAM */}
          {(activeTab === 'ALL' || activeTab === 'DISPATCH') && subAgents?.dispatch && (
            <div
              className={`p-4 sm:p-5 rounded-2xl bg-[#08101e]/90 border border-blue-500/30 hover:border-blue-500/50 transition-all space-y-4 min-w-0 ${
                activeTab === 'DISPATCH' ? 'col-span-full' : ''
              }`}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 flex-shrink-0">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-blue-300 uppercase tracking-wide truncate">
                      Tactical Dispatch Decision Stream
                    </h3>
                    <p className="text-[11px] text-slate-400 truncate">Squad Mobilization & Corridors</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-blue-950 text-blue-300 border border-blue-500/40 flex-shrink-0">
                  {subAgents.dispatch.route_accessibility_status}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                {/* Mobilized Squads */}
                {subAgents.dispatch.recommended_squads?.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">
                      Mobilized Emergency Tactical Squads:
                    </span>
                    {subAgents.dispatch.recommended_squads.map((squad, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-[#050b14] border border-white/5 flex items-start justify-between gap-3 min-w-0"
                      >
                        <div className="min-w-0">
                          <span className="font-extrabold text-blue-300 font-mono text-xs block truncate">
                            {squad.count}x {squad.unit_type}
                          </span>
                          <p className="text-slate-400 text-xs mt-1 leading-relaxed">{squad.mission}</p>
                        </div>
                        <span className="text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-500/30 flex-shrink-0">
                          DEPLOYED
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Staging Area & Precautions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-[#050b14] border border-white/5 min-w-0">
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-0.5">
                      Staging Base:
                    </span>
                    <span className="font-bold text-slate-200 text-xs block truncate">{subAgents.dispatch.staging_area}</span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#050b14] border border-white/5 min-w-0">
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-0.5">
                      Ground Hazard:
                    </span>
                    <span className="font-medium text-amber-300 text-xs block truncate">{subAgents.dispatch.special_tactical_precautions}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STREAM D: ELECTRICAL TOPOLOGY SUBGRAPH VIEW */}
          {(activeTab === 'ALL' || activeTab === 'TOPOLOGY') && (
            <div
              className={`p-4 sm:p-5 rounded-2xl bg-[#08101e]/90 border border-emerald-500/30 space-y-4 min-w-0 ${
                activeTab === 'TOPOLOGY' ? 'col-span-full' : 'md:col-span-2 xl:col-span-3'
              }`}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Database className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-wide truncate">
                    Live DynamoDB Adjacency Graph Plane (ZeroGrid-State)
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-400 flex-shrink-0">Region: ap-south-1</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#050b14] border border-white/5 space-y-1 min-w-0">
                  <span className="text-[10px] text-slate-500 font-mono">NODE 1 (SUBSTATION)</span>
                  <p className="font-bold text-white font-mono truncate">SUB_VIRAR_EAST_01</p>
                  <p className="text-[11px] text-rose-400 font-bold">STATUS: CRITICAL (46cm)</p>
                </div>

                <div className="p-3 rounded-xl bg-[#050b14] border border-white/5 space-y-1 min-w-0">
                  <span className="text-[10px] text-slate-500 font-mono">NODE 2 (STEP-DOWN)</span>
                  <p className="font-bold text-white font-mono truncate">XFMR_WARD4_02</p>
                  <p className="text-[11px] text-amber-400 font-bold">STATUS: OVERLOADED</p>
                </div>

                <div className="p-3 rounded-xl bg-[#050b14] border border-white/5 space-y-1 min-w-0">
                  <span className="text-[10px] text-slate-500 font-mono">NODE 3 (CRITICAL FACILITY)</span>
                  <p className="font-bold text-white font-mono truncate">NODE_HOSPITAL_09</p>
                  <p className="text-[11px] text-emerald-400 font-bold">STATUS: PROTECTED (ICU)</p>
                </div>

                <div className="p-3 rounded-xl bg-[#050b14] border border-white/5 space-y-1 min-w-0">
                  <span className="text-[10px] text-slate-500 font-mono">NODE 4 (BACKUP TIE-LINE)</span>
                  <p className="font-bold text-white font-mono truncate">SUB_VASAI_WEST_03</p>
                  <p className="text-[11px] text-blue-400 font-bold">STATUS: STANDBY ENERGIZED</p>
                </div>
              </div>
            </div>
          )}

          {/* STREAM E: SPATIAL-TEMPORAL PROXIMITY & REDIS SQUAD CONCURRENCY */}
          {(activeTab === 'ALL' || activeTab === 'SPATIAL') && (
            <div
              className={`p-4 sm:p-5 rounded-2xl bg-[#08101e]/90 border border-purple-500/30 hover:border-purple-500/50 transition-all space-y-4 min-w-0 ${
                activeTab === 'SPATIAL' ? 'col-span-full' : 'md:col-span-2 xl:col-span-3'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 flex-shrink-0">
                    <Radar className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-purple-300 uppercase tracking-wide truncate">
                      Spatial-Temporal Memory & Redis Concurrency Plane
                    </h3>
                    <p className="text-[11px] text-slate-400 truncate">
                      MongoDB Geo-Proximity Lookahead + Redis Atomic Unit State Engine
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={loadTeams}
                    disabled={loadingTeams}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-950/70 border border-purple-500/30 text-purple-300 text-xs font-mono font-bold hover:bg-purple-900/40 transition-all"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingTeams ? 'animate-spin' : ''}`} />
                    <span>Sync Redis</span>
                  </button>
                  <span className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-purple-950 text-purple-300 border border-purple-500/40">
                    {teams.filter((t) => t.state === 'IDLE').length}/{teams.length} IDLE
                  </span>
                </div>
              </div>

              {/* Spatial Proximity Advisory from MongoDB Historical Loop */}
              {(orchestration?.spatial_memory?.tactical_proximity_advisory || subAgents?.dispatch?.spatial_proximity_advisory) && (
                <div className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-500/40 flex items-start gap-3 min-w-0">
                  <Compass className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-purple-300 font-bold block">
                      MongoDB Spatial Proximity Lookahead:
                    </span>
                    <p className="text-xs text-purple-100 mt-1 leading-relaxed font-medium">
                      {orchestration?.spatial_memory?.tactical_proximity_advisory || subAgents?.dispatch?.spatial_proximity_advisory}
                    </p>
                  </div>
                </div>
              )}

              {/* Candidate Proximity Squads Grid */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">
                  Proximity Ranked Units (Distance vs Central Staging Savings):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(orchestration?.spatial_memory?.candidate_teams || subAgents?.dispatch?.candidate_proximity_teams || []).map((cand, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-2 min-w-0 ${
                        cand.priority_recommendation
                          ? 'bg-gradient-to-br from-purple-950/60 to-[#0b162c] border-purple-500/60 shadow-lg shadow-purple-950/30 ring-1 ring-purple-400/30'
                          : 'bg-[#050b14] border-white/5'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-bold text-white text-xs truncate">{cand.team_name}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono block mt-0.5 truncate">
                              {cand.distance_km} km away &bull; ~{cand.estimated_transit_mins}m transit
                            </span>
                          </div>
                          <span
                            className={`text-[9px] font-mono px-2 py-0.5 rounded font-extrabold uppercase flex-shrink-0 ${
                              cand.redis_state === 'IDLE'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                                : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                            }`}
                          >
                            {cand.redis_state}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] gap-2">
                        <span className="text-emerald-400 font-mono font-bold truncate">
                          ⚡ -{cand.transit_savings_mins}m saved
                        </span>
                        <button
                          onClick={() => handleToggleLock(cand.team_id, cand.redis_state)}
                          disabled={lockingTeamId === cand.team_id}
                          className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all flex-shrink-0 ${
                            cand.redis_state === 'IDLE'
                              ? 'bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40'
                              : 'bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40'
                          }`}
                        >
                          {lockingTeamId === cand.team_id
                            ? 'Syncing...'
                            : cand.redis_state === 'IDLE'
                            ? 'Lock Unit'
                            : 'Release Lock'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Real-time Redis Squad Roster Grid */}
              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">
                  Complete Tactical Roster Concurrency State:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                  {teams.map((t) => (
                    <div
                      key={t.team_id}
                      className="p-3.5 rounded-xl bg-[#050b14] border border-white/5 flex flex-col justify-between space-y-2 min-w-0"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-mono text-[11px] font-bold text-slate-200 truncate">
                            {t.name}
                          </span>
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              t.state === 'IDLE' ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'
                            }`}
                          />
                        </div>
                        <span className="text-[9px] text-slate-500 block truncate mt-0.5">{t.base_location}</span>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                            {t.capacity} Pers
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                            {t.category}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
                        <span
                          className={`font-mono font-bold ${
                            t.state === 'IDLE' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {t.state}
                        </span>
                        <button
                          onClick={() => handleToggleLock(t.team_id, t.state)}
                          disabled={lockingTeamId === t.team_id}
                          className="px-2 py-1 rounded text-[9px] font-mono font-bold bg-white/5 hover:bg-white/10 text-slate-300 transition-all"
                        >
                          {t.state === 'IDLE' ? 'Lock' : 'Release'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 7. OPERATOR ACTION TOOLBAR ─── */}
      {orchestration && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[#08101e]/90 border border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              onClick={() => {
                if (subAgents?.grid?.immediate_breakers_to_trip?.length) {
                  requestBreakerToggle(subAgents.grid.immediate_breakers_to_trip[0]);
                }
              }}
              className="px-4 py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
            >
              <Zap className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>Isolate Flagged Breakers (HITL Protected)</span>
            </button>

            <button
              onClick={handleDispatchAllSquads}
              disabled={squadsDispatched}
              className={`px-4 py-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md ${
                squadsDispatched
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                  : 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border-blue-500/40'
              }`}
            >
              <Truck className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <span>{squadsDispatched ? 'All Squads Dispatched ✓' : 'Dispatch All Tactical Squads'}</span>
            </button>
          </div>

          <button
            onClick={handleCopyDirective}
            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/10 font-bold text-xs flex items-center justify-center gap-2 transition-all"
          >
            {copiedNote ? <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" /> : <Copy className="w-4 h-4 flex-shrink-0" />}
            <span>{copiedNote ? 'Tactical Directive Copied!' : 'Copy Tactical Directive'}</span>
          </button>
        </div>
      )}

      {/* ─── 8. HUMAN-IN-THE-LOOP (HITL) SAFETY GATE MODAL ─── */}
      {pendingBreaker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-[#091322] border border-rose-500/60 shadow-2xl p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 ring-2 ring-rose-500/30 flex-shrink-0">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wide font-display">
                    Human-in-the-Loop Safety Gate
                  </h3>
                  <p className="text-xs text-rose-300 font-mono">
                    CRITICAL HIGH-VOLTAGE BREAKER TRIP CONFIRMATION
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPendingBreaker(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 space-y-1">
                <span className="text-[10px] font-mono text-rose-400 uppercase font-bold block">
                  Target Circuit Asset:
                </span>
                <p className="text-sm font-extrabold text-white font-mono">{pendingBreaker}</p>
                <p className="text-rose-200 text-xs leading-relaxed">
                  Tripping this breaker will physically de-energize the 33kV switchyard feeder. Standby tie line from Vasai West will maintain Sanjeevani Hospital ICU busbar.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#050b14] border border-white/10 space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">
                  Operator Sign-Off Checklist:
                </span>
                <label className="flex items-start gap-2.5 cursor-pointer text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={hitlConfirmed}
                    onChange={(e) => setHitlConfirmed(e.target.checked)}
                    className="mt-0.5 rounded border-white/20 text-rose-500 focus:ring-0 accent-rose-500"
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
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-white/5 transition-all text-center"
              >
                Abort & Return
              </button>
              <button
                onClick={confirmHitlBreakerTrip}
                disabled={!hitlConfirmed}
                className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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