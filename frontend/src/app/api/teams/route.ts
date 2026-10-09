import { NextRequest, NextResponse } from 'next/server';

const AWS_VOICE_AGENT_ENDPOINT = process.env.NEXT_PUBLIC_VOICE_AGENT_URL || '';

// Default in-memory team status state for instant dev resilience
let inMemoryTeams = [
  {
    team_id: 'TEAM_NDRF_ALPHA',
    name: 'NDRF Flood Rescue Alpha',
    category: 'FLOOD_RESCUE',
    base_location: 'Virar East Staging',
    capacity: 8,
    equipment: ['Zodiac Inflatable Boats', 'Thermal Drone', 'Dewatering Pumps'],
    state: 'IDLE',
    is_available: true,
    active_incident_id: null
  },
  {
    team_id: 'TEAM_NDRF_BRAVO',
    name: 'NDRF Rapid Evacuation Bravo',
    category: 'EVACUATION',
    base_location: 'Vasai West Depot',
    capacity: 12,
    equipment: ['High-Clearance Rescue Trucks', 'Lifejackets', 'Medical Kit'],
    state: 'ASSIGNED',
    active_incident_id: 'INC_EVAC_0911',
    is_available: false
  },
  {
    team_id: 'TEAM_PUMP_CREW_01',
    name: 'Municipal Dewatering Squad 01',
    category: 'DEWATERING',
    base_location: 'Ward 4 Pumping Station',
    capacity: 4,
    equipment: ['500-HP High-Volume Submersible Pumps', 'Discharge Conduits'],
    state: 'IDLE',
    is_available: true,
    active_incident_id: null
  },
  {
    team_id: 'TEAM_LINEMEN_SQUAD_04',
    name: 'MSEDCL High-Voltage Linemen',
    category: 'ELECTRICAL_GRID',
    base_location: 'Virar East 33kV Switchyard',
    capacity: 6,
    equipment: ['Dielectric Hot Sticks', 'Grounding Clamps', 'Megger Insulation Testers'],
    state: 'IDLE',
    is_available: true,
    active_incident_id: null
  },
  {
    team_id: 'TEAM_VASAI_RESCUE_02',
    name: 'Civil Defense Quick Response 02',
    category: 'PARAMEDIC_RESCUE',
    base_location: 'Sanjeevani Hospital Staging',
    capacity: 6,
    equipment: ['Ambulance Unit', 'Field Triage Kit', 'Emergency Defibrillator'],
    state: 'IDLE',
    is_available: true,
    active_incident_id: null
  }
];

export async function GET() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(AWS_VOICE_AGENT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'teams' }),
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));

    if (response.ok) {
      const data = await response.json();
      if (data && data.teams) {
        return NextResponse.json(data);
      }
    }
  } catch (err) {
    // Upstream fallback
  }

  return NextResponse.json({
    teams: inMemoryTeams,
    is_simulation: true
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, team_id, incident_id, ttl_seconds } = body;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const upstreamPayload = {
        action: action === 'release' ? 'release_team' : 'lock_team',
        team_id,
        incident_id: incident_id || 'INC_01',
        ttl_seconds: ttl_seconds || 1800
      };

      const response = await fetch(AWS_VOICE_AGENT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upstreamPayload),
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
    } catch {}

    // In-memory atomic toggle simulation
    const target = inMemoryTeams.find(t => t.team_id === team_id);
    if (!target) {
      return NextResponse.json({ success: false, error: 'Team not found' }, { status: 404 });
    }

    if (action === 'release') {
      target.state = 'IDLE';
      target.is_available = true;
      target.active_incident_id = null;
      return NextResponse.json({
        success: true,
        team_id,
        state: 'IDLE',
        source: 'IN_MEMORY_SIMULATION'
      });
    } else {
      if (target.state === 'ASSIGNED') {
        return NextResponse.json({
          success: false,
          team_id,
          state: 'ASSIGNED',
          current_incident: target.active_incident_id,
          error: `Team ${team_id} is already locked to ${target.active_incident_id}`,
          source: 'IN_MEMORY_SIMULATION'
        });
      }
      target.state = 'ASSIGNED';
      target.is_available = false;
      target.active_incident_id = incident_id || 'INC_LOCKED';
      return NextResponse.json({
        success: true,
        team_id,
        state: 'ASSIGNED',
        incident_id: target.active_incident_id,
        source: 'IN_MEMORY_SIMULATION'
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
