const mongoose = require('mongoose');

/**
 * SosEvent - persisted record of every SOS dispatch.
 *
 * location uses GeoJSON Point so MongoDB can do geospatial queries
 * (e.g. "find active SOS within 10 km of rescue base").
 * The 2dsphere index below enables that immediately.
 */
const sosNoteSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

/**
 * Per-user acknowledgment entry.
 * Tracks who acknowledged the SOS, when, and whether they confirmed safety.
 */
const sosAckSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    displayName: {
      type: String,
      default: ''
    },
    confirmedSafe: {
      type: Boolean,
      default: true
    },
    acknowledgedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

/**
 * Sub-schema for crowdsourced duplicate citizen witness reports
 */
const witnessReportSchema = new mongoose.Schema(
  {
    citizenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    displayName: { type: String, default: 'Anonymous Citizen' },
    phoneNumber: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
    reportedDepthCm: { type: Number, default: 0 },
    message: { type: String, trim: true, default: '' },
    batteryPercentage: { type: Number, default: null },
    transport: { type: String, enum: ['ONLINE', 'MESH', 'BOTH'], default: 'ONLINE' },
    coordinates: { type: [Number], required: false } // [lng, lat]
  },
  { _id: false }
);

const sosEventSchema = new mongoose.Schema(
  {
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true
      }
    },
    accuracyMeters: {
      type: Number,
      default: null
    },
    category: {
      type: String,
      enum: [
        'WATERLOGGING',
        'SUBMERGED_UNDERPASS',
        'DRAINAGE_OVERFLOW',
        'HEATWAVE',
        'FALLEN_GRID',
        'MEDICAL',
        'DISASTER',
        'TRAPPED',
        'SECURITY',
        'OTHER'
      ],
      default: 'OTHER'
    },
    domain: {
      type: String,
      enum: ['FLOOD', 'HEATWAVE', 'POWER_GRID', 'RESCUE', 'OTHER'],
      default: 'OTHER',
      index: true
    },
    reportCount: {
      type: Number,
      default: 1,
      min: 1,
      index: true
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
      index: true
    },
    priorityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    },
    waterDepthCm: {
      type: Number,
      default: 0
    },
    passability: {
      type: String,
      enum: ['ALL_PASSABLE', 'HIGH_CLEARANCE_ONLY', 'PEDESTRIAN_ONLY', 'IMPASSABLE'],
      default: 'ALL_PASSABLE'
    },
    packetId: {
      type: String,
      index: true,
      sparse: true
    },
    relayedByMule: {
      type: Boolean,
      default: false
    },
    message: {
      type: String,
      trim: true,
      default: ''
    },
    transport: {
      type: String,
      enum: ['ONLINE', 'MESH', 'BOTH'],
      default: 'ONLINE'
    },
    batteryPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },
    status: {
      type: String,
      enum: [
        'ACTIVE',
        'INVESTIGATING',
        'ALLOCATING',
        'DISPATCHED',
        'ON_SCENE',
        'CONTAINED',
        'ACKNOWLEDGED',
        'RESOLVED',
        'ESCALATED_MASS_CASUALTY',
        'FALSE_ALARM'
      ],
      default: 'ACTIVE',
      index: true
    },
    witnessReports: {
      type: [witnessReportSchema],
      default: []
    },
    workforceDemand: {
      type: {
        requiredRole: String,
        teamCount: Number,
        equipmentNeeded: [String],
        urgencyMinutes: Number
      },
      default: null
    },
    firstReportedAt: {
      type: Date,
      default: Date.now
    },
    lastReportedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    // Legacy single-acknowledger field (kept for backward compat)
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    // Per-user acknowledgment list - tracks each individual who confirmed safety
    acknowledgedByUsers: {
      type: [sosAckSchema],
      default: []
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    assignedAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Zone',
      default: null,
      index: true
    },
    hqId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Headquarters',
      default: null,
      index: true
    },
    h3Index: {
      type: String,
      default: null,
      index: true
    },
    affectedNodeId: {
      type: String,
      default: null,
      index: true
    },
    agentZeroAdvisory: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    assignedSquad: {
      type: String,
      default: null,
      index: true
    },
    resolvedAt: {
      type: Date,
      default: null
    },
    resolutionNotes: {
      type: String,
      default: null
    },
    notes: {
      type: [sosNoteSchema],
      default: []
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        return ret;
      }
    }
  }
);

// 2dsphere index - enables geospatial queries on the location field.
// Equivalent to: db.sosEvents.createIndex({ location: "2dsphere" })
sosEventSchema.index({ location: '2dsphere' });
// Compound index for fast sub-10ms spatial-temporal duplicate queries:
sosEventSchema.index({ status: 1, lastReportedAt: -1, domain: 1 });
sosEventSchema.index({ location: '2dsphere', status: 1 });

const SosEvent = mongoose.model('SosEvent', sosEventSchema);

module.exports = SosEvent;
