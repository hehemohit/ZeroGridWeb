const mongoose = require('mongoose');

const headquartersSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Headquarters name is required'],
      trim: true
    },
    location: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Location is required']
    },
    assignedAdmins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
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

const Headquarters = mongoose.model('Headquarters', headquartersSchema);

module.exports = Headquarters;
