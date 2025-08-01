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

// Main Dashboard
router.get('/', isLoggedIn, requireCompleteProfile, async (req, res) => {
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

// Get unread notifications count
async function getUnreadNotificationsCount(userId) {
  return await Notification.countDocuments({
    recipient: userId,
    read: false
  });
}



// Helper function to get medicine icon based on category
function getMedicineIcon(category) {
  const iconMap = {
    'Pain Relief': 'fas fa-head-side-cough',
    'Fever': 'fas fa-thermometer-half',
    'Antibiotics': 'fas fa-shield-virus',
    'Vitamins': 'fas fa-apple-alt',
    'Diabetes': 'fas fa-tint',
    'Blood Pressure': 'fas fa-heartbeat',
    'Allergy': 'fas fa-wind',
    'Cough & Cold': 'fas fa-lungs',
    'Digestive': 'fas fa-stomach',
    'Skin Care': 'fas fa-spa',
    'Eye Care': 'fas fa-eye',
    'Dental': 'fas fa-tooth',
    'Women Health': 'fas fa-female',
    'Children': 'fas fa-baby',
    'Elderly': 'fas fa-user-plus',
    'First Aid': 'fas fa-first-aid',
    'General': 'fas fa-capsules'
  };
  
  return iconMap[category] || 'fas fa-capsules';
}

// Browse Medicines
router.get('/browse', isLoggedIn, requireCompleteProfile, async (req, res) => {
  try {
    const { 
      category, 
      search, 
      sort = 'distance', 
      distance = '50',
      customDistance
    } = req.query;
    
    console.log('📥 Received query parameters:', { category, search, sort, distance, customDistance });
    
    // Use custom distance if provided, but handle "Any Distance" case
    let finalDistance = customDistance || distance;
    
    // If distance is "all" (Any Distance), set finalDistance to null to skip filtering
    if (distance === 'all') {
      finalDistance = null;
      console.log('🌍 "Any Distance" selected - no distance filtering will be applied');
    } else if (customDistance) {
      console.log(`🎯 Custom distance selected: ${customDistance} km`);
    }
    
    const userId = req.session.user.id;
    const user = await User.findById(userId);
    
    // Build query to show medicines that are available for requests
    // This includes medicines with status 'Available' or 'Requested' that have remaining quantity
    let query = {
      $or: [
        { status: 'Available' },
        { status: 'Requested' }
      ]
    };
    
    // Exclude medicines donated by the current user
    query.donor = { $ne: userId };
    
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
    
    console.log(`🔍 Found ${medicines.length} medicines matching query criteria`);
    console.log(`🔍 Query:`, JSON.stringify(query, null, 2));
    
    // Debug: Check for specific medicine
    const specificMedicine = medicines.find(m => m.name.toLowerCase().includes('paracetmol'));
    if (specificMedicine) {
      console.log(`🎯 Found Paracetmol medicine:`, {
        id: specificMedicine._id,
        name: specificMedicine.name,
        status: specificMedicine.status,
        donor: specificMedicine.donor?._id,
        currentUser: userId
      });
    } else {
      console.log(`❌ Paracetmol medicine not found in results`);
      
      // Check all medicines in database
      const allMedicines = await Medicine.find({}).populate('donor');
      const paracetmolInDB = allMedicines.find(m => m.name.toLowerCase().includes('paracetmol'));
      if (paracetmolInDB) {
        console.log(`🔍 Paracetmol found in database but not in results:`, {
          id: paracetmolInDB._id,
          name: paracetmolInDB.name,
          status: paracetmolInDB.status,
          donor: paracetmolInDB.donor?._id,
          currentUser: userId,
          isOwnMedicine: paracetmolInDB.donor?._id?.toString() === userId.toString()
        });
      }
    }
    
    // Calculate distances if user has address information
    if (user.addressLine1 && user.city && user.state) {
      console.log('📍 Calculating distances for', medicines.length, 'medicines...');
      
      // Use user's address for distance calculation
      const userAddress = `${user.addressLine1}, ${user.city}, ${user.state} ${user.pincode || ''}`;
      medicines = await calculateDistances(medicines, userAddress);
      
      // Filter by distance only if distance parameter is provided and not "all"
      if (finalDistance && finalDistance !== 'all' && finalDistance !== null) {
        const maxDistance = parseInt(finalDistance);
        const beforeFilter = medicines.length;
        medicines = medicines.filter(medicine => medicine.distance && medicine.distance <= maxDistance);
        console.log(`📏 Filtered ${beforeFilter} → ${medicines.length} medicines within ${maxDistance} km`);
      } else {
        console.log('📏 Showing all medicines with distance information (no distance filter applied)');
      }
      
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
    const beforeLimit = medicines.length;
    medicines = medicines.slice(0, 20);
    console.log(`📊 Limited results from ${beforeLimit} to ${medicines.length} medicines`);
    
    // Debug: Log all medicine names and distances
    medicines.forEach(medicine => {
      console.log(`🏥 ${medicine.name}:`, {
        distance: medicine.distance,
        distanceFormatted: medicine.distanceFormatted,
        hasDistance: !!medicine.distance,
        hasDistanceFormatted: !!medicine.distanceFormatted
      });
    });
    
    // Calculate availability and status for each medicine
    const medicinesWithAvailability = await Promise.all(
      medicines.map(async (medicine) => {
        // Calculate total quantity already requested (pending + accepted)
        const pendingRequests = await Request.find({ 
          medicine: medicine._id, 
          status: { $in: ['Pending', 'Accepted'] }
        });
        const totalRequestedQuantity = pendingRequests.reduce((sum, req) => sum + req.quantity, 0);
        const availableQuantity = Math.max(0, medicine.quantity - totalRequestedQuantity);
        
        // Determine display status based on availability and expiry
        let displayStatus = 'Available';
        
        // Check if expired
        if (medicine.expiry && new Date(medicine.expiry) <= new Date()) {
          displayStatus = 'Expired';
        }
        // Check if stock is finished
        else if (availableQuantity === 0) {
          displayStatus = 'Stock Finished';
        }
        // Check if there are pending requests
        else if (pendingRequests.length > 0) {
          displayStatus = 'Requested';
        }
        // Otherwise it's available
        else {
          displayStatus = 'Available';
        }
        
        return {
          ...medicine.toObject(),
          distance: medicine.distance,
          distanceFormatted: medicine.distanceFormatted,
          availableQuantity,
          totalRequestedQuantity,
          displayStatus
        };
      })
    );
    
    // Filter out medicines with no available quantity
    const medicinesForResponse = medicinesWithAvailability.filter(medicine => medicine.availableQuantity > 0);
    
    // Get categories for filter
    const categories = await Medicine.distinct('category');
    
    // Get user's location for distance calculation
    const userLocation = user.addressLine1 && user.city && user.state ? {
      address: `${user.addressLine1}, ${user.city}, ${user.state} ${user.pincode || ''}`,
      city: user.city,
      state: user.state
    } : null;
    
    // Get unread notifications count
    const unreadNotifications = await getUnreadNotificationsCount(userId);
    
    // Check if it's an AJAX request
    const isAjaxRequest = req.headers['x-requested-with'] === 'XMLHttpRequest';
    
    if (isAjaxRequest) {
      // Return JSON for AJAX requests
      res.json({
        medicines: medicinesForResponse,
        categories,
        userLocation,
        currentFilters: { category, search, sort, distance: distance === 'all' ? 'all' : distance, customDistance }
      });
    } else {
      // Return rendered page for regular requests
      res.render('browse', {
        user,
        medicines: medicinesForResponse,
        categories,
        userLocation,
        currentFilters: { category, search, sort, distance: distance === 'all' ? 'all' : distance, customDistance },
        getMedicineIcon: getMedicineIcon,
        unreadNotifications,
        layout: 'layouts/dashboard_layout',
        activePage: 'browse'
      });
    }
  } catch (error) {
    console.error('Browse error:', error);
    req.flash('error', 'Error loading medicines.');
    res.redirect('/dashboard');
  }
});

// Calculate distances between user and medicine locations
async function calculateDistances(medicines, userAddress) {
  let processedCount = 0;
  
  // Get user coordinates first
  console.log(`📍 Geocoding user address: ${userAddress}`);
  const userCoordinates = await geocodeAddress(userAddress);
  
  if (!userCoordinates) {
    console.log('❌ Failed to geocode user address - cannot calculate distances');
    return medicines.map(medicine => {
      medicine.distance = null;
      medicine.distanceFormatted = 'Distance unknown';
      return medicine;
    });
  }
  
  console.log(`✅ User location: ${userCoordinates.lat}, ${userCoordinates.lng}`);
  
  for (let medicine of medicines) {
    if (medicine.donor && medicine.donor.addressLine1 && medicine.donor.city) {
      try {
        // Get coordinates for medicine location
        const medicineAddress = `${medicine.donor.addressLine1}, ${medicine.donor.city}, ${medicine.donor.state}`;
        console.log(`📍 Geocoding medicine: ${medicineAddress}`);
        
        const medicineCoordinates = await geocodeAddress(medicineAddress);
        
        if (medicineCoordinates) {
          // Calculate distance using Haversine formula
          medicine.distance = calculateHaversineDistance(
            userCoordinates.lat, 
            userCoordinates.lng, 
            medicineCoordinates.lat, 
            medicineCoordinates.lng
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

// Calculate distance between two addresses
async function calculateDistance(originAddress, destinationAddress) {
  try {
    console.log(`📍 Calculating distance from ${originAddress} to ${destinationAddress}`);
    
    const originCoords = await geocodeAddress(originAddress);
    const destinationCoords = await geocodeAddress(destinationAddress);
    
    if (originCoords && destinationCoords) {
      const distance = calculateHaversineDistance(
        originCoords.lat, 
        originCoords.lng, 
        destinationCoords.lat, 
        destinationCoords.lng
      );
      console.log(`✅ Distance calculated: ${distance.toFixed(1)} km`);
      return distance;
    }
    
    console.log('❌ Could not geocode one or both addresses');
    return null;
  } catch (error) {
    console.error('Error calculating distance:', error);
    return null;
  }
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
    
    // Check if medicine is available for request
    // Medicine can be requested if status is 'Available' or if there's remaining quantity
    const pendingRequests = await Request.find({ 
      medicine: medicineId, 
      status: { $in: ['Pending', 'Accepted'] }
    });
    const totalRequestedQuantity = pendingRequests.reduce((sum, req) => sum + req.quantity, 0);
    const remainingQuantity = Math.max(0, medicine.quantity - totalRequestedQuantity);
    
    if (remainingQuantity === 0) {
      return res.status(400).json({ error: 'No quantity available for this medicine' });
    }
    
    // Check if expired
    if (medicine.expiry && new Date(medicine.expiry) <= new Date()) {
      return res.status(400).json({ error: 'This medicine has expired' });
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
    
    // Validate requested quantity
    const requestedQuantity = quantity || 1;
    if (requestedQuantity > remainingQuantity) {
      return res.status(400).json({ 
        error: `Only ${remainingQuantity} ${medicine.unit || 'units'} available. You requested ${requestedQuantity}.` 
      });
    }
    
    if (requestedQuantity <= 0) {
      return res.status(400).json({ error: 'Requested quantity must be greater than 0' });
    }
    
    // Create request
    const request = new Request({
      requester: requesterId,
      donor: medicine.donor._id,
      medicine: medicineId,
      quantity: requestedQuantity,
      message: message || '',
      status: 'Pending'
    });
    
    await request.save();
    
    // Update medicine status based on remaining quantity
    const newTotalRequested = totalRequestedQuantity + requestedQuantity;
    if (newTotalRequested >= medicine.quantity) {
      medicine.status = 'Stock Finished';
    } else if (newTotalRequested > 0) {
      medicine.status = 'Requested';
    }
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
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ error: 'Error processing request' });
  }
});

// Get medicine details for modal
router.get('/medicine/:medicineId', isLoggedIn, requireCompleteProfile, async (req, res) => {
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
router.get('/requests', isLoggedIn, requireCompleteProfile, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const user = await User.findById(userId);
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
    
    // Get unread notifications count
    const unreadNotifications = await getUnreadNotificationsCount(userId);
    
    res.render('requests', {
      user,
      requests,
      currentPage: parseInt(page),
      totalPages,
      currentFilters: { status },
      unreadNotifications,
      layout: 'layouts/dashboard_layout',
      activePage: 'requests'
    });
  } catch (error) {
    console.error('Requests error:', error);
    req.flash('error', 'Error loading requests.');
    res.redirect('/dashboard');
  }
});

// API endpoint for requests data
router.get('/requests/api', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    let query = { requester: userId };
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const [requests, totalRequests] = await Promise.all([
      Request.find(query)
        .populate('medicine')
        .populate('donor', 'firstName lastName city state')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Request.countDocuments(query)
    ]);
    
    const totalPages = Math.ceil(totalRequests / limit);
    
    res.json({
      success: true,
      requests: requests,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalRequests,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Requests API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error fetching requests' 
    });
  }
});

// Cancel request API endpoint
router.post('/requests/:requestId/cancel', isLoggedIn, async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.session.user.id;
    
    const request = await Request.findOne({ _id: requestId, requester: userId });
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        error: 'Request not found or unauthorized' 
      });
    }
    
    if (request.status !== 'Pending') {
      return res.status(400).json({ 
        success: false, 
        error: 'Only pending requests can be cancelled' 
      });
    }
    
    // Update request status
    request.status = 'Cancelled';
    await request.save();
    
    // Update medicine status back to available if it was requested
    if (request.medicine) {
      const medicine = await Medicine.findById(request.medicine);
      if (medicine && medicine.status === 'Requested') {
        medicine.status = 'Available';
        await medicine.save();
      }
    }
    
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
    
    res.json({ 
      success: true, 
      message: 'Request cancelled successfully',
      request: {
        id: request._id,
        status: request.status
      }
    });
  } catch (error) {
    console.error('Cancel request error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error cancelling request' 
    });
  }
});

