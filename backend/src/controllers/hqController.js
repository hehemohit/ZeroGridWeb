const mongoose = require('mongoose');
const Headquarters = require('../models/Headquarters');
const User = require('../models/User');

/**
 * GET /api/admin/hq
 * List all headquarters populated with assigned admins (displayName, email, photoUrl).
 */
async function getHqs(req, res) {
  try {
    const hqs = await Headquarters.find()
      .populate('assignedAdmins', 'displayName email photoUrl role')
      .sort({ createdAt: -1 });

    const formattedHqs = hqs.map(hq => ({
      ...(hq.toJSON ? hq.toJSON() : hq.toObject ? hq.toObject() : hq),
      id: hq._id.toString()
    }));

    return res.status(200).json({ hqs: formattedHqs });
  } catch (error) {
    console.error('[HQ Controller] getHqs error:', error);
    return res.status(500).json({ message: 'Failed to fetch headquarters.' });
  }
}

/**
 * POST /api/admin/hq
 * Create a new headquarters.
 * Body: { name, location, assignedAdmins, status }
 */
async function createHq(req, res) {
  try {
    const { name, location, assignedAdmins = [], status = 'ACTIVE' } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Headquarters name is required' });
    }

    if (!location) {
      return res.status(400).json({ message: 'Location is required' });
    }

    const validStatus = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

    // Verify assigned admin IDs exist if provided
    let cleanAdminIds = [];
    if (Array.isArray(assignedAdmins) && assignedAdmins.length > 0) {
      cleanAdminIds = assignedAdmins.filter(id => mongoose.Types.ObjectId.isValid(id));
    }

    const newHq = await Headquarters.create({
      name: name.trim(),
      location,
      assignedAdmins: cleanAdminIds,
      status: validStatus
    });

    const populatedHq = await Headquarters.findById(newHq._id).populate(
      'assignedAdmins',
      'displayName email photoUrl role'
    );

    const formattedHq = {
      ...(populatedHq.toJSON ? populatedHq.toJSON() : populatedHq.toObject ? populatedHq.toObject() : populatedHq),
      id: populatedHq._id.toString()
    };

    return res.status(201).json({
      message: 'Headquarters created successfully',
      hq: formattedHq
    });
  } catch (error) {
    console.error('[HQ Controller] createHq error:', error);
    return res.status(500).json({ message: 'Failed to create headquarters.' });
  }
}

/**
 * PUT /api/admin/hq/:id
 * Update an existing headquarters.
 * Body: { name, location, assignedAdmins, status }
 */
async function updateHq(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid headquarters ID' });
    }

    const hq = await Headquarters.findById(id);

    if (!hq) {
      return res.status(404).json({ message: 'Headquarters not found' });
    }

    const { name, location, assignedAdmins, status } = req.body;

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: 'Headquarters name cannot be empty' });
      }
      hq.name = name.trim();
    }

    if (location !== undefined) {
      if (!location) {
        return res.status(400).json({ message: 'Location cannot be empty' });
      }
      hq.location = location;
    }

    if (status !== undefined) {
      if (['ACTIVE', 'INACTIVE'].includes(status)) {
        hq.status = status;
      }
    }

    if (assignedAdmins !== undefined && Array.isArray(assignedAdmins)) {
      hq.assignedAdmins = assignedAdmins.filter(id => mongoose.Types.ObjectId.isValid(id));
    }

    await hq.save();

    const updatedHq = await Headquarters.findById(id).populate(
      'assignedAdmins',
      'displayName email photoUrl role'
    );

    const formattedHq = {
      ...(updatedHq.toJSON ? updatedHq.toJSON() : updatedHq.toObject ? updatedHq.toObject() : updatedHq),
      id: updatedHq._id.toString()
    };

    return res.status(200).json({
      message: 'Headquarters updated successfully',
      hq: formattedHq
    });
  } catch (error) {
    console.error('[HQ Controller] updateHq error:', error);
    return res.status(500).json({ message: 'Failed to update headquarters.' });
  }
}

/**
 * DELETE /api/admin/hq/:id
 * Delete a headquarters.
 */
async function deleteHq(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid headquarters ID' });
    }

    const deletedHq = await Headquarters.findByIdAndDelete(id);

    if (!deletedHq) {
      return res.status(404).json({ message: 'Headquarters not found' });
    }

    return res.status(200).json({
      message: 'Headquarters deleted successfully',
      id
    });
  } catch (error) {
    console.error('[HQ Controller] deleteHq error:', error);
    return res.status(500).json({ message: 'Failed to delete headquarters.' });
  }
}

module.exports = {
  getHqs,
  createHq,
  updateHq,
  deleteHq
};
