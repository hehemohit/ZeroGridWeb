/**
 * ZeroGrid Tactical Teams Seeding Utility
 * Populates MongoDB collection 'tacticalteams' with initial high-fidelity
 * emergency rescue, dewatering, grid linemen, and heatwave response squads.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const TacticalTeam = require('../models/TacticalTeam');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zerogrid';

const SEED_TEAMS = [
  {
    teamId: 'TEAM_NDRF_ALPHA',
    name: 'NDRF Flood Rescue Alpha',
    domain: 'FLOOD_RESCUE',
    status: 'IDLE',
    currentLocation: {
      type: 'Point',
      coordinates: [72.8140, 19.4580], // ~300m from Virar East Substation
    },
    speedKmh: 25,
    personnelCount: 8,
    skills: ['DEEP_WATER_EVAC', 'INFLATABLE_BOAT_PILOT', 'CIVILIAN_TRIAGE'],
    equipment: ['ZODIAC_BOAT', 'SUBMERSIBLE_PUMP_500HP', 'THROW_BAGS'],
    contactRadio: 'VHF_CH_01',
  },
  {
    teamId: 'TEAM_NDRF_BRAVO',
    name: 'NDRF Rapid Evacuation Bravo',
    domain: 'EVACUATION',
    status: 'IDLE',
    currentLocation: {
      type: 'Point',
      coordinates: [72.8160, 19.4550], // ~500m from Ward 4
    },
    speedKmh: 35,
    personnelCount: 6,
    skills: ['MASS_EVACUATION', 'FIRST_AID', 'SWIFTWATER_RESCUE'],
    equipment: ['RESCUE_TRUCK', 'INFLATABLE_RAFTS', 'LOUDSPEAKER_SYSTEM'],
    contactRadio: 'VHF_CH_02',
  },
  {
    teamId: 'TEAM_PUMP_CREW_01',
    name: 'Municipal Dewatering Squad 01',
    domain: 'DEWATERING',
    status: 'IDLE',
    currentLocation: {
      type: 'Point',
      coordinates: [72.8130, 19.4565], // ~150m from Substation switchyard
    },
    speedKmh: 20,
    personnelCount: 5,
    skills: ['CULVERT_DRAINAGE', 'HIGH_CAPACITY_PUMPING', 'TRENCHING'],
    equipment: ['500HP_DIESEL_PUMP', 'DISCHARGE_HOSES_300M', 'GENERATOR_50KW'],
    contactRadio: 'VHF_CH_03',
  },
  {
    teamId: 'TEAM_LINEMEN_SQUAD_04',
    name: 'MSEDCL High-Voltage Linemen',
    domain: 'ELECTRICAL_GRID',
    status: 'IDLE',
    currentLocation: {
      type: 'Point',
      coordinates: [72.8115, 19.4555], // Virar East switchyard perimeter
    },
    speedKmh: 30,
    personnelCount: 6,
    skills: ['HV_BREAKER_ISOLATION', 'TRANSFORMER_REPAIR', 'AIR_GAP_VERIFICATION'],
    equipment: ['BUCKET_TRUCK', 'HOTSTICK_KIT', 'EARTHING_RODS', 'PHASE_DETECTOR'],
    contactRadio: 'VHF_CH_04',
  },
  {
    teamId: 'TEAM_VASAI_RESCUE_02',
    name: 'Civil Defense Quick Response 02',
    domain: 'PARAMEDIC_RESCUE',
    status: 'IDLE',
    currentLocation: {
      type: 'Point',
      coordinates: [72.8020, 19.4420], // Vasai corridor
    },
    speedKmh: 40,
    personnelCount: 4,
    skills: ['CARDIAC_TRIAGE', 'HEAT_STROKE_TREATMENT', 'AMBULANCE_TRANSIT'],
    equipment: ['MOBILE_ICU_AMBULANCE', 'DEFIBRILLATOR', 'IV_COOLING_KIT', 'OXYGEN_TANKS'],
    contactRadio: 'VHF_CH_05',
  },
  {
    teamId: 'TEAM_COOLING_SQUAD_01',
    name: 'Municipal Heatwave Crisis Squad 01',
    domain: 'HEATWAVE_SUPPORT',
    status: 'IDLE',
    currentLocation: {
      type: 'Point',
      coordinates: [72.8150, 19.4520], // Sanjeevani hospital corridor
    },
    speedKmh: 30,
    personnelCount: 5,
    skills: ['HYDRATION_DISTRIBUTION', 'MISTING_SHELTER_SETUP', 'HEAT_VULNERABILITY_CHECK'],
    equipment: ['MISTING_CANOPY', 'HYDRATION_TANKER_2000L', 'ELECTROLYTE_PACKS', 'PORTABLE_FANS'],
    contactRadio: 'VHF_CH_06',
  },
];

async function seedTeams() {
  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB.');

  for (const teamData of SEED_TEAMS) {
    const res = await TacticalTeam.findOneAndUpdate(
      { teamId: teamData.teamId },
      { $set: teamData },
      { upsert: true, returnDocument: 'after' }
    );
    console.log(`  [+] Tactical Squad registered: ${res.teamId} (${res.name}) - Status: ${res.status}`);
  }

  console.log('🎉 Tactical teams seeded successfully into MongoDB.');
  await mongoose.disconnect();
}

seedTeams().catch((err) => {
  console.error('❌ Seeding error:', err);
  process.exit(1);
});
