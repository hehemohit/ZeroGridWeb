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
  ArrowDown,
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
  Sparkles,
  Waves,
  Sun,
  LifeBuoy,
  Users,
  Compass,
  CheckSquare
} from 'lucide-react';
import { api } from '@/lib/api';

// Step states
type StepStatus = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'CONSTRAINT_LOOP' | 'ERROR_PRESERVED' | 'FILTERED';

interface PresetScenario {
  id: string;
  title: string;
  badge: string;
  badgeColor: string;
  domain?: string;
  targetDepartment?: string;
  fallbackDepartment?: string | null;
  requiredTags?: string[];
  fallbackTags?: string[];
  description: string;
  incident: {
    incident_id: string;
    incident_type: string;
    domain?: string;
    category?: string;
    severity: string;
    coordinates: [number, number];
    water_depth_cm: number;
    temperature_c?: number;
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
  const [selectedPresetId, setSelectedPresetId] = useState<string>('scenario_grid_flood_fallback');

  // Input states
  const [incidentId, setIncidentId] = useState<string>('TICKET_GRID_301');
  const [incidentType, setIncidentType] = useState<string>('SUBSTATION_WATER_INGRESS');
  const [severity, setSeverity] = useState<string>('CRITICAL');
  const [message, setMessage] = useState<string>(
    '33kV switchyard submerged. Feeder breaker tripped. Linemen needed for air-gap isolation and emergency dewatering pumps to drain yard.'
  );
  const [waterDepthCm, setWaterDepthCm] = useState<number>(55);
  const [temperatureC, setTemperatureC] = useState<number>(28);
  const [rainfallMm, setRainfallMm] = useState<number>(48);
  const [tidalSurgeM, setTidalSurgeM] = useState<number>(2.2);
  const [availableTeams, setAvailableTeams] = useState<string[]>(['admin.grid.01@zerogrid.org']);
  const [injectFaultStep, setInjectFaultStep] = useState<string>('NONE');

  // Execution states
  const [running, setRunning] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [timelineEvents, setTimelineEvents] = useState<PipelineTimelineEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'CHECKPOINT' | 'NEGOTIATION' | 'DIRECTIVE' | 'RAW'>('OVERVIEW');
  const [showConfigDrawer, setShowConfigDrawer] = useState<boolean>(false);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);

  // Active step highlights
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>({
    ALERT_TRIGGER: 'IDLE',
    CONFIDENCE_CALCULATION: 'IDLE',
    DEDUPLICATION: 'IDLE',
    DOMAIN_ROUTING: 'IDLE',
    DEMAND_GENERATION: 'IDLE',
    RESOURCE_NEGOTIATION: 'IDLE',
    ATOMIC_LOCK_DISPATCH: 'IDLE'
  });

  const socketRef = useRef<Socket | null>(null);

  // Fetch preset scenarios from backend on mount
  useEffect(() => {
    async function loadPresets() {
      try {
        const res = await api.get<{ success: boolean; presets: PresetScenario[] }>('/api/flow/presets');
        if (res.presets && res.presets.length > 0) {
          setPresets(res.presets);
          applyPreset(res.presets[0]);
        }
      } catch (err) {
        console.warn('Backend presets 404, using fallback presets');
      }
    }
    loadPresets();
  }, []);

  // Connect to Socket.io /sos namespace for live step events
  useEffect(() => {
    const socket = io(`${api.baseUrl}/sos`, {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Flow page connected to Socket.io /sos namespace');
      setSocketConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('⚠️ Flow page disconnected from Socket.io');
      setSocketConnected(false);
    });

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

      setStepStatuses((prev) => {
        const next = { ...prev };
        if (data.step === 'INIT') {
          next.ALERT_TRIGGER = 'COMPLETED';
        } else if (data.step === 'CONFIDENCE_CALCULATION') {
          next.CONFIDENCE_CALCULATION = data.status === 'RUNNING' ? 'RUNNING' : data.status === 'FILTERED_FALSE_ALERT' ? 'FILTERED' : 'COMPLETED';
        } else if (
          data.step === 'DEDUPLICATION_AND_PRIORITY' ||
          data.step === 'DEDUPLICATION' ||
          data.step === 'AGENT_ZERO_INTAKE_AND_CLASSIFICATION'
        ) {
          next.DEDUPLICATION = 'COMPLETED';
          next.DOMAIN_ROUTING = 'COMPLETED';
        } else if (
          data.step === 'SUB_AGENT_TACTICAL_ASSESSMENT' ||
          data.step === 'SUB_AGENT_COLLABORATION' ||
          data.step === 'REQUIREMENTS_GENERATION'
        ) {
          next.DOMAIN_ROUTING = 'COMPLETED';
          next.DEMAND_GENERATION = 'COMPLETED';
        } else if (
          data.step === 'AGENT_ZERO_WORKFORCE_ALLOCATION' ||
          data.step === 'RESOURCE_NEGOTIATION'
        ) {
          next.RESOURCE_NEGOTIATION = data.status === 'RUNNING' ? 'RUNNING' : data.status === 'ERROR_PRESERVED' ? 'ERROR_PRESERVED' : 'COMPLETED';
        } else if (
          data.step === 'AGENT_ZERO_MASTER_DISPATCH' ||
          data.step === 'ATOMIC_LOCK_AND_DISPATCH'
        ) {
          next.ATOMIC_LOCK_DISPATCH = data.status === 'RUNNING' ? 'RUNNING' : 'COMPLETED';
        }
        return next;
      });
    });

    socket.on('flow:completed', (data: any) => {
      if (data?.pipeline_result) {
        setExecutionResult((prev: any) => ({
          ...prev,
          ...data.pipeline_result
        }));
      }
      setStepStatuses((prev) => ({
        ...prev,
        ATOMIC_LOCK_DISPATCH: 'COMPLETED'
      }));
    });

