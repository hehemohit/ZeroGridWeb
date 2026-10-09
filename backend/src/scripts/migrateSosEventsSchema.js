/**
 * ZeroGrid SosEvent Schema Migration Script
 * Backfills existing SOS event documents with reportCount, priority,
 * domain, and witnessReports arrays.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const SosEvent = require('../models/SosEvent');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zerogrid';

function mapCategoryToDomain(category) {
  const cat = (category || '').toUpperCase();
  if (['WATERLOGGING', 'SUBMERGED_UNDERPASS', 'DRAINAGE_OVERFLOW'].includes(cat)) {
    return 'FLOOD';
  }
  if (cat === 'HEATWAVE') {
    return 'HEATWAVE';
  }
  if (['FALLEN_GRID', 'TRANSFORMER_FAILURE'].includes(cat)) {
    return 'POWER_GRID';
  }
  if (['TRAPPED', 'MEDICAL', 'SECURITY', 'DISASTER'].includes(cat)) {
    return 'RESCUE';
  }
  return 'OTHER';
}

async function migrate() {
  console.log('🔄 Connecting to MongoDB for schema migration...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected.');

  const events = await SosEvent.find({
    $or: [
      { reportCount: { $exists: false } },
      { priority: { $exists: false } },
      { domain: { $exists: false } }
    ]
  });

  console.log(`🔍 Found ${events.length} un-migrated SosEvent documents.`);

  let updatedCount = 0;
  for (const event of events) {
    const domain = mapCategoryToDomain(event.category);
    const depth = event.waterDepthCm || 0;
    const priority = depth >= 40 ? 'CRITICAL' : (depth >= 20 ? 'HIGH' : 'MEDIUM');
    const priorityScore = priority === 'CRITICAL' ? 88 : (priority === 'HIGH' ? 70 : 50);

    await SosEvent.updateOne(
      { _id: event._id },
      {
        $set: {
          reportCount: event.reportCount || 1,
          priority: event.priority || priority,
          priorityScore: event.priorityScore || priorityScore,
          domain: event.domain || domain,
          witnessReports: event.witnessReports || [],
          firstReportedAt: event.firstReportedAt || event.createdAt || new Date(),
          lastReportedAt: event.lastReportedAt || event.updatedAt || new Date()
        }
      }
    );
    updatedCount++;
  }

  console.log(`🎉 Migrated ${updatedCount} SosEvent documents successfully.`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
