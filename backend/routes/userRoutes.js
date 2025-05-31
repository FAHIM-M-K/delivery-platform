// routes/userRoutes.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/authMiddleware'); // Import protect middleware

// Helper function to generate JWT (already exists)
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
};

// 1. Register a new user (existing code)
// POST /api/users/register
router.post('/register', async (req, res) => {
  const { email, password, firstName, lastName, role, phoneNumber } = req.body;

  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      // Reverted to original secure logic for public registration:
      role: role && ['customer', 'delivery-agent'].includes(role) ? role : 'customer'
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        token: generateToken(user._id, user.role),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error('Error registering user:', error);
    if (error.name === 'ValidationError') {
      let errors = {};
      Object.keys(error.errors).forEach((key) => {
        errors[key] = error.errors[key].message;
      });
      return res.status(400).json({ message: 'Validation Error', errors });
    }
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A user with this email already exists.' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// 2. Authenticate user & get token (existing code)
// POST /api/users/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        token: generateToken(user._id, user.role),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// --- NEW: User Profile Routes ---

// 3. GET user profile (Protected - user can only get their own profile)
// GET /api/users/profile
router.get('/profile', protect, async (req, res) => {
  // req.user is populated by the 'protect' middleware
  const user = await User.findById(req.user._id).select('-password');

  if (user) {
    res.json({
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

// 4. UPDATE user profile (Protected - user can only update their own profile)
// PUT /api/users/profile
router.put('/profile', protect, async (req, res) => {
  // req.user is populated by the 'protect' middleware
  const user = await User.findById(req.user._id);

  if (user) {
    // Update fields if provided in the request body
    user.firstName = req.body.firstName || user.firstName;
    user.lastName = req.body.lastName || user.lastName;
    user.email = req.body.email || user.email; // Be cautious allowing email updates without verification
    user.phoneNumber = req.body.phoneNumber || user.phoneNumber;

    // Only update password if a new one is provided
    if (req.body.password) {
      user.password = req.body.password; // The pre-save hook in User model will hash this
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      phoneNumber: updatedUser.phoneNumber, 
      role: updatedUser.role,
      token: generateToken(updatedUser._id, updatedUser.role), // Issue a new token if profile changed
    });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

module.exports = router;