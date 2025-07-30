const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const Medicine = require('../models/Medicine');
const Request = require('../models/Request');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Review = require('../models/Review');
const { isLoggedIn } = require('./middleware');
const { geocodeAddress, calculateHaversineDistance, formatDistance } = require('../utils/geocoding');

// Main Dashboard
router.get('/', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/auth/login');
    }

    // Get user statistics
    const stats = await getUserStats(userId);
    
    // Get recent donations (last 3)
    const recentDonations = await Medicine.find({ donor: userId })
      .sort({ createdAt: -1 })
      .limit(3)
      .populate('donor', 'firstName lastName');
    

    
    // Get recent requests (last 5)
    const recentRequests = await Request.find({ requester: userId })
      .populate('medicine')
      .populate('donor', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Get unread notifications count
    const unreadNotifications = await Notification.countDocuments({
      recipient: userId,
      read: false
    });
    
    // Get expiring medicines (within 30 days)
    const expiringMedicines = await Medicine.find({
      donor: userId,
      expiry: { $gte: new Date(), $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      status: 'Available'
    }).limit(3);

    res.render('dashboard', {
      user,
      stats,
      recentDonations,
      recentRequests,
      unreadNotifications,
      expiringMedicines,
      layout: 'layouts/dashboard_layout',
      activePage: 'dashboard'
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    req.flash('error', 'Error loading dashboard.');
    res.redirect('/');
  }
});

// Get user statistics
async function getUserStats(userId) {
  const [
    medicinesDonated,
    medicinesReceived,
    pendingRequests,
    completedRequests,
    peopleHelped,
    averageRating
  ] = await Promise.all([
    Medicine.countDocuments({ donor: userId }),
    Request.countDocuments({ requester: userId, status: 'Completed' }),
    Request.countDocuments({ requester: userId, status: 'Pending' }),
    Request.countDocuments({ requester: userId, status: 'Completed' }),
    Request.distinct('donor', { requester: userId, status: 'Completed' }),
    Review.aggregate([
      { $match: { reviewedUser: userId } },
      { $group: { _id: null, avgRating: { $avg: '$rating' } } }
    ])
  ]);

  return {
    medicinesDonated,
    medicinesReceived,
    pendingRequests,
    completedRequests,
    peopleHelped: peopleHelped.length,
    averageRating: averageRating.length > 0 ? Math.round(averageRating[0].avgRating * 10) / 10 : 0
  };
}



// Browse Medicines
router.get('/browse', isLoggedIn, async (req, res) => {
  try {
    const { 
      category, 
      search, 
      sort = 'distance', 
      distance = '50',
      lat,
      lng 
    } = req.query;
    
    const userId = req.session.user.id;
    const user = await User.findById(userId);
    
    let query = { status: 'Available' };
    
    // Filter by category
    if (category && category !== 'all') {
      query.category = category;
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { manufacturer: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get all available medicines with donor info
    let medicines = await Medicine.find(query)
      .populate('donor', 'firstName lastName city state pincode addressLine1')
      .sort({ createdAt: -1 });
    
    // Calculate distances if user location is provided
    if (lat && lng && user.addressLine1 && user.city && user.state) {
      console.log('📍 Calculating distances for', medicines.length, 'medicines...');
      medicines = await calculateDistances(medicines, lat, lng);
      
      // Filter by distance
      const maxDistance = parseInt(distance);
      const beforeFilter = medicines.length;
      medicines = medicines.filter(medicine => medicine.distance && medicine.distance <= maxDistance);
      console.log(`📏 Filtered ${beforeFilter} → ${medicines.length} medicines within ${maxDistance} miles`);
      
      // Sort by distance
      if (sort === 'distance') {
        medicines.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
      }
    } else {
      console.log('⚠️ No user location provided - showing medicines without distance filtering');
    }
    
    // Apply other sort options
    switch (sort) {
      case 'newest':
        medicines.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      case 'oldest':
        medicines.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        break;
      case 'expiry':
        medicines.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
        break;
      case 'name':
        medicines.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    
    // Limit results
    medicines = medicines.slice(0, 20);
    
    // Get categories for filter
    const categories = await Medicine.distinct('category');
    
    // Get user's location for distance calculation
    const userLocation = user.addressLine1 && user.city && user.state ? {
      address: `${user.addressLine1}, ${user.city}, ${user.state} ${user.pincode || ''}`,
      city: user.city,
      state: user.state
    } : null;
    
    res.render('browse', {
      medicines,
      categories,
      userLocation,
      currentFilters: { category, search, sort, distance },
      layout: 'layouts/dashboard_layout',
      activePage: 'browse'
    });
  } catch (error) {
    console.error('Browse error:', error);
    req.flash('error', 'Error loading medicines.');
    res.redirect('/dashboard');
  }
});

// Calculate distances between user and medicine locations
async function calculateDistances(medicines, userLat, userLng) {
  const userLocation = `${userLat},${userLng}`;
  let processedCount = 0;
  
  for (let medicine of medicines) {
    if (medicine.donor && medicine.donor.addressLine1 && medicine.donor.city) {
      try {
        // Get coordinates for medicine location
        const medicineAddress = `${medicine.donor.addressLine1}, ${medicine.donor.city}, ${medicine.donor.state}`;
        console.log(`📍 Geocoding: ${medicineAddress}`);
        
        const coordinates = await geocodeAddress(medicineAddress);
        
        if (coordinates) {
          // Calculate distance using Haversine formula
          medicine.distance = calculateHaversineDistance(
            parseFloat(userLat), 
            parseFloat(userLng), 
            coordinates.lat, 
            coordinates.lng
          );
          medicine.distanceFormatted = formatDistance(medicine.distance);
          console.log(`✅ ${medicine.name}: ${medicine.distanceFormatted}`);
        } else {
          medicine.distance = null;
          medicine.distanceFormatted = 'Distance unknown';
          console.log(`❌ ${medicine.name}: Geocoding failed`);
        }
        processedCount++;
      } catch (error) {
        console.error('Error calculating distance for medicine:', medicine._id, error);
        medicine.distance = null;
        medicine.distanceFormatted = 'Distance unknown';
      }
    } else {
      medicine.distance = null;
      medicine.distanceFormatted = 'Location not available';
    }
  }
  
  console.log(`🎯 Processed ${processedCount} medicines with distance calculations`);
  return medicines;
}

// Note: Geocoding functions are now imported from utils/geocoding.js

// Request Medicine
router.post('/request-medicine/:medicineId', isLoggedIn, async (req, res) => {
  try {
    const { medicineId } = req.params;
    const { quantity, message } = req.body;
    const requesterId = req.session.user.id;
    
    // Validate medicine exists and is available
    const medicine = await Medicine.findById(medicineId).populate('donor');
    if (!medicine) {
      return res.status(404).json({ error: 'Medicine not found' });
    }
    
    if (medicine.status !== 'Available') {
      return res.status(400).json({ error: 'Medicine is not available for request' });
    }
    
    if (medicine.donor._id.toString() === requesterId) {
      return res.status(400).json({ error: 'You cannot request your own medicine' });
    }
    
    // Check if user already has a pending request for this medicine
    const existingRequest = await Request.findOne({
      requester: requesterId,
      medicine: medicineId,
      status: { $in: ['Pending', 'Accepted'] }
    });
    
    if (existingRequest) {
      return res.status(400).json({ error: 'You already have a pending request for this medicine' });
    }
    
    // Create request
    const request = new Request({
      requester: requesterId,
      donor: medicine.donor._id,
      medicine: medicineId,
      quantity: quantity || medicine.quantity,
      message: message || '',
      status: 'Pending'
    });
    
    await request.save();
    
    // Update medicine status to requested
    medicine.status = 'Requested';
    await medicine.save();
    
    // Create notifications
    const notifications = [
      // Notify donor
      new Notification({
        recipient: medicine.donor._id,
        sender: requesterId,
        type: 'request_received',
        title: 'New Medicine Request',
        message: `Someone has requested your ${medicine.name}`,
        relatedMedicine: medicineId,
        relatedRequest: request._id
      }),
      // Notify requester
      new Notification({
        recipient: requesterId,
        sender: medicine.donor._id,
        type: 'request_sent',
        title: 'Request Sent',
        message: `Your request for ${medicine.name} has been sent to the donor`,
        relatedMedicine: medicineId,
        relatedRequest: request._id
      })
    ];
    
    await Notification.insertMany(notifications);
    
    res.json({ 
      success: true, 
      message: 'Request sent successfully',
      requestId: request._id 
    });
    
  } catch (error) {
    console.error('Request medicine error:', error);
    res.status(500).json({ error: 'Error processing request' });
  }
});

// Get medicine details for modal
router.get('/medicine/:medicineId', isLoggedIn, async (req, res) => {
  try {
    const { medicineId } = req.params;
    
    const medicine = await Medicine.findById(medicineId)
      .populate('donor', 'firstName lastName city state pincode addressLine1');
    
    if (!medicine) {
      return res.status(404).json({ error: 'Medicine not found' });
    }
    
    res.json({ medicine });
    
  } catch (error) {
    console.error('Get medicine error:', error);
    res.status(500).json({ error: 'Error fetching medicine details' });
  }
});

// My Requests
router.get('/requests', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { status, page = 1 } = req.query;
    const limit = 10;
    const skip = (page - 1) * limit;
    
    let query = { requester: userId };
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const [requests, totalRequests] = await Promise.all([
      Request.find(query)
        .populate('medicine')
        .populate('donor', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Request.countDocuments(query)
    ]);
    
    const totalPages = Math.ceil(totalRequests / limit);
    
    res.render('requests', {
      requests,
      currentPage: parseInt(page),
      totalPages,
      currentFilters: { status },
      layout: 'layouts/dashboard_layout',
      activePage: 'requests'
    });
  } catch (error) {
    console.error('Requests error:', error);
    req.flash('error', 'Error loading requests.');
    res.redirect('/dashboard');
  }
});

// Donation History
router.get('/donor', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { status, page = 1 } = req.query;
    const limit = 10;
    const skip = (page - 1) * limit;
    
    let query = { donor: userId };
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const [donations, totalDonations] = await Promise.all([
      Medicine.find(query)
        .populate('donor', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Medicine.countDocuments(query)
    ]);
    
    // Get request counts for each donation
    const donationsWithRequests = await Promise.all(
      donations.map(async (donation) => {
        const requestCount = await Request.countDocuments({ medicine: donation._id });
        const completedCount = await Request.countDocuments({ 
          medicine: donation._id, 
          status: 'Completed' 
        });
        return {
          ...donation.toObject(),
          requestCount,
          completedCount
        };
      })
    );
    
    const totalPages = Math.ceil(totalDonations / limit);
    
    res.render('donor', {
      donations: donationsWithRequests,
      currentPage: parseInt(page),
      totalPages,
      currentFilters: { status },
      layout: 'layouts/dashboard_layout',
      activePage: 'donor'
    });
  } catch (error) {
    console.error('Donor history error:', error);
    req.flash('error', 'Error loading donation history.');
    res.redirect('/dashboard');
  }
});

// Profile
router.get('/profile', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const user = await User.findById(userId);
    
    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/dashboard');
    }
    
    // Get user stats
    const stats = await getUserStats(userId);
    
    res.render('profile', {
      user,
      stats,
      layout: 'layouts/dashboard_layout',
      activePage: 'profile'
    });
  } catch (error) {
    console.error('Profile error:', error);
    req.flash('error', 'Error loading profile.');
    res.redirect('/dashboard');
  }
});

