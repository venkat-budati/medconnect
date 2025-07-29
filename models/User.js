const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
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
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema); 