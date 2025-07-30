const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  // Medicine and user references
  medicine: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: true
  },
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  donor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Request details
  message: {
    type: String,
    trim: true,
    default: ''
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  
  // Status and tracking
  status: {
    type: String,
    enum: ['Pending', 'Accepted', 'Rejected', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  
  // Response from donor
  donorResponse: {
    message: {
      type: String,
      trim: true,
      default: ''
    },
    respondedAt: {
      type: Date
    }
  },
  
  // Pickup details
  pickupDetails: {
    address: {
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
    },
    contactPhone: {
      type: String,
      trim: true,
      default: ''
    },
    pickupDate: {
      type: Date
    },
    pickupTime: {
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
  },
  completedAt: {
    type: Date
  }
});

// Update timestamps on save
requestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Set completedAt when status changes to Completed
  if (this.isModified('status') && this.status === 'Completed' && !this.completedAt) {
    this.completedAt = Date.now();
  }
  
  next();
});

// Virtual for request age in days
requestSchema.virtual('ageInDays').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  const diffTime = now - created;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for status color/class
requestSchema.virtual('statusClass').get(function() {
  const statusClasses = {
    'Pending': 'status-pending',
    'Accepted': 'status-accepted',
    'Rejected': 'status-rejected',
    'Completed': 'status-completed',
    'Cancelled': 'status-cancelled'
  };
  return statusClasses[this.status] || 'status-pending';
});

// Index for better query performance
requestSchema.index({ requester: 1, createdAt: -1 });
requestSchema.index({ donor: 1, createdAt: -1 });
requestSchema.index({ status: 1, createdAt: -1 });
requestSchema.index({ medicine: 1, status: 1 });

module.exports = mongoose.model('Request', requestSchema); 