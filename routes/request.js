const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');
const Request = require('../models/Request');
const User = require('../models/User');
const { isLoggedIn } = require('./middleware');

// Middleware to check if user's profile is complete
const requireCompleteProfile = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const user = await User.findById(userId);

    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/auth/login');
    }

    if (!user.isProfileComplete()) {
      // Check if it's an AJAX request
      if (req.xhr || req.headers.accept && req.headers.accept.indexOf('json') > -1) {
        return res.status(403).json({
          success: false,
          message: 'Please complete your profile to access all features.',
          requiresProfileCompletion: true
        });
      }
      
      req.flash('info', 'Please complete your profile to access all features.');
      return res.redirect('/dashboard/profile');
    }

    next();
  } catch (error) {
    console.error('Profile completion check error:', error);
    if (req.xhr || req.headers.accept && req.headers.accept.indexOf('json') > -1) {
      return res.status(500).json({
        success: false,
        message: 'Error checking profile completion.'
      });
    }
    req.flash('error', 'Error checking profile completion.');
    res.redirect('/dashboard/profile');
  }
};

// Browse medicines
router.get('/', isLoggedIn, requireCompleteProfile, async (req, res) => {
  const medicines = await Medicine.find().populate('donor');
  res.render('request', { medicines });
});

// Request a medicine
router.post('/:id', isLoggedIn, async (req, res) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) {
    req.flash('error', 'Medicine not found.');
    return res.redirect('/request');
  }
  try {
    const newRequest = new Request({
      medicine: medicine._id,
      requester: req.session.user.id,
      donor: medicine.donor,
      status: 'Pending'
    });
    await newRequest.save();
    req.flash('success', 'Request submitted.');
    res.redirect('/dashboard');
  } catch (err) {
    req.flash('error', 'Request failed.');
    res.redirect('/request');
  }
});

module.exports = router; 