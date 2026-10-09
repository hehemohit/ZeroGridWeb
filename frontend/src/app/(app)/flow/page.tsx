'use client';

import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  GitBranch,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Cpu,
  Radio,
  Zap,
  Activity,
  Droplets,
  Layers,
  ArrowRight,
  RefreshCw,
  Sliders,
  Terminal,
  Lock,
  Unlock,
  Hospital,
  Flame,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles
} from 'lucide-react';
import { api } from '@/lib/api';

// Step states
type StepStatus = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'CONSTRAINT_LOOP' | 'ERROR_PRESERVED' | 'FILTERED';

interface PresetScenario {
  id: string;
  title: string;
  badge: string;
  badgeColor: string;
  description: string;
  incident: {
    incident_id: string;
    incident_type: string;
    severity: string;
    coordinates: [number, number];
    water_depth_cm: number;
    message: string;
  };
  simulated_available_teams: string[] | null;
  inject_fault_at_step: string | null;
}

interface PipelineTimelineEntry {
  step: string;
  status: string;
  summary: string;
  timestamp: string;
}

export default function FlowTestingPage() {
  // Preset scenarios
  const [presets, setPresets] = useState<PresetScenario[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('scenario_resource_deficit');

  // Input states
  const [incidentId, setIncidentId] = useState<string>('INC_VIRAR_EAST_01');
  const [incidentType, setIncidentType] = useState<string>('SUBSTATION_WATER_INGRESS');
  const [severity, setSeverity] = useState<string>('CRITICAL');
  const [message, setMessage] = useState<string>(
    'Critical water ingress at Virar East 33kV switchyard. Water rising rapidly near primary transformer.'
  );
  const [waterDepthCm, setWaterDepthCm] = useState<number>(55);
  const [rainfallMm, setRainfallMm] = useState<number>(48);
  const [tidalSurgeM, setTidalSurgeM] = useState<number>(2.2);
  const [availableTeams, setAvailableTeams] = useState<string[]>(['TEAM_NDRF_ALPHA']);
  const [injectFaultStep, setInjectFaultStep] = useState<string>('NONE');

  // Execution states
  const [running, setRunning] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [timelineEvents, setTimelineEvents] = useState<PipelineTimelineEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'CHECKPOINT' | 'NEGOTIATION' | 'DIRECTIVE' | 'RAW'>('OVERVIEW');
  const [showConfigDrawer, setShowConfigDrawer] = useState<boolean>(false);

  // Active step highlights
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>({
    ALERT_TRIGGER: 'IDLE',
    CONFIDENCE_CALCULATION: 'IDLE',
    AGENT_ZERO_TASKING: 'IDLE',
    SUB_AGENT_COLLABORATION: 'IDLE',
    RESOURCE_NEGOTIATION: 'IDLE',
    ATOMIC_LOCK_DISPATCH: 'IDLE'
  });

  const socketRef = useRef<Socket | null>(null);

  // Fetch preset scenarios from backend on mount
  useEffect(() => {
    async function loadPresets() {
      try {
        let presetsList: PresetScenario[] = [];
        try {
          const res = await api.get<{ success: boolean; presets: PresetScenario[] }>('/api/flow/presets');
          presetsList = res.presets || [];
        } catch {
          const localRes = await fetch('/api/flow/presets');
          if (localRes.ok) {
            const data = await localRes.json();
            presetsList = data.presets || [];
          }
        }

        if (presetsList.length > 0) {
          setPresets(presetsList);
          applyPreset(presetsList[0]);
          return;
        }
      } catch {
        // Continue to hardcoded fallback below
      }

      const defaultPresets: PresetScenario[] = [
          {
            id: 'scenario_resource_deficit',
            title: 'Resource Deficit & Sub-Agent Reformulation Loop',
            badge: 'Negotiation Loop',
            badgeColor: 'amber',
            description: 'Sub-agent requests 4 rescue squads, but only 1 IDLE unit is free in Redis. Triggers live recursive feedback loop and plan reformulation.',
            incident: {
              incident_id: 'INC_DEFICIT_VIRAR_01',
              incident_type: 'SUBSTATION_WATER_INGRESS',
              severity: 'CRITICAL',
              coordinates: [19.4534, 72.8061],
              water_depth_cm: 55.0,
              message: 'Severe flood surge in Virar East switchyard. Standing water approaching 33kV busbars. Immediate multi-squad intervention demanded.'
            },
            simulated_available_teams: ['TEAM_NDRF_ALPHA'],
            inject_fault_at_step: null
          },
          {
            id: 'scenario_optimal_dispatch',
            title: 'Optimal Multi-Agent Dispatch (Direct Allocation)',
            badge: 'Happy Path',
            badgeColor: 'emerald',
            description: 'Sufficient emergency units are free in Redis. Triage, Grid, and Dispatch formulate requirements and Agent Zero locks units in single pass.',
            incident: {
              incident_id: 'INC_OPTIMAL_VASAI_02',
              incident_type: 'SUBSTATION_WATER_INGRESS',
              severity: 'HIGH',
              coordinates: [19.3820, 72.8280],
              water_depth_cm: 38.0,
              message: 'Water ingress at Vasai West primary substation. Drain channels obstructed. Linemen and pump crews required.'
            },
            simulated_available_teams: ['TEAM_NDRF_ALPHA', 'TEAM_PUMP_CREW_01', 'TEAM_LINEMEN_SQUAD_04'],
            inject_fault_at_step: null
          },
          {
            id: 'scenario_false_alert',
            title: 'False Alarm & Anomaly Noise Filtering',
            badge: 'Confidence Filter',
            badgeColor: 'blue',
            description: 'Spurious sensor noise or unverified report. Confidence Calculator Agent evaluates low credibility (< 0.70) and short-circuits.',
            incident: {
              incident_id: 'INC_FALSE_ALARM_03',
              incident_type: 'SENSOR_ANOMALY',
              severity: 'LOW',
              coordinates: [19.4500, 72.8100],
              water_depth_cm: 4.0,
              message: 'Brief water sensor flicker detected during dry clear skies. No visual flooding confirmed.'
            },
            simulated_available_teams: null,
            inject_fault_at_step: null
          },
          {
            id: 'scenario_fault_injection',
            title: 'Mid-Pipeline Fault Injection & State Preservation',
            badge: 'Fault Recovery',
            badgeColor: 'red',
            description: 'Injects synthetic failure at Step 4 (Resource Negotiation). Checkpoint engine preserves prior agent states for recovery.',
            incident: {
              incident_id: 'INC_FAULT_TEST_04',
              incident_type: 'SUBSTATION_WATER_INGRESS',
              severity: 'CRITICAL',
              coordinates: [19.4534, 72.8061],
              water_depth_cm: 60.0,
              message: 'Critical emergency scenario used to verify fault resilience and state checkpoint integrity.'
            },
            simulated_available_teams: ['TEAM_NDRF_ALPHA'],
            inject_fault_at_step: 'RESOURCE_NEGOTIATION'
          }
        ];
        setPresets(defaultPresets);
        applyPreset(defaultPresets[0]);
    }
    loadPresets();
  }, []);

  // Connect to Socket.io /sos namespace for live step events
  useEffect(() => {
    const socket = io(`${api.baseUrl}/sos`, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('flow:step:update', (data: any) => {
      setTimelineEvents((prev) => [
        ...prev,
        {
          step: data.step,
          status: data.status,
          summary: data.summary,
          timestamp: data.timestamp || new Date().toISOString()
        }
      ]);

      // Map microservice steps to visual nodes
      setStepStatuses((prev) => {
        const next = { ...prev };
        if (data.step === 'INIT') {
          next.ALERT_TRIGGER = 'COMPLETED';
        } else if (data.step === 'CONFIDENCE_CALCULATION') {
          next.CONFIDENCE_CALCULATION = data.status === 'RUNNING' ? 'RUNNING' : data.status === 'FILTERED_FALSE_ALERT' ? 'FILTERED' : 'COMPLETED';
        } else if (data.step === 'SUB_AGENT_COLLABORATION') {
          next.SUB_AGENT_COLLABORATION = data.status === 'RUNNING' ? 'RUNNING' : data.status === 'ERROR_PRESERVED' ? 'ERROR_PRESERVED' : 'COMPLETED';
          next.AGENT_ZERO_TASKING = 'COMPLETED';
        } else if (data.step === 'RESOURCE_NEGOTIATION') {
          next.RESOURCE_NEGOTIATION = data.status === 'RUNNING' ? 'RUNNING' : data.status === 'ERROR_PRESERVED' ? 'ERROR_PRESERVED' : 'COMPLETED';
        } else if (data.step === 'ATOMIC_LOCK_AND_DISPATCH') {
          next.ATOMIC_LOCK_DISPATCH = data.status === 'RUNNING' ? 'RUNNING' : 'COMPLETED';
        }
        return next;
      });
    });

    socket.on('flow:completed', (data: any) => {
      setStepStatuses((prev) => ({
        ...prev,
        ATOMIC_LOCK_DISPATCH: 'COMPLETED'
      }));
    });

    socket.on('sos:new', (data: any) => {
      console.log('🚨 Live SOS Received over Socket.io:', data);
      setIncidentId(data.id || data._id || 'SOS_LIVE');
      if (data.message) setMessage(data.message);
      if (data.waterDepthCm !== undefined) setWaterDepthCm(Number(data.waterDepthCm));
      setTimelineEvents((prev) => [
        ...prev,
        {
          step: 'INIT',
          status: 'RUNNING',
          summary: `Incoming Live SOS: ${data.message || 'Distress signal detected'} (${data.waterDepthCm || 0}cm water depth)`,
          timestamp: new Date().toISOString()
        }
      ]);
      setStepStatuses((prev) => ({
        ...prev,
        ALERT_TRIGGER: 'COMPLETED',
        CONFIDENCE_CALCULATION: 'RUNNING'
      }));
    });

    socket.on('sos:agent_zero_orchestrated', (data: any) => {
      console.log('⚡ Agent Zero Live Orchestration received:', data);
      if (data.directive) {
        setExecutionResult({
          incident_id: data.sosId,
          status: 'VERIFIED_AND_ASSIGNED',
          assigned_teams: data.directive.assignedSquad ? [data.directive.assignedSquad] : ['TEAM_NDRF_ALPHA'],
          agent_zero_directive: data.directive,
          sub_agents: data.orchestration?.sub_agents,
          resource_negotiation: {
            rounds_count: 1,
            assigned_teams: data.directive.assignedSquad ? [data.directive.assignedSquad] : ['TEAM_NDRF_ALPHA']
          }
        });
        setStepStatuses({
          ALERT_TRIGGER: 'COMPLETED',
          CONFIDENCE_CALCULATION: 'COMPLETED',
          AGENT_ZERO_TASKING: 'COMPLETED',
          SUB_AGENT_COLLABORATION: 'COMPLETED',
          RESOURCE_NEGOTIATION: 'COMPLETED',
          ATOMIC_LOCK_DISPATCH: 'COMPLETED'
        });
      }
    });

    socket.on('flow:error', (data: any) => {
      // Retain preserved state visual
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const applyPreset = (preset: PresetScenario) => {
    setSelectedPresetId(preset.id);
    setIncidentId(preset.incident.incident_id);
    setIncidentType(preset.incident.incident_type);
    setSeverity(preset.incident.severity);
    setMessage(preset.incident.message);
    setWaterDepthCm(preset.incident.water_depth_cm);
    setAvailableTeams(preset.simulated_available_teams || ['TEAM_NDRF_ALPHA', 'TEAM_PUMP_CREW_01']);
    setInjectFaultStep(preset.inject_fault_at_step || 'NONE');
  };

  const handleReset = () => {
    setExecutionResult(null);
    setTimelineEvents([]);
    setStepStatuses({
      ALERT_TRIGGER: 'IDLE',
      CONFIDENCE_CALCULATION: 'IDLE',
      AGENT_ZERO_TASKING: 'IDLE',
      SUB_AGENT_COLLABORATION: 'IDLE',
      RESOURCE_NEGOTIATION: 'IDLE',
      ATOMIC_LOCK_DISPATCH: 'IDLE'
    });
  };

  const handleExecuteFlow = async () => {
    setRunning(true);
    handleReset();

    // Trigger visual start
    setStepStatuses({
      ALERT_TRIGGER: 'COMPLETED',
      CONFIDENCE_CALCULATION: 'RUNNING',
      AGENT_ZERO_TASKING: 'IDLE',
      SUB_AGENT_COLLABORATION: 'IDLE',
      RESOURCE_NEGOTIATION: 'IDLE',
      ATOMIC_LOCK_DISPATCH: 'IDLE'
    });

    const payload = {
      incident_id: incidentId,
      incident_type: incidentType,
      severity: severity,
      coordinates: [19.4534, 72.8061],
      water_depth_cm: Number(waterDepthCm),
      message: message,
      weather_override: {
        rainfall_mm_per_hr: Number(rainfallMm),
        tidal_surge_m: Number(tidalSurgeM)
      },
      simulated_available_teams: availableTeams,
      inject_fault_at_step: injectFaultStep !== 'NONE' ? injectFaultStep : undefined
    };

    try {
      let response: any = null;

      // Try Express backend first, gracefully falling back to Next.js API route
      try {
        response = await api.post<{
          success: boolean;
          pipeline_result: any;
          weather_telemetry: any;
        }>('/api/flow/run', payload);
      } catch (backendErr) {
        console.warn('Backend proxy 404 / unavailable (server not restarted), falling back to local Next.js route:', backendErr);
        const localRes = await fetch('/api/flow/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!localRes.ok) {
          throw new Error(`HTTP ${localRes.status}: Unable to execute flow pipeline`);
        }
        response = await localRes.json();
      }

      const res = response?.pipeline_result;
      if (!res) {
        throw new Error('Invalid pipeline response format received.');
      }

      setExecutionResult(res);

      if (res.status === 'FALSE_ALERT_FILTERED') {
        setStepStatuses({
          ALERT_TRIGGER: 'COMPLETED',
          CONFIDENCE_CALCULATION: 'FILTERED',
          AGENT_ZERO_TASKING: 'IDLE',
          SUB_AGENT_COLLABORATION: 'IDLE',
          RESOURCE_NEGOTIATION: 'IDLE',
          ATOMIC_LOCK_DISPATCH: 'IDLE'
        });
      } else if (res.status === 'ERROR_PRESERVED_STATE') {
        setStepStatuses({
          ALERT_TRIGGER: 'COMPLETED',
          CONFIDENCE_CALCULATION: 'COMPLETED',
          AGENT_ZERO_TASKING: 'COMPLETED',
          SUB_AGENT_COLLABORATION: res.failed_step === 'SUB_AGENT_COLLABORATION' ? 'ERROR_PRESERVED' : 'COMPLETED',
          RESOURCE_NEGOTIATION: res.failed_step === 'RESOURCE_NEGOTIATION' ? 'ERROR_PRESERVED' : 'IDLE',
          ATOMIC_LOCK_DISPATCH: 'IDLE'
        });
      } else {
        // Complete happy path
        const wasNegotiated = (res.resource_negotiation?.rounds_count || 1) > 1;
        setStepStatuses({
          ALERT_TRIGGER: 'COMPLETED',
          CONFIDENCE_CALCULATION: 'COMPLETED',
          AGENT_ZERO_TASKING: 'COMPLETED',
          SUB_AGENT_COLLABORATION: 'COMPLETED',
          RESOURCE_NEGOTIATION: wasNegotiated ? 'CONSTRAINT_LOOP' : 'COMPLETED',
          ATOMIC_LOCK_DISPATCH: 'COMPLETED'
        });
      }
    } catch (err: any) {
      console.error('Flow execution failed', err);
      setStepStatuses({
        ALERT_TRIGGER: 'COMPLETED',
        CONFIDENCE_CALCULATION: 'ERROR_PRESERVED',
        AGENT_ZERO_TASKING: 'IDLE',
        SUB_AGENT_COLLABORATION: 'IDLE',
        RESOURCE_NEGOTIATION: 'IDLE',
        ATOMIC_LOCK_DISPATCH: 'IDLE'
      });
    } finally {
      setRunning(false);
    }
  };

  const allTeamsList = [
    { id: 'TEAM_NDRF_ALPHA', label: 'NDRF Flood Rescue Alpha' },
    { id: 'TEAM_NDRF_BRAVO', label: 'NDRF Evacuation Bravo' },
    { id: 'TEAM_PUMP_CREW_01', label: 'Dewatering Squad 01 (500-HP)' },
    { id: 'TEAM_LINEMEN_SQUAD_04', label: 'MSEDCL High-Voltage Linemen' }
  ];

  const toggleTeam = (tid: string) => {
    setAvailableTeams((prev) =>
      prev.includes(tid) ? prev.filter((t) => t !== tid) : [...prev, tid]
    );
  };

  const preservedState = executionResult?.preserved_state || executionResult?.pipeline_checkpoint?.last_valid_data;
  const negotiationRounds = executionResult?.resource_negotiation?.negotiation_log || [];
  const directive = executionResult?.agent_zero_directive;

  return (
    <div className="flex flex-col h-full bg-canvas text-primaryText overflow-y-auto">
      {/* Top Header */}
      <header className="px-5 py-4 border-b border-hairline bg-surface flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brandTeal/10 border border-brandTeal/30 flex items-center justify-center text-brandTeal shadow-xs">
            <GitBranch className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-display tracking-tight text-primaryText">
                Agent Zero Flow Visualizer
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-brandTeal/15 text-brandTeal border border-brandTeal/25 uppercase tracking-wider">
                Multi-Agent Loop
              </span>
            </div>
            <p className="text-xs text-secondaryText">
              Recursive sub-agent negotiation, real-time Redis pool matching, and fault-tolerant checkpoint preservation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfigDrawer(!showConfigDrawer)}
            className="px-3 py-2 text-xs font-medium border border-hairline rounded-lg bg-surfaceElevated hover:bg-surface text-secondaryText hover:text-primaryText transition-colors flex items-center gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Telemetry Controls</span>
            {showConfigDrawer ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <button
            onClick={handleReset}
            disabled={running}
            className="px-3 py-2 text-xs font-medium border border-hairline rounded-lg bg-surfaceElevated hover:bg-surface text-secondaryText hover:text-primaryText transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            onClick={handleExecuteFlow}
            disabled={running}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-brandTeal text-slate-950 hover:bg-brandTeal/90 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {running ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Executing Pipeline...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Execute Flow Test</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Preset Scenarios Strip */}
      <section className="px-5 py-3 border-b border-hairline bg-surfaceElevated/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-mutedGray font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-brandTeal" />
            Scenario Presets
          </span>
          <span className="text-[11px] text-secondaryText font-mono">
            Active: <span className="text-brandTeal font-medium">{presets.find((p) => p.id === selectedPresetId)?.badge}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {presets.map((preset) => {
            const isSelected = selectedPresetId === preset.id;
            const badgeClasses =
              preset.badgeColor === 'amber'
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                : preset.badgeColor === 'emerald'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : preset.badgeColor === 'blue'
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                : 'bg-red-500/15 text-red-400 border-red-500/30';

            return (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-surface border-brandTeal ring-1 ring-brandTeal/30 shadow-xs'
                    : 'bg-surface border-hairline hover:border-brandTeal/50'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-xs font-semibold text-primaryText truncate">{preset.title.split('&')[0]}</span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${badgeClasses}`}>
                    {preset.badge}
                  </span>
                </div>
                <p className="text-[11px] text-secondaryText line-clamp-2 leading-relaxed">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Expandable Configuration Drawer */}
      {showConfigDrawer && (
        <section className="px-5 py-4 border-b border-hairline bg-surface transition-all">
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Column 1: Alert Text & Hazard */}
            <div className="space-y-3">
              <span className="text-xs font-mono uppercase tracking-wider text-mutedGray font-semibold">
                Alert Telemetry
              </span>
              <div>
                <label className="text-[11px] text-secondaryText block mb-1">Incident Description</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  className="w-full text-xs p-2 rounded-lg bg-surfaceElevated border border-hairline text-primaryText focus:border-brandTeal outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-secondaryText block mb-1">Water Depth: {waterDepthCm} cm</label>
                  <input
                    type="range"
                    min="2"
                    max="100"
                    value={waterDepthCm}
                    onChange={(e) => setWaterDepthCm(Number(e.target.value))}
                    className="w-full accent-brandTeal cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-secondaryText block mb-1">Severity</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    className="w-full text-xs p-1.5 rounded-lg bg-surfaceElevated border border-hairline text-primaryText"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Column 2: Live Weather / Tidal Overrides */}
            <div className="space-y-3">
              <span className="text-xs font-mono uppercase tracking-wider text-mutedGray font-semibold flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5 text-blue-400" />
                Hybrid Coastal Telemetry
              </span>
              <div>
                <label className="text-[11px] text-secondaryText block mb-1">
                  Rainfall Rate: {rainfallMm} mm/hr
                </label>
                <input
                  type="range"
                  min="0"
                  max="120"
                  value={rainfallMm}
                  onChange={(e) => setRainfallMm(Number(e.target.value))}
                  className="w-full accent-blue-400 cursor-pointer"
                />
              </div>
              <div>
                <label className="text-[11px] text-secondaryText block mb-1">
                  Tidal Surge: {tidalSurgeM} m
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.1"
                  value={tidalSurgeM}
                  onChange={(e) => setTidalSurgeM(Number(e.target.value))}
                  className="w-full accent-blue-400 cursor-pointer"
                />
              </div>
            </div>

            {/* Column 3: Redis Available Squads & Fault Injection */}
            <div className="space-y-3">
              <span className="text-xs font-mono uppercase tracking-wider text-mutedGray font-semibold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                Redis Pool & Fault Injection
              </span>
              <div>
                <label className="text-[11px] text-secondaryText block mb-1.5">
                  Available IDLE Squads in Redis ({availableTeams.length} units free)
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {allTeamsList.map((team) => {
                    const isChecked = availableTeams.includes(team.id);
                    return (
                      <button
                        type="button"
                        key={team.id}
                        onClick={() => toggleTeam(team.id)}
                        className={`text-[10px] p-1.5 rounded-md border text-left flex items-center justify-between transition-colors cursor-pointer ${
                          isChecked
                            ? 'bg-brandTeal/10 border-brandTeal/40 text-brandTeal font-medium'
                            : 'bg-surfaceElevated border-hairline text-mutedGray'
                        }`}
                      >
                        <span className="truncate">{team.label}</span>
                        {isChecked && <Check className="w-3 h-3 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-secondaryText block mb-1">Synthetic Fault Injection</label>
                <select
                  value={injectFaultStep}
                  onChange={(e) => setInjectFaultStep(e.target.value)}
                  className="w-full text-xs p-1.5 rounded-lg bg-surfaceElevated border border-hairline text-primaryText"
                >
                  <option value="NONE">None (Clean Execution)</option>
                  <option value="RESOURCE_NEGOTIATION">Fail at Step 4 (Resource Negotiation)</option>
                  <option value="SUB_AGENT_COLLABORATION">Fail at Step 2 (Sub-Agent Collaboration)</option>
                </select>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Content Workspace */}
      <div className="flex-1 p-5 space-y-5 max-w-7xl mx-auto w-full">
        {/* Animated Visual Flow Pipeline */}
        <section className="bg-surface rounded-2xl border border-hairline p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-brandTeal" />
              <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-primaryText">
                Multi-Agent Negotiation Pipeline
              </h2>
            </div>
            {executionResult && (
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-mono font-semibold border ${
                  executionResult.status === 'VERIFIED_AND_ASSIGNED'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : executionResult.status === 'ERROR_PRESERVED_STATE'
                    ? 'bg-red-500/15 text-red-400 border-red-500/30'
                    : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                }`}
              >
                Status: {executionResult.status}
              </span>
            )}
          </div>

          {/* Node Flow Diagram */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 relative">
            {/* Step 1: Incoming Alert */}
            <PipelineNode
              title="1. Alert Trigger"
              subtitle="Ground Telemetry & SOS"
              icon={Zap}
              status={stepStatuses.ALERT_TRIGGER}
              details={`${waterDepthCm}cm depth / ${severity}`}
            />

            {/* Step 2: Confidence Calculator */}
            <PipelineNode
              title="2. Confidence Agent"
              subtitle="Veracity & Noise Filter"
              icon={ShieldAlert}
              status={stepStatuses.CONFIDENCE_CALCULATION}
              details={
                executionResult?.confidence_data
                  ? `Score: ${(executionResult.confidence_data.confidence_score * 100).toFixed(0)}%`
                  : 'Fast Model (Llama 3.1 8B)'
              }
            />

            {/* Step 3: Agent Zero Tasking */}
            <PipelineNode
              title="3. Agent Zero"
              subtitle="Master Tasking & Context"
              icon={Cpu}
              status={stepStatuses.AGENT_ZERO_TASKING}
              details="Root Substation Graph"
            />

            {/* Step 4: Sub-Agent Collaboration */}
            <PipelineNode
              title="4. Sub-Agents"
              subtitle="Triage + Grid + Dispatch"
              icon={Layers}
              status={stepStatuses.SUB_AGENT_COLLABORATION}
              details="Rainfall, Impendance, Squads"
            />

            {/* Step 5: Resource Negotiation Loop */}
            <PipelineNode
              title="5. Negotiation Loop"
              subtitle="Redis Pool Constraint Match"
              icon={RefreshCw}
              status={stepStatuses.RESOURCE_NEGOTIATION}
              isLoop={true}
              roundsCount={executionResult?.resource_negotiation?.rounds_count}
              details={
                executionResult?.resource_negotiation
                  ? `${executionResult.resource_negotiation.rounds_count} Round(s) / ${executionResult.assigned_teams?.length || 0} Units`
                  : 'Recursive feedback'
              }
            />

            {/* Step 6: Atomic Lock & Dispatch */}
            <PipelineNode
              title="6. Redis Lock"
              subtitle="SET NX EX Dispatch"
              icon={Lock}
              status={stepStatuses.ATOMIC_LOCK_DISPATCH}
              details={
                executionResult?.assigned_teams
                  ? `${executionResult.assigned_teams.length} Locked`
                  : 'Distributed Atomic Lock'
              }
            />
          </div>

          {/* Recursive Negotiation Banner when loop re-triggers */}
          {executionResult?.resource_negotiation?.rounds_count > 1 && (
            <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-300">
              <div className="flex items-center gap-2.5">
                <RefreshCw className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
                <span>
                  <strong>Recursive Loop Activated:</strong> Sub-agent initially requested more teams than available in Redis. Agent Zero communicated the constraint, and the sub-agent successfully reformulated the tactical requirement plan.
                </span>
              </div>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                {executionResult.resource_negotiation.rounds_count} Rounds
              </span>
            </div>
          )}

          {/* Fault Preserved Banner */}
          {executionResult?.status === 'ERROR_PRESERVED_STATE' && (
            <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between text-xs text-red-300">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>
                  <strong>Fault Intercepted & State Preserved:</strong> Exception caught at step [
                  <code className="bg-red-950/60 px-1.5 py-0.5 rounded text-red-200">{executionResult.failed_step}</code>
                  ]. All preceding sub-agent states are checkpointed without loss. Execution can resume directly.
                </span>
              </div>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 shrink-0">
                Checkpoint Intact
              </span>
            </div>
          )}
        </section>

        {/* Tabbed Detail Inspector */}
        <section className="bg-surface rounded-2xl border border-hairline overflow-hidden shadow-xs">
          {/* Tabs Header */}
          <div className="flex items-center border-b border-hairline px-4 bg-surfaceElevated/40">
            <TabButton active={activeTab === 'OVERVIEW'} onClick={() => setActiveTab('OVERVIEW')} label="Executive Overview" />
            <TabButton active={activeTab === 'CHECKPOINT'} onClick={() => setActiveTab('CHECKPOINT')} label="State Checkpoint" badge="Preserved" />
            <TabButton active={activeTab === 'NEGOTIATION'} onClick={() => setActiveTab('NEGOTIATION')} label="Negotiation Log" badge={`${negotiationRounds.length || 0}`} />
            <TabButton active={activeTab === 'DIRECTIVE'} onClick={() => setActiveTab('DIRECTIVE')} label="Agent Zero Directive" />
            <TabButton active={activeTab === 'RAW'} onClick={() => setActiveTab('RAW')} label="Raw JSON Payload" />
          </div>

          <div className="p-5">
            {/* TAB 1: OVERVIEW */}
            {activeTab === 'OVERVIEW' && (
              <div className="space-y-4">
                {!executionResult ? (
                  <div className="text-center py-12 text-secondaryText">
                    <GitBranch className="w-10 h-10 mx-auto mb-3 text-mutedGray opacity-50" />
                    <p className="text-sm font-medium">No pipeline run active yet.</p>
                    <p className="text-xs text-mutedGray mt-1">Select a scenario above and click &quot;Execute Flow Test&quot;.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Directive Summary */}
                    <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline md:col-span-2 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-brandTeal flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5" />
                          Master Operational Directive
                        </span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-surface text-secondaryText border border-hairline">
                          Threat Score: {directive?.overall_threat_score || 88}
                        </span>
                      </div>
                      <p className="text-xs text-primaryText leading-relaxed">
                        {directive?.executive_summary || 'Multi-agent coordination completed.'}
                      </p>

                      <div className="p-3 rounded-lg bg-surface border border-hairline/80 space-y-1.5">
                        <span className="text-[11px] font-mono text-emerald-400 font-semibold flex items-center gap-1.5">
                          <Hospital className="w-3.5 h-3.5" />
                          Hospital Lifeline Protocol
                        </span>
                        <p className="text-xs text-secondaryText">
                          {directive?.hospital_lifeline_protocol || 'Emergency tie line routed to critical facility busbar.'}
                        </p>
                      </div>

                      {directive?.immediate_automated_actions && (
                        <div>
                          <span className="text-[11px] font-mono text-secondaryText block mb-1">Automated Switchgear Actions:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {directive.immediate_automated_actions.map((act: string, idx: number) => (
                              <span key={idx} className="text-[11px] font-mono px-2 py-0.5 rounded bg-brandTeal/10 text-brandTeal border border-brandTeal/20">
                                {act}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Assigned Squads & Lock Table */}
                    <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline space-y-3">
                      <span className="text-xs font-mono font-semibold uppercase tracking-wider text-mutedGray flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        Allocated Tactical Squads
                      </span>

                      {executionResult.assigned_teams && executionResult.assigned_teams.length > 0 ? (
                        <div className="space-y-2">
                          {executionResult.assigned_teams.map((teamId: string, idx: number) => (
                            <div key={idx} className="p-2.5 rounded-lg bg-surface border border-hairline flex items-center justify-between">
                              <div>
                                <span className="text-xs font-semibold text-primaryText block">{teamId}</span>
                                <span className="text-[10px] text-mutedGray font-mono">Status: LOCKED (SET NX EX)</span>
                              </div>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                ASSIGNED
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-xs text-secondaryText">
                          No teams assigned.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: STATE CHECKPOINT */}
            {activeTab === 'CHECKPOINT' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-semibold uppercase tracking-wider text-secondaryText">
                    Fault-Tolerant Checkpoint State (<code className="text-brandTeal">state_checkpoint.last_valid_data</code>)
                  </span>
                  <span className="text-[11px] font-mono text-mutedGray">
                    Step: {executionResult?.pipeline_checkpoint?.step || executionResult?.failed_step || 'N/A'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Confidence Checkpoint */}
                  <div className="p-3.5 rounded-xl bg-surfaceElevated border border-hairline">
                    <span className="text-xs font-mono font-semibold text-brandTeal block mb-2">1. Confidence Evaluation</span>
                    <pre className="text-[11px] font-mono text-secondaryText overflow-x-auto p-2.5 rounded bg-surface border border-hairline">
                      {JSON.stringify(preservedState?.confidence || executionResult?.confidence_data || {}, null, 2)}
                    </pre>
                  </div>

                  {/* Requirements Checkpoint */}
                  <div className="p-3.5 rounded-xl bg-surfaceElevated border border-hairline">
                    <span className="text-xs font-mono font-semibold text-amber-400 block mb-2">2. Sub-Agent Requirements</span>
                    <pre className="text-[11px] font-mono text-secondaryText overflow-x-auto p-2.5 rounded bg-surface border border-hairline">
                      {JSON.stringify(preservedState?.requirements || {}, null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Sub-Agents Preserved */}
                <div className="p-3.5 rounded-xl bg-surfaceElevated border border-hairline">
                  <span className="text-xs font-mono font-semibold text-blue-400 block mb-2">3. Sub-Agents Deliverables (Triage, Grid, Dispatch)</span>
                  <pre className="text-[11px] font-mono text-secondaryText overflow-x-auto p-2.5 rounded bg-surface border border-hairline max-h-60">
                    {JSON.stringify(preservedState?.sub_agents || executionResult?.sub_agents || {}, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* TAB 3: NEGOTIATION LOG */}
            {activeTab === 'NEGOTIATION' && (
              <div className="space-y-3">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-mutedGray block mb-1">
                  Recursive Resource Negotiation Rounds
                </span>

                {negotiationRounds.length === 0 ? (
                  <p className="text-xs text-secondaryText py-6 text-center">No negotiation logs for this run.</p>
                ) : (
                  negotiationRounds.map((round: any, idx: number) => (
                    <div key={idx} className="p-3.5 rounded-xl bg-surfaceElevated border border-hairline space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-primaryText">Round {round.round || idx + 1}: {round.status}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Available: {round.available} / Requested: {round.requested || round.requested_original}
                        </span>
                      </div>
                      <p className="text-xs text-secondaryText">
                        {round.notes || round.reformulation_notes}
                      </p>
                      {round.assigned_teams && (
                        <div className="text-[11px] font-mono text-brandTeal">
                          Assigned Units: {round.assigned_teams.join(', ')}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 4: DIRECTIVE */}
            {activeTab === 'DIRECTIVE' && (
              <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline">
                <pre className="text-xs font-mono text-secondaryText overflow-x-auto">
                  {JSON.stringify(directive || {}, null, 2)}
                </pre>
              </div>
            )}

            {/* TAB 5: RAW PAYLOAD */}
            {activeTab === 'RAW' && (
              <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline">
                <pre className="text-xs font-mono text-secondaryText overflow-x-auto max-h-96">
                  {JSON.stringify(executionResult || {}, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// Pipeline Node Sub-component
function PipelineNode({
  title,
  subtitle,
  icon: Icon,
  status,
  details,
  isLoop = false,
  roundsCount
}: {
  title: string;
  subtitle: string;
  icon: any;
  status: StepStatus;
  details?: string;
  isLoop?: boolean;
  roundsCount?: number;
}) {
  const isRunning = status === 'RUNNING';
  const isCompleted = status === 'COMPLETED';
  const isLoopActive = status === 'CONSTRAINT_LOOP';
  const isError = status === 'ERROR_PRESERVED';
  const isFiltered = status === 'FILTERED';

  let borderClass = 'border-hairline bg-surfaceElevated';
  let badgeColor = 'text-mutedGray bg-surface';
  let badgeLabel = 'WAITING';

  if (isRunning) {
    borderClass = 'border-brandTeal ring-2 ring-brandTeal/30 bg-brandTeal/5 shadow-md animate-pulse';
    badgeColor = 'text-brandTeal bg-brandTeal/15 border-brandTeal/30';
    badgeLabel = 'RUNNING';
  } else if (isLoopActive) {
    borderClass = 'border-amber-500 bg-amber-500/5 ring-1 ring-amber-500/40 shadow-xs';
    badgeColor = 'text-amber-400 bg-amber-500/15 border-amber-500/30';
    badgeLabel = `LOOP x${roundsCount || 2}`;
  } else if (isCompleted) {
    borderClass = 'border-emerald-500/60 bg-emerald-500/5';
    badgeColor = 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30';
    badgeLabel = 'RESOLVED';
  } else if (isError) {
    borderClass = 'border-red-500 bg-red-500/10 ring-1 ring-red-500/40';
    badgeColor = 'text-red-400 bg-red-500/15 border-red-500/30';
    badgeLabel = 'CHECKPOINTED';
  } else if (isFiltered) {
    borderClass = 'border-blue-500 bg-blue-500/10';
    badgeColor = 'text-blue-400 bg-blue-500/15 border-blue-500/30';
    badgeLabel = 'FILTERED';
  }

  return (
    <div className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${borderClass}`}>
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="w-7 h-7 rounded-lg bg-surface border border-hairline flex items-center justify-center text-primaryText">
            <Icon className="w-3.5 h-3.5" />
          </div>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${badgeColor}`}>
            {badgeLabel}
          </span>
        </div>
        <h3 className="text-xs font-bold text-primaryText leading-snug">{title}</h3>
        <p className="text-[10px] text-secondaryText truncate mb-2">{subtitle}</p>
      </div>

      <div className="pt-2 border-t border-hairline/60 flex items-center justify-between text-[10px] font-mono text-mutedGray">
        <span className="truncate">{details || '—'}</span>
        {isCompleted && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />}
        {isLoopActive && <RefreshCw className="w-3 h-3 text-amber-400 shrink-0 ml-1" />}
        {isError && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 ml-1" />}
      </div>
    </div>
  );
}

// Tab button helper
function TabButton({
  active,
  onClick,
  label,
  badge
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
        active
          ? 'border-brandTeal text-brandTeal font-semibold'
          : 'border-transparent text-secondaryText hover:text-primaryText'
      }`}
    >
      <span>{label}</span>
      {badge && (
        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-surfaceElevated border border-hairline text-mutedGray">
          {badge}
        </span>
      )}
    </button>
  );
}
