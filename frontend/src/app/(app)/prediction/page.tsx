'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  TrendingUp,
  AlertTriangle,
  Zap,
  Waves,
  CloudRain,
  ShieldCheck,
  Clock,
  Users,
  RefreshCw,
  CheckCircle2,
  Activity,
  Layers,
  ChevronRight,
  Send,
  Building,
  Thermometer,
  Package,
  Database,
  Flame,
  LifeBuoy,
  HeartPulse,
  Truck
} from 'lucide-react';

interface HourlyData {
  hourOffset: number;
  time: string;
  compoundChaosScore: number;
  hydroThreat: number;
  electricalThreat: number;
  topoThreat: number;
  heatThreat?: number;
  rainfallMmHr: number;
  windGustsKmh: number;
  temperatureC?: number;
  tideMeters: number;
  isSluiceClosed: boolean;
  estimatedWaterDepthCm: number;
  threatLevel: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'NOMINAL';
}

interface WireAnalysis {
  lineId: string;
  name: string;
  voltage: string;
  type: string;
  riskLevel: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'NOMINAL';
  groundClearanceM: number;
  criticalFacilities: string[];
  vulnerabilityNotes: string;
}

interface SubstationAnalysis {
  nodeId: string;
  name: string;
  type: string;
  riskLevel: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'NOMINAL';
  plinthHeightCm: number;
  projectedWaterDepthCm: number;
  criticalFacilities: string[];
  recommendedAction: string;
}

interface ManpowerStaging {
  department: string;
  departmentName: string;
  recommendedHoldQuota: number;
  currentAvailable: number;
  priorityTacticalTags: string[];
  designatedStagingArea: string;
  standbyObjective: string;
  urgency: 'IMMEDIATE' | 'SCHEDULED';
}

interface RequiredResource {
  resourceName: string;
  category: string;
  quantityNeeded: number;
  unit: string;
  designatedLocation: string;
  justification: string;
}

interface PredictionResponse {
  success: boolean;
  evaluatedAt: string;
  summary: {
    overallChaosIndex: number;
    overallRiskTier: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'NOMINAL';
    peakHourOffset: number;
    peakTime: string;
    peakRiskWindow: string;
    estimatedMaxWaterDepthCm: number;
    maxWindGustKmh: number;
    maxTemperatureC?: number;
    totalAccumulatedRain24hMm?: number;
    totalPreemptiveAdminsOnHold: number;
    activeIncidentsCount: number;
    monitoredHotspotsCount: number;
  };
  predictedScenario?: {
    id: string;
    title: string;
    description: string;
    probabilities: {
      floodInundationPercent: number;
      powerGridFailurePercent: number;
      heatwaveThermalStressPercent: number;
      structuralEntrapmentPercent: number;
    };
  };
  mongoActiveCasesInsight?: {
    totalActiveCases: number;
    avgRecordedWaterDepthCm: number;
    maxRecordedWaterDepthCm: number;
    maxRecordedTemperatureC: number;
    byCategory: {
      waterlogging: number;
      fallenGrid: number;
      heatwave: number;
      trapped: number;
      medical: number;
      other: number;
    };
  };
  whatWillBeRequiredMost?: RequiredResource[];
  hourlyChaosCurve: HourlyData[];
  wirePlacementAnalysis: WireAnalysis[];
  substationAnalysis: SubstationAnalysis[];
  manpowerStaging: ManpowerStaging[];
  executiveDirective: string;
  aiEngine: string;
  activeTier: number;
}

