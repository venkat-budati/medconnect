const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');
const { isLoggedIn } = require('./middleware');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const upload = multer({ storage: multer.memoryStorage() });

// GET donate form
router.get('/', isLoggedIn, (req, res) => {
  res.render('donate');
});

// POST donate
router.post('/', isLoggedIn, upload.single('image'), async (req, res) => {
  const { name, quantity, expiry } = req.body;
  if (!name || !quantity || !expiry || !req.file) {
    req.flash('error', 'All fields are required.');
    return res.redirect('/donate');
  }
  try {
    const result = await cloudinary.uploader.upload_stream({ resource_type: 'image' }, async (error, result) => {
      if (error) {
        req.flash('error', 'Image upload failed.');
        return res.redirect('/donate');
      }
      const medicine = new Medicine({
        name,
        quantity,
        expiry,
        imageUrl: result.secure_url,
        donor: req.session.user.id
      });
      await medicine.save();
      req.flash('success', 'Medicine donated successfully.');
      res.redirect('/dashboard');
    });
    result.end(req.file.buffer);
  } catch (err) {
    req.flash('error', 'Donation failed.');
    res.redirect('/donate');
  }
});

module.exports = router; 