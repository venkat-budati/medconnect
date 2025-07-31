const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // User who receives the notification
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // User who triggered the notification (optional)
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Notification type and content
  type: {
    type: String,
    enum: [
      'request_sent',           // Requester sent a request
      'request_received',      // Donor receives a request
      'request_accepted',      // Requester's request was accepted
      'request_rejected',      // Requester's request was rejected
      'request_completed',     // Request was completed
      'donation_completed',    // Donation was completed (newly added)
      'donation_failed',       // Donation was marked as failed (newly added)
      'request_cancelled',     // Request was cancelled (newly added)
      'medicine_donated',      // Medicine was successfully donated
      'medicine_expiring',     // Medicine is expiring soon
      'profile_updated',       // Profile was updated
      'welcome',              // Welcome notification
      'system'                // System notification
    ],
    required: true
  },
  
  title: {
    type: String,
    required: true,
    trim: true
  },
  
  message: {
    type: String,
    required: true,
    trim: true
  },
  
  // Related data (optional)
  relatedMedicine: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine'
  },
  
  relatedRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request'
  },
  
  // Notification status
  read: {
    type: Boolean,
    default: false
  },
  
  // Priority level
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  readAt: {
    type: Date
  }
});

// Update readAt when notification is marked as read
notificationSchema.pre('save', function(next) {
  if (this.isModified('read') && this.read && !this.readAt) {
    this.readAt = Date.now();
  }
  next();
});

// Virtual for notification age
notificationSchema.virtual('ageInMinutes').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  const diffTime = now - created;
  return Math.ceil(diffTime / (1000 * 60));
});

// Virtual for notification age in hours
notificationSchema.virtual('ageInHours').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  const diffTime = now - created;
  return Math.ceil(diffTime / (1000 * 60 * 60));
});

// Virtual for notification age in days
notificationSchema.virtual('ageInDays').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  const diffTime = now - created;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for formatted time
notificationSchema.virtual('formattedTime').get(function() {
  const minutes = this.ageInMinutes;
  const hours = this.ageInHours;
  const days = this.ageInDays;
  
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  } else if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  } else {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
});

// Index for better query performance
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema); 