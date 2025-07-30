const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  // Authentication fields
  email: {
    type: String,
    required: function() { return !this.phone; },
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    match: /.+@.+\..+/
  },
  phone: {
    type: String,
    required: function() { return !this.email; },
    unique: true,
    sparse: true,
    match: /^\d{10,15}$/
  },
  password: {
    type: String,
    required: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  
  // Profile fields
  firstName: {
    type: String,
    trim: true,
    default: ''
  },
  lastName: {
    type: String,
    trim: true,
    default: ''
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  mobile: {
    type: String,
    trim: true,
    match: /^[\+]?[1-9][\d]{0,15}$/
  },
  
  // Address fields
  addressLine1: {
    type: String,
    trim: true,
    default: ''
  },
  country: {
    type: String,
    trim: true,
    default: ''
  },
  state: {
    type: String,
    trim: true,
    default: ''
  },
  city: {
    type: String,
    trim: true,
    default: ''
  },
  pincode: {
    type: String,
    trim: true,
    default: ''
  },
  
  // Profile stats
  medicinesDonated: {
    type: Number,
    default: 0
  },
  medicinesReceived: {
    type: Number,
    default: 0
  },
  peopleHelped: {
    type: Number,
    default: 0
  },
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamps on save
userSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();
  
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`.trim();
});

// Virtual for initials (for avatar)
userSchema.virtual('initials').get(function() {
  const first = this.firstName ? this.firstName.charAt(0) : '';
  const last = this.lastName ? this.lastName.charAt(0) : '';
  return (first + last).toUpperCase();
});

// Method to compare password
userSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to update profile stats
userSchema.methods.updateStats = async function() {
  const Medicine = mongoose.model('Medicine');
  const Request = mongoose.model('Request');
  
  // Count donated medicines
  this.medicinesDonated = await Medicine.countDocuments({ donor: this._id });
  
  // Count received medicines
  this.medicinesReceived = await Request.countDocuments({ 
    requester: this._id, 
    status: 'Completed' 
  });
  
  // Count people helped (unique donors who completed requests)
  const completedRequests = await Request.find({ 
    requester: this._id, 
    status: 'Completed' 
  }).distinct('donor');
  this.peopleHelped = completedRequests.length;
  
  await this.save();
};

module.exports = mongoose.model('User', userSchema); 