// Donation History
router.get('/donor', isLoggedIn, requireCompleteProfile, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const user = await User.findById(userId);
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
    
    // Get unread notifications count
    const unreadNotifications = await getUnreadNotificationsCount(userId);
    
    res.render('donor', {
      user,
      donations: donationsWithRequests,
      currentPage: parseInt(page),
      totalPages,
      currentFilters: { status },
      unreadNotifications,
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
    
    // Check if profile is complete
    const isProfileComplete = user.isProfileComplete();
    
    // Get user stats
    const stats = await getUserStats(userId);
    
    // Get unread notifications count
    const unreadNotifications = await getUnreadNotificationsCount(userId);
    
    res.render('profile', {
      user,
      stats,
      unreadNotifications,
      isProfileComplete,
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
      username,
      phone,
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
    
    // Server-side validation for all required fields
    const requiredFields = [
      { field: 'firstName', name: 'First Name' },
      { field: 'lastName', name: 'Last Name' },
      { field: 'username', name: 'Username' },
      { field: 'phone', name: 'Phone Number' },
      { field: 'addressLine1', name: 'Address' },
      { field: 'city', name: 'City' },
      { field: 'state', name: 'State' },
      { field: 'country', name: 'Country' },
      { field: 'district', name: 'District' },
      { field: 'pincode', name: 'Pincode' }
    ];
    
    // Check if any required field is empty
    for (const requiredField of requiredFields) {
      const fieldValue = req.body[requiredField.field];
      if (!fieldValue || fieldValue.trim() === '') {
        return res.status(400).json({ error: `${requiredField.name} is required.` });
      }
    }
    
    // Validate username if provided
    if (username && username !== user.username) {
      // Check if username is valid format
      const usernameRegex = /^[a-zA-Z0-9_]+$/;
      if (!usernameRegex.test(username)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores.' });
      }
      
      // Check if username is already taken
      const existingUser = await User.findOne({ username: username });
      if (existingUser && existingUser._id.toString() !== userId) {
        return res.status(400).json({ error: 'Username is already taken.' });
      }
    }
    
    // Update user fields with validated values
    user.firstName = firstName;
    user.lastName = lastName;
    user.username = username;
    user.phone = phone;
    user.addressLine1 = addressLine1;
    user.country = country;
    user.state = state;
    user.city = city;
    user.district = district;
    user.pincode = pincode;
    
    await user.save();
    
    // Update session with new address information
    req.session.user = {
      ...req.session.user,
      addressLine1: user.addressLine1,
      city: user.city,
      state: user.state,
      pincode: user.pincode
    };
    
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
    
    // Get unread notifications count
    const unreadNotifications = await getUnreadNotificationsCount(userId);
    
    res.render('settings', {
      user,
      unreadNotifications,
      layout: 'layouts/dashboard_layout',
      activePage: 'settings'
    });
  } catch (error) {
    console.error('Settings error:', error);
    req.flash('error', 'Error loading settings.');
    res.redirect('/dashboard');
  }
});

// Change Password API with rate limiting
const passwordChangeAttempts = new Map();

router.post('/settings/change-password', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userIP = req.ip || req.connection.remoteAddress;
    
    // Rate limiting: max 5 attempts per hour per user
    const userKey = `${userId}-${userIP}`;
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    if (!passwordChangeAttempts.has(userKey)) {
      passwordChangeAttempts.set(userKey, { count: 0, resetTime: now + oneHour });
    }
    
    const userAttempts = passwordChangeAttempts.get(userKey);
    
    // Reset counter if hour has passed
    if (now > userAttempts.resetTime) {
      userAttempts.count = 0;
      userAttempts.resetTime = now + oneHour;
    }
    
    // Check if user has exceeded attempts
    if (userAttempts.count >= 5) {
      return res.status(429).json({
        success: false,
        error: 'Too many password change attempts. Please try again in an hour.'
      });
    }
    
        // Increment attempt counter
    userAttempts.count++;
    const { currentPassword, newPassword, confirmPassword } = req.body;
    
    // Validate input
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }
    
    // Check if new passwords match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'New passwords do not match'
      });
    }
    
    // Get user first
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Validate password strength using the model method
    const passwordValidation = user.validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: passwordValidation.errors.join(', ')
      });
    }
    
    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }
    
    // Check if new password is same as current
    const isNewPasswordSame = await user.comparePassword(newPassword);
    if (isNewPasswordSame) {
      return res.status(400).json({
        success: false,
        error: 'New password must be different from current password'
      });
    }
    
    // Check if password contains email or phone (security measure)
    const emailDomain = user.email ? user.email.split('@')[0] : '';
    const phoneLast4 = user.phone ? user.phone.slice(-4) : '';
    
    if (emailDomain && newPassword.toLowerCase().includes(emailDomain.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Password should not contain your email address'
      });
    }
    
    if (phoneLast4 && newPassword.includes(phoneLast4)) {
      return res.status(400).json({
        success: false,
        error: 'Password should not contain your phone number'
      });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    // Reset attempt counter on successful password change
    passwordChangeAttempts.delete(userKey);
    
    // Destroy session to force re-login
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
      }
      
      res.json({
        success: true,
        message: 'Password changed successfully. Please log in again with your new password.',
        redirect: '/auth/login'
      });
    });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Error changing password'
    });
  }
});

