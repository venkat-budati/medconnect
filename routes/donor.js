const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');
const { isLoggedIn } = require('./middleware');

// Donor history page
router.get('/', isLoggedIn, async (req, res) => {
  const userId = req.session.user.id;
  const donations = await Medicine.find({ donor: userId }).sort({ createdAt: -1 });
  res.render('donor', { donations, activePage: 'donor' });
});

module.exports = router; 