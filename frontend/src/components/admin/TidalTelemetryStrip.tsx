'use client';

import React, { useEffect, useState } from 'react';
import { Waves, CloudRain, Clock, Zap, AlertTriangle, ShieldCheck, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { api } from '@/lib/api';
import { io, Socket } from 'socket.io-client';

export interface TidalTelemetryData {
  currentTideMeters: number;
  tidePhase: 'RISING' | 'FALLING';
  highTidePeakTime: string;
  highTidePeakMeters: number;
  sluiceGateStatus: 'OPEN' | 'CLOSED';
  gravityDrainagePossible: boolean;
  expectedDrainageResumeTime: string;
  warning: string | null;
}

export interface WeatherTelemetryData {
  precipitationMmHr: number;
  intensityLevel: 'NONE' | 'LIGHT' | 'MODERATE' | 'HEAVY' | 'TORRENTIAL';
  trend: 'INCREASING' | 'DECREASING' | 'STEADY';
  summary: string;
}

interface TidalTelemetryStripProps {
  onOpenCrisisCommand?: () => void;
  className?: string;
  compact?: boolean;
}

export function TidalTelemetryStrip({
  onOpenCrisisCommand,
  className = '',
  compact = false
}: TidalTelemetryStripProps) {
  const [tide, setTide] = useState<TidalTelemetryData>({
    currentTideMeters: 1.1,
    tidePhase: 'RISING',
    highTidePeakTime: '23:12',
    highTidePeakMeters: 4.53,
    sluiceGateStatus: 'OPEN',
    gravityDrainagePossible: true,
    expectedDrainageResumeTime: 'NOW (Active)',
    warning: null
  });

  const [weather, setWeather] = useState<WeatherTelemetryData>({
    precipitationMmHr: 0,
    intensityLevel: 'NONE',
    trend: 'STEADY',
    summary: 'Clear sky'
  });

  const [isLoading, setIsLoading] = useState(false);

  // Initial fetch and WebSocket listener
  useEffect(() => {
    let isMounted = true;

    async function fetchTelemetry() {
      try {
        setIsLoading(true);
        const res: any = await api.get('/api/admin/predictive/tide-summary');
        if (isMounted && res.success) {
          if (res.tide) setTide(res.tide);
          if (res.weather) setWeather(res.weather);
        }
      } catch (err) {
        // Fallback gracefully without interrupting dispatcher
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchTelemetry();

    // Socket.io real-time subscription
    let socket: Socket | null = null;
    try {
      socket = io(`${api.baseUrl}/sos`, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });

      socket.on('telemetry:tide-update', (data: any) => {
        if (isMounted && data) {
          if (data.tide) setTide(data.tide);
          if (data.weather) setWeather(data.weather);
        }
      });
    } catch (sockErr) {
      // Ignore socket connection errors
    }

    // Refresh polling every 120s as backup if socket is interrupted
    const interval = setInterval(fetchTelemetry, 120000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (socket) socket.disconnect();
    };
  }, []);

  const isGatesClosed = tide.sluiceGateStatus === 'CLOSED' || tide.currentTideMeters >= 3.8;
  const isRainHeavy = weather.precipitationMmHr > 20 || weather.intensityLevel === 'HEAVY' || weather.intensityLevel === 'TORRENTIAL';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {/* 1. Coastal Tide Pill */}
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-mono border backdrop-blur-md transition-all shadow-md ${
          isGatesClosed
            ? 'bg-red-950/90 text-red-200 border-red-500/50 shadow-glow-red animate-pulse'
            : 'bg-surfaceCard/90 text-primaryText border-brandTeal/30 hover:border-brandTeal/60'
        }`}
        title={`Next peak crest: ${tide.highTidePeakMeters}m at ${tide.highTidePeakTime}`}
      >
        <Waves className={`w-3.5 h-3.5 ${isGatesClosed ? 'text-red-400' : 'text-brandTeal'}`} />
        <span className="font-bold">
          TIDE: {tide.currentTideMeters}m
        </span>
        <span
          className={`px-1.5 py-0.2 rounded text-[9px] font-bold tracking-wider uppercase ${
            isGatesClosed
              ? 'bg-red-500/30 text-red-300 border border-red-500/40'
              : 'bg-brandTeal/20 text-brandTeal border border-brandTeal/30'
          }`}
        >
          {isGatesClosed ? 'GATES CLOSED' : 'GATES OPEN'}
        </span>
      </div>

      {/* 2. Meteorological Rainfall Pill */}
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono border backdrop-blur-md transition-all shadow-md ${
          isRainHeavy
            ? 'bg-amber-950/90 text-amber-200 border-amber-500/50 shadow-glow-amber'
            : 'bg-surfaceCard/90 text-secondaryText border-hairline'
        }`}
        title={weather.summary}
      >
        <CloudRain className={`w-3.5 h-3.5 ${isRainHeavy ? 'text-amber-400' : 'text-blue-400'}`} />
        <span className="font-bold text-primaryText">
          RAIN: {weather.precipitationMmHr} mm/h
        </span>
        <span className="text-[10px] text-mutedGray">
          ({weather.intensityLevel})
        </span>
        {weather.trend === 'INCREASING' && (
          <span title="Precipitation Increasing">
            <ArrowUpRight className="w-3 h-3 text-amber-400" />
          </span>
        )}
        {weather.trend === 'DECREASING' && (
          <span title="Precipitation Decreasing">
            <ArrowDownRight className="w-3 h-3 text-emerald-400" />
          </span>
        )}
        {weather.trend === 'STEADY' && (
          <span title="Precipitation Steady">
            <Minus className="w-3 h-3 text-mutedGray" />
          </span>
        )}
      </div>

      {/* 3. Drainage Recession Status Pill */}
      <div
        className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono border backdrop-blur-md transition-all shadow-md ${
          isGatesClosed
            ? 'bg-orange-950/90 text-orange-200 border-orange-500/50'
            : 'bg-surfaceCard/90 text-secondaryText border-hairline'
        }`}
      >
        <Clock className={`w-3.5 h-3.5 ${isGatesClosed ? 'text-orange-400' : 'text-emerald-400'}`} />
        <span>
          {isGatesClosed
            ? `DRAINAGE STALLED → ${tide.expectedDrainageResumeTime || '16:30'}`
            : 'GRAVITY DISCHARGE ACTIVE'}
        </span>
      </div>

      {/* 4. Action Button: Predictive Crisis Command Modal Trigger */}
      {onOpenCrisisCommand && (
        <button
          onClick={onOpenCrisisCommand}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold tracking-wide uppercase transition-all shadow-lg bg-gradient-to-r from-teal-500/20 via-brandTeal/30 to-emerald-500/20 hover:from-teal-500/30 hover:to-brandTeal/40 text-brandTeal border border-brandTeal/60 hover:border-brandTeal hover:shadow-glow-teal active:scale-95"
        >
          <Zap className="w-3.5 h-3.5 text-brandTeal animate-pulse" />
          <span>⚡ Predictive Crisis Command</span>
          <span className="hidden sm:inline text-[9px] bg-brandTeal/20 px-1.5 py-0.2 rounded text-brandTeal border border-brandTeal/30">
            AWS STRANDS
          </span>
        </button>
      )}
    </div>
  );
}
