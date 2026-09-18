const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    contactUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    label: {
      type: String,
      trim: true,
      default: 'Emergency Contact'
    }
  },
  {
    timestamps: true
  }
);

// Prevent adding the same contact user multiple times for the same owner
contactSchema.index({ ownerId: 1, contactUserId: 1 }, { unique: true });

const Contact = mongoose.model('Contact', contactSchema);

module.exports = Contact;
