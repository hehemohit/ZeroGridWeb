const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'API Key name is required'],
      trim: true
    },
    key: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    tier: {
      type: String,
      enum: ['FREE', 'PARTNER', 'ENTERPRISE'],
      default: 'FREE'
    },
    permissions: [
      {
        type: String,
        enum: ['READ_ZONES', 'READ_DENSITY', 'INGEST_SOS', 'WEBHOOKS'],
        default: ['READ_ZONES', 'READ_DENSITY']
      }
    ],
    rateLimitPerMin: {
      type: Number,
      default: 60
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastUsedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret.key; // Hide raw key in standard json outputs
        return ret;
      }
    }
  }
);

const ApiKey = mongoose.model('ApiKey', apiKeySchema);

module.exports = ApiKey;