// Logout route for dashboard
router.get('/logout', isLoggedIn, (req, res) => {
  try {
    console.log('Logout initiated for user:', req.session.user);
    
    // Clear session data
    if (req.session) {
      // Clear all session data
      req.session.user = null;
      req.session.otp = null;
      req.session.otpEmail = null;
      req.session.otpExpires = null;
      
      // Regenerate session ID to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err);
          return res.redirect('/auth/login?error=logout_failed');
        }
        
        // Destroy the new session
        req.session.destroy((destroyErr) => {
          if (destroyErr) {
            console.error('Session destruction error:', destroyErr);
            return res.redirect('/auth/login?error=logout_failed');
          }
          
          console.log('Session destroyed successfully');
          res.redirect('/auth/login?success=logged_out');
        });
      });
    } else {
      console.log('No session found during logout');
      res.redirect('/auth/login?success=logged_out');
    }
  } catch (error) {
    console.error('Logout error:', error);
    res.redirect('/auth/login?error=logout_failed');
  }
});

// Debug session route (remove in production)
router.get('/debug-session', (req, res) => {
  res.json({
    sessionExists: !!req.session,
    sessionId: req.session ? req.session.id : null,
    user: req.session ? req.session.user : null,
    isLoggedIn: !!(req.session && req.session.user)
  });
});

