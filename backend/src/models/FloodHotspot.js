const mongoose = require('mongoose');

const FloodHotspotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Hotspot name is required'],
      trim: true,
      unique: true
    },
    ward: {
      type: String,
      required: [true, 'Municipal ward is required'],
      trim: true
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: ['UNDERPASS', 'LOW_LYING_BOWL', 'RAILWAY_CULVERT']
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
        required: true
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        validate: {
          validator: (coords) =>
            Array.isArray(coords) &&
            coords.length === 2 &&
            coords[0] >= -180 && coords[0] <= 180 &&
            coords[1] >= -90 && coords[1] <= 90,
          message: 'Coordinates must be valid [lng, lat] within geographic boundaries'
        }
      }
    },
    drainageCapacityMmPerHr: {
      type: Number,
      default: 20,
      min: 0
    },
    chronicRiskLevel: {
      type: String,
      enum: ['HIGH', 'CRITICAL'],
      default: 'HIGH'
    },
    historicalClearanceHoursAvg: {
      type: Number,
      default: 4.0,
      min: 0
    },
    criticalWaterThresholdCm: {
      type: Number,
      default: 30, // Depth at which vehicular / rescue transit is compromised
      min: 0
    },
    notes: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// 2dsphere index for spatial proximity queries ($near, $geoWithin)
FloodHotspotSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('FloodHotspot', FloodHotspotSchema);