// Update Profile
router.post('/profile/update', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const {
      firstName,
      lastName,
      mobile,
      addressLine1,
      country,
      state,
      city,
      district,
      pincode
    } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update user fields
    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.mobile = mobile || user.mobile;
    user.addressLine1 = addressLine1 || user.addressLine1;
    user.country = country || user.country;
    user.state = state || user.state;
    user.city = city || user.city;
    user.district = district || user.district;
    user.pincode = pincode || user.pincode;
    
    await user.save();
    
    // Create notification
    await Notification.create({
      recipient: userId,
      type: 'profile_updated',
      title: 'Profile Updated',
      message: 'Your profile has been successfully updated.',
      priority: 'low'
    });
    
    res.json({ success: true, message: 'Profile updated successfully!' });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Error updating profile' });
  }
});

// Settings
router.get('/settings', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const user = await User.findById(userId);
    
    res.render('settings', {
      user,
      layout: 'layouts/dashboard_layout',
      activePage: 'settings'
    });
  } catch (error) {
    console.error('Settings error:', error);
    req.flash('error', 'Error loading settings.');
    res.redirect('/dashboard');
  }
});

// Cancel request
router.post('/cancel/:id', isLoggedIn, async (req, res) => {
  try {
    const requestId = req.params.id;
    const userId = req.session.user.id;
    
    const request = await Request.findOne({ _id: requestId, requester: userId });
    if (!request) {
      req.flash('error', 'Request not found or unauthorized.');
      return res.redirect('/dashboard/requests');
    }
    
    if (request.status !== 'Pending') {
      req.flash('error', 'Only pending requests can be cancelled.');
      return res.redirect('/dashboard/requests');
    }
    
    request.status = 'Cancelled';
    await request.save();
    
    // Create notification for donor
    await Notification.create({
      recipient: request.donor,
      sender: userId,
      type: 'request_cancelled',
      title: 'Request Cancelled',
      message: 'A request for your medicine has been cancelled.',
      relatedRequest: requestId,
      priority: 'medium'
    });
    
    req.flash('success', 'Request cancelled successfully.');
    res.redirect('/dashboard/requests');
  } catch (error) {
    console.error('Cancel request error:', error);
    req.flash('error', 'Error cancelling request.');
    res.redirect('/dashboard/requests');
  }
});

