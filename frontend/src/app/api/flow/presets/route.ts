import { NextResponse } from 'next/server';

export async function GET() {
  const presets = [
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

  return NextResponse.json({ success: true, presets });
}
