const mongoose = require('mongoose');

/**
 * TacticalTeam - Emergency workforce unit registry persisted in MongoDB.
 * Queried by Agent 0's Workforce Matching Engine to dispatch proximate,
 * skill-matched squads to active crisis incidents.
 */
const tacticalTeamSchema = new mongoose.Schema(
  {
    teamId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true, // e.g. "TEAM_NDRF_ALPHA", "TEAM_LINEMEN_SQUAD_04"
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    domain: {
      type: String,
      enum: [
        'FLOOD_RESCUE',
        'HEATWAVE_SUPPORT',
        'ELECTRICAL_GRID',
        'PARAMEDIC_RESCUE',
        'EVACUATION',
        'DEWATERING',
      ],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        'IDLE',
        'ASSIGNED',
        'EN_ROUTE',
        'ON_SCENE',
        'RETURNING',
        'RESTOCKED',
        'OFF_DUTY',
        'MAINTENANCE',
      ],
      default: 'IDLE',
      index: true,
    },
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    speedKmh: {
      type: Number,
      default: 30,
      min: 5,
    },
    personnelCount: {
      type: Number,
      default: 6,
    },
    skills: {
      type: [String],
      default: [], // e.g. ["DEEP_WATER_EVAC", "INFLATABLE_BOAT_PILOT", "HV_LINE_ISOLATION"]
    },
    equipment: {
      type: [String],
      default: [], // e.g. ["ZODIAC_BOAT", "SUBMERSIBLE_PUMP_500HP", "BUCKET_TRUCK"]
    },
    assignedIncidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SosEvent',
      default: null,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    contactRadio: {
      type: String,
      default: 'VHF_CH_04',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        return ret;
      },
    },
  }
);

// 2dsphere geospatial index for proximity search
tacticalTeamSchema.index({ currentLocation: '2dsphere' });

// Compound index for matching engine queries
tacticalTeamSchema.index({ status: 1, domain: 1 });

const TacticalTeam = mongoose.model('TacticalTeam', tacticalTeamSchema);

module.exports = TacticalTeam;
