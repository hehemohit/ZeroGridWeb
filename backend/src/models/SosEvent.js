const mongoose = require('mongoose');

/**
 * SosEvent — persisted record of every SOS dispatch.
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
      enum: ['MEDICAL', 'DISASTER', 'TRAPPED', 'SECURITY', 'OTHER'],
      default: 'OTHER'
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
    status: {
      type: String,
      enum: ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'],
      default: 'ACTIVE',
      index: true
    },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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

// 2dsphere index — enables geospatial queries on the location field.
// Equivalent to: db.sosEvents.createIndex({ location: "2dsphere" })
sosEventSchema.index({ location: '2dsphere' });

const SosEvent = mongoose.model('SosEvent', sosEventSchema);

module.exports = SosEvent;
