const mongoose = require('mongoose');

/**
 * ParentChildLink — tracks family linking relationships between users.
 *
 * Supports multiple parents per child (no artificial single-parent limit).
 * Status transitions: PENDING -> ACCEPTED | REJECTED | REVOKED
 *
 * Security note: GET /api/family/child/:childId/location MUST re-query
 * this collection to verify an ACCEPTED record exists on every call.
 * Never cache "is parent" in JWT claims.
 */
const parentChildLinkSchema = new mongoose.Schema(
  {
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    childId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED'],
      default: 'PENDING'
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    respondedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Prevent duplicate link requests between the same parent-child pair
parentChildLinkSchema.index({ parentId: 1, childId: 1 }, { unique: true });

const ParentChildLink = mongoose.model('ParentChildLink', parentChildLinkSchema);

module.exports = ParentChildLink;