// Logout API endpoint (for AJAX requests)
router.post('/logout', isLoggedIn, (req, res) => {
  try {
    console.log('AJAX logout initiated for user:', req.session.user);
    
    // Clear session data
    if (req.session) {
      // Clear all session data
      req.session.user = null;
      req.session.otp = null;
      req.session.otpEmail = null;
      req.session.otpExpires = null;
      
      // Regenerate session ID to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err);
          return res.status(500).json({
            success: false,
            error: 'Error during logout'
          });
        }
        
        // Destroy the new session
        req.session.destroy((destroyErr) => {
          if (destroyErr) {
            console.error('Session destruction error:', destroyErr);
            return res.status(500).json({
              success: false,
              error: 'Error during logout'
            });
          }
          
          console.log('Session destroyed successfully via AJAX');
          res.json({
            success: true,
            message: 'Logged out successfully',
            redirect: '/auth/login'
          });
        });
      });
    } else {
      console.log('No session found during AJAX logout');
      res.json({
        success: true,
        message: 'Logged out successfully',
        redirect: '/auth/login'
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Error during logout'
    });
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

// Render notifications page
router.get('/notifications-page', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const user = await User.findById(userId);
    const unreadNotifications = await getUnreadNotificationsCount(userId);
    
    res.render('notifications', {
      user,
      unreadNotifications,
      layout: 'layouts/dashboard_layout',
      activePage: 'notifications'
    });
  } catch (error) {
    console.error('Notifications page error:', error);
    req.flash('error', 'Error loading notifications page.');
    res.redirect('/dashboard');
  }
});

