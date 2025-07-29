const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');
const Request = require('../models/Request');
const { isLoggedIn } = require('./middleware');

// Browse medicines
router.get('/', isLoggedIn, async (req, res) => {
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