// Get notifications
router.get('/notifications', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { page = 1 } = req.query;
    const limit = 20;
    const skip = (page - 1) * limit;
    
    const [notifications, totalNotifications] = await Promise.all([
      Notification.find({ recipient: userId })
        .populate('sender', 'firstName lastName')
        .populate('relatedMedicine', 'name')
        .populate('relatedRequest', 'status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments({ recipient: userId })
    ]);
    
    const totalPages = Math.ceil(totalNotifications / limit);
    
    res.json({
      notifications,
      currentPage: parseInt(page),
      totalPages,
      hasMore: page < totalPages
    });
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ error: 'Error loading notifications' });
  }
});

// Mark notification as read
router.post('/notifications/:id/read', isLoggedIn, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.session.user.id;
    
    await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { read: true }
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Error marking notification as read' });
  }
});

// Mark all notifications as read
router.post('/notifications/read-all', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    await Notification.updateMany(
      { recipient: userId, read: false },
      { read: true }
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Error marking all notifications as read' });
  }
});

// Google Maps API Proxy Routes
router.get('/api/address-autocomplete', isLoggedIn, async (req, res) => {
  try {
    const { input, international } = req.query;
    
    if (!input || input.length < 3) {
      return res.json({ predictions: [] });
    }
    
    // Build URL based on international search preference
    let url;
    if (international === 'true') {
      // International search - no country restriction
      url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=geocode&key=${process.env.GOOGLE_MAPS_API_KEY}`;
    } else {
      // India-focused search with country restriction
      url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=geocode&components=country:in&key=${process.env.GOOGLE_MAPS_API_KEY}`;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    console.log(data);
    res.json(data);
  } catch (error) {
    console.error('Address autocomplete error:', error);
    res.status(500).json({ error: 'Failed to fetch address suggestions' });
  }
});

router.get('/api/place-details', isLoggedIn, async (req, res) => {
  try {
    const { place_id } = req.query;
    
    if (!place_id) {
      return res.status(400).json({ error: 'Place ID is required' });
    }
    
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=address_component,formatted_address&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Place details error:', error);
    res.status(500).json({ error: 'Failed to fetch place details' });
  }
});

router.get('/api/reverse-geocode', isLoggedIn, async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }
    
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    res.status(500).json({ error: 'Failed to fetch address details' });
  }
});

module.exports = router; 