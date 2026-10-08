'use client';

import React, { useState } from 'react';
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
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Flame,
  HeartPulse,
  Navigation
} from 'lucide-react';
import {
  triggerAutonomousOrchestration,
  AutonomousOrchestrationResponse,
  AutonomousOrchestratePayload,
} from '@/lib/voiceAgent';

interface AgentZeroOrchestratorWidgetProps {
  incidentId?: string;
  incidentType?: string;
  severity?: string;
  coordinates?: [number, number] | number[] | null;
  waterDepthCm?: number;
  message?: string;
  onApplyAdvisoryToNotes?: (text: string) => void;
}

export function AgentZeroOrchestratorWidget({
  incidentId = 'INC_01',
  incidentType = 'SUBSTATION_WATER_INGRESS',
  severity = 'CRITICAL',
  coordinates,
  waterDepthCm = 45,
  message,
  onApplyAdvisoryToNotes,
}: AgentZeroOrchestratorWidgetProps) {
  const [loading, setLoading] = useState(false);
  const [orchestration, setOrchestration] = useState<AutonomousOrchestrationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'TRIAGE' | 'GRID' | 'DISPATCH'>('ALL');
  const [trippedBreakers, setTrippedBreakers] = useState<string[]>([]);
  const [squadsDispatched, setSquadsDispatched] = useState<boolean>(false);
  const [copiedNote, setCopiedNote] = useState(false);

  const handleRunOrchestration = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload: AutonomousOrchestratePayload = {
        incident_id: incidentId,
        incident_type: incidentType,
        severity: severity,
        coordinates: coordinates,
        water_depth_cm: waterDepthCm,
        message: message || `Severe flood threat near electrical grid infrastructure (${waterDepthCm}cm).`,
      };

      const result = await triggerAutonomousOrchestration(payload);
      setOrchestration(result);
      // Auto-initialize recommended breakers to trip
      if (result?.agent_zero_directive?.immediate_automated_actions) {
        setTrippedBreakers([]);
        setSquadsDispatched(false);
      }
    } catch (err: any) {
      console.error('Agent Zero orchestration failed:', err);
      setError(err?.message || 'Failed to execute Agent Zero orchestration');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBreaker = (breaker: string) => {
    setTrippedBreakers((prev) =>
      prev.includes(breaker) ? prev.filter((b) => b !== breaker) : [...prev, breaker]
    );
  };

  const handleCopyDirectiveToNotes = () => {
    if (!orchestration) return;
    const d = orchestration.agent_zero_directive;
    const summaryText = `[AGENT ZERO TACTICAL DIRECTIVE]
Threat Score: ${d.overall_threat_score}/100
Summary: ${d.executive_summary}
Automated Actions: ${d.immediate_automated_actions.join(', ')}
Hospital Lifeline: ${d.hospital_lifeline_protocol}`;

    if (onApplyAdvisoryToNotes) {
      onApplyAdvisoryToNotes(summaryText);
    } else {
      navigator.clipboard.writeText(summaryText);
    }
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2500);
  };

  const directive = orchestration?.agent_zero_directive;
  const subAgents = orchestration?.sub_agents;
  const graph = orchestration?.graph_telemetry;

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-[#070d18]/95 p-4 sm:p-5 shadow-2xl backdrop-blur-xl transition-all">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-400/40 shadow-inner">
            <Cpu className="w-5 h-5 text-cyan-400 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm sm:text-base font-extrabold tracking-tight text-white font-display">
                Agent Zero Orchestrator
              </h4>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                LPU MULTI-AGENT
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Deterministic DynamoDB Topology + Concurrent Sub-Agent Inference
            </p>
          </div>
        </div>

        {/* Live Data Plane Indicator & Run Button */}
        <div className="flex items-center gap-2">
          {graph && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border ${
                graph.data_source === 'DYNAMODB_CLOUD'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-950/80 text-amber-300 border-amber-500/40'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  graph.data_source === 'DYNAMODB_CLOUD' ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              {graph.data_source === 'DYNAMODB_CLOUD' ? 'DynamoDB Cloud' : 'Simulator Mode'}
            </span>
          )}

          <button
            onClick={handleRunOrchestration}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Synthesizing...' : orchestration ? 'Re-Synthesize' : 'Synthesize Decisions'}</span>
          </button>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="mt-3 p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Initial Call-to-action state */}
      {!orchestration && !loading && !error && (
        <div className="py-8 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div className="max-w-md mx-auto">
            <h5 className="text-sm font-bold text-white">No Multi-Agent Synthesis Generated Yet</h5>
            <p className="text-xs text-slate-400 mt-1">
              Click &quot;Synthesize Decisions&quot; to traverse the localized electrical grid in DynamoDB and
              concurrently mobilize the Triage, Grid Operations, and Dispatch sub-agents.
            </p>
          </div>
          <button
            onClick={handleRunOrchestration}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-cyan-500/30"
          >
            <Zap className="w-4 h-4" />
            <span>Activate Agent Zero Core</span>
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="py-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-400 animate-spin">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h5 className="text-sm font-bold text-cyan-300">Agent Zero Multi-Agent Synthesis Active</h5>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Querying DynamoDB adjacency lists & running concurrent Groq LPU sub-agents (Triage, Grid, Dispatch)...
            </p>
          </div>
        </div>
      )}

      {/* 2. Orchestration Results Presenter */}
      {orchestration && directive && (
        <div className="mt-4 space-y-4">
          {/* Top Threat & Topology KPI Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5">
              <span className="text-[10px] text-slate-400 block font-mono uppercase">Threat Index</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span
                  className={`text-lg font-black font-mono ${
                    directive.overall_threat_score >= 80
                      ? 'text-rose-400'
                      : directive.overall_threat_score >= 50
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {directive.overall_threat_score}
                </span>
                <span className="text-[10px] text-slate-500">/ 100</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5">
              <span className="text-[10px] text-slate-400 block font-mono uppercase">Grid Root Asset</span>
              <span className="text-xs font-bold text-cyan-300 font-mono mt-1 block truncate">
                {graph?.root_node_id || 'SUB_VIRAR_EAST_01'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5">
              <span className="text-[10px] text-slate-400 block font-mono uppercase">Nodes Traversed</span>
              <span className="text-xs font-bold text-white font-mono mt-1 block">
                {graph?.node_count || 4} Substations & Transformers
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5">
              <span className="text-[10px] text-slate-400 block font-mono uppercase">Lifeline ICU Protection</span>
              <span className="text-xs font-bold text-emerald-300 font-mono mt-1 flex items-center gap-1">
                <HeartPulse className="w-3.5 h-3.5 text-emerald-400" />
                Guaranteed Active
              </span>
            </div>
          </div>

          {/* Master Executive Briefing Card */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-950/40 via-slate-900/90 to-blue-950/30 border border-cyan-500/40 shadow-inner">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5 font-display">
                <Shield className="w-3.5 h-3.5 text-cyan-400" />
                Master Operational Directive
              </span>
              <span className="text-[9px] font-mono text-slate-400">
                {new Date(orchestration.orchestrated_at).toLocaleTimeString()} UTC
              </span>
            </div>
            <p className="text-xs sm:text-sm font-semibold text-slate-100 leading-relaxed">
              {directive.executive_summary}
            </p>

            {/* Hospital Lifeline Protocol Callout */}
            {directive.hospital_lifeline_protocol && (
              <div className="mt-3 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-start gap-2.5">
                <HeartPulse className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 block font-mono">
                    Hospital & ICU Power Protection Protocol
                  </span>
                  <p className="text-xs text-emerald-100 mt-0.5 leading-relaxed font-medium">
                    {directive.hospital_lifeline_protocol}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Sub-Agent Segregation Navigation Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/90 border border-white/5">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'ALL'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              All Decisions
            </button>
            <button
              onClick={() => setActiveTab('TRIAGE')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'TRIAGE'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Triage</span>
            </button>
            <button
              onClick={() => setActiveTab('GRID')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'GRID'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Grid Ops</span>
            </button>
            <button
              onClick={() => setActiveTab('DISPATCH')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'DISPATCH'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Truck className="w-3 h-3" />
              <span>Dispatch</span>
            </button>
          </div>

          {/* 3. SEGREGATED DECISION STREAMS */}
          <div className="space-y-3">
            {/* STREAM 1: TRIAGE SUB-AGENT DECISION STREAM */}
            {(activeTab === 'ALL' || activeTab === 'TRIAGE') && subAgents?.triage && (
              <div className="p-3.5 rounded-xl bg-slate-900/70 border border-rose-500/30 hover:border-rose-500/50 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-lg bg-rose-500/20 text-rose-400">
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-bold text-rose-300 uppercase tracking-wide">
                      Triage Decision Stream
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-500/40">
                    THREAT: {subAgents.triage.threat_level}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">Casualty & Electrocution Risk:</span>
                    <p className="text-slate-200 mt-0.5 font-medium leading-relaxed">
                      {subAgents.triage.casualty_risk_assessment}
                    </p>
                  </div>

                  {subAgents.triage.priority_facilities_threatened?.length > 0 && (
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 uppercase block mb-1">
                        Threatened Priority Infrastructure:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {subAgents.triage.priority_facilities_threatened.map((facility, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/60 text-rose-300 border border-rose-500/30 text-[11px] font-mono font-bold"
                          >
                            <Building className="w-3 h-3" />
                            {facility}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px]">
                    <span className="text-slate-400">Evacuation Recommendation:</span>
                    <span
                      className={`font-bold font-mono ${
                        subAgents.triage.evacuation_recommended ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {subAgents.triage.evacuation_recommended ? '⚠️ EVACUATION REQUIRED' : 'SHELTER IN PLACE'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* STREAM 2: GRID OPERATIONS SUB-AGENT DECISION STREAM */}
            {(activeTab === 'ALL' || activeTab === 'GRID') && subAgents?.grid && (
              <div className="p-3.5 rounded-xl bg-slate-900/70 border border-amber-500/30 hover:border-amber-500/50 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400">
                      <Zap className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                      Grid Operations Decision Stream
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-500/40">
                    STABILITY: {subAgents.grid.grid_stability_status}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* Cascading Failure Risk */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                      <span>Cascading Collapse Risk:</span>
                      <span className="font-bold text-amber-400">{subAgents.grid.cascading_failure_risk_pct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all"
                        style={{ width: `${subAgents.grid.cascading_failure_risk_pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Immediate Breakers to Trip (Interactive) */}
                  {subAgents.grid.immediate_breakers_to_trip?.length > 0 && (
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 uppercase block mb-1">
                        Critical Breaker Isolation Actions:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {subAgents.grid.immediate_breakers_to_trip.map((breaker, idx) => {
                          const isTripped = trippedBreakers.includes(breaker);
                          return (
                            <button
                              key={idx}
                              onClick={() => handleToggleBreaker(breaker)}
                              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-left text-[11px] font-mono transition-all ${
                                isTripped
                                  ? 'bg-rose-950/80 text-rose-300 border-rose-500/60 shadow-sm'
                                  : 'bg-slate-950/80 text-slate-300 border-white/10 hover:border-amber-400/40'
                              }`}
                            >
                              <span className="font-bold">{breaker}</span>
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                  isTripped ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {isTripped ? 'ISOLATED' : 'TRIP BREAKER'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Safe Alternate Routing */}
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-white/5">
                    <span className="text-[10px] font-mono text-amber-400 uppercase block mb-0.5">
                      Safe Alternative Routing:
                    </span>
                    <p className="text-slate-300 text-[11px] font-medium leading-relaxed">
                      {subAgents.grid.safe_rerouting_path}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* STREAM 3: TACTICAL DISPATCH SUB-AGENT DECISION STREAM */}
            {(activeTab === 'ALL' || activeTab === 'DISPATCH') && subAgents?.dispatch && (
              <div className="p-3.5 rounded-xl bg-slate-900/70 border border-blue-500/30 hover:border-blue-500/50 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-lg bg-blue-500/20 text-blue-400">
                      <Truck className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-bold text-blue-300 uppercase tracking-wide">
                      Tactical Dispatch Decision Stream
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950 text-blue-300 border border-blue-500/40">
                    ROUTE: {subAgents.dispatch.route_accessibility_status}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  {/* Recommended Squads Breakdown */}
                  {subAgents.dispatch.recommended_squads?.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-mono text-slate-400 uppercase block">
                        Mobilized Field Units:
                      </span>
                      {subAgents.dispatch.recommended_squads.map((squad, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-slate-950/60 border border-white/5 flex items-start justify-between gap-2 text-[11px]"
                        >
                          <div>
                            <span className="font-bold text-blue-300 font-mono">
                              {squad.count}x {squad.unit_type}
                            </span>
                            <p className="text-slate-400 text-[10px] mt-0.5">{squad.mission}</p>
                          </div>
                          <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-500/30">
                            DEPLOY
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Staging Area & Route Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-lg bg-slate-950/60 border border-white/5">
                      <span className="text-[10px] font-mono text-slate-400 uppercase block mb-0.5">
                        Designated Staging Area:
                      </span>
                      <span className="font-semibold text-slate-200">{subAgents.dispatch.staging_area}</span>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-950/60 border border-white/5">
                      <span className="text-[10px] font-mono text-slate-400 uppercase block mb-0.5">
                        Precautions:
                      </span>
                      <span className="font-medium text-amber-300">{subAgents.dispatch.special_tactical_precautions}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4. Operator Actions Toolbar */}
          <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (subAgents?.grid?.immediate_breakers_to_trip) {
                    setTrippedBreakers(subAgents.grid.immediate_breakers_to_trip);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-bold text-[11px] flex items-center gap-1.5 transition-all"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Trip All Breakers ({subAgents?.grid?.immediate_breakers_to_trip?.length || 0})</span>
              </button>

              <button
                onClick={() => setSquadsDispatched(true)}
                disabled={squadsDispatched}
                className={`px-3 py-1.5 rounded-lg border font-bold text-[11px] flex items-center gap-1.5 transition-all ${
                  squadsDispatched
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                    : 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border-blue-500/40'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>{squadsDispatched ? 'Squads Dispatched ✓' : 'Dispatch Field Units'}</span>
              </button>
            </div>

            <button
              onClick={handleCopyDirectiveToNotes}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 font-bold text-[11px] flex items-center gap-1.5 transition-all ml-auto"
            >
              {copiedNote ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedNote ? 'Pasted to Incident Notes!' : 'Append to Notes'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
