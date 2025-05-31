// models/User.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // For password hashing

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true, // Ensure emails are unique
    trim: true,
    lowercase: true, // Store emails in lowercase
    match: [/.+\@.+\..+/, 'Please fill a valid email address'] // Basic email format validation
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'] // Minimum password length
  },
  // Define roles: 'customer', 'admin', 'delivery-agent'
  role: {
    type: String,
    enum: ['customer', 'admin', 'delivery-agent'], // Enforce specific roles
    default: 'customer' // Default role for new users
  },
  firstName: {
    type: String,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },
  // We can add addresses here or in a separate model later
  // For now, let's keep it simple. Addresses can be managed in a separate 'Address' model
  // and linked to the user, or embedded. For this stage, let's just allow for basic user info.
}, {
  timestamps: true // Adds createdAt and updatedAt fields automatically
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