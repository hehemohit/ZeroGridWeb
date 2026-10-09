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
  Navigation,
  Compass,
  Radar,
  Lock,
  Unlock,
  X
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
  const [pendingBreaker, setPendingBreaker] = useState<string | null>(null);
  const [hitlConfirmed, setHitlConfirmed] = useState<boolean>(false);
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
      if (result?.agent_zero_directive?.immediate_automated_actions) {
        setTrippedBreakers([]);
        setSquadsDispatched(false);
      }
    } catch (err: any) {
      console.warn('Agent Zero orchestration notice:', err);
      setError(err?.message || 'Failed to execute Agent Zero orchestration');
    } finally {
      setLoading(false);
    }
  };

  const requestBreakerToggle = (breaker: string) => {
    if (trippedBreakers.includes(breaker)) {
      setTrippedBreakers((prev) => prev.filter((b) => b !== breaker));
    } else {
      setPendingBreaker(breaker);
      setHitlConfirmed(false);
    }
  };

  const confirmHitlBreakerTrip = () => {
    if (!pendingBreaker) return;
    setTrippedBreakers((prev) => [...prev, pendingBreaker]);
    setPendingBreaker(null);
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
    <div className="rounded-2xl border border-hairline bg-surfaceCard text-primaryText p-4 sm:p-5 shadow-sm transition-all duration-200">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-hairline">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-brandTeal/10 border border-brandTeal/20 text-brandTeal shadow-sm">
            <Cpu className="w-5 h-5 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-brandTeal animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm sm:text-base font-bold tracking-tight text-primaryText font-display">
                Agent Zero Orchestrator
              </h4>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-brandTeal/10 text-brandTeal border border-brandTeal/20">
                LPU MULTI-AGENT
              </span>
            </div>
            <p className="text-[11px] text-secondaryText">
              Deterministic DynamoDB Topology + Concurrent Sub-Agent Inference
            </p>
          </div>
        </div>

        {/* Live Data Plane Indicator & Run Button */}
        <div className="flex items-center gap-2">
          {graph && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium border bg-surfaceElevated border-hairline text-secondaryText">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{graph.data_source === 'DYNAMODB_CLOUD' ? 'DynamoDB Cloud' : 'Simulator Mode'}</span>
            </span>
          )}

          <button
            onClick={handleRunOrchestration}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-brandTeal hover:bg-brandTealGlow text-slate-900 font-bold text-xs shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Synthesizing...' : orchestration ? 'Re-Synthesize' : 'Synthesize Decisions'}</span>
          </button>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Initial Call-to-action state */}
      {!orchestration && !loading && !error && (
        <div className="py-8 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-brandTeal/10 border border-brandTeal/20 flex items-center justify-center text-brandTeal">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div className="max-w-md mx-auto">
            <h5 className="text-sm font-bold text-primaryText">No Multi-Agent Synthesis Generated Yet</h5>
            <p className="text-xs text-secondaryText mt-1">
              Click &quot;Synthesize Decisions&quot; to traverse the localized electrical grid in DynamoDB and
              concurrently mobilize the Triage, Grid Operations, and Dispatch sub-agents.
            </p>
          </div>
          <button
            onClick={handleRunOrchestration}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brandTeal hover:bg-brandTealGlow text-slate-900 font-bold text-xs transition-all shadow-sm"
          >
            <Zap className="w-4 h-4" />
            <span>Activate Agent Zero Core</span>
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="py-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brandTeal/10 border border-brandTeal/20 text-brandTeal animate-spin">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h5 className="text-sm font-bold text-brandTeal">Agent Zero Multi-Agent Synthesis Active</h5>
            <p className="text-xs text-secondaryText max-w-sm mx-auto">
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
            <div className="p-3 rounded-xl bg-surfaceElevated border border-hairline">
              <span className="text-[10px] text-mutedGray block font-mono uppercase font-semibold">Threat Index</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span
                  className={`text-lg font-black font-mono ${
                    directive.overall_threat_score >= 80
                      ? 'text-red-500'
                      : directive.overall_threat_score >= 50
                      ? 'text-amber-500'
                      : 'text-emerald-500'
                  }`}
                >
                  {directive.overall_threat_score}
                </span>
                <span className="text-[10px] text-mutedGray font-mono">/ 100</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surfaceElevated border border-hairline">
              <span className="text-[10px] text-mutedGray block font-mono uppercase font-semibold">Grid Root Asset</span>
              <span className="text-xs font-bold text-brandTeal font-mono mt-1 block truncate">
                {graph?.root_node_id || 'SUB_VIRAR_EAST_01'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surfaceElevated border border-hairline">
              <span className="text-[10px] text-mutedGray block font-mono uppercase font-semibold">Nodes Traversed</span>
              <span className="text-xs font-bold text-primaryText font-mono mt-1 block">
                {graph?.node_count || 4} Substations
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surfaceElevated border border-hairline">
              <span className="text-[10px] text-mutedGray block font-mono uppercase font-semibold">Lifeline ICU</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-1 flex items-center gap-1">
                <HeartPulse className="w-3.5 h-3.5 text-emerald-500" />
                Active
              </span>
            </div>
          </div>

          {/* Master Executive Briefing Card */}
          <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-brandTeal uppercase tracking-wider flex items-center gap-1.5 font-display">
                <Shield className="w-3.5 h-3.5 text-brandTeal" />
                Master Operational Directive
              </span>
              <span className="text-[10px] font-mono text-mutedGray">
                {new Date(orchestration.orchestrated_at).toLocaleTimeString()} UTC
              </span>
            </div>
            <p className="text-xs sm:text-sm font-medium text-secondaryText leading-relaxed">
              {directive.executive_summary}
            </p>

            {/* Hospital Lifeline Protocol Callout */}
            {directive.hospital_lifeline_protocol && (
              <div className="mt-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5">
                <HeartPulse className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider block font-mono">
                    Hospital & ICU Power Protection Protocol
                  </span>
                  <p className="text-xs mt-0.5 leading-relaxed font-medium">
                    {directive.hospital_lifeline_protocol}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Sub-Agent Segregation Navigation Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surfaceElevated border border-hairline overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`whitespace-nowrap flex-shrink-0 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'ALL'
                  ? 'bg-surfaceCard text-primaryText border border-hairline shadow-sm'
                  : 'text-secondaryText hover:text-primaryText hover:bg-surfaceCard/50'
              }`}
            >
              All Decisions
            </button>
            <button
              onClick={() => setActiveTab('TRIAGE')}
              className={`whitespace-nowrap flex-shrink-0 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'TRIAGE'
                  ? 'bg-surfaceCard text-red-500 border border-hairline shadow-sm'
                  : 'text-secondaryText hover:text-primaryText hover:bg-surfaceCard/50'
              }`}
            >
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              <span>Triage</span>
            </button>
            <button
              onClick={() => setActiveTab('GRID')}
              className={`whitespace-nowrap flex-shrink-0 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'GRID'
                  ? 'bg-surfaceCard text-amber-500 border border-hairline shadow-sm'
                  : 'text-secondaryText hover:text-primaryText hover:bg-surfaceCard/50'
              }`}
            >
              <Zap className="w-3 h-3 flex-shrink-0" />
              <span>Grid Ops</span>
            </button>
            <button
              onClick={() => setActiveTab('DISPATCH')}
              className={`whitespace-nowrap flex-shrink-0 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'DISPATCH'
                  ? 'bg-surfaceCard text-blue-500 border border-hairline shadow-sm'
                  : 'text-secondaryText hover:text-primaryText hover:bg-surfaceCard/50'
              }`}
            >
              <Truck className="w-3 h-3 flex-shrink-0" />
              <span>Dispatch</span>
            </button>
          </div>

          {/* 3. SEGREGATED DECISION STREAMS */}
          <div className="space-y-3">
            {/* STREAM 1: TRIAGE SUB-AGENT DECISION STREAM */}
            {(activeTab === 'ALL' || activeTab === 'TRIAGE') && subAgents?.triage && (
              <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline space-y-3">
                <div className="flex items-center justify-between border-b border-hairline pb-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-lg bg-red-500/10 text-red-500">
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-bold text-primaryText uppercase tracking-wide">
                      Triage Decision Stream
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                    THREAT: {subAgents.triage.threat_level}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-[10px] font-mono text-mutedGray uppercase font-semibold">Casualty & Electrocution Risk:</span>
                    <p className="text-secondaryText mt-0.5 font-medium leading-relaxed">
                      {subAgents.triage.casualty_risk_assessment}
                    </p>
                  </div>

                  {subAgents.triage.priority_facilities_threatened?.length > 0 && (
                    <div>
                      <span className="text-[10px] font-mono text-mutedGray uppercase block mb-1 font-semibold">
                        Threatened Priority Infrastructure:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {subAgents.triage.priority_facilities_threatened.map((facility, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surfaceCard text-primaryText border border-hairline text-[11px] font-mono font-medium"
                          >
                            <Building className="w-3 h-3 text-red-500" />
                            {facility}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-hairline text-[11px]">
                    <span className="text-mutedGray font-medium">Evacuation Recommendation:</span>
                    <span
                      className={`font-bold font-mono ${
                        subAgents.triage.evacuation_recommended ? 'text-red-500' : 'text-emerald-500'
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
              <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline space-y-3">
                <div className="flex items-center justify-between border-b border-hairline pb-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-lg bg-amber-500/10 text-amber-500">
                      <Zap className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-bold text-primaryText uppercase tracking-wide">
                      Grid Operations Decision Stream
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    STABILITY: {subAgents.grid.grid_stability_status}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-mutedGray mb-1">
                      <span>Cascading Collapse Risk:</span>
                      <span className="font-bold text-amber-500">{subAgents.grid.cascading_failure_risk_pct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surfaceCard overflow-hidden border border-hairline">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-red-500 transition-all"
                        style={{ width: `${subAgents.grid.cascading_failure_risk_pct}%` }}
                      />
                    </div>
                  </div>

                  {subAgents.grid.immediate_breakers_to_trip?.length > 0 && (
                    <div>
                      <span className="text-[10px] font-mono text-mutedGray uppercase block mb-1 font-semibold">
                        Critical Breaker Isolation Actions:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {subAgents.grid.immediate_breakers_to_trip.map((breaker, idx) => {
                          const isTripped = trippedBreakers.includes(breaker);
                          return (
                            <button
                              key={idx}
                              onClick={() => requestBreakerToggle(breaker)}
                              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-left text-[11px] font-mono transition-all ${
                                isTripped
                                  ? 'bg-red-500/10 text-red-500 border-red-500/30'
                                  : 'bg-surfaceCard text-primaryText border-hairline hover:border-brandTeal'
                              }`}
                            >
                              <span className="font-bold truncate mr-1.5">{breaker}</span>
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                  isTripped ? 'bg-red-500 text-white' : 'bg-surfaceElevated text-mutedGray'
                                }`}
                              >
                                {isTripped ? 'TRIPPED' : 'ARM'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STREAM 3: TACTICAL DISPATCH SUB-AGENT DECISION STREAM */}
            {(activeTab === 'ALL' || activeTab === 'DISPATCH') && subAgents?.dispatch && (
              <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline space-y-3">
                <div className="flex items-center justify-between border-b border-hairline pb-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-lg bg-blue-500/10 text-blue-500">
                      <Truck className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-bold text-primaryText uppercase tracking-wide">
                      Tactical Dispatch Decision Stream
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                    ROUTE: {subAgents.dispatch.route_accessibility_status}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {subAgents.dispatch.recommended_squads?.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-mono text-mutedGray uppercase block font-semibold">
                        Mobilized Field Units:
                      </span>
                      {subAgents.dispatch.recommended_squads.map((squad, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-surfaceCard border border-hairline flex items-start justify-between gap-2 text-[11px]"
                        >
                          <div>
                            <span className="font-bold text-primaryText font-mono">
                              {squad.count}x {squad.unit_type}
                            </span>
                            <p className="text-secondaryText text-[10px] mt-0.5">{squad.mission}</p>
                          </div>
                          <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                            DEPLOY
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-lg bg-surfaceCard border border-hairline">
                      <span className="text-[10px] font-mono text-mutedGray uppercase block mb-0.5">
                        Staging Area:
                      </span>
                      <span className="font-semibold text-primaryText">{subAgents.dispatch.staging_area}</span>
                    </div>

                    <div className="p-2 rounded-lg bg-surfaceCard border border-hairline">
                      <span className="text-[10px] font-mono text-mutedGray uppercase block mb-0.5">
                        Precautions:
                      </span>
                      <span className="font-medium text-amber-500">{subAgents.dispatch.special_tactical_precautions}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4. Operator Actions Toolbar */}
          <div className="pt-2 border-t border-hairline flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (subAgents?.grid?.immediate_breakers_to_trip?.length) {
                    requestBreakerToggle(subAgents.grid.immediate_breakers_to_trip[0]);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 font-bold text-[11px] flex items-center gap-1.5 transition-all"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Isolate Breakers (HITL)</span>
              </button>

              <button
                onClick={() => setSquadsDispatched(true)}
                disabled={squadsDispatched}
                className={`px-3 py-1.5 rounded-lg border font-bold text-[11px] flex items-center gap-1.5 transition-all ${
                  squadsDispatched
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-brandTeal hover:bg-brandTealGlow text-slate-900 border-transparent'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>{squadsDispatched ? 'Dispatched ✓' : 'Dispatch Field Units'}</span>
              </button>
            </div>

            <button
              onClick={handleCopyDirectiveToNotes}
              className="px-3 py-1.5 rounded-lg bg-surfaceElevated hover:bg-surface text-secondaryText hover:text-primaryText border border-hairline font-bold text-[11px] flex items-center gap-1.5 transition-all ml-auto shadow-sm"
            >
              {copiedNote ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedNote ? 'Appended to Notes!' : 'Append to Notes'}</span>
            </button>
          </div>
        </div>
      )}

      {/* HITL Safety Gate Modal */}
      {pendingBreaker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-surfaceCard border border-hairline shadow-xl p-5 space-y-4 text-primaryText">
            <div className="flex items-start justify-between gap-3 border-b border-hairline pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-red-500/10 text-red-500 ring-2 ring-red-500/20">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-primaryText uppercase tracking-wide font-display">
                    Human-in-the-Loop Safety Gate
                  </h3>
                  <p className="text-[10px] text-red-500 font-mono">
                    MANDATORY OPERATOR AUTHORIZATION REQUIRED
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPendingBreaker(null)}
                className="p-1 rounded-lg text-mutedGray hover:text-primaryText hover:bg-surfaceElevated transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-1">
                <span className="text-[10px] font-mono text-red-500 uppercase font-bold block">
                  Target Circuit Asset:
                </span>
                <p className="text-sm font-bold text-primaryText font-mono">{pendingBreaker}</p>
                <p className="text-secondaryText text-[11px]">
                  Tripping this breaker disconnects the 33kV primary feed. Automatic standby tie-line to Vasai West must engage to keep ICU energized.
                </p>
              </div>

              <label className="flex items-start gap-2 cursor-pointer text-secondaryText select-none p-2.5 rounded-lg bg-surfaceElevated border border-hairline">
                <input
                  type="checkbox"
                  checked={hitlConfirmed}
                  onChange={(e) => setHitlConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-hairline text-red-500 focus:ring-0 accent-red-500"
                />
                <span className="text-[11px] leading-relaxed">
                  I verify air-gap clearance and authorize high-voltage breaker isolation.
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setPendingBreaker(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-secondaryText hover:text-primaryText bg-surfaceElevated hover:bg-surface border border-hairline transition-all shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmHitlBreakerTrip}
                disabled={!hitlConfirmed}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-600 text-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Authorize & Trip</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
