// routes/userRoutes.js

const express = require('express');
const router = express.Router();
const User = require('../models/User'); // Import the User model
const jwt = require('jsonwebtoken'); // For JWT creation

// Helper function to generate JWT
const generateToken = (id, role) => {
  // Get JWT secret from environment variables
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '1h', // Token expires in 1 hour
  });
};

// --- User Authentication Routes ---

// 1. Register a new user
// POST /api/users/register
router.post('/register', async (req, res) => {
  const { email, password, firstName, lastName, role } = req.body;

  try {
    // Check if user with this email already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    // Create a new user
    const user = await User.create({
      email,
      password, // Password will be hashed by the pre-save hook in User model
      firstName,
      lastName,
      // Only allow 'admin' role if explicitly set AND if an admin is performing the action (later, with auth middleware)
      // For now, new registrations will default to 'customer' role.
      // If a 'role' is provided in req.body, ensure it's not 'admin' for public registration.
      // un-comment this line to get to add admin
      // role: ['customer', 'admin', 'delivery-agent'].includes(role) ? role : 'customer' 
      role: role && ['customer', 'delivery-agent'].includes(role) ? role : 'customer'   

    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        token: generateToken(user._id, user.role), // Send back a JWT
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
    if (error.code === 11000) { // MongoDB duplicate key error code
      return res.status(400).json({ message: 'A user with this email already exists.' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// 2. Authenticate user & get token
// POST /api/users/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user by email
    const user = await User.findOne({ email });

    // Check if user exists and password matches
    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        token: generateToken(user._id, user.role), // Send back a JWT
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' }); // 401 Unauthorized
    }
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;