// Get notifications (API endpoint for dropdown and notifications page)
router.get('/notifications', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { type } = req.query;
    
    // Build query
    const query = { recipient: userId };
    if (type) {
      query.type = type;
    }
    
    const notifications = await Notification.find(query)
      .populate('sender', 'firstName lastName')
      .populate('relatedMedicine', 'name')
      .populate('relatedRequest', 'status')
      .sort({ createdAt: -1 });
    
    res.json({
      notifications
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

// Create test notifications (for development only)
router.post('/notifications/test', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Create some test notifications
    const testNotifications = [
      {
        recipient: userId,
        type: 'request_received',
        title: 'New Medicine Request',
        message: 'Someone has requested your donated medicine.',
        priority: 'high'
      },
      {
        recipient: userId,
        type: 'request_accepted',
        title: 'Request Accepted',
        message: 'Your medicine request has been accepted by the donor.',
        priority: 'medium'
      },
      {
        recipient: userId,
        type: 'medicine_expiring',
        title: 'Medicine Expiring Soon',
        message: 'Your donated medicine will expire in 5 days.',
        priority: 'urgent'
      }
    ];
    
    await Notification.insertMany(testNotifications);
    
    res.json({ success: true, message: 'Test notifications created' });
  } catch (error) {
    console.error('Create test notifications error:', error);
    res.status(500).json({ error: 'Error creating test notifications' });
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

// Request Status Update Endpoints
// Accept a request
router.post('/api/requests/:requestId/accept', isLoggedIn, async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.session.user.id;
    const { message } = req.body;

    const request = await Request.findById(requestId)
      .populate('medicine')
      .populate('requester', 'firstName lastName email');

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Verify the user is the donor of this medicine
    if (request.donor.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized to accept this request' });
    }

    // Update request status
    request.status = 'Accepted';
    request.donorResponse = {
      message: message || 'Request accepted',
      respondedAt: new Date()
    };
    await request.save();

    // Reduce medicine quantity when request is accepted
    const medicine = request.medicine;
    const requestedQuantity = request.quantity;
    
    // Calculate new quantity
    const newQuantity = Math.max(0, medicine.quantity - requestedQuantity);
    medicine.quantity = newQuantity;
    
    // Update medicine status based on remaining quantity
    if (newQuantity === 0) {
      medicine.status = 'Stock Finished';
    } else {
      // Check if there are other pending requests
      const otherPendingRequests = await Request.find({
        medicine: medicine._id,
        status: { $in: ['Pending', 'Accepted'] },
        _id: { $ne: request._id } // Exclude current request
      });
      
      if (otherPendingRequests.length > 0) {
        medicine.status = 'Requested';
      } else {
        medicine.status = 'Available';
      }
    }
    
    await medicine.save();

    // Create notification for requester
    await Notification.create({
      recipient: request.requester._id,
      sender: userId,
      type: 'request_accepted',
      title: 'Request Accepted',
      message: `Your request for ${request.medicine.name} has been accepted by the donor`,
      relatedRequest: request._id
    });

    res.json({ 
      success: true, 
      message: 'Request accepted successfully',
      request: {
        id: request._id,
        status: request.status,
        donorResponse: request.donorResponse
      }
    });
  } catch (error) {
    console.error('Accept request error:', error);
    res.status(500).json({ error: 'Error accepting request' });
  }
});

// Reject a request
router.post('/api/requests/:requestId/reject', isLoggedIn, async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.session.user.id;
    const { message } = req.body;

    const request = await Request.findById(requestId)
      .populate('medicine')
      .populate('requester', 'firstName lastName email');

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Verify the user is the donor of this medicine
    if (request.donor.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized to reject this request' });
    }

    // Check if request was previously accepted (to restore quantity)
    const wasAccepted = request.status === 'Accepted';
    
    // Update request status
    request.status = 'Rejected';
    request.donorResponse = {
      message: message || 'Request rejected',
      respondedAt: new Date()
    };
    await request.save();

    // If request was previously accepted, restore the quantity
    if (wasAccepted) {
      const medicine = request.medicine;
      const requestedQuantity = request.quantity;
      
      // Restore quantity
      medicine.quantity += requestedQuantity;
      
      // Update medicine status
      const otherPendingRequests = await Request.find({
        medicine: medicine._id,
        status: { $in: ['Pending', 'Accepted'] },
        _id: { $ne: request._id } // Exclude current request
      });
      
      if (otherPendingRequests.length > 0) {
        medicine.status = 'Requested';
      } else {
        medicine.status = 'Available';
      }
      
      await medicine.save();
    }

    // Create notification for requester
    await Notification.create({
      recipient: request.requester._id,
      sender: userId,
      type: 'request_rejected',
      title: 'Request Rejected',
      message: `Your request for ${request.medicine.name} has been rejected by the donor`,
      relatedRequest: request._id
    });

    res.json({ 
      success: true, 
      message: 'Request rejected successfully',
      request: {
        id: request._id,
        status: request.status,
        donorResponse: request.donorResponse
      }
    });
  } catch (error) {
    console.error('Reject request error:', error);
    res.status(500).json({ error: 'Error rejecting request' });
  }
});

