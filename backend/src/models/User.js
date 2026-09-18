const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required']
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true
    },
    authProvider: {
      type: String,
      enum: ['LOCAL', 'GOOGLE'],
      default: 'LOCAL'
    },
    googleId: {
      type: String,
      default: null
    },
    role: {
      type: String,
      enum: ['CITIZEN', 'ADMIN'],
      default: 'CITIZEN'
    },
    adminApproved: {
      type: Boolean,
      default: null
      // null = not applicable for citizens; false = admin pending approval; true = admin approved
    },
    // Profile completion fields
    phoneNumber: {
      type: String,
      trim: true,
      default: null
    },
    dateOfBirth: {
      type: Date,
      default: null
    },
    photoUrl: {
      type: String,
      default: null
    },
    profileComplete: {
      type: Boolean,
      default: false
    },
    // Future feature fields (reserved)
    accountType: {
      type: String,
      enum: ['STANDARD', 'CHILD'],
      default: 'STANDARD'
    },
    fcmToken: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Pre-save hook: maintain role/approval consistency
userSchema.pre('save', function (next) {
  if (this.isModified('role')) {
    if (this.role === 'ADMIN' && this.adminApproved === null) {
      this.adminApproved = false;
    } else if (this.role === 'CITIZEN') {
      this.adminApproved = null;
    }
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