export default function PredictionPage() {
  const [data, setData] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState<HourlyData | null>(null);
  const [stagingLoading, setStagingLoading] = useState(false);
  const [stagingSuccess, setStagingSuccess] = useState<string | null>(null);

  const fetchPrediction = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PredictionResponse>('/api/admin/predictive/24h-chaos');
      setData(res);
      if (res.hourlyChaosCurve && res.hourlyChaosCurve.length > 0) {
        setSelectedHour(res.hourlyChaosCurve[res.summary.peakHourOffset || 0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load 24-hour chaos prediction.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrediction();
  }, []);

  const handleDeployPreemptiveOrders = async () => {
    if (!data) return;
    setStagingLoading(true);
    setStagingSuccess(null);
    try {
      const res = await api.post<{ success: boolean; message: string; stagingOrder: any }>('/api/admin/predictive/preemptive-stage', {
        stagedDepartments: data.manpowerStaging,
        directiveNotes: data.executiveDirective
      });
      setStagingSuccess(res.message || 'Preemptive manpower standby orders dispatched successfully.');
    } catch (err: any) {
      alert(`Error deploying orders: ${err.message}`);
    } finally {
      setStagingLoading(false);
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'CRITICAL':
        return 'text-red-500 bg-red-500/10 border-red-500/30';
      case 'HIGH':
        return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
      case 'ELEVATED':
        return 'text-amber-500 bg-amber-500/10 border-amber-500/30';
      default:
        return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';
    }
  };

  const getBarColor = (score: number) => {
    if (score >= 75) return 'bg-red-500';
    if (score >= 55) return 'bg-orange-500';
    if (score >= 35) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4 p-6">
        <RefreshCw className="w-8 h-8 text-brandTeal animate-spin" />
        <div className="text-center space-y-1">
          <p className="font-semibold text-primaryText">Synthesizing 24-Hour Multi-Domain Chaos...</p>
          <p className="text-xs text-mutedGray max-w-sm">
            Cross-referencing live MongoDB active cases, rainfall, coastal tides, heatwave temperatures, and 33kV/11kV power wire placements.
          </p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 max-w-2xl mx-auto space-y-4">
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
        <button
          onClick={fetchPrediction}
          className="px-4 py-2 bg-brandTeal text-slate-900 font-semibold rounded-lg text-sm hover:opacity-90"
        >
          Retry Prediction Synthesis
        </button>
      </div>
    );
  }

  const summary = data?.summary;
  const scenario = data?.predictedScenario;
  const mongoInsight = data?.mongoActiveCasesInsight;
  const resources = data?.whatWillBeRequiredMost || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* 1. Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-hairline">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brandTeal/10 border border-brandTeal/30 text-brandTeal">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-primaryText font-display">
              Autonomous 24-Hour Multi-Domain Chaos Prediction
            </h1>
            <span className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${getTierColor(summary?.overallRiskTier || 'NOMINAL')}`}>
              {summary?.overallRiskTier} CHAOS
            </span>
          </div>
          <p className="text-xs sm:text-sm text-secondaryText">
            Integrates live MongoDB active SOS tickets, rainfall, Arabian Sea tides, urban heatwave indexes, and 33kV/11kV electrical wire placements to anticipate disaster scenarios and preemptively stage workforce.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-mutedGray font-mono block">AI SYNTHESIS TIER</span>
            <span className="text-xs font-semibold text-brandTeal flex items-center justify-end gap-1">
              <Zap className="w-3 h-3 text-amber-400" />
              {data?.aiEngine}
            </span>
          </div>
          <button
            onClick={fetchPrediction}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-surfaceElevated hover:bg-surface border border-hairline rounded-xl text-xs font-medium text-primaryText transition shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Forecast
          </button>
        </div>
      </div>

      {/* 2. Primary Disaster Scenario Prediction Card */}
      {scenario && (
        <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-surface via-surfaceElevated to-surface border border-brandTeal/40 shadow-lg relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-brandTeal/20 text-brandTeal border border-brandTeal/30 font-bold">
                  24-Hour Primary Crisis Forecast
                </span>
                <span className="text-xs font-mono text-mutedGray">
                  Peak Danger Window: <strong className="text-amber-400">{summary?.peakRiskWindow}</strong>
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-primaryText font-display">
                {scenario.title}
              </h2>
              <p className="text-xs sm:text-sm text-secondaryText leading-relaxed max-w-3xl">
                {scenario.description}
              </p>
            </div>

            {/* 4 Multi-Disaster Probability Meters */}
            <div className="grid grid-cols-2 gap-3 min-w-[280px] sm:min-w-[340px]">
              <div className="p-3 rounded-xl bg-surface border border-hairline space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-blue-400">
                    <Waves className="w-3.5 h-3.5" /> Flood Inundation
                  </span>
                  <span className="font-mono font-bold text-primaryText">{scenario.probabilities.floodInundationPercent}%</span>
                </div>
                <div className="w-full bg-surfaceElevated h-1.5 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${scenario.probabilities.floodInundationPercent}%` }} />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface border border-hairline space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <Zap className="w-3.5 h-3.5" /> Grid Cascade
                  </span>
                  <span className="font-mono font-bold text-primaryText">{scenario.probabilities.powerGridFailurePercent}%</span>
                </div>
                <div className="w-full bg-surfaceElevated h-1.5 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: `${scenario.probabilities.powerGridFailurePercent}%` }} />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface border border-hairline space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-orange-400">
                    <Flame className="w-3.5 h-3.5" /> Heatwave Stress
                  </span>
                  <span className="font-mono font-bold text-primaryText">{scenario.probabilities.heatwaveThermalStressPercent}%</span>
                </div>
                <div className="w-full bg-surfaceElevated h-1.5 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500" style={{ width: `${scenario.probabilities.heatwaveThermalStressPercent}%` }} />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface border border-hairline space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-red-400">
                    <LifeBuoy className="w-3.5 h-3.5" /> Entrapment Risk
                  </span>
                  <span className="font-mono font-bold text-primaryText">{scenario.probabilities.structuralEntrapmentPercent}%</span>
                </div>
                <div className="w-full bg-surfaceElevated h-1.5 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500" style={{ width: `${scenario.probabilities.structuralEntrapmentPercent}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Live MongoDB Active Incident Telemetry Bar */}
      {mongoInsight && (
        <div className="p-4 rounded-2xl bg-surface border border-hairline flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-surfaceElevated border border-hairline text-brandTeal">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono text-mutedGray block">
                MongoDB Active SOS Empirical Baseline
              </span>
              <span className="text-sm font-bold text-primaryText">
                {mongoInsight.totalActiveCases} Active Alerts in Ground Network
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center gap-1.5">
              <Waves className="w-3 h-3" /> Flood: {mongoInsight.byCategory.waterlogging}
              {mongoInsight.avgRecordedWaterDepthCm > 0 && ` (~${mongoInsight.avgRecordedWaterDepthCm}cm)`}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> Grid: {mongoInsight.byCategory.fallenGrid}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center gap-1.5">
              <Flame className="w-3 h-3" /> Heat: {mongoInsight.byCategory.heatwave}
              {mongoInsight.maxRecordedTemperatureC > 0 && ` (${mongoInsight.maxRecordedTemperatureC}°C)`}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-1.5">
              <LifeBuoy className="w-3 h-3" /> Trapped: {mongoInsight.byCategory.trapped}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1.5">
              <HeartPulse className="w-3 h-3" /> Medical: {mongoInsight.byCategory.medical}
            </span>
          </div>
        </div>
      )}

      {/* 4. "What Will Be Required Most" Asset & Resource Logistics Quota */}
      {resources.length > 0 && (
        <div className="p-5 sm:p-6 rounded-2xl bg-surface border border-hairline space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-primaryText font-display flex items-center gap-2">
                <Package className="w-4 h-4 text-brandTeal" />
                What Will Be Required Most (Next 24h Logistics Quota)
              </h2>
              <p className="text-xs text-secondaryText">
                Anticipated emergency assets and critical equipment to stage before crisis escalation.
              </p>
            </div>
            <span className="text-xs font-mono text-brandTeal font-bold">
              {resources.length} Equipment Categories
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {resources.map((item, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-surfaceElevated border border-hairline space-y-2 text-xs flex flex-col justify-between"
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-primaryText leading-snug">{item.resourceName}</h3>
                    <span className="text-base font-extrabold font-mono text-brandTeal whitespace-nowrap">
                      {item.quantityNeeded} {item.unit}
                    </span>
                  </div>
                  <p className="text-[11px] text-secondaryText leading-relaxed">
                    {item.justification}
                  </p>
                </div>

                <div className="pt-2 border-t border-hairline text-[10px] text-mutedGray flex items-center gap-1.5 font-mono">
                  <Truck className="w-3 h-3 text-mutedGray flex-shrink-0" />
                  <span className="truncate">Stage At: <strong className="text-primaryText">{item.designatedLocation}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Executive 4-KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-surface border border-hairline space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-xs text-mutedGray">
            <span>24h Peak Chaos Index</span>
            <Activity className="w-4 h-4 text-brandTeal" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-primaryText">
              {summary?.overallChaosIndex}
            </span>
            <span className="text-xs text-mutedGray">/ 100</span>
          </div>
          <div className="w-full bg-surfaceElevated h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full ${getBarColor(summary?.overallChaosIndex || 0)}`}
              style={{ width: `${summary?.overallChaosIndex || 0}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-hairline space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-xs text-mutedGray">
            <span>Peak Danger Window</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-primaryText truncate">
            {summary?.peakRiskWindow}
          </div>
          <div className="text-[11px] text-mutedGray truncate">
            Peak at {summary?.peakTime ? new Date(summary.peakTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBD'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-hairline space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-xs text-mutedGray">
            <span>Max Projected Water Depth</span>
            <Waves className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-primaryText">
              {summary?.estimatedMaxWaterDepthCm}
            </span>
            <span className="text-xs text-mutedGray">cm street bowl</span>
          </div>
          <div className="text-[11px] text-secondaryText truncate">
            Plinth margin: {Math.max(0, 45 - (summary?.estimatedMaxWaterDepthCm || 0))}cm
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-hairline space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-xs text-mutedGray">
            <span>Preemptive Workforce On Hold</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-primaryText">
              {summary?.totalPreemptiveAdminsOnHold}
            </span>
            <span className="text-xs text-mutedGray">/ 160 Admins</span>
          </div>
          <div className="text-[11px] text-emerald-500 font-semibold truncate">
            Across 4 Tactical Divisions
          </div>
        </div>
      </div>

      {/* 6. Executive AI Directive Alert */}
      {data?.executiveDirective && (
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-brandTeal/30 shadow-md relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-brandTeal" />
          <div className="flex items-start gap-3.5">
            <div className="p-2 rounded-xl bg-brandTeal/10 text-brandTeal flex-shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider font-bold text-brandTeal">
                  Incident Commander Preemptive Directive
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surfaceElevated border border-hairline text-mutedGray">
                  NDMA Standard
                </span>
              </div>
              <p className="text-xs sm:text-sm text-primaryText leading-relaxed">
                {data.executiveDirective}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 7. Interactive 24-Hour Chaos Timeline Graph */}
      <div className="p-5 sm:p-6 rounded-2xl bg-surface border border-hairline space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-primaryText font-display flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brandTeal" />
              24-Hour Hour-by-Hour Chaos Curve
            </h2>
            <p className="text-xs text-secondaryText">
              Hover or click bars to inspect hourly hydrodynamic, electrical, and thermal exposure components.
            </p>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono text-mutedGray">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> &lt;35 Nominal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> 35-54 Elevated
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> 55-74 High
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> &ge;75 Critical
            </span>
          </div>
        </div>

        {/* The Bar Graph Strip */}
        <div className="pt-6 pb-2 overflow-x-auto">
          <div className="flex items-end gap-1.5 sm:gap-2 min-w-[700px] h-48 border-b border-hairline pb-2">
            {data?.hourlyChaosCurve.map((hour) => {
              const isSelected = selectedHour?.hourOffset === hour.hourOffset;
              const isPeak = summary?.peakHourOffset === hour.hourOffset;
              const heightPercent = Math.max(8, hour.compoundChaosScore);

              return (
                <div
                  key={hour.hourOffset}
                  onClick={() => setSelectedHour(hour)}
                  className="flex-1 flex flex-col items-center gap-1 cursor-pointer group relative"
                >
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 z-20 pointer-events-none bg-surfaceElevated border border-hairline text-primaryText text-[10px] font-mono px-2 py-1 rounded shadow-lg whitespace-nowrap">
                    Chaos: {hour.compoundChaosScore}/100 | Rain: {hour.rainfallMmHr}mm/h | Temp: {hour.temperatureC || 28}°C
                  </div>

                  {isPeak && (
                    <span className="text-[9px] font-mono uppercase bg-red-500 text-white font-bold px-1 rounded-sm mb-0.5">
                      PEAK
                    </span>
                  )}

                  <div
                    className={`w-full rounded-t-lg transition-all duration-300 ${getBarColor(hour.compoundChaosScore)} ${
                      isSelected ? 'ring-2 ring-brandTeal brightness-110' : 'opacity-85 hover:opacity-100'
                    }`}
                    style={{ height: `${heightPercent}%` }}
                  />

                  {hour.isSluiceClosed && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 ring-2 ring-surface" title="Sluice gates locked shut" />
                  )}

                  <span className={`text-[10px] font-mono pt-1 ${isSelected ? 'text-brandTeal font-bold' : 'text-mutedGray'}`}>
                    +{hour.hourOffset}h
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Hour Detailed Inspector */}
        {selectedHour && (
          <div className="p-4 rounded-xl bg-surfaceElevated border border-hairline flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-mono text-mutedGray block">
                Selected Hour (+{selectedHour.hourOffset}h from now)
              </span>
              <span className="font-semibold text-primaryText text-sm">
                {new Date(selectedHour.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', weekday: 'short' })}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6 font-mono text-[11px]">
              <div>
                <span className="text-mutedGray block">Chaos Score</span>
                <span className={`font-bold ${selectedHour.compoundChaosScore >= 55 ? 'text-red-400' : 'text-brandTeal'}`}>
                  {selectedHour.compoundChaosScore} / 100
                </span>
              </div>
              <div>
                <span className="text-mutedGray block">Rainfall Rate</span>
                <span className="font-bold text-primaryText">{selectedHour.rainfallMmHr} mm/hr</span>
              </div>
              <div>
                <span className="text-mutedGray block">Temperature</span>
                <span className="font-bold text-orange-400">{selectedHour.temperatureC || 28}°C</span>
              </div>
              <div>
                <span className="text-mutedGray block">Wind Gusts</span>
                <span className="font-bold text-primaryText">{selectedHour.windGustsKmh} km/h</span>
              </div>
              <div>
                <span className="text-mutedGray block">Arabian Sea Tide</span>
                <span className="font-bold text-blue-400">{selectedHour.tideMeters} m</span>
              </div>
              <div>
                <span className="text-mutedGray block">Sea Sluice Status</span>
                <span className={`font-bold ${selectedHour.isSluiceClosed ? 'text-red-400' : 'text-emerald-400'}`}>
                  {selectedHour.isSluiceClosed ? 'LOCKED SHUT' : 'GRAVITY OPEN'}
                </span>
              </div>
              <div>
                <span className="text-mutedGray block">Projected Bowl Depth</span>
                <span className="font-bold text-amber-400">{selectedHour.estimatedWaterDepthCm} cm</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 8. Preemptive Manpower Staging Hub (160-Admin Workforce) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-surface border border-hairline space-y-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-primaryText font-display flex items-center gap-2">
              <Users className="w-4 h-4 text-brandTeal" />
              Preemptive Workforce Staging Directive (160 Admins)
            </h2>
            <p className="text-xs text-secondaryText">
              Recommended personnel to place ON HOLD with designated tactical equipment before peak danger window.
            </p>
          </div>

          <button
            onClick={handleDeployPreemptiveOrders}
            disabled={stagingLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brandTeal text-slate-900 font-bold text-xs hover:opacity-90 transition shadow-sm disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {stagingLoading ? 'Dispatching Standby Orders...' : 'Deploy Preemptive Standby Orders'}
          </button>
        </div>

        {stagingSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{stagingSuccess}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data?.manpowerStaging.map((stage) => (
            <div
              key={stage.department}
              className="p-4 rounded-xl bg-surfaceElevated border border-hairline space-y-3 relative overflow-hidden"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-primaryText">{stage.departmentName}</h3>
                  <span className="text-[10px] font-mono text-mutedGray block">{stage.department}</span>
                </div>
                <div className="text-right">
                  <span className="text-base font-extrabold font-mono text-brandTeal block">
                    {stage.recommendedHoldQuota} Admins
                  </span>
                  <span className="text-[10px] text-mutedGray">of {stage.currentAvailable} Total</span>
                </div>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-secondaryText">
                  <Building className="w-3.5 h-3.5 text-mutedGray flex-shrink-0" />
                  <span className="truncate">Staging: <strong>{stage.designatedStagingArea}</strong></span>
                </div>
                <p className="text-[11px] text-mutedGray italic">
                  "{stage.standbyObjective}"
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {stage.priorityTacticalTags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-surface border border-hairline text-primaryText font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 9. Electrical Wire Placement & Substation Vulnerability Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-2xl bg-surface border border-hairline space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-primaryText font-display flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Electrical Wire Placement Vulnerability
            </h2>
            <span className="text-[11px] font-mono text-mutedGray">
              {data?.wirePlacementAnalysis.length} Monitored Corridors
            </span>
          </div>

          <div className="space-y-3">
            {data?.wirePlacementAnalysis.map((line) => (
              <div
                key={line.lineId}
                className="p-3.5 rounded-xl bg-surfaceElevated border border-hairline space-y-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-primaryText">{line.name}</h3>
                    <div className="flex items-center gap-2 text-[10px] text-mutedGray font-mono">
                      <span>{line.voltage}</span>
                      <span>•</span>
                      <span>{line.type}</span>
                      <span>•</span>
                      <span>Clearance: {line.groundClearanceM}m</span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${getTierColor(line.riskLevel)}`}>
                    {line.riskLevel}
                  </span>
                </div>

                <p className="text-[11px] text-secondaryText leading-relaxed">
                  {line.vulnerabilityNotes}
                </p>

                {line.criticalFacilities && line.criticalFacilities.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-mutedGray">
                    <span className="font-mono">Feeds:</span>
                    {line.criticalFacilities.map(f => (
                      <span key={f} className="text-brandTeal font-mono">{f}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-hairline space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-primaryText font-display flex items-center gap-2">
              <Building className="w-4 h-4 text-brandTeal" />
              Grid Node & Substation Flood Plinth Margin
            </h2>
            <span className="text-[11px] font-mono text-mutedGray">
              {data?.substationAnalysis.length} Critical Nodes
            </span>
          </div>

          <div className="space-y-3">
            {data?.substationAnalysis.map((node) => (
              <div
                key={node.nodeId}
                className="p-3.5 rounded-xl bg-surfaceElevated border border-hairline space-y-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-primaryText">{node.name}</h3>
                    <div className="text-[10px] text-mutedGray font-mono">
                      Node ID: {node.nodeId} ({node.type})
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${getTierColor(node.riskLevel)}`}>
                    {node.riskLevel}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-[11px] font-mono">
                  <div>
                    <span className="text-mutedGray">Plinth Height:</span>{' '}
                    <span className="text-primaryText">{node.plinthHeightCm}cm</span>
                  </div>
                  <div>
                    <span className="text-mutedGray">Projected Ingress:</span>{' '}
                    <span className="text-amber-400">{node.projectedWaterDepthCm}cm</span>
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-surface border border-hairline text-[11px] text-secondaryText">
                  <span className="font-semibold text-primaryText">Mitigation: </span>
                  {node.recommendedAction}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