// Complete a donation
router.post('/api/requests/:requestId/complete', isLoggedIn, async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.session.user.id;

    const request = await Request.findById(requestId)
      .populate('medicine')
      .populate('requester', 'firstName lastName email');

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Verify the user is the donor of this medicine
    if (request.donor.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized to complete this donation' });
    }

    // Update request status
    request.status = 'Completed';
    request.completedAt = new Date();
    await request.save();

    // Update medicine status if this was the last accepted request
    const medicine = request.medicine;
    const otherAcceptedRequests = await Request.find({
      medicine: medicine._id,
      status: 'Accepted',
      _id: { $ne: request._id } // Exclude current request
    });
    
    // If no other accepted requests, update medicine status
    if (otherAcceptedRequests.length === 0) {
      const pendingRequests = await Request.find({
        medicine: medicine._id,
        status: 'Pending'
      });
      
      if (pendingRequests.length > 0) {
        medicine.status = 'Requested';
      } else if (medicine.quantity > 0) {
        medicine.status = 'Available';
      } else {
        medicine.status = 'Stock Finished';
      }
      
      await medicine.save();
    }

    // Create notification for requester
    await Notification.create({
      recipient: request.requester._id,
      sender: userId,
      type: 'donation_completed',
      title: 'Donation Completed',
      message: `Your donation of ${request.medicine.name} has been completed successfully`,
      relatedRequest: request._id
    });

    res.json({ 
      success: true, 
      message: 'Donation completed successfully',
      request: {
        id: request._id,
        status: request.status,
        completedAt: request.completedAt
      }
    });
  } catch (error) {
    console.error('Complete donation error:', error);
    res.status(500).json({ error: 'Error completing donation' });
  }
});

