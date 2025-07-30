const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  
  description: {
    type: String,
    trim: true,
    default: ''
  },
  
  icon: {
    type: String,
    trim: true,
    default: 'fas fa-pills'
  },
  
  color: {
    type: String,
    trim: true,
    default: '#007bff'
  },
  
  // Category status
  active: {
    type: Boolean,
    default: true
  },
  
  // Category order for display
  order: {
    type: Number,
    default: 0
  },
  
  // Medicine count (cached)
  medicineCount: {
    type: Number,
    default: 0
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
categorySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Generate slug if not provided
  if (!this.slug && this.name) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  
  next();
});

// Method to update medicine count
categorySchema.methods.updateMedicineCount = async function() {
  const Medicine = mongoose.model('Medicine');
  this.medicineCount = await Medicine.countDocuments({ 
    category: this.name, 
    status: 'Available' 
  });
  await this.save();
};

// Static method to get all active categories
categorySchema.statics.getActiveCategories = function() {
  return this.find({ active: true }).sort({ order: 1, name: 1 });
};

// Index for better query performance
categorySchema.index({ active: 1, order: 1 });
categorySchema.index({ slug: 1 });

module.exports = mongoose.model('Category', categorySchema); 