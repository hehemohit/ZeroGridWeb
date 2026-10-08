const mongoose = require('mongoose');
require('dotenv').config();

const SosEvent = require('../models/SosEvent');
const User = require('../models/User');
const ParentChildLink = require('../models/ParentChildLink');
const Contact = require('../models/Contact');

async function test() {
  console.log('[Test Dossier] Connecting to Mongo...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[Test Dossier] Connected.');

  const sampleSos = await SosEvent.findOne().populate('triggeredBy').lean();
  if (!sampleSos) {
    console.log('[Test Dossier] No SOS events found in DB to test.');
    process.exit(0);
  }

  console.log(`[Test Dossier] Found sample SOS event: ${sampleSos._id}, category: ${sampleSos.category}`);
  const user = sampleSos.triggeredBy;
  console.log(`[Test Dossier] Triggered by: ${user ? user.displayName : 'None'}`);

  if (user) {
    const links = await ParentChildLink.find({
      $or: [{ parentId: user._id }, { childId: user._id }]
    }).populate('parentId childId');
    console.log(`[Test Dossier] Family links found: ${links.length}`);

    const history = await SosEvent.find({ triggeredBy: user._id });
    console.log(`[Test Dossier] User total history events: ${history.length}`);
  }

  console.log('[Test Dossier] Backend schema verification successful!');
  await mongoose.disconnect();
}

test().catch(err => {
  console.error('[Test Dossier] Error:', err);
  process.exit(1);
});
