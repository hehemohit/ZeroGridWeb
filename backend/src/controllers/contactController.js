const mongoose = require('mongoose');
const Contact = require('../models/Contact');
const User = require('../models/User');
const { isValidEmail, isValidPhone } = require('../utils/validation');

/**
 * GET /api/contacts
 * Returns all emergency contacts saved by the authenticated user.
 */
async function getContacts(req, res) {
  try {
    const contacts = await Contact.find({ ownerId: req.user.userId })
      .populate('contactUserId', 'displayName email phoneNumber role photoUrl')
      .sort({ createdAt: -1 });

    const formatted = contacts
      .filter(c => c.contactUserId != null)
      .map(c => ({
        id: c._id,
        label: c.label || 'Emergency Contact',
        createdAt: c.createdAt,
        contactUser: {
          id: c.contactUserId._id,
          displayName: c.contactUserId.displayName,
          email: c.contactUserId.email,
          phoneNumber: c.contactUserId.phoneNumber || null,
          role: c.contactUserId.role,
          photoUrl: c.contactUserId.photoUrl || null
        }
      }));

    return res.status(200).json({ contacts: formatted });
  } catch (error) {
    console.error('getContacts error:', error);
    return res.status(500).json({ message: 'Failed to retrieve emergency contacts' });
  }
}

/**
 * POST /api/contacts
 * Adds an emergency contact for the authenticated user.
 * Target must already be a registered ZeroGrid user found by email or phoneNumber.
 */
async function addContact(req, res) {
  try {
    const { contactEmailOrPhone, label } = req.body;

    if (!contactEmailOrPhone || typeof contactEmailOrPhone !== 'string') {
      return res.status(400).json({ message: 'Contact email or phone number is required' });
    }

    const trimmedInput = contactEmailOrPhone.trim();
    const isEmail = isValidEmail(trimmedInput);
    const isPhone = isValidPhone(trimmedInput);

    if (!isEmail && !isPhone) {
      return res.status(400).json({
        message: 'Please provide a valid email address or phone number (7-15 digits with optional + country code)'
      });
    }

    // Lookup target user
    const query = isEmail
      ? { email: trimmedInput.toLowerCase() }
      : { phoneNumber: trimmedInput };

    const targetUser = await User.findOne(query);

    if (!targetUser) {
      return res.status(404).json({
        message: 'No registered ZeroGrid user found with this ' + (isEmail ? 'email address' : 'phone number') + '. They must register first.'
      });
    }

    // Prevent adding oneself
    if (targetUser._id.toString() === req.user.userId) {
      return res.status(400).json({ message: 'You cannot add yourself as an emergency contact' });
    }

    // Check for duplicate
    const existing = await Contact.findOne({
      ownerId: req.user.userId,
      contactUserId: targetUser._id
    });

    if (existing) {
      return res.status(409).json({ message: 'This user is already in your emergency contacts list' });
    }

    const newContact = await Contact.create({
      ownerId: req.user.userId,
      contactUserId: targetUser._id,
      label: (label && label.trim()) || 'Emergency Contact'
    });

    return res.status(201).json({
      message: 'Emergency contact added successfully',
      contact: {
        id: newContact._id,
        label: newContact.label,
        createdAt: newContact.createdAt,
        contactUser: {
          id: targetUser._id,
          displayName: targetUser.displayName,
          email: targetUser.email,
          phoneNumber: targetUser.phoneNumber || null,
          role: targetUser.role,
          photoUrl: targetUser.photoUrl || null
        }
      }
    });
  } catch (error) {
    console.error('addContact error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This user is already in your emergency contacts list' });
    }
    return res.status(500).json({ message: 'Failed to add emergency contact' });
  }
}

/**
 * DELETE /api/contacts/:id
 * Removes an emergency contact belonging to the authenticated user.
 */
async function deleteContact(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid contact ID format' });
    }

    const deleted = await Contact.findOneAndDelete({
      _id: id,
      ownerId: req.user.userId
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Contact not found or already deleted' });
    }

    return res.status(200).json({
      message: 'Emergency contact removed successfully',
      id
    });
  } catch (error) {
    console.error('deleteContact error:', error);
    return res.status(500).json({ message: 'Failed to remove emergency contact' });
  }
}

module.exports = {
  getContacts,
  addContact,
  deleteContact
};
