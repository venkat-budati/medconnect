const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  // Users involved
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  reviewedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Related request
  request: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: true
  },
  
  // Rating and review
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  
  title: {
    type: String,
    trim: true,
    maxlength: 100
  },
  
  comment: {
    type: String,
    trim: true,
    maxlength: 500
  },
  
  // Review categories
  categories: {
    helpfulness: {
      type: Number,
      min: 1,
      max: 5,
      default: 5
    },
    communication: {
      type: Number,
      min: 1,
      max: 5,
      default: 5
    },
    timeliness: {
      type: Number,
      min: 1,
      max: 5,
      default: 5
    },
    condition: {
      type: Number,
      min: 1,
      max: 5,
      default: 5
    }
  },
  
  // Review status
  status: {
    type: String,
    enum: ['active', 'hidden', 'reported'],
    default: 'active'
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
reviewSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for average category rating
reviewSchema.virtual('averageCategoryRating').get(function() {
  const categories = this.categories;
  const values = Object.values(categories);
  const sum = values.reduce((acc, val) => acc + val, 0);
  return Math.round((sum / values.length) * 10) / 10;
});

// Virtual for overall rating with categories
reviewSchema.virtual('overallRating').get(function() {
  const mainRating = this.rating;
  const categoryRating = this.averageCategoryRating;
  return Math.round(((mainRating + categoryRating) / 2) * 10) / 10;
});

// Ensure one review per request per user
reviewSchema.index({ request: 1, reviewer: 1 }, { unique: true });

// Index for better query performance
reviewSchema.index({ reviewedUser: 1, status: 1 });
reviewSchema.index({ rating: 1, createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema); 