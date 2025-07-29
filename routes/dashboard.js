const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');
const Request = require('../models/Request');
const { isLoggedIn } = require('./middleware');

// Dashboard
router.get('/', isLoggedIn, async (req, res) => {
  const userId = req.session.user.id;
  const donations = await Medicine.find({ donor: userId });
  const requests = await Request.find({ requester: userId }).populate('medicine');
  res.render('dashboard', { donations, requests });
});

// Cancel request
router.post('/cancel/:id', isLoggedIn, async (req, res) => {
  await Request.deleteOne({ _id: req.params.id, requester: req.session.user.id });
  req.flash('success', 'Request cancelled.');
  res.redirect('/dashboard');
});

module.exports = router; 