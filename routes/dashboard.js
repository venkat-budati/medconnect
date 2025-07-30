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
  res.render('dashboard', { 
    donations, 
    requests, 
    layout: 'layouts/dashboard_layout',
    activePage: 'dashboard'
  });
});

// Browse Medicines
router.get('/browse', isLoggedIn, async (req, res) => {
  res.render('browse', { layout: 'layouts/dashboard_layout', activePage: 'browse' });
});

// My Requests
router.get('/requests', isLoggedIn, async (req, res) => {
  res.render('requests', { layout: 'layouts/dashboard_layout', activePage: 'requests' });
});

router.get('/donor', isLoggedIn, async (req, res) => {
  res.render('donor', { layout: 'layouts/dashboard_layout', activePage: 'donor' });
});

router.get('/profile', isLoggedIn, async (req, res) => {
  res.render('profile', { layout: 'layouts/dashboard_layout', activePage: 'profile' });
});

router.get('/settings', isLoggedIn, async (req, res) => {
  res.render('settings', { layout: 'layouts/dashboard_layout', activePage: 'settings' });
});

// Cancel request
router.post('/cancel/:id', isLoggedIn, async (req, res) => {
  await Request.deleteOne({ _id: req.params.id, requester: req.session.user.id });
  req.flash('success', 'Request cancelled.');
  res.redirect('/dashboard');
});

module.exports = router; 