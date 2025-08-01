const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { isLoggedIn } = require('./middleware');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

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
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 3 // Max 3 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
}).array('images', 3);

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// GET donate form
router.get('/', isLoggedIn, requireCompleteProfile, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/dashboard');
    }

    // Get categories for the form
    const categories = [
      { value: 'Pain Relief', label: 'Pain Relief', icon: 'fas fa-head-side-cough' },
      { value: 'Fever', label: 'Fever', icon: 'fas fa-thermometer-half' },
      { value: 'Antibiotics', label: 'Antibiotics', icon: 'fas fa-shield-virus' },
      { value: 'Vitamins', label: 'Vitamins & Supplements', icon: 'fas fa-apple-alt' },
      { value: 'Diabetes', label: 'Diabetes', icon: 'fas fa-tint' },
      { value: 'Blood Pressure', label: 'Blood Pressure', icon: 'fas fa-heartbeat' },
      { value: 'Allergy', label: 'Allergy', icon: 'fas fa-wind' },
      { value: 'Cough & Cold', label: 'Cough & Cold', icon: 'fas fa-lungs' },
      { value: 'Digestive', label: 'Digestive', icon: 'fas fa-stomach' },
      { value: 'Skin Care', label: 'Skin Care', icon: 'fas fa-spa' },
      { value: 'Eye Care', label: 'Eye Care', icon: 'fas fa-eye' },
      { value: 'Dental', label: 'Dental', icon: 'fas fa-tooth' },
      { value: 'Women Health', label: 'Women Health', icon: 'fas fa-female' },
      { value: 'Children', label: 'Children', icon: 'fas fa-baby' },
      { value: 'Elderly', label: 'Elderly', icon: 'fas fa-user-plus' },
      { value: 'First Aid', label: 'First Aid', icon: 'fas fa-first-aid' },
      { value: 'General', label: 'General', icon: 'fas fa-capsules' }
    ];

    // Get unread notifications count
    const unreadNotifications = await Notification.countDocuments({
      recipient: req.session.user.id,
      read: false
    });

    res.render('donate', { 
      user,
      categories,
      messages: req.flash(),
      unreadNotifications,
      layout: 'layouts/dashboard_layout', 
      activePage: 'donate' 
    });
  } catch (error) {
    console.error('Donate page error:', error);
    req.flash('error', 'Error loading donate page.');
    res.redirect('/dashboard');
  }
});

// POST donate
router.post('/', isLoggedIn, (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_COUNT') {
        req.flash('error', 'Too many files. Maximum 3 images allowed.');
        return res.redirect('/donate');
      } else if (err.code === 'LIMIT_FILE_SIZE') {
        req.flash('error', 'File too large. Maximum 5MB per file.');
        return res.redirect('/donate');
      } else {
        req.flash('error', 'File upload error: ' + err.message);
        return res.redirect('/donate');
      }
    } else if (err) {
      req.flash('error', 'File upload error: ' + err.message);
      return res.redirect('/donate');
    }
    // If no error, continue to the next middleware
    next();
  });
}, async (req, res) => {
  try {
    
    const {
      name,
      quantity,
      unit,
      expiry,
      dosage,
      manufacturer,
      category,
      condition,
      notes,
      description
    } = req.body;

    // Validation
    const errors = [];
    if (!name || name.trim().length < 3) {
      errors.push('Medicine name must be at least 3 characters long.');
    }
    if (!quantity || quantity < 1) {
      errors.push('Quantity must be at least 1.');
    }
    if (!expiry) {
      errors.push('Expiry date is required.');
    }
    if (expiry && new Date(expiry) <= new Date()) {
      errors.push('Expiry date must be in the future.');
    }
    if (!category) {
      errors.push('Please select a category for the medicine.');
    }
    if (!condition) {
      errors.push('Please select the condition of the medicine.');
    }

    if (errors.length > 0) {
      req.flash('error', errors.join(' '));
      return res.redirect('/donate');
    }

    // Get user data for pickup location
    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/donate');
    }

    // Check if user has address information
    if (!user.addressLine1 || !user.city || !user.state || !user.pincode) {
      req.flash('error', 'Please complete your profile address information before donating medicines. This is required for pickup arrangements.');
      return res.redirect('/donate');
    }

    // Upload images to Cloudinary
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(file => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'medicines',
              transformation: [
                { width: 800, height: 600, crop: 'limit' },
                { quality: 'auto' }
              ]
            },
            (error, result) => {
              if (error) {
                reject(error);
              } else {
                resolve(result.secure_url);
              }
            }
          );
          stream.end(file.buffer);
        });
      });

      try {
        imageUrls = await Promise.all(uploadPromises);
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        req.flash('error', 'Failed to upload images. Please try again.');
        return res.redirect('/donate');
      }
    }


    
    // Create medicine record
    const medicine = new Medicine({
      name: name.trim(),
      quantity: parseInt(quantity),
      unit: unit || 'Tablets',
      expiry: new Date(expiry),
      dosage: dosage || '',
      manufacturer: manufacturer || '',
      category: category,
      description: description || notes || '',
      imageUrl: imageUrls.length > 0 ? imageUrls[0] : '',
      additionalImages: imageUrls.slice(1),
      condition: condition,
      status: 'Available',
      donor: req.session.user.id,
      pickupLocation: {
        addressLine1: user.addressLine1,
        city: user.city,
        state: user.state,
        pincode: user.pincode
      }
    });

    await medicine.save();

    // Update user stats
    user.medicinesDonated += 1;
    await user.save();

    // Create notification for successful donation
    await Notification.create({
      recipient: req.session.user.id,
      type: 'medicine_donated',
      title: 'Medicine Donated Successfully',
      message: `Your donation of ${name} has been submitted successfully. It will be available for requests.`,
      relatedMedicine: medicine._id,
      priority: 'medium'
    });

    // Create system notification for potential donors in the area
    const nearbyUsers = await User.find({
      city: user.city,
      _id: { $ne: req.session.user.id }
    }).limit(10);

    if (nearbyUsers.length > 0) {
      const notificationPromises = nearbyUsers.map(nearbyUser => 
        Notification.create({
          recipient: nearbyUser._id,
          type: 'system',
          title: 'New Medicine Available',
          message: `A new medicine (${name}) is now available in your area.`,
          relatedMedicine: medicine._id,
          priority: 'low'
        })
      );
      await Promise.all(notificationPromises);
    }

    req.flash('success', 'Medicine donated successfully! It is now available for requests.');
    res.redirect('/dashboard');

  } catch (error) {
    console.error('Donation error:', error);
    req.flash('error', 'Failed to submit donation. Please try again.');
    res.redirect('/donate');
  }
});