// Mark donation as failed
router.post('/api/requests/:requestId/failed', isLoggedIn, async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.session.user.id;
    const { reason } = req.body;

    const request = await Request.findById(requestId)
      .populate('medicine')
      .populate('requester', 'firstName lastName email');

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Verify the user is the donor of this medicine
    if (request.donor.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized to mark this donation as failed' });
    }

    // Update request status
    request.status = 'Failed';
    request.donorResponse = {
      message: reason || 'Donation failed',
      respondedAt: new Date()
    };
    await request.save();

    // Create notification for requester
    await Notification.create({
      recipient: request.requester._id,
      sender: userId,
      type: 'donation_failed',
      title: 'Donation Failed',
      message: `The donation of ${request.medicine.name} has been marked as failed`,
      relatedRequest: request._id
    });

    res.json({ 
      success: true, 
      message: 'Donation marked as failed',
      request: {
        id: request._id,
        status: request.status,
        donorResponse: request.donorResponse
      }
    });
  } catch (error) {
    console.error('Mark donation failed error:', error);
    res.status(500).json({ error: 'Error marking donation as failed' });
  }
});

// Get donation history data
router.get('/api/donations/history', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { status, page = 1, limit = 10 } = req.query;
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
        .limit(parseInt(limit)),
      Medicine.countDocuments(query)
    ]);

    // Get request counts and calculate availability for each donation
    const donationsWithRequests = await Promise.all(
      donations.map(async (donation) => {
        const requestCount = await Request.countDocuments({ medicine: donation._id });
        const completedCount = await Request.countDocuments({ 
          medicine: donation._id, 
          status: 'Completed' 
        });
        
        // Calculate total quantity requested (pending + accepted requests)
        const pendingRequests = await Request.find({ 
          medicine: donation._id, 
          status: { $in: ['Pending', 'Accepted'] }
        });
        const totalRequestedQuantity = pendingRequests.reduce((sum, req) => sum + req.quantity, 0);
        
        // Calculate remaining available quantity
        const remainingQuantity = Math.max(0, donation.quantity - totalRequestedQuantity);
        
        // Determine display status based on availability and expiry
        let displayStatus = 'Available';
        
        // Check if expired
        if (donation.expiry && new Date(donation.expiry) <= new Date()) {
          displayStatus = 'Expired';
        }
        // Check if stock is finished
        else if (remainingQuantity === 0) {
          displayStatus = 'Stock Finished';
        }
        // Check if there are pending requests
        else if (pendingRequests.length > 0) {
          displayStatus = 'Requested';
        }
        // Otherwise it's available
        else {
          displayStatus = 'Available';
        }
        
        return {
          ...donation.toObject(),
          requestCount,
          completedCount,
          remainingQuantity,
          displayStatus
        };
      })
    );

    const totalPages = Math.ceil(totalDonations / limit);

    res.json({
      success: true,
      donations: donationsWithRequests,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalDonations,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get donation history error:', error);
    res.status(500).json({ error: 'Error fetching donation history' });
  }
});

