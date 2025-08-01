const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
  // Basic medicine info
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  category: {
    type: String,
    enum: [
      'Pain Relief', 
      'Fever', 
      'Antibiotics', 
      'Vitamins', 
      'Diabetes', 
      'Blood Pressure', 
      'Allergy', 
      'Cough & Cold', 
      'Digestive', 
      'Skin Care', 
      'Eye Care', 
      'Dental', 
      'Women Health', 
      'Children', 
      'Elderly', 
      'First Aid', 
      'General',
      'Other'
    ],
    required: true
  },
  dosage: {
    type: String,
    trim: true,
    default: ''
  },
  manufacturer: {
    type: String,
    trim: true,
    default: ''
  },
  
  // Quantity and expiry
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unit: {
    type: String,
    enum: ['Tablets', 'Capsules', 'Bottles', 'Strips', 'Pieces'],
    default: 'Tablets'
  },
  expiry: {
    type: Date,
    required: true
  },
  
  // Image and status
  imageUrl: {
    type: String,
    default: ''
  },
  additionalImages: [{
    type: String
  }],
  condition: {
    type: String,
    enum: ['new', 'opened', 'partial'],
    required: true
  },
  status: {
    type: String,
    enum: ['Available', 'Requested', 'Stock Finished', 'Donated', 'Expired'],
    default: 'Available'
  },
  
  // Donor information
  donor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Location for pickup
  pickupLocation: {
    addressLine1: {
      type: String,
      trim: true,
      default: ''
    },
    city: {
      type: String,
      trim: true,
      default: ''
    },
    state: {
      type: String,
      trim: true,
      default: ''
    },
    pincode: {
      type: String,
      trim: true,
      default: ''
    }
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
medicineSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for days until expiry
medicineSchema.virtual('daysUntilExpiry').get(function() {
  const today = new Date();
  const expiryDate = new Date(this.expiry);
  const diffTime = expiryDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Virtual for expiry status
medicineSchema.virtual('isExpired').get(function() {
  return this.daysUntilExpiry < 0;
});

// Virtual for expiry warning (30 days)
medicineSchema.virtual('isExpiringSoon').get(function() {
  return this.daysUntilExpiry <= 30 && this.daysUntilExpiry >= 0;
});

// Index for better query performance
medicineSchema.index({ status: 1, expiry: 1 });
medicineSchema.index({ donor: 1, createdAt: -1 });
medicineSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model('Medicine', medicineSchema); 