const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Zone name is required'],
      trim: true
    },
    code: {
      type: String,
      required: [true, 'Zone code is required'],
      unique: true,
      trim: true,
      uppercase: true
    },
    hqId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Headquarters',
      required: [true, 'Parent Headquarters is required']
    },
    h3Index: {
      type: String,
      default: null,
      index: true
    },
    radiusKm: {
      type: Number,
      default: 12.0
    },
    center: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: [true, 'Center coordinates are required']
      }
    },
    boundary: {
      type: {
        type: String,
        enum: ['Polygon'],
        default: 'Polygon'
      },
      coordinates: {
        type: [[[Number]]], // GeoJSON Polygon ring [[ [lng, lat], [lng, lat], ... ]]
        required: [true, 'Hexagonal boundary polygon is required']
      }
    },
    assignedAdmins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'HIGH_ALERT'],
      default: 'ACTIVE'
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

// 2dsphere index for spatial point-in-hexagon containment queries
zoneSchema.index({ boundary: '2dsphere' });
zoneSchema.index({ center: '2dsphere' });

const Zone = mongoose.model('Zone', zoneSchema);

module.exports = Zone;
