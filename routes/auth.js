const express = require('express');
const router = express.Router();
const User = require('../models/User');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Email transporter for OTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Registration - Step 1: Send OTP
router.post('/send-otp', async (req, res) => {
  const { email, phone } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });
  
  try {
    // Check if user already exists with email
    const existingUserByEmail = await User.findOne({ email });
    if (existingUserByEmail) {
      return res.status(400).json({ error: 'An account with this email already exists. Please login instead.' });
    }
    
    // Check if user already exists with phone
    const existingUserByPhone = await User.findOne({ phone });
    if (existingUserByPhone) {
      return res.status(400).json({ error: 'An account with this phone number already exists. Please login instead.' });
    }
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.otp = otp;
    req.session.otpEmail = email;
    req.session.otpExpires = Date.now() + 10 * 60 * 1000; // 10 min
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'Your MedConnect Registration OTP',
        text: `Your OTP for MedConnect registration is: ${otp}`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #f7f9fa; padding: 32px;">
            <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); padding: 32px 24px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="display: inline-block; background: #2a7cc7; color: #fff; font-size: 2rem; font-weight: bold; border-radius: 50%; width: 56px; height: 56px; line-height: 56px;">M</span>
                <h2 style="margin: 16px 0 0 0; color: #2a7cc7; font-size: 1.5rem;">MedConnect</h2>
              </div>
              <h3 style="color: #222; text-align: center;">Verify Your Email Address</h3>
              <p style="color: #444; font-size: 1rem; text-align: center;">Thank you for registering with <b>MedConnect</b>.<br>Your One-Time Password (OTP) for registration is:</p>
              <div style="text-align: center; margin: 32px 0;">
                <span style="display: inline-block; font-size: 2.2rem; letter-spacing: 0.5rem; color: #2a7cc7; font-weight: bold; background: #e9f4fb; padding: 12px 32px; border-radius: 8px; border: 1px dashed #2a7cc7;">${otp}</span>
              </div>
              <p style="color: #666; font-size: 0.95rem; text-align: center;">This OTP is valid for 10 minutes. Please do not share it with anyone.<br>If you did not request this, you can safely ignore this email.</p>
              <hr style="margin: 32px 0; border: none; border-top: 1px solid #eee;">
              <div style="text-align: center; color: #aaa; font-size: 0.9rem;">&copy; ${new Date().getFullYear()} MedConnect</div>
            </div>
          </div>
        `
      });
      res.json({ success: true, message: 'OTP sent to email' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to send OTP' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error checking email availability' });
  }
});

// Registration - Step 2: Verify OTP and Register
router.post('/register', async (req, res) => {
  const { firstName, lastName, email, phone, password, confirmPassword, otp } = req.body;
  if (!firstName || !lastName || !email || !phone || !password || !otp) {
    req.flash('error', 'All fields are required.');
    return res.redirect('/auth/register');
  }
  if (password !== confirmPassword) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect('/auth/register');
  }
  if (!req.session.otp || !req.session.otpEmail || req.session.otpEmail !== email) {
    req.flash('error', 'OTP not requested or email mismatch.');
    return res.redirect('/auth/register');
  }
  if (Date.now() > req.session.otpExpires) {
    req.flash('error', 'OTP expired.');
    return res.redirect('/auth/register');
  }
  if (otp !== req.session.otp) {
    req.flash('error', 'Invalid OTP.');
    return res.redirect('/auth/register');
  }
  try {
    // Generate unique username
    const baseUsername = `${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/[^a-z0-9]/g, '');
    let username = baseUsername;
    let counter = 1;
    
    // Check if username exists and generate unique one
    while (await User.findOne({ username })) {
      username = `${baseUsername}${counter}`;
      counter++;
    }
    
    const user = new User({ 
      firstName, 
      lastName, 
      username,
      email, 
      phone, 
      password 
    });
    await user.save();
    user.verified = true;
    await user.save();
    // Clear OTP from session
    delete req.session.otp;
    delete req.session.otpEmail;
    delete req.session.otpExpires;
    req.flash('success', 'Registration successful. Please log in.');
    res.redirect('/auth/login');
  } catch (err) {
    req.flash('error', 'Email or phone already in use.');
    res.redirect('/auth/register');
  }
});

// Register page (GET)
router.get('/register', (req, res) => {
  res.render('register', { layout: false });
});

// Login
router.get('/login', (req, res) => {
  res.render('login', { layout: false });
});

router.post('/login', async (req, res) => {
  const { email, phone, password } = req.body;
  
  // Validate that either email or phone is provided
  if (!email && !phone) {
    req.flash('error', 'Please provide either email or phone number.');
    return res.redirect('/auth/login');
  }
  
  // Validate that password is provided
  if (!password) {
    req.flash('error', 'Password is required.');
    return res.redirect('/auth/login');
  }
  
  try {
    let user;
    let credentialType = '';
    
    // If both email and phone are provided, check if they belong to the same account
    if (email && phone) {
      user = await User.findOne({ email, phone });
      credentialType = 'email and phone';
      if (!user) {
        req.flash('error', 'The email and phone number combination is not found. Please check your credentials.');
        return res.redirect('/auth/login');
      }
    } else if (email) {
      // Login with email only
      user = await User.findOne({ email });
      credentialType = 'email';
      if (!user) {
        req.flash('error', 'No account found with this email address.');
        return res.redirect('/auth/login');
      }
    } else if (phone) {
      // Login with phone only
      user = await User.findOne({ phone });
      credentialType = 'phone number';
      if (!user) {
        req.flash('error', 'No account found with this phone number.');
        return res.redirect('/auth/login');
      }
    }
    
    console.log('Login attempt user:', user);
    
    if (!user.verified) {
      req.flash('error', 'Account not verified. Please register and verify your email.');
      return res.redirect('/auth/login');
    }
    
    // Validate password
    const match = await user.comparePassword(password);
    console.log('Password match:', match);
    if (!match) {
      req.flash('error', `Invalid password for the provided ${credentialType}.`);
      return res.redirect('/auth/login');
    }
    req.session.user = { 
      id: user._id, 
      email: user.email, 
      phone: user.phone,
      addressLine1: user.addressLine1,
      city: user.city,
      state: user.state,
      pincode: user.pincode
    };
    req.flash('success', 'Logged in successfully.');
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    req.flash('error', 'Login failed.');
    res.redirect('/auth/login');
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router; 