// Get requests for a specific donation
router.get('/api/donations/:donationId/requests', isLoggedIn, async (req, res) => {
  try {
    const { donationId } = req.params;
    const userId = req.session.user.id;

    // Verify the user owns this donation
    const donation = await Medicine.findById(donationId);
    if (!donation || donation.donor.toString() !== userId) {
      return res.status(404).json({ error: 'Donation not found' });
    }

    const requests = await Request.find({ medicine: donationId })
      .populate('requester', 'firstName lastName city state addressLine1 pincode')
      .populate('medicine', 'name unit expiry category')
      .sort({ createdAt: -1 });

    // Calculate distances for each request
    console.log('🔍 User session data:', {
      addressLine1: req.session.user.addressLine1,
      city: req.session.user.city,
      state: req.session.user.state
    });
    
    const userAddress = req.session.user.addressLine1 && req.session.user.city ? 
      `${req.session.user.addressLine1}, ${req.session.user.city}, ${req.session.user.state}` : null;
    
    console.log('📍 Constructed user address:', userAddress);
    
    if (userAddress) {
      for (let request of requests) {
        if (request.requester && request.requester.addressLine1 && request.requester.city) {
          try {
            const requesterAddress = `${request.requester.addressLine1}, ${request.requester.city}, ${request.requester.state}`;
            console.log(`📍 Calculating distance from ${userAddress} to ${requesterAddress}`);
            console.log('🔍 Requester data:', {
              addressLine1: request.requester.addressLine1,
              city: request.requester.city,
              state: request.requester.state
            });
            
            const distance = await calculateDistance(userAddress, requesterAddress);
            request.distance = distance;
            request.distanceFormatted = distance ? `${distance.toFixed(1)} km` : 'Distance unknown';
            console.log(`✅ Distance calculated: ${request.distanceFormatted}`);
          } catch (error) {
            console.error('Error calculating distance for request:', error);
            request.distance = null;
            request.distanceFormatted = 'Distance unknown';
          }
        } else {
          console.log('⚠️ Requester address incomplete:', request.requester);
          request.distance = null;
          request.distanceFormatted = 'Distance unknown';
        }
      }
    } else {
      console.log('⚠️ User address incomplete:', req.session.user);
      for (let request of requests) {
        request.distance = null;
        request.distanceFormatted = 'Distance unknown';
      }
    }

    // Convert to plain objects to ensure all properties are included in JSON
    const requestsForResponse = requests.map(request => {
      const requestObj = request.toObject ? request.toObject() : request;
      return {
        ...requestObj,
        distance: request.distance,
        distanceFormatted: request.distanceFormatted
      };
    });

    console.log('📤 Sending requests response:', requestsForResponse.map(r => ({
      id: r._id,
      distance: r.distance,
      distanceFormatted: r.distanceFormatted
    })));

    res.json({
      success: true,
      requests: requestsForResponse
    });
  } catch (error) {
    console.error('Get donation requests error:', error);
    res.status(500).json({ error: 'Error fetching donation requests' });
  }
});

// Get individual donation details
router.get('/api/donations/:donationId', isLoggedIn, async (req, res) => {
  try {
    const { donationId } = req.params;
    const userId = req.session.user.id;

    // Verify the user owns this donation
    const donation = await Medicine.findById(donationId);
    if (!donation || donation.donor.toString() !== userId) {
      return res.status(404).json({ error: 'Donation not found' });
    }

    // Get request counts for this donation
    const requestCount = await Request.countDocuments({ medicine: donationId });
    const completedCount = await Request.countDocuments({ 
      medicine: donationId, 
      status: 'Completed' 
    });
    
    // Calculate total quantity requested (pending + accepted requests)
    const pendingRequests = await Request.find({ 
      medicine: donationId, 
      status: { $in: ['Pending', 'Accepted'] }
    });
    const totalRequestedQuantity = pendingRequests.reduce((sum, req) => sum + req.quantity, 0);
    
    // Calculate remaining available quantity
    const remainingQuantity = Math.max(0, donation.quantity - totalRequestedQuantity);
    
    // Determine display status based on availability and expiry
    let displayStatus = 'Available';
    
    // Check if expired
    if (donation.expiry && new Date(donation.expiry) <= new Date()) {
      displayStatus = 'Expired';
    }
    // Check if stock is finished
    else if (remainingQuantity === 0) {
      displayStatus = 'Stock Finished';
    }
    // Check if there are pending requests
    else if (pendingRequests.length > 0) {
      displayStatus = 'Requested';
    }
    // Otherwise it's available
    else {
      displayStatus = 'Available';
    }

    // Add request counts and status to donation object
    const donationWithCounts = {
      ...donation.toObject(),
      requestCount,
      completedCount,
      remainingQuantity,
      displayStatus
    };

    res.json({
      success: true,
      donation: donationWithCounts
    });
  } catch (error) {
    console.error('Get donation details error:', error);
    res.status(500).json({ error: 'Error fetching donation details' });
  }
});

module.exports = router; 