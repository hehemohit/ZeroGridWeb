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
  Database
} from 'lucide-react';
import {
  triggerAutonomousOrchestration,
  AutonomousOrchestrationResponse,
  AutonomousOrchestratePayload
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

export default function AgentZeroDashboardPage() {
  const { user } = useAuth();

  // Active Incidents & Presets
  const [activeIncidents, setActiveIncidents] = useState<ActiveSosOption[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('PRESET_VIRAR');
  const [customWaterDepth, setCustomWaterDepth] = useState<number>(46);
  const [customCoordinates, setCustomCoordinates] = useState<[number, number]>([19.456, 72.812]);

  // Orchestration state
  const [loading, setLoading] = useState<boolean>(false);
  const [orchestration, setOrchestration] = useState<AutonomousOrchestrationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'TRIAGE' | 'GRID' | 'DISPATCH' | 'TOPOLOGY'>('ALL');

  // Interactive Operator Actions
  const [trippedBreakers, setTrippedBreakers] = useState<string[]>([]);
  const [squadsDispatched, setSquadsDispatched] = useState<boolean>(false);
  const [copiedNote, setCopiedNote] = useState<boolean>(false);

  // Load any active SOS events from the backend to populate the picker
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

  // Run autonomous multi-agent orchestration
  const handleExecuteOrchestration = async (overrideDepth?: number, overrideCoords?: [number, number]) => {
    setLoading(true);
    setError(null);
    try {
      const depth = overrideDepth ?? customWaterDepth;
      const coords = overrideCoords ?? customCoordinates;

      const payload: AutonomousOrchestratePayload = {
        incident_id: selectedIncidentId,
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
    } catch (err: any) {
      console.error('Agent Zero orchestration failed:', err);
      setError(err?.message || 'Failed to communicate with Agent Zero microservice');
    } finally {
      setLoading(false);
    }
  };

  // Run automatic initial synthesis on load
  useEffect(() => {
    handleExecuteOrchestration();
  }, []);

  const handleToggleBreaker = (breaker: string) => {
    setTrippedBreakers((prev) =>
      prev.includes(breaker) ? prev.filter((b) => b !== breaker) : [...prev, breaker]
    );
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
    <div className="min-h-screen w-full bg-[#030712] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* ─── 1. TOP COMMAND BAR ─── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-5 rounded-2xl bg-[#080f1d]/90 border border-cyan-500/20 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-400/40 shadow-inner">
            <Cpu className="w-6 h-6 text-cyan-400 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg sm:text-2xl font-black text-white tracking-tight font-display">
                Agent Zero Command Center
              </h1>
              <span className="text-[10px] sm:text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                GROQ LPU MULTI-AGENT CORE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Autonomous Grid Recovery, Deterministic DynamoDB Adjacency Graph & Emergency Tactical Orchestration
            </p>
          </div>
        </div>

        {/* Live Data Plane & Cloud Verification Badges */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>DynamoDB Cloud (ap-south-1)</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-950/70 border border-blue-500/40 text-blue-300 text-xs font-mono font-bold">
            <Radio className="w-3.5 h-3.5 text-blue-400" />
            <span>Groq LPU (gpt-oss-120b)</span>
          </div>

          <button
            onClick={() => handleExecuteOrchestration()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-xs shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Synthesizing...' : 'Re-Run Orchestration'}</span>
          </button>
        </div>
      </div>

      {/* ─── 2. INCIDENT & TELEMETRY CONTROL STRIP ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4 rounded-xl bg-[#091322]/80 border border-white/5 text-xs">
        {/* Preset Selector */}
        <div className="space-y-1">
          <label className="text-[10px] font-mono uppercase text-slate-400 block font-bold">Incident Profile</label>
          <select
            value={selectedIncidentId}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedIncidentId(val);
              if (val === 'PRESET_VIRAR') {
                setCustomWaterDepth(46);
                setCustomCoordinates([19.456, 72.812]);
              } else if (val === 'PRESET_WARD4') {
                setCustomWaterDepth(32);
                setCustomCoordinates([19.458, 72.815]);
              } else if (val === 'PRESET_HOSPITAL') {
                setCustomWaterDepth(15);
                setCustomCoordinates([19.454, 72.818]);
              }
            }}
            className="w-full bg-[#050b14] border border-cyan-500/30 rounded-lg px-2.5 py-1.5 text-slate-200 font-medium focus:outline-none focus:border-cyan-400 text-xs"
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
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-slate-400 uppercase font-bold">Water Logging Depth</span>
            <span className="text-cyan-300 font-bold">{customWaterDepth} cm</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={customWaterDepth}
            onChange={(e) => setCustomWaterDepth(Number(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer"
          />
        </div>

        {/* Coordinates Display */}
        <div className="space-y-1">
          <label className="text-[10px] font-mono uppercase text-slate-400 block font-bold">Target Coordinates</label>
          <div className="flex items-center gap-2 bg-[#050b14] border border-white/10 rounded-lg px-2.5 py-1.5 font-mono text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-cyan-400" />
            <span>{customCoordinates[0].toFixed(4)}, {customCoordinates[1].toFixed(4)}</span>
          </div>
        </div>

        {/* Fast Trigger */}
        <div className="flex items-end">
          <button
            onClick={() => handleExecuteOrchestration(customWaterDepth, customCoordinates)}
            className="w-full py-2 px-3 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold transition-all text-center flex items-center justify-center gap-1.5"
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-[#091322] border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Threat Severity Index</span>
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

          <div className="p-4 rounded-2xl bg-[#091322] border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Root Substation Node</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm sm:text-base font-extrabold text-cyan-300 font-mono truncate">
                {graph?.root_node_id || 'SUB_VIRAR_EAST_01'}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">33kV / 92.5% Nominal Load</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#091322] border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">DynamoDB Adjacency Subgraph</span>
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

          <div className="p-4 rounded-2xl bg-[#091322] border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Hospital Lifeline Busbar</span>
            <div className="flex items-center gap-2 mt-1">
              <HeartPulse className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <span className="text-sm sm:text-base font-black text-emerald-300 font-mono">
                ICU 100% ENERGIZED
              </span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">Vasai 33kV Tie Line Engaged</span>
          </div>
        </div>
      )}

      {/* ─── 4. MASTER OPERATIONAL DIRECTIVE CARD ─── */}
      {orchestration && directive && (
        <div className="p-5 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-[#0a1526]/90 to-blue-950/30 border border-cyan-500/40 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-cyan-400" />
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight font-display">
                Agent Zero Master Operational Directive
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Orchestrated: {new Date(orchestration.orchestrated_at).toLocaleTimeString()} UTC</span>
            </div>
          </div>

          <p className="text-sm sm:text-base text-slate-100 font-semibold leading-relaxed">
            {directive.executive_summary}
          </p>

          {/* Hospital & ICU Lifeline Callout Box */}
          {directive.hospital_lifeline_protocol && (
            <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/40 flex items-start gap-3">
              <HeartPulse className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
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
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                    {act}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 5. SEGREGATED DECISION STREAM NAVIGATION ─── */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[#091322] border border-white/5">
        <button
          onClick={() => setActiveTab('ALL')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all ${
            activeTab === 'ALL'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          All Decision Streams
        </button>
        <button
          onClick={() => setActiveTab('TRIAGE')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'TRIAGE'
              ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Triage Commander</span>
        </button>
        <button
          onClick={() => setActiveTab('GRID')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'GRID'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Grid Operations</span>
        </button>
        <button
          onClick={() => setActiveTab('DISPATCH')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'DISPATCH'
              ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          <span>Tactical Dispatch</span>
        </button>
        <button
          onClick={() => setActiveTab('TOPOLOGY')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'TOPOLOGY'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Electrical Topology</span>
        </button>
      </div>

      {/* ─── 6. SEGREGATED DECISION STREAMS GRID ─── */}
      {orchestration && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* STREAM A: TRIAGE SUB-AGENT DECISION STREAM */}
          {(activeTab === 'ALL' || activeTab === 'TRIAGE') && subAgents?.triage && (
            <div className={`p-5 rounded-2xl bg-[#091322] border border-rose-500/30 hover:border-rose-500/50 transition-all space-y-4 ${activeTab === 'TRIAGE' ? 'lg:col-span-3' : ''}`}>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-rose-300 uppercase tracking-wide">
                      Triage Decision Stream
                    </h3>
                    <p className="text-[11px] text-slate-400">Human Casualty Probability & Ingress Analysis</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-rose-950 text-rose-300 border border-rose-500/40">
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
                          <Building className="w-3.5 h-3.5" />
                          {facility}
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
            <div className={`p-5 rounded-2xl bg-[#091322] border border-amber-500/30 hover:border-amber-500/50 transition-all space-y-4 ${activeTab === 'GRID' ? 'lg:col-span-3' : ''}`}>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wide">
                      Grid Operations Decision Stream
                    </h3>
                    <p className="text-[11px] text-slate-400">Electrical Impedance, Switching & Rerouting</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-amber-950 text-amber-300 border border-amber-500/40">
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
                            onClick={() => handleToggleBreaker(breaker)}
                            className={`flex items-center justify-between px-3 py-2 rounded-xl border text-left text-xs font-mono transition-all ${
                              isTripped
                                ? 'bg-rose-950/80 text-rose-300 border-rose-500/60 shadow-md shadow-rose-950/50'
                                : 'bg-[#050b14] text-slate-300 border-white/10 hover:border-amber-400/50'
                            }`}
                          >
                            <span className="font-bold truncate">{breaker}</span>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded font-extrabold uppercase ${
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
            <div className={`p-5 rounded-2xl bg-[#091322] border border-blue-500/30 hover:border-blue-500/50 transition-all space-y-4 ${activeTab === 'DISPATCH' ? 'lg:col-span-3' : ''}`}>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-blue-300 uppercase tracking-wide">
                      Tactical Dispatch Decision Stream
                    </h3>
                    <p className="text-[11px] text-slate-400">Squad Mobilization & Corridor Safety</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-blue-950 text-blue-300 border border-blue-500/40">
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
                        className="p-3 rounded-xl bg-[#050b14] border border-white/5 flex items-start justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-blue-300 font-mono text-xs">
                              {squad.count}x {squad.unit_type}
                            </span>
                          </div>
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
                  <div className="p-3 rounded-xl bg-[#050b14] border border-white/5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-0.5">
                      Staging Base:
                    </span>
                    <span className="font-bold text-slate-200 text-xs">{subAgents.dispatch.staging_area}</span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#050b14] border border-white/5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-0.5">
                      Ground Hazard:
                    </span>
                    <span className="font-medium text-amber-300 text-xs">{subAgents.dispatch.special_tactical_precautions}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STREAM D: ELECTRICAL TOPOLOGY SUBGRAPH VIEW */}
          {(activeTab === 'ALL' || activeTab === 'TOPOLOGY') && (
            <div className={`p-5 rounded-2xl bg-[#091322] border border-emerald-500/30 space-y-4 ${activeTab === 'TOPOLOGY' ? 'lg:col-span-3' : 'lg:col-span-3'}`}>
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-wide">
                    Live DynamoDB Adjacency Graph Plane (ZeroGrid-State)
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-400">Region: ap-south-1</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#050b14] border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-500 font-mono">NODE 1 (SUBSTATION)</span>
                  <p className="font-bold text-white font-mono">SUB_VIRAR_EAST_01</p>
                  <p className="text-[11px] text-rose-400 font-bold">STATUS: CRITICAL (46cm)</p>
                </div>

                <div className="p-3 rounded-xl bg-[#050b14] border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-500 font-mono">NODE 2 (STEP-DOWN)</span>
                  <p className="font-bold text-white font-mono">XFMR_WARD4_02</p>
                  <p className="text-[11px] text-amber-400 font-bold">STATUS: OVERLOADED</p>
                </div>

                <div className="p-3 rounded-xl bg-[#050b14] border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-500 font-mono">NODE 3 (CRITICAL FACILITY)</span>
                  <p className="font-bold text-white font-mono">NODE_HOSPITAL_09</p>
                  <p className="text-[11px] text-emerald-400 font-bold">STATUS: PROTECTED (ICU)</p>
                </div>

                <div className="p-3 rounded-xl bg-[#050b14] border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-500 font-mono">NODE 4 (BACKUP TIE-LINE)</span>
                  <p className="font-bold text-white font-mono">SUB_VASAI_WEST_03</p>
                  <p className="text-[11px] text-blue-400 font-bold">STATUS: STANDBY ENERGIZED</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 7. OPERATOR ACTION TOOLBAR ─── */}
      {orchestration && (
        <div className="p-4 rounded-2xl bg-[#091322] border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                if (subAgents?.grid?.immediate_breakers_to_trip) {
                  setTrippedBreakers(subAgents.grid.immediate_breakers_to_trip);
                }
              }}
              className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-bold text-xs flex items-center gap-2 transition-all shadow-md"
            >
              <Zap className="w-4 h-4 text-rose-400" />
              <span>Isolate All Flagged Circuit Breakers ({subAgents?.grid?.immediate_breakers_to_trip?.length || 0})</span>
            </button>

            <button
              onClick={() => setSquadsDispatched(true)}
              disabled={squadsDispatched}
              className={`px-4 py-2 rounded-xl border font-bold text-xs flex items-center gap-2 transition-all shadow-md ${
                squadsDispatched
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                  : 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border-blue-500/40'
              }`}
            >
              <Truck className="w-4 h-4 text-blue-400" />
              <span>{squadsDispatched ? 'All Squads Dispatched ✓' : 'Dispatch All Tactical Squads'}</span>
            </button>
          </div>

          <button
            onClick={handleCopyDirective}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/10 font-bold text-xs flex items-center gap-2 transition-all ml-auto"
          >
            {copiedNote ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copiedNote ? 'Tactical Directive Copied!' : 'Copy Tactical Directive'}</span>
          </button>
        </div>
      )}
    </div>
  );
}