// GET medicine categories (for AJAX requests)
router.get('/categories', isLoggedIn, async (req, res) => {
  try {
    const categories = [
      { value: 'Pain Relief', label: 'Pain Relief', icon: 'fas fa-head-side-cough' },
      { value: 'Fever', label: 'Fever', icon: 'fas fa-thermometer-half' },
      { value: 'Antibiotics', label: 'Antibiotics', icon: 'fas fa-shield-virus' },
      { value: 'Vitamins', label: 'Vitamins & Supplements', icon: 'fas fa-apple-alt' },
      { value: 'Diabetes', label: 'Diabetes', icon: 'fas fa-tint' },
      { value: 'Blood Pressure', label: 'Blood Pressure', icon: 'fas fa-heartbeat' },
      { value: 'Allergy', label: 'Allergy', icon: 'fas fa-wind' },
      { value: 'Cough & Cold', label: 'Cough & Cold', icon: 'fas fa-lungs' },
      { value: 'Digestive', label: 'Digestive', icon: 'fas fa-stomach' },
      { value: 'Skin Care', label: 'Skin Care', icon: 'fas fa-spa' },
      { value: 'Eye Care', label: 'Eye Care', icon: 'fas fa-eye' },
      { value: 'Dental', label: 'Dental', icon: 'fas fa-tooth' },
      { value: 'Women Health', label: 'Women Health', icon: 'fas fa-female' },
      { value: 'Children', label: 'Children', icon: 'fas fa-baby' },
      { value: 'Elderly', label: 'Elderly', icon: 'fas fa-user-plus' },
      { value: 'First Aid', label: 'First Aid', icon: 'fas fa-first-aid' },
      { value: 'General', label: 'General', icon: 'fas fa-capsules' }
    ];
    
    res.json(categories);
  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

// GET check user profile completeness (for AJAX requests)
router.get('/check-profile', isLoggedIn, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hasAddress = user.addressLine1 && user.city && user.state && user.pincode;
    
    res.json({
      hasAddress,
      missingFields: !hasAddress ? {
        addressLine1: !user.addressLine1,
        city: !user.city,
        state: !user.state,
        pincode: !user.pincode
      } : null
    });
  } catch (error) {
    console.error('Profile check error:', error);
    res.status(500).json({ error: 'Failed to check profile' });
  }
});

// POST validate medicine name (for AJAX requests)
router.post('/validate-name', isLoggedIn, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || name.trim().length < 3) {
      return res.json({ valid: false, message: 'Medicine name must be at least 3 characters long.' });
    }

    // Check if medicine with similar name already exists
    const existingMedicine = await Medicine.findOne({
      name: { $regex: new RegExp(name.trim(), 'i') },
      donor: req.session.user.id,
      status: 'Available'
    });

    if (existingMedicine) {
      return res.json({ 
        valid: false, 
        message: 'You have already donated a medicine with a similar name.' 
      });
    }

    res.json({ valid: true });
  } catch (error) {
    console.error('Name validation error:', error);
    res.status(500).json({ error: 'Validation failed' });
  }
});

