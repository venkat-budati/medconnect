const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');
const Request = require('../models/Request');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Review = require('../models/Review');
const { isLoggedIn } = require('./middleware');

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
    const { category, search, sort = 'newest' } = req.query;
    const userId = req.session.user.id;
    
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
    
    // Sort options
    let sortOption = {};
    switch (sort) {
      case 'newest':
        sortOption = { createdAt: -1 };
        break;
      case 'oldest':
        sortOption = { createdAt: 1 };
        break;
      case 'expiry':
        sortOption = { expiry: 1 };
        break;
      case 'name':
        sortOption = { name: 1 };
        break;
    }
    
    const medicines = await Medicine.find(query)
      .populate('donor', 'firstName lastName city state')
      .sort(sortOption)
      .limit(20);
    
    // Get categories for filter
    const categories = await Medicine.distinct('category');
    
    res.render('browse', {
      medicines,
      categories,
      currentFilters: { category, search, sort },
      layout: 'layouts/dashboard_layout',
      activePage: 'browse'
    });
  } catch (error) {
    console.error('Browse error:', error);
    req.flash('error', 'Error loading medicines.');
    res.redirect('/dashboard');
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

module.exports = router; 