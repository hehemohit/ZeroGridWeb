import { NextResponse } from 'next/server';

export async function GET() {
  const presets = [
    {
      id: 'scenario_grid_flood_fallback',
      title: 'Flooded 33kV Switchyard & Fallback Negotiation',
      badge: 'Grid Ingress',
      badgeColor: 'amber',
      description: 'Severe electrical hazard at Virar East Substation. Agent 0 autonomously classifies crisis into Power Grid Management, detects linemen shortage, and executes iterative fallback loop to pull dewatering squads from Flood Management.',
      incident: {
        incident_id: 'TICKET_GRID_301',
        incident_type: 'SUBSTATION_WATER_INGRESS',
        category: 'POWER_OUTAGE',
        severity: 'CRITICAL',
        coordinates: [19.4534, 72.8061],
        water_depth_cm: 55.0,
        temperature_c: 28.0,
        message: '33kV switchyard submerged. Feeder breaker tripped. Linemen needed for air-gap isolation and emergency dewatering pumps to drain yard.'
      },
      simulated_available_teams: ['admin.grid.01@zerogrid.org'],
      inject_fault_at_step: null
    },
    {
      id: 'scenario_flood_direct',
      title: 'Submerged Underpass Rapid Dewatering',
      badge: 'Flood Direct',
      badgeColor: 'emerald',
      description: 'Underpass inundated with 48cm runoff. Agent 0 autonomously classifies hydrologic threat, routes to Flood Management Agent, and mobilizes zodiac rescue boats and submersible pumps.',
      incident: {
        incident_id: 'TICKET_FLOOD_101',
        incident_type: 'URBAN_FLOOD_INGRESS',
        category: 'FLOOD',
        severity: 'HIGH',
        coordinates: [19.4580, 72.8140],
        water_depth_cm: 48.0,
        temperature_c: 27.5,
        message: 'Ward 4 underpass flooded with 48cm standing water. Stranded vehicles requiring zodiac boats and high-capacity pump extraction.'
      },
      simulated_available_teams: ['admin.flood.01@zerogrid.org', 'admin.flood.02@zerogrid.org'],
      inject_fault_at_step: null
    },
    {
      id: 'scenario_heatwave_crisis',
      title: 'Transit Terminal Urban Heatwave (44°C)',
      badge: 'Thermal Distress',
      badgeColor: 'red',
      description: 'Extreme wet-bulb crisis, heat index 44°C, multiple citizens collapsing. Agent 0 autonomously classifies thermal hazard, routes to Heatwave Management Agent, and deploys cooling hydration canopies.',
      incident: {
        incident_id: 'TICKET_HEAT_201',
        incident_type: 'HEATWAVE_SURGE',
        category: 'HEATWAVE',
        severity: 'HIGH',
        coordinates: [19.4520, 72.8150],
        water_depth_cm: 0,
        temperature_c: 44.2,
        message: 'Severe heatwave emergency. Multiple civilians collapsing due to heat exhaustion at Virar terminal. Urgent hydration misting shelter needed.'
      },
      simulated_available_teams: ['admin.heat.01@zerogrid.org', 'admin.heat.02@zerogrid.org'],
      inject_fault_at_step: null
    },
    {
      id: 'scenario_rescue_entrapment',
      title: 'Submerged Basement Structural Entrapment',
      badge: 'Structural Entrapment',
      badgeColor: 'blue',
      description: 'Civilians trapped in basement structure due to rapid ingress and partial collapse. Agent 0 autonomously classifies life-safety entrapment and routes to Rescue Management Agent.',
      incident: {
        incident_id: 'TICKET_RESCUE_401',
        incident_type: 'STRUCTURAL_ENTRAPMENT',
        category: 'TRAPPED',
        severity: 'CRITICAL',
        coordinates: [19.4420, 72.8020],
        water_depth_cm: 35.0,
        temperature_c: 28.0,
        message: 'Civilians trapped inside submerged lower ground floor following partial ceiling collapse. Rapid extraction and trauma triage paramedics required.'
      },
      simulated_available_teams: ['admin.rescue.01@zerogrid.org', 'admin.rescue.02@zerogrid.org'],
      inject_fault_at_step: null
    },
    {
      id: 'scenario_false_alert',
      title: 'Spurious Sensor Spike (Clear Skies)',
      badge: 'Low Confidence Noise',
      badgeColor: 'purple',
      description: 'Sensor artifact during dry weather. Confidence Calculator scores alert at 42% (< 65% threshold) and safely filters alert before reaching Agent 0.',
      incident: {
        incident_id: 'TICKET_NOISE_999',
        incident_type: 'SENSOR_ANOMALY',
        category: 'OTHER',
        severity: 'LOW',
        coordinates: [19.4500, 72.8100],
        water_depth_cm: 3.0,
        temperature_c: 28.0,
        message: 'Transient sensor spike detected. No rainfall, tide normal, no citizen corroboration.'
      },
      simulated_available_teams: null,
      inject_fault_at_step: null
    }
  ];

  return NextResponse.json({ success: true, presets });
}