// POST validate expiry date (for AJAX requests)
router.post('/validate-expiry', isLoggedIn, async (req, res) => {
  try {
    const { expiry } = req.body;
    
    if (!expiry) {
      return res.json({ valid: false, message: 'Expiry date is required.' });
    }

    const expiryDate = new Date(expiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (expiryDate <= today) {
      return res.json({ valid: false, message: 'Expiry date must be in the future.' });
    }

    // Check if expiry is within 30 days (warning)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    if (expiryDate <= thirtyDaysFromNow) {
      return res.json({ 
        valid: true, 
        warning: 'This medicine expires within 30 days. Please ensure it\'s still safe to donate.' 
      });
    }

    res.json({ valid: true });
  } catch (error) {
    console.error('Expiry validation error:', error);
    res.status(500).json({ error: 'Validation failed' });
  }
});

// GET donation history (for the user)
router.get('/history', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { page = 1, status } = req.query;
    const limit = 10;
    const skip = (page - 1) * limit;

    let query = { donor: userId };
    if (status && status !== 'all') {
      query.status = status;
    }

    const [donations, totalDonations] = await Promise.all([
      Medicine.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Medicine.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalDonations / limit);

    res.json({
      donations,
      currentPage: parseInt(page),
      totalPages,
      totalDonations,
      hasMore: page < totalPages
    });
  } catch (error) {
    console.error('Donation history error:', error);
    res.status(500).json({ error: 'Failed to load donation history' });
  }
});

// DELETE donation (cancel/remove)
router.delete('/:id', isLoggedIn, async (req, res) => {
  try {
    const medicineId = req.params.id;
    const userId = req.session.user.id;

    const medicine = await Medicine.findOne({ _id: medicineId, donor: userId });
    if (!medicine) {
      return res.status(404).json({ error: 'Medicine not found or unauthorized' });
    }

    // Check if medicine has any pending requests
    const Request = require('../models/Request');
    const pendingRequests = await Request.countDocuments({
      medicine: medicineId,
      status: { $in: ['Pending', 'Accepted'] }
    });

    if (pendingRequests > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete medicine with pending requests. Please contact support.' 
      });
    }

    // Delete images from Cloudinary if they exist
    if (medicine.imageUrl) {
      try {
        await cloudinary.uploader.destroy(medicine.imageUrl.split('/').pop().split('.')[0]);
      } catch (cloudinaryError) {
        console.error('Cloudinary deletion error:', cloudinaryError);
      }
    }

    await Medicine.findByIdAndDelete(medicineId);

    // Update user stats
    const user = await User.findById(userId);
    if (user && user.medicinesDonated > 0) {
      user.medicinesDonated -= 1;
      await user.save();
    }

    res.json({ success: true, message: 'Donation removed successfully' });
  } catch (error) {
    console.error('Delete donation error:', error);
    res.status(500).json({ error: 'Failed to remove donation' });
  }
});

// PUT update donation
router.put('/:id', isLoggedIn, async (req, res) => {
  try {
    const medicineId = req.params.id;
    const userId = req.session.user.id;
    const {
      name,
      quantity,
      unit,
      expiry,
      dosage,
      manufacturer,
      category,
      condition,
      notes,
      description
    } = req.body;

    const medicine = await Medicine.findOne({ _id: medicineId, donor: userId });
    if (!medicine) {
      return res.status(404).json({ error: 'Medicine not found or unauthorized' });
    }

    // Check if medicine has any requests
    const Request = require('../models/Request');
    const hasRequests = await Request.exists({ medicine: medicineId });
    
    if (hasRequests) {
      return res.status(400).json({ 
        error: 'Cannot edit medicine that has requests. Please contact support.' 
      });
    }

    // Update medicine fields
    medicine.name = name.trim();
    medicine.quantity = parseInt(quantity);
    medicine.unit = unit || 'Tablets';
    medicine.expiry = new Date(expiry);
    medicine.dosage = dosage || '';
    medicine.manufacturer = manufacturer || '';
    medicine.category = category || 'Other';
    medicine.description = description || notes || '';
    medicine.condition = condition;

    await medicine.save();

    res.json({ success: true, message: 'Donation updated successfully' });
  } catch (error) {
    console.error('Update donation error:', error);
    res.status(500).json({ error: 'Failed to update donation' });
  }
});

module.exports = router; 