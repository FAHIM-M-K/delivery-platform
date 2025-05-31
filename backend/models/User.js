// models/User.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // For password hashing

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/.+\@.+\..+/, 'Please fill a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  role: {
    type: String,
    enum: ['customer', 'admin', 'delivery-agent'],
    default: 'customer'
  },
  firstName: {
    type: String,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },
  // NEW LINE: Add phoneNumber field
  phoneNumber: {
    type: String,
    trim: true,
    // You might want to add a regex match for phone number format validation
    // e.g., match: [/^\+?\d{8,15}$/, 'Please fill a valid phone number']
    // For simplicity, we'll keep it basic for now.
    required: [true, 'Phone number is required'] // Making it required for delivery
  },
}, {
  timestamps: true
});

// --- Middleware to hash password before saving ---
// This runs before a user document is saved to the database
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }
  // Generate a salt and hash the password
  const salt = await bcrypt.genSalt(10); // 10 is the number of rounds for hashing
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// --- Method to compare entered password with hashed password ---
// This method will be available on user instances
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;