    socket.on('sos:new', (data: any) => {
      setIncidentId(data.id || data._id || 'SOS_LIVE');
      if (data.message) setMessage(data.message);
      if (data.waterDepthCm !== undefined) setWaterDepthCm(Number(data.waterDepthCm));
      if (data.temperatureC !== undefined) setTemperatureC(Number(data.temperatureC));
      if (data.severity) setSeverity(data.severity);
      setExecutionResult(null);
      setTimelineEvents((prev) => [
        ...prev,
        {
          step: 'INIT',
          status: 'RUNNING',
          summary: `Incoming Live SOS: ${data.message || 'Distress signal detected'} (${data.waterDepthCm || 0}cm water depth, ${data.temperatureC || 28}°C)`,
          timestamp: new Date().toISOString()
        }
      ]);
      setStepStatuses({
        ALERT_TRIGGER: 'COMPLETED',
        CONFIDENCE_CALCULATION: 'RUNNING',
        DEDUPLICATION: 'IDLE',
        DOMAIN_ROUTING: 'IDLE',
        DEMAND_GENERATION: 'IDLE',
        RESOURCE_NEGOTIATION: 'IDLE',
        ATOMIC_LOCK_DISPATCH: 'IDLE'
      });
    });

    socket.on('sos:agent_zero_orchestrated', (data: any) => {
      const res = data.pipeline_result || data.orchestration || data;
      if (res) {
        setExecutionResult((prev: any) => ({
          ...prev,
          ...res,
          incident_id: data.sosId || res.incident_id || prev?.incident_id,
          status: res.status || 'VERIFIED_AND_ASSIGNED',
          assigned_teams: res.assigned_teams || (data.assignedSquad ? [data.assignedSquad] : prev?.assigned_teams),
          agent_zero_directive: res.agent_zero_directive || data.directive || prev?.agent_zero_directive,
          agent_zero_classification: res.agent_zero_classification || data.agent_zero_classification || prev?.agent_zero_classification,
          domain_demand: res.domain_demand || data.domain_demand || prev?.domain_demand,
          workforce_allocation: res.workforce_allocation || data.workforce_allocation || prev?.workforce_allocation,
          confidence_data: res.confidence_data || data.confidence_data || prev?.confidence_data,
          deduplication: res.deduplication || data.deduplication || prev?.deduplication,
          dispatch_message: res.dispatch_message || data.dispatchMessage || prev?.dispatch_message
        }));

        const wasNegotiated = Boolean(
          res.workforce_allocation?.fallback_department_used ||
          (res.resource_negotiation?.rounds_count || 1) > 1
        );

        setStepStatuses({
          ALERT_TRIGGER: 'COMPLETED',
          CONFIDENCE_CALCULATION: 'COMPLETED',
          DEDUPLICATION: 'COMPLETED',
          DOMAIN_ROUTING: 'COMPLETED',
          DEMAND_GENERATION: 'COMPLETED',
          RESOURCE_NEGOTIATION: wasNegotiated ? 'CONSTRAINT_LOOP' : 'COMPLETED',
          ATOMIC_LOCK_DISPATCH: 'COMPLETED'
        });
      }
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
    setWaterDepthCm(preset.incident.water_depth_cm || 0);
    setTemperatureC(preset.incident.temperature_c || 28);
    setAvailableTeams(preset.simulated_available_teams || ['admin.grid.01@zerogrid.org']);
    setInjectFaultStep(preset.inject_fault_at_step || 'NONE');
    setExecutionResult(null);
    setTimelineEvents([]);
    setStepStatuses({
      ALERT_TRIGGER: 'IDLE',
      CONFIDENCE_CALCULATION: 'IDLE',
      DEDUPLICATION: 'IDLE',
      DOMAIN_ROUTING: 'IDLE',
      DEMAND_GENERATION: 'IDLE',
      RESOURCE_NEGOTIATION: 'IDLE',
      ATOMIC_LOCK_DISPATCH: 'IDLE'
    });
  };

  const handleReset = () => {
    setExecutionResult(null);
    setTimelineEvents([]);
    setStepStatuses({
      ALERT_TRIGGER: 'IDLE',
      CONFIDENCE_CALCULATION: 'IDLE',
      DEDUPLICATION: 'IDLE',
      DOMAIN_ROUTING: 'IDLE',
      DEMAND_GENERATION: 'IDLE',
      RESOURCE_NEGOTIATION: 'IDLE',
      ATOMIC_LOCK_DISPATCH: 'IDLE'
    });
  };

  const handleExecuteFlow = async () => {
    setRunning(true);
    handleReset();

    setStepStatuses({
      ALERT_TRIGGER: 'COMPLETED',
      CONFIDENCE_CALCULATION: 'RUNNING',
      DEDUPLICATION: 'IDLE',
      DOMAIN_ROUTING: 'IDLE',
      DEMAND_GENERATION: 'IDLE',
      RESOURCE_NEGOTIATION: 'IDLE',
      ATOMIC_LOCK_DISPATCH: 'IDLE'
    });

    const payload = {
      incident_id: incidentId,
      incident_type: incidentType,
      severity: severity,
      coordinates: [19.4534, 72.8061],
      water_depth_cm: Number(waterDepthCm),
      temperature_c: Number(temperatureC),
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

      try {
        response = await api.post<{
          success: boolean;
          pipeline_result: any;
          weather_telemetry: any;
        }>('/api/flow/run', payload);
      } catch (backendErr) {
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
      if (!res) throw new Error('Invalid pipeline response format.');

      setExecutionResult(res);

      if (res.status === 'FALSE_ALERT_FILTERED') {
        setStepStatuses({
          ALERT_TRIGGER: 'COMPLETED',
          CONFIDENCE_CALCULATION: 'FILTERED',
          DEDUPLICATION: 'IDLE',
          DOMAIN_ROUTING: 'IDLE',
          DEMAND_GENERATION: 'IDLE',
          RESOURCE_NEGOTIATION: 'IDLE',
          ATOMIC_LOCK_DISPATCH: 'IDLE'
        });
      } else if (res.status === 'ERROR_PRESERVED_STATE') {
        setStepStatuses({
          ALERT_TRIGGER: 'COMPLETED',
          CONFIDENCE_CALCULATION: 'COMPLETED',
          DEDUPLICATION: 'COMPLETED',
          DOMAIN_ROUTING: 'COMPLETED',
          DEMAND_GENERATION: 'COMPLETED',
          RESOURCE_NEGOTIATION: 'ERROR_PRESERVED',
          ATOMIC_LOCK_DISPATCH: 'IDLE'
        });
      } else {
        const wasNegotiated = (res.resource_negotiation?.rounds_count || 1) > 1 || Boolean(res.workforce_allocation?.fallback_department_used);
        setStepStatuses({
          ALERT_TRIGGER: 'COMPLETED',
          CONFIDENCE_CALCULATION: 'COMPLETED',
          DEDUPLICATION: 'COMPLETED',
          DOMAIN_ROUTING: 'COMPLETED',
          DEMAND_GENERATION: 'COMPLETED',
          RESOURCE_NEGOTIATION: wasNegotiated ? 'CONSTRAINT_LOOP' : 'COMPLETED',
          ATOMIC_LOCK_DISPATCH: 'COMPLETED'
        });
      }
    } catch (err: any) {
      console.error('Flow execution failed', err);
      setStepStatuses({
        ALERT_TRIGGER: 'COMPLETED',
        CONFIDENCE_CALCULATION: 'ERROR_PRESERVED',
        DEDUPLICATION: 'IDLE',
        DOMAIN_ROUTING: 'IDLE',
        DEMAND_GENERATION: 'IDLE',
        RESOURCE_NEGOTIATION: 'IDLE',
        ATOMIC_LOCK_DISPATCH: 'IDLE'
      });
    } finally {
      setRunning(false);
    }
  };

  const allTeamsList = [
    { id: 'admin.grid.01@zerogrid.org', label: 'Er. Devendra Dixit (Grid Lead)' },
    { id: 'admin.grid.02@zerogrid.org', label: 'Alok Sen (Power Grid)' },
    { id: 'admin.flood.01@zerogrid.org', label: 'Aarav Sharma (Flood Lead)' },
    { id: 'admin.flood.02@zerogrid.org', label: 'Rohan Kulkarni (Flood Team)' },
    { id: 'admin.heat.01@zerogrid.org', label: 'Dr. Amit Verma (Heat Lead)' },
    { id: 'admin.rescue.01@zerogrid.org', label: 'Cdr. Rakesh Chauhan (Rescue Lead)' }
  ];

  const toggleTeam = (tid: string) => {
    setAvailableTeams((prev) =>
      prev.includes(tid) ? prev.filter((t) => t !== tid) : [...prev, tid]
    );
  };

  const hasExecuted = Boolean(executionResult);
  const isRunningPipeline = running;
  const classifiedDomain = executionResult?.agent_zero_classification?.domain ||
    executionResult?.deduplication?.domain ||
    executionResult?.domain_demand?.targetDepartment?.replace('_MANAGEMENT', '') || null;
  const classificationReason = executionResult?.agent_zero_classification?.reasoning ||
    (executionResult?.domain_demand ? `Autonomously classified and routed to ${executionResult.domain_demand.targetDepartment}` : null);
  const isFallbackEngaged = Boolean(
    executionResult?.workforce_allocation?.fallback_department_used ||
    (executionResult?.resource_negotiation?.rounds_count || 1) > 1
  );
  const directive = executionResult?.agent_zero_directive;
  const workforce = executionResult?.workforce_allocation;
  const negotiationRounds = executionResult?.resource_negotiation?.negotiation_log || [];

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
                Agent Zero Interactive Flow Chart
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-brandTeal/15 text-brandTeal border border-brandTeal/25 uppercase tracking-wider">
                Multi-Agent Tree
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full border uppercase tracking-wider flex items-center gap-1.5 ${
                  socketConnected
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${socketConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {socketConnected ? 'Live SOS Stream Active' : 'Connecting to Stream...'}
              </span>
            </div>
            <p className="text-xs text-secondaryText">
              Sub-agent domain routing, tag-based demand, MongoDB 160 admin availability check, and iterative fallback loop.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfigDrawer(!showConfigDrawer)}
            className="px-3 py-2 text-xs font-medium border border-hairline rounded-lg bg-surfaceElevated hover:bg-surface text-secondaryText hover:text-primaryText transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Telemetry Overrides</span>
            {showConfigDrawer ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <button
            onClick={handleReset}
            disabled={running}
            className="px-3 py-2 text-xs font-medium border border-hairline rounded-lg bg-surfaceElevated hover:bg-surface text-secondaryText hover:text-primaryText transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
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
                <span>Simulating Multi-Agent Pipeline...</span>
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
            Crisis Domain Presets
          </span>
          <span className="text-[11px] text-secondaryText font-mono">
            Active Scenario: <span className="text-brandTeal font-medium">{presets.find((p) => p.id === selectedPresetId)?.badge}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {presets.map((preset) => {
            const isSelected = selectedPresetId === preset.id;
            const badgeClasses =
              preset.badgeColor === 'amber'
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                : preset.badgeColor === 'emerald'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : preset.badgeColor === 'blue'
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                : preset.badgeColor === 'red'
                ? 'bg-red-500/15 text-red-400 border-red-500/30'
                : 'bg-purple-500/15 text-purple-400 border-purple-500/30';

            return (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-surface border-brandTeal ring-1 ring-brandTeal/30 shadow-xs'
                    : 'bg-surface border-hairline hover:border-brandTeal/50'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-semibold text-primaryText truncate">{preset.title.split('->')[0]}</span>
                  <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full border ${badgeClasses}`}>
                    {preset.badge}
                  </span>
                </div>
                <p className="text-[10px] text-secondaryText line-clamp-2 leading-relaxed">
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
                    min="0"
                    max="100"
                    value={waterDepthCm}
                    onChange={(e) => setWaterDepthCm(Number(e.target.value))}
                    className="w-full accent-brandTeal cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-secondaryText block mb-1">Reported Severity</label>
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

            <div className="space-y-3">
              <span className="text-xs font-mono uppercase tracking-wider text-mutedGray font-semibold flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5 text-blue-400" />
                Ground Overrides
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

            <div className="space-y-3">
              <span className="text-xs font-mono uppercase tracking-wider text-mutedGray font-semibold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                Available Admin Personnel in MongoDB
              </span>
              <div>
                <label className="text-[11px] text-secondaryText block mb-1.5">
                  Free Units ({availableTeams.length} available)
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
            </div>
          </div>
        </section>
      )}

      {/* Main Content Workspace */}
      <div className="flex-1 p-5 space-y-6 max-w-7xl mx-auto w-full">
        {/* ============================================================== */}
        {/* 🚀 MULTI-TIERED VISUAL FLOW CHART CANVAS */}
        {/* ============================================================== */}
        <section className="bg-surface rounded-2xl border border-hairline p-6 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-hairline">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-brandTeal" />
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-primaryText">
                  Multi-Agent Decision Tree & Iterative Fallback Loop
                </h2>
                <p className="text-[11px] text-secondaryText">
                  Hierarchical flowchart visualization mapping incident intake to dedicated department squads.
                </p>
              </div>
            </div>
            {executionResult && (
              <span
                className={`text-xs px-3 py-1 rounded-full font-mono font-semibold border ${
                  executionResult.status === 'VERIFIED_AND_ASSIGNED'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : executionResult.status === 'FALSE_ALERT_FILTERED'
                    ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                    : 'bg-red-500/15 text-red-400 border-red-500/30'
                }`}
              >
                Status: {executionResult.status}
              </span>
            )}
          </div>

          <div className="space-y-6">
            {/* ========================================================== */}
            {/* PHASE 1: NOISE FILTERING & CREDIBILITY VERIFICATION */}
            {/* (CONFIDENCE CALCULATOR AGENT >= 65%) */}
            {/* ========================================================== */}
            <div className="space-y-2">
              <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-mutedGray flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brandTeal" />
                  Phase 1: Noise Filtering & Credibility Verification (Confidence Calculator Agent)
                </span>
                <span className="text-[10px] text-secondaryText font-mono">
                  Input Stream → Veracity Check (Threshold ≥ 65%)
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1A: Ground Telemetry & Citizen SOS */}
                <FlowChartBox
                  title="1. Citizen SOS / Ground Telemetry"
                  subtitle="Ground Sensor & Witness Stream"
                  icon={Radio}
                  status={stepStatuses.ALERT_TRIGGER}
                  badge="INTAKE"
                  badgeColor="blue"
                  details={`${waterDepthCm}cm Depth | ${temperatureC}°C | ${severity} | [19.45, 72.81]`}
                />

                {/* 1B: Confidence Calculator Agent */}
                <FlowChartBox
                  title="2. Confidence Calculator Agent"
                  subtitle="Veracity Noise Gate (Threshold ≥ 65%)"
                  icon={ShieldAlert}
                  status={stepStatuses.CONFIDENCE_CALCULATION}
                  badge={
                    executionResult?.confidence_data
                      ? `${(executionResult.confidence_data.confidence_score * 100).toFixed(0)}% VERACITY`
                      : isRunningPipeline
                      ? 'EVALUATING...'
                      : '≥ 65% THRESHOLD'
                  }
                  badgeColor={
                    executionResult?.status === 'FALSE_ALERT_FILTERED'
                      ? 'red'
                      : executionResult?.confidence_data
                      ? 'emerald'
                      : 'blue'
                  }
                  details={
                    executionResult?.confidence_data?.veracity_classification ||
                    (isRunningPipeline ? 'Validating against telemetry & history...' : 'Standing by for incoming telemetry')
                  }
                />
              </div>
            </div>

            {/* Vertical Connector: Confidence to Agent 0 */}
            <div className="flex flex-col items-center justify-center my-1 text-center">
              <div className="h-4 w-0.5 bg-brandTeal/40" />
              <div className="px-3 py-1 rounded-full bg-surfaceElevated border border-hairline text-[10px] font-mono text-secondaryText flex items-center gap-1.5 shadow-2xs">
                <ShieldAlert className="w-3 h-3 text-brandTeal" />
                <span>
                  {executionResult?.status === 'FALSE_ALERT_FILTERED'
                    ? '🛑 Veracity Filtered (< 65%) — Stand Down'
                    : 'Verified Credible Incident (≥ 65%) → Handed Off to Agent 0 Master Gatekeeper'}
                </span>
                <ArrowDown className="w-3 h-3 text-brandTeal" />
              </div>
              <div className="h-4 w-0.5 bg-brandTeal/40" />
            </div>

            {/* ========================================================== */}
            {/* PHASE 2: AGENT 0 MASTER GATEKEEPER */}
            {/* SPATIAL DEDUPLICATION & AUTONOMOUS CRISIS CLASSIFICATION */}
            {/* ========================================================== */}
            <div className="space-y-3">
              <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-mutedGray flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${hasExecuted ? 'bg-indigo-400' : 'bg-mutedGray'}`} />
                  Phase 2: Agent 0 Master Gatekeeper (Deduplication & Autonomous Crisis Classification)
                </span>
                <span className="text-[10px] text-secondaryText font-mono">
                  {hasExecuted && classifiedDomain ? (
                    <>Agent 0 Routed: <strong className="text-brandTeal">{classifiedDomain}_MANAGEMENT</strong></>
                  ) : isRunningPipeline ? (
                    <>Agent 0: <strong className="text-brandTeal animate-pulse">Evaluating & Classifying Domain...</strong></>
                  ) : (
                    <>Zero Client Selection: <strong className="text-secondaryText">Agent 0 Autonomously Classifies Crisis</strong></>
                  )}
                </span>
              </div>

              {/* 2A Deduplication + 2B Autonomous Classifier */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 2A: Agent 0 Spatial Deduplication */}
                <FlowChartBox
                  title="3. Agent 0 Spatial Deduplication"
                  subtitle="Geospatial Clustering & Priority Escalation"
                  icon={Cpu}
                  status={stepStatuses.DEDUPLICATION}
                  badge={
                    executionResult?.deduplication?.is_duplicate
                      ? `DUPLICATE (${executionResult.deduplication.report_count}x)`
                      : executionResult?.deduplication
                      ? 'NEW INCIDENT TICKET'
                      : isRunningPipeline
                      ? 'MATCHING...'
                      : 'STANDBY'
                  }
                  badgeColor={
                    executionResult?.deduplication?.is_duplicate
                      ? 'amber'
                      : executionResult?.deduplication
                      ? 'emerald'
                      : 'blue'
                  }
                  details={
                    executionResult?.deduplication
                      ? `Escalated Priority: ${executionResult.deduplication.priority} (${executionResult.deduplication.priority_score}/100)`
                      : isRunningPipeline
                      ? 'Checking spatial radius...'
                      : 'Spatial radius clustering & duplicate suppression'
                  }
                />

                {/* 2B: Agent 0 Autonomous Crisis Classifier */}
                <div className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                  hasExecuted
                    ? 'border-brandTeal ring-1 ring-brandTeal/30 bg-surfaceElevated'
                    : isRunningPipeline
                    ? 'border-brandTeal bg-brandTeal/5 animate-pulse'
                    : 'border-hairline bg-surfaceElevated'
                }`}>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-lg bg-surface border border-hairline flex items-center justify-center text-primaryText">
                        <Compass className="w-4 h-4 text-brandTeal" />
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                        hasExecuted && classifiedDomain
                          ? 'bg-brandTeal/15 text-brandTeal border-brandTeal/30 font-semibold'
                          : isRunningPipeline
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-surface border-hairline text-mutedGray'
                      }`}>
                        {hasExecuted && classifiedDomain
                          ? `ROUTED: ${classifiedDomain}`
                          : isRunningPipeline
                          ? 'CLASSIFYING...'
                          : 'AUTONOMOUS AGENT 0'}
                      </span>
                    </div>
                    <h3 className="text-xs font-bold text-primaryText leading-snug">
                      4. Agent 0 Autonomous Crisis Classifier
                    </h3>
                    <p className="text-[10px] text-secondaryText mb-2">
                      Semantic & Telemetry Analysis (No Client Pre-Selection)
                    </p>
                  </div>
                  <div className="pt-2 border-t border-hairline/60 text-[10px] font-mono text-secondaryText">
                    {classificationReason ? (
                      <span className="text-primaryText font-medium">💡 Reason: {classificationReason}</span>
                    ) : isRunningPipeline ? (
                      <span className="text-brandTeal animate-pulse">Agent 0 analyzing message & sensor telemetry...</span>
                    ) : (
                      <span className="text-mutedGray">Agent 0 analyzes incoming text + sensors to route to 1 of 4 departments.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Branching Connector from Agent 0 to 4 Sub-Agents */}
              <div className="flex flex-col items-center justify-center my-1 text-center">
                <div className="h-3 w-0.5 bg-brandTeal/40" />
                <div className="px-3 py-1 rounded-full bg-surfaceElevated border border-hairline text-[10px] font-mono text-secondaryText flex items-center gap-1.5 shadow-2xs">
                  <GitBranch className="w-3 h-3 text-brandTeal" />
                  <span>Agent 0 Dispatches Problem to Targeted Domain Sub-Agent</span>
                  <ArrowDown className="w-3 h-3 text-brandTeal" />
                </div>
                <div className="h-3 w-0.5 bg-brandTeal/40" />
              </div>

              {/* The 4 Domain Sub-Agents Candidates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 2A: Flood Management */}
                <DomainSubAgentCard
                  title="Flood Agent"
                  department="FLOOD_MANAGEMENT"
                  icon={Waves}
                  isRouted={hasExecuted && classifiedDomain === 'FLOOD'}
                  isRunning={isRunningPipeline}
                  primaryTags={['WATER_RESCUE', 'DEWATERING', 'ZODIAC_BOAT', 'SUBMERSIBLE_PUMP']}
                  fallbackDept="RESCUE_MANAGEMENT"
                />

                {/* 2B: Heatwave Management */}
                <DomainSubAgentCard
                  title="Heatwave Agent"
                  department="HEATWAVE_MANAGEMENT"
                  icon={Sun}
                  isRouted={hasExecuted && classifiedDomain === 'HEATWAVE'}
                  isRunning={isRunningPipeline}
                  primaryTags={['HYDRATION', 'COOLING_SHELTER', 'MEDICAL_TRIAGE']}
                  fallbackDept="RESCUE_MANAGEMENT"
                />

                {/* 2C: Power Grid Management */}
                <DomainSubAgentCard
                  title="Power Grid Agent"
                  department="POWER_GRID_MANAGEMENT"
                  icon={Zap}
                  isRouted={hasExecuted && classifiedDomain === 'POWER_GRID'}
                  isRunning={isRunningPipeline}
                  primaryTags={['HV_LINEMEN', 'SUBSTATION_OPS', 'BUCKET_TRUCK']}
                  fallbackDept="FLOOD_MANAGEMENT"
                />

                {/* 2D: Rescue Management */}
                <DomainSubAgentCard
                  title="Rescue Agent"
                  department="RESCUE_MANAGEMENT"
                  icon={LifeBuoy}
                  isRouted={hasExecuted && classifiedDomain === 'RESCUE'}
                  isRunning={isRunningPipeline}
                  primaryTags={['SEARCH_RESCUE', 'EVACUATION', 'CIVIL_DEFENSE', 'PARAMEDIC']}
                  fallbackDept="HEATWAVE_MANAGEMENT"
                />
              </div>
            </div>

            {/* Vertical Connector */}
            <div className="flex flex-col items-center justify-center my-1">
              <div className="h-4 w-0.5 bg-brandTeal/40" />
              <ArrowDown className="w-3.5 h-3.5 text-brandTeal" />
            </div>

            {/* ========================================================== */}
            {/* PHASE 3: ROUTED SUB-AGENT TACTICAL ASSESSMENT & DEMAND */}
            {/* ========================================================== */}
            <div className={`p-4 rounded-xl border relative transition-all ${
              hasExecuted
                ? 'bg-surfaceElevated border-brandTeal/30 shadow-xs'
                : 'bg-surfaceElevated/60 border-hairline'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-primaryText flex items-center gap-2">
                  <CheckSquare className={`w-4 h-4 ${hasExecuted ? 'text-brandTeal' : 'text-mutedGray'}`} />
                  Phase 3: Routed Sub-Agent Tactical Assessment & Workforce Demand Contract
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  hasExecuted
                    ? 'bg-brandTeal/15 text-brandTeal border-brandTeal/25 font-semibold'
                    : isRunningPipeline
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse'
                    : 'bg-surface border-hairline text-mutedGray'
                }`}>
                  {hasExecuted
                    ? (executionResult?.domain_demand?.requiredRole || 'DEMAND FORMULATED')
                    : isRunningPipeline
                    ? 'FORMULATING DEMAND...'
                    : 'PENDING INITIATION'}
                </span>
              </div>

              {hasExecuted && executionResult?.domain_demand ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-surface border border-hairline/80">
                    <span className="text-[10px] text-mutedGray block mb-0.5 font-mono">Target Department</span>
                    <span className="font-semibold text-primaryText">
                      {executionResult.domain_demand.targetDepartment}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-hairline/80">
                    <span className="text-[10px] text-mutedGray block mb-0.5 font-mono">Team Count Demanded</span>
                    <span className="font-semibold text-primaryText">
                      {executionResult.domain_demand.teamCount} Squad(s)
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-hairline/80 md:col-span-2">
                    <span className="text-[10px] text-mutedGray block mb-1 font-mono">Mandatory Tactical Tags</span>
                    <div className="flex flex-wrap gap-1">
                      {executionResult.domain_demand.requiredTags.map((tag: string, i: number) => (
                        <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded bg-brandTeal/10 text-brandTeal border border-brandTeal/20">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs opacity-75">
                  <div className="p-2.5 rounded-lg bg-surface border border-hairline/60">
                    <span className="text-[10px] text-mutedGray block mb-0.5 font-mono">Target Department</span>
                    <span className="font-mono text-secondaryText text-[11px]">
                      {isRunningPipeline ? 'Formulating...' : 'Awaiting Autonomous Routing'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-hairline/60">
                    <span className="text-[10px] text-mutedGray block mb-0.5 font-mono">Team Count Demanded</span>
                    <span className="font-mono text-secondaryText text-[11px]">Pending Sub-Agent Sizing</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-hairline/60 md:col-span-2">
                    <span className="text-[10px] text-mutedGray block mb-1 font-mono">Mandatory Tactical Tags</span>
                    <span className="text-[11px] font-mono text-mutedGray italic">Will be formulated dynamically upon execution</span>
                  </div>
                </div>
              )}

              {/* Loop Return Indicator: Sub-Agent returns demand back to Agent 0 */}
              <div className="mt-3 pt-2.5 border-t border-hairline flex items-center justify-between text-[11px] font-mono">
                <span className="flex items-center gap-1.5 text-secondaryText">
                  <RefreshCw className="w-3.5 h-3.5 text-brandTeal" />
                  <span>Sub-Agent submits demand contract back to <strong>Agent 0</strong> for availability verification & atomic locking</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-surface border border-hairline text-brandTeal">
                  Demand Hand-back to Agent 0 ➔
                </span>
              </div>
            </div>

            {/* Vertical Connector */}
            <div className="flex flex-col items-center justify-center my-1">
              <div className="h-4 w-0.5 bg-brandTeal/40" />
              <ArrowDown className="w-3.5 h-3.5 text-brandTeal" />
            </div>

            {/* ========================================================== */}
            {/* PHASE 4: AGENT 0 MASTER ORCHESTRATOR */}
            {/* AVAILABILITY CHECK, ITERATIVE FALLBACK LOOP & MASTER DISPATCH */}
            {/* ========================================================== */}
            <div className="space-y-3">
              <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-mutedGray flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${hasExecuted ? 'bg-amber-400' : 'bg-mutedGray'}`} />
                Phase 4: Agent 0 Master Orchestrator (MongoDB 160 Admin Availability & Fallback Loop)
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Decision Diamond Node */}
                <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-mono font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
                      hasExecuted ? 'text-amber-400' : 'text-secondaryText'
                    }`}>
                      <Lock className="w-3.5 h-3.5" />
                      Decision: Primary Team Availability
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface border border-hairline text-secondaryText">
                      {hasExecuted ? 'MongoDB 160 Admins Verified' : 'MongoDB 160 Admins Standby'}
                    </span>
                  </div>
                  <p className="text-xs text-secondaryText mb-3">
                    {hasExecuted ? (
                      <>
                        Agent 0 queried MongoDB <code className="text-primaryText font-mono">users</code> for IDLE personnel in{' '}
                        <strong className="text-primaryText font-mono">
                          {executionResult?.domain_demand?.targetDepartment || (classifiedDomain ? `${classifiedDomain}_MANAGEMENT` : 'AWAITING_ROUTING')}
                        </strong>{' '}
                        matching requested tags.
                      </>
                    ) : (
                      <>
                        Agent 0 will query MongoDB <code className="text-primaryText font-mono">users</code> for IDLE personnel matching required tactical tags upon demand submission.
                      </>
                    )}
                  </p>
                  <div className="flex items-center gap-2 pt-2 border-t border-hairline text-[11px]">
                    {hasExecuted ? (
                      <>
                        <span className={`px-2 py-0.5 rounded font-mono font-medium ${isFallbackEngaged ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                          {isFallbackEngaged ? '⚠️ SHORTFALL DETECTED' : '✅ FULL AVAILABILITY'}
                        </span>
                        <span className="text-secondaryText font-mono">
                          {isFallbackEngaged ? 'Triggered Sub-Agent Fallback Loop' : 'Direct Quota Satisfied'}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="px-2 py-0.5 rounded font-mono font-medium bg-surface border border-hairline text-mutedGray">
                          STANDBY
                        </span>
                        <span className="text-mutedGray font-mono">
                          Awaiting Phase 3 Demand Contract
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Fallback Loop Card */}
                <div className={`p-4 rounded-xl border transition-all ${
                  isFallbackEngaged
                    ? 'bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/30'
                    : 'bg-surfaceElevated border-hairline opacity-60'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-mono font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
                      isFallbackEngaged ? 'text-amber-400' : 'text-secondaryText'
                    }`}>
                      <RefreshCw className={`w-3.5 h-3.5 ${isFallbackEngaged ? 'animate-spin' : ''}`} />
                      Iterative Fallback Loop
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      isFallbackEngaged
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 font-semibold'
                        : 'bg-surface border-hairline text-mutedGray'
                    }`}>
                      Rounds: {hasExecuted ? (executionResult?.resource_negotiation?.rounds_count || (isFallbackEngaged ? 2 : 1)) : '—'}
                    </span>
                  </div>
                  <p className="text-xs text-primaryText leading-relaxed mb-2">
                    {isFallbackEngaged ? (
                      <>
                        <strong>Shortfall Re-evaluation Active:</strong> Primary pool had a deficit. Agent 0 reported constraint back to Sub-Agent, pivoting to fallback department{' '}
                        <strong className="text-brandTeal">
                          {workforce?.fallback_department_used || executionResult?.domain_demand?.fallbackDepartment || 'FLOOD_MANAGEMENT'}
                        </strong>.
                      </>
                    ) : hasExecuted ? (
                      'Loop on Standby. All demanded squads were secured from primary team without shortfall.'
                    ) : (
                      'Iterative fallback loop is on standby. Will activate dynamically if the requested squads exceed available idle personnel.'
                    )}
                  </p>
                  {isFallbackEngaged && (
                    <div className="text-[10px] font-mono text-amber-300/80 bg-amber-950/40 p-2 rounded border border-amber-500/20">
                      Round 1: Shortfall Detected (1 secured, 2 deficit) → Round 2: Fallback Units Mobilized
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Vertical Connector */}
            <div className="flex flex-col items-center justify-center my-1">
              <div className="h-4 w-0.5 bg-brandTeal/40" />
              <ArrowDown className="w-3.5 h-3.5 text-brandTeal" />
            </div>

            {/* Final Dispatch Directive & Assigned Personnel */}
            <div className="space-y-3">
              <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-mutedGray flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${hasExecuted ? 'bg-emerald-400' : 'bg-mutedGray'}`} />
                Agent 0 Master Directive, Mandatory Tags & Final Personnel Mobilization
              </div>

              {hasExecuted && executionResult?.status === 'FALSE_ALERT_FILTERED' ? (
                <div className="p-3.5 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-between text-blue-300 text-xs font-mono">
                  <span>🛑 Alert filtered by Confidence Calculator Agent (&lt; 65% veracity). No emergency units mobilized.</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-200">STAND DOWN</span>
                </div>
              ) : hasExecuted ? (
                <>
                  {/* Mandatory Gear Banner */}
                  <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3 text-amber-300">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-xs font-semibold font-mono uppercase tracking-wide">
                        ⚠️ MANDATORY GEAR & SKILL LOADOUT REQUIRED:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {(workforce?.required_tags || executionResult?.domain_demand?.requiredTags || []).map((tag: string, i: number) => (
                          <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30">
                            {tag}
                          </span>
                        ))}
                        {workforce?.fallback_tags && workforce.fallback_tags.map((tag: string, i: number) => (
                          <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded bg-brandTeal/20 text-brandTeal border border-brandTeal/30">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-secondaryText">
                      Included in personnel dispatch message
                    </span>
                  </div>

                  {/* Assigned Command Personnel Cards */}
                  <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-semibold uppercase tracking-wider text-primaryText flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-brandTeal" />
                        Mobilized Command Squads (MongoDB 160 Admin Roster)
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        Status: EN_ROUTE
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {(workforce?.personnel_details || []).map((p: any, idx: number) => (
                        <div key={idx} className="p-3 rounded-lg bg-surface border border-hairline flex items-center justify-between">
                          <div className="truncate">
                            <span className="text-xs font-semibold text-primaryText block truncate">
                              {p.displayName || p.name}
                            </span>
                            <span className="text-[10px] text-mutedGray font-mono truncate block">
                              {p.email}
                            </span>
                          </div>
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-brandTeal/10 text-brandTeal border border-brandTeal/20 shrink-0 ml-2">
                            {p.department?.replace('_MANAGEMENT', '')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-xl bg-surfaceElevated/50 border border-hairline text-center py-6 space-y-1.5">
                  <p className="text-xs font-mono text-secondaryText">
                    ⚡ Phase 4 Master Dispatch Directive & Mandatory Gear Loadout on standby.
                  </p>
                  <p className="text-[11px] text-mutedGray">
                    Click <strong className="text-brandTeal">&quot;Execute Flow Test&quot;</strong> to run the multi-agent pipeline and mobilize squads.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Tabbed Detail Inspector */}
        <section className="bg-surface rounded-2xl border border-hairline overflow-hidden shadow-xs">
          <div className="flex items-center border-b border-hairline px-4 bg-surfaceElevated/40">
            <TabButton active={activeTab === 'OVERVIEW'} onClick={() => setActiveTab('OVERVIEW')} label="Executive Overview" />
            <TabButton active={activeTab === 'CHECKPOINT'} onClick={() => setActiveTab('CHECKPOINT')} label="State Checkpoint" badge="Preserved" />
            <TabButton active={activeTab === 'NEGOTIATION'} onClick={() => setActiveTab('NEGOTIATION')} label="Negotiation Log" badge={`${negotiationRounds.length || 0}`} />
            <TabButton active={activeTab === 'DIRECTIVE'} onClick={() => setActiveTab('DIRECTIVE')} label="Dispatch Directive" />
            <TabButton active={activeTab === 'RAW'} onClick={() => setActiveTab('RAW')} label="Raw JSON Payload" />
          </div>

          <div className="p-5">
            {activeTab === 'OVERVIEW' && (
              <div className="space-y-4">
                {!executionResult ? (
                  <div className="text-center py-12 text-secondaryText">
                    <GitBranch className="w-10 h-10 mx-auto mb-3 text-mutedGray opacity-50" />
                    <p className="text-sm font-medium">No pipeline run active yet.</p>
                    <p className="text-xs text-mutedGray mt-1">Select a crisis domain preset above and click &quot;Execute Flow Test&quot;.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                    <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline space-y-3">
                      <span className="text-xs font-mono font-semibold uppercase tracking-wider text-mutedGray flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        Allocated Tactical Command
                      </span>

                      <div className="space-y-2">
                        {(workforce?.personnel_details || []).map((p: any, idx: number) => (
                          <div key={idx} className="p-2 rounded-lg bg-surface border border-hairline flex items-center justify-between">
                            <div className="truncate">
                              <span className="text-xs font-semibold text-primaryText block truncate">{p.displayName || p.name}</span>
                              <span className="text-[10px] text-mutedGray font-mono truncate">{p.email}</span>
                            </div>
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                              ASSIGNED
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'CHECKPOINT' && (
              <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline font-mono text-xs">
                <pre className="text-secondaryText overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(executionResult?.pipeline_checkpoint || { message: 'No checkpoint state active.' }, null, 2)}
                </pre>
              </div>
            )}

            {activeTab === 'NEGOTIATION' && (
              <div className="space-y-3">
                {negotiationRounds.map((log: any, idx: number) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-surfaceElevated border border-hairline text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-brandTeal">Negotiation Round {log.round}</span>
                      <span className="font-mono px-2 py-0.5 rounded bg-surface border border-hairline text-[10px]">
                        Status: {log.status}
                      </span>
                    </div>
                    <p className="text-secondaryText">
                      Department: <strong>{log.department}</strong> | Demanded: {log.demanded} | Secured: {log.secured} | Shortfall: {log.shortfall}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'DIRECTIVE' && (
              <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline font-mono text-xs text-primaryText whitespace-pre-wrap">
                {executionResult?.dispatch_message || workforce?.dispatch_message || 'No dispatch directive issued yet.'}
              </div>
            )}

            {activeTab === 'RAW' && (
              <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline font-mono text-xs">
                <pre className="text-secondaryText overflow-x-auto">
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

// Flow Chart Box Sub-component
function FlowChartBox({
  title,
  subtitle,
  icon: Icon,
  status,
  badge,
  badgeColor,
  details
}: {
  title: string;
  subtitle: string;
  icon: any;
  status: StepStatus;
  badge: string;
  badgeColor: string;
  details?: string;
}) {
  const isRunning = status === 'RUNNING';
  const isCompleted = status === 'COMPLETED';

  let borderClass = 'border-hairline bg-surfaceElevated';
  if (isRunning) {
    borderClass = 'border-brandTeal ring-2 ring-brandTeal/30 bg-brandTeal/5 shadow-md animate-pulse';
  } else if (isCompleted) {
    borderClass = 'border-emerald-500/50 bg-emerald-500/5';
  }

  return (
    <div className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${borderClass}`}>
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="w-8 h-8 rounded-lg bg-surface border border-hairline flex items-center justify-center text-primaryText">
            <Icon className="w-4 h-4 text-brandTeal" />
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-surface border-hairline text-secondaryText">
            {badge}
          </span>
        </div>
        <h3 className="text-xs font-bold text-primaryText leading-snug">{title}</h3>
        <p className="text-[10px] text-secondaryText truncate mb-2">{subtitle}</p>
      </div>
      <div className="pt-2 border-t border-hairline/60 flex items-center justify-between text-[10px] font-mono text-mutedGray">
        <span className="truncate">{details || '—'}</span>
        {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />}
      </div>
    </div>
  );
}

// Domain Sub-Agent Card
function DomainSubAgentCard({
  title,
  department,
  icon: Icon,
  isRouted,
  isCandidate,
  isRunning,
  primaryTags,
  fallbackDept
}: {
  title: string;
  department: string;
  icon: any;
  isRouted: boolean;
  isCandidate?: boolean;
  isRunning?: boolean;
  primaryTags: string[];
  fallbackDept: string;
}) {
  let cardClass = 'bg-surfaceElevated/40 border-hairline opacity-50';
  let badgeText = 'STANDBY';
  let badgeClass = 'bg-surface border-hairline text-mutedGray';
  let iconClass = 'text-mutedGray';

  if (isRouted) {
    cardClass = 'bg-surface border-brandTeal ring-1 ring-brandTeal/40 shadow-sm';
    badgeText = 'ROUTED ACTIVE';
    badgeClass = 'bg-brandTeal/15 text-brandTeal border-brandTeal/30 font-semibold';
    iconClass = 'text-brandTeal';
  } else if (isRunning) {
    cardClass = 'bg-brandTeal/5 border-brandTeal ring-1 ring-brandTeal/20 shadow-xs animate-pulse';
    badgeText = 'EVALUATING...';
    badgeClass = 'bg-brandTeal/20 text-brandTeal border-brandTeal/40 font-semibold animate-pulse';
    iconClass = 'text-brandTeal';
  } else if (isCandidate) {
    cardClass = 'bg-surface border-indigo-400/40 text-primaryText';
    badgeText = 'PRESET CANDIDATE';
    badgeClass = 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 font-medium';
    iconClass = 'text-indigo-400';
  }

  return (
    <div className={`p-3.5 rounded-xl border transition-all ${cardClass}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="w-7 h-7 rounded-lg bg-surface border border-hairline flex items-center justify-center text-primaryText">
          <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
        </div>
        <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${badgeClass}`}>
          {badgeText}
        </span>
      </div>

      <h4 className="text-xs font-bold text-primaryText">{title}</h4>
      <span className="text-[10px] text-mutedGray font-mono block mb-2">{department}</span>

      <div className="space-y-1.5 pt-2 border-t border-hairline/60 text-[10px]">
        <span className="text-[9px] text-mutedGray font-mono block">Primary Tags:</span>
        <div className="flex flex-wrap gap-1">
          {primaryTags.slice(0, 3).map((t, idx) => (
            <span key={idx} className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-surface border border-hairline text-secondaryText">
              {t}
            </span>
          ))}
        </div>
        <span className="text-[9px] text-mutedGray font-mono block pt-1">
          Fallback: <strong className="text-secondaryText">{fallbackDept.replace('_MANAGEMENT', '')}</strong>
        </span>
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
