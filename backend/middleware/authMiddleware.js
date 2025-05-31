// middleware/authMiddleware.js

const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Import the User model

// Middleware to protect routes (authentication)
const protect = async (req, res, next) => {
  let token;

  // Check if the Authorization header is present and starts with 'Bearer'
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header (format: "Bearer TOKEN")
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Find user by ID from the decoded token (excluding password)
      req.user = await User.findById(decoded.id).select('-password');

      // If user is not found, or token is invalid/expired
      if (!req.user) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      next(); // Proceed to the next middleware or route handler
    } catch (error) {
      console.error('Auth middleware error:', error.message);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

// Middleware to check user roles (authorization)
// This will be called after 'protect' middleware
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    // req.user is set by the 'protect' middleware
    if (!req.user) {
      return res.status(403).json({ message: 'Not authorized, user data missing' }); // 403 Forbidden
    }

    // Check if the user's role is included in the allowed roles
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `User role '${req.user.role}' is not authorized to access this resource` });
    }

    next(); // User has the required role, proceed
  };
};

module.exports = { protect, authorizeRoles };