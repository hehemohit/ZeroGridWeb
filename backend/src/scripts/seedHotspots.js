/**
 * seedHotspots.js
 * Database seed script for chronic flood hotspots and urban drainage bottlenecks
 * in the Vasai-Virar & Mumbai Metropolitan Coastal Region.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const FloodHotspot = require('../models/FloodHotspot');

const HOTSPOTS = [
  // --- Vasai-Virar Municipal Corporation (VVMC) Testbed ---
  {
    name: 'Virar West Datt Mandir Road',
    ward: 'Ward A (Virar)',
    category: 'LOW_LYING_BOWL',
    location: {
      type: 'Point',
      coordinates: [72.8061, 19.4534] // [lng, lat]
    },
    drainageCapacityMmPerHr: 15,
    chronicRiskLevel: 'CRITICAL',
    historicalClearanceHoursAvg: 5.5,
    criticalWaterThresholdCm: 25,
    notes: 'Chronic topographical saucer bowl; stormwater collects from surrounding elevation and railway embankment slope.'
  },
  {
    name: 'Nalasopara Railway Subway',
    ward: 'Ward C (Nalasopara West)',
    category: 'UNDERPASS',
    location: {
      type: 'Point',
      coordinates: [72.8228, 19.4182]
    },
    drainageCapacityMmPerHr: 10,
    chronicRiskLevel: 'CRITICAL',
    historicalClearanceHoursAvg: 6.0,
    criticalWaterThresholdCm: 30,
    notes: 'Low-clearance arterial railway underpass connecting east and west corridors; floods rapidly during heavy downpours.'
  },
  {
    name: 'Vasai East Evershine Underpass',
    ward: 'Ward G (Vasai East)',
    category: 'UNDERPASS',
    location: {
      type: 'Point',
      coordinates: [72.8415, 19.3833]
    },
    drainageCapacityMmPerHr: 18,
    chronicRiskLevel: 'HIGH',
    historicalClearanceHoursAvg: 3.5,
    criticalWaterThresholdCm: 25,
    notes: 'Primary vehicular arterial crossing under western railway line serving industrial & residential corridors.'
  },
  {
    name: 'Vasai West Stella / Ambadi Road Junction',
    ward: 'Ward D (Vasai West)',
    category: 'LOW_LYING_BOWL',
    location: {
      type: 'Point',
      coordinates: [72.8125, 19.3789]
    },
    drainageCapacityMmPerHr: 22,
    chronicRiskLevel: 'HIGH',
    historicalClearanceHoursAvg: 3.0,
    criticalWaterThresholdCm: 20,
    notes: 'Commercial nexus prone to backwater accumulation when Vasai Creek tide exceeds 3.8m.'
  },
  {
    name: 'Nalasopara East Achole Road Culvert',
    ward: 'Ward E (Nalasopara East)',
    category: 'RAILWAY_CULVERT',
    location: {
      type: 'Point',
      coordinates: [72.8335, 19.4190]
    },
    drainageCapacityMmPerHr: 12,
    chronicRiskLevel: 'CRITICAL',
    historicalClearanceHoursAvg: 5.0,
    criticalWaterThresholdCm: 28,
    notes: 'Major stormwater culvert prone to siltation bottlenecks during continuous monsoon precipitation.'
  },

  // --- Brihanmumbai Municipal Corporation (BMC / Mumbai) Testbed ---
  {
    name: 'Milan Subway',
    ward: 'Ward H/West (Santacruz)',
    category: 'UNDERPASS',
    location: {
      type: 'Point',
      coordinates: [72.8423, 19.0837]
    },
    drainageCapacityMmPerHr: 15,
    chronicRiskLevel: 'CRITICAL',
    historicalClearanceHoursAvg: 4.5,
    criticalWaterThresholdCm: 30,
    notes: 'Historic chronic railway underpass in suburban Mumbai, subjected to heavy stormwater surface runoff.'
  },
  {
    name: 'Andheri Subway',
    ward: 'Ward K/West (Andheri)',
    category: 'UNDERPASS',
    location: {
      type: 'Point',
      coordinates: [72.8471, 19.1197]
    },
    drainageCapacityMmPerHr: 12,
    chronicRiskLevel: 'CRITICAL',
    historicalClearanceHoursAvg: 5.0,
    criticalWaterThresholdCm: 30,
    notes: 'Key east-west connector under Western Railway tracks, frequently submerged during cloudburst events.'
  },
  {
    name: 'Hindmata Flyover Basin',
    ward: 'Ward F/South (Dadar)',
    category: 'LOW_LYING_BOWL',
    location: {
      type: 'Point',
      coordinates: [72.8428, 19.0116]
    },
    drainageCapacityMmPerHr: 20,
    chronicRiskLevel: 'HIGH',
    historicalClearanceHoursAvg: 4.0,
    criticalWaterThresholdCm: 25,
    notes: 'Natural saucer depression bowl in central Mumbai; municipal holding tanks and pumps stationed nearby.'
  },
  {
    name: 'Kurla LBS Marg / Mithi River Culvert',
    ward: 'Ward L (Kurla West)',
    category: 'RAILWAY_CULVERT',
    location: {
      type: 'Point',
      coordinates: [72.8792, 19.0688]
    },
    drainageCapacityMmPerHr: 8,
    chronicRiskLevel: 'CRITICAL',
    historicalClearanceHoursAvg: 7.0,
    criticalWaterThresholdCm: 35,
    notes: 'Tidal backflow from Mithi River during Arabian Sea high tides completely halts culvert gravity discharge.'
  },
  {
    name: 'Sion Railway Station Low Basin',
    ward: 'Ward F/North (Sion)',
    category: 'LOW_LYING_BOWL',
    location: {
      type: 'Point',
      coordinates: [72.8624, 19.0390]
    },
    drainageCapacityMmPerHr: 18,
    chronicRiskLevel: 'HIGH',
    historicalClearanceHoursAvg: 4.0,
    criticalWaterThresholdCm: 20,
    notes: 'Railway track depression bowl vulnerable to standing water and track submergence.'
  },
  {
    name: 'Dahisar Subway',
    ward: 'Ward R/North (Dahisar)',
    category: 'UNDERPASS',
    location: {
      type: 'Point',
      coordinates: [72.8596, 19.2558]
    },
    drainageCapacityMmPerHr: 15,
    chronicRiskLevel: 'HIGH',
    historicalClearanceHoursAvg: 3.5,
    criticalWaterThresholdCm: 25,
    notes: 'Northern Mumbai suburban vehicular underpass connecting Western Express Highway to western sectors.'
  },
  {
    name: 'Malad Subway',
    ward: 'Ward P/North (Malad)',
    category: 'UNDERPASS',
    location: {
      type: 'Point',
      coordinates: [72.8458, 19.1865]
    },
    drainageCapacityMmPerHr: 12,
    chronicRiskLevel: 'CRITICAL',
    historicalClearanceHoursAvg: 4.5,
    criticalWaterThresholdCm: 30,
    notes: 'Subway prone to acute flash flooding with rapid rise in water depth during continuous rainfall.'
  }
];

async function seed() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI is not set in environment or .env');
    process.exit(1);
  }

  console.log('🔄 Connecting to MongoDB for hotspot seeding...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB.');

  console.log(`📍 Seeding ${HOTSPOTS.length} chronic flood hotspots...`);

  let upsertedCount = 0;
  for (const item of HOTSPOTS) {
    await FloodHotspot.findOneAndUpdate(
      { name: item.name },
      { $set: item },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
    upsertedCount++;
    console.log(`  ✓ Seeded [${item.category}] ${item.name} (${item.ward})`);
  }

  console.log(`\n🎉 Successfully seeded ${upsertedCount} chronic flood hotspots!`);
  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB.');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Seeding failed:', err);
      process.exit(1);
    });
}

module.exports = { HOTSPOTS, seed };
