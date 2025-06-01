// backend/routes/userRoutes.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const generateToken = require('../utils/generateToken');

// 1. User Registration
// POST /api/users/register
router.post('/register', async (req, res) => {
  const { email, password, firstName, lastName, phoneNumber, role } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Validate required fields explicitly as they are defined in schema
    if (!email || !password || !phoneNumber) {
        return res.status(400).json({ message: 'Email, password, and phone number are required.' });
    }

    let userRole = 'customer';
    // If the request comes from an authenticated admin and a valid role is provided
    // This assumes the 'protect' middleware might not always run for /register if it's public.
    // If '/register' is public, this check for req.user will be false.
    // If it's admin-only register, then req.user will exist.
    if (req.user && req.user.role === 'admin' && ['admin', 'delivery-agent'].includes(role)) {
      userRole = role;
    }


    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      role: userRole,
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        isBlocked: user.isBlocked,
        addresses: user.addresses, // Include addresses in registration response
        token: generateToken(user._id, user.role),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error('Error during user registration:', error);
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({ message: messages.join(', ') });
    }
    if (error.code === 11000) {
        return res.status(400).json({ message: 'Email already registered.' });
    }
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});


// 2. User Login
// POST /api/users/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: 'Your account has been blocked. Please contact support.' });
    }

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        isBlocked: user.isBlocked,
        addresses: user.addresses, // Include addresses in login response
        token: generateToken(user._id, user.role),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('Error during user login:', error);
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});

// 3. Get User Profile
// GET /api/users/profile
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');

    if (user) {
      res.json({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        isBlocked: user.isBlocked,
        addresses: user.addresses // Include addresses
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// 4. Update User Profile
// PUT /api/users/profile
router.put('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.firstName = req.body.firstName || user.firstName;
      user.lastName = req.body.lastName || user.lastName;
      user.email = req.body.email || user.email;
      user.phoneNumber = req.body.phoneNumber || user.phoneNumber;

      if (req.body.password) {
        user.password = req.body.password;
      }

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
        role: updatedUser.role,
        isBlocked: updatedUser.isBlocked,
        addresses: updatedUser.addresses, // Include addresses in response
        token: generateToken(updatedUser._id, updatedUser.role),
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error updating user profile:', error);
    if (error.code === 11000) {
        return res.status(400).json({ message: 'Email already in use by another account.' });
    }
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});

// 5. Add/Update Delivery Address for a user
// PUT /api/users/profile/addresses
router.put('/profile/addresses', protect, async (req, res) => {
  const { _id, address, city, postalCode, country, isDefault } = req.body; // _id is for existing address

  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If isDefault is true, set all other addresses to not default
    if (isDefault) {
      user.addresses.forEach(addr => addr.isDefault = false);
    }

    if (_id) { // Updating an existing address
        const existingAddress = user.addresses.id(_id); // Mongoose helper to find subdocument by _id
        if (!existingAddress) {
            return res.status(404).json({ message: 'Address not found for update' });
        }
        existingAddress.address = address || existingAddress.address;
        existingAddress.city = city || existingAddress.city;
        existingAddress.postalCode = postalCode || existingAddress.postalCode;
        existingAddress.country = country || existingAddress.country;
        existingAddress.isDefault = isDefault !== undefined ? isDefault : existingAddress.isDefault; // Handle boolean explicitly
    } else { // Adding a new address
        user.addresses.push({ address, city, postalCode, country, isDefault });
    }

    const updatedUser = await user.save();
    res.json({
      message: 'Address updated successfully',
      addresses: updatedUser.addresses,
    });

  } catch (error) {
    console.error('Error adding/updating address:', error);
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});

// 6. Delete Delivery Address for a user
// DELETE /api/users/profile/addresses/:addressId
router.delete('/profile/addresses/:addressId', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Use Mongoose pull to remove the subdocument
        user.addresses.pull({ _id: req.params.addressId });

        await user.save();
        res.json({ message: 'Address removed successfully', addresses: user.addresses });

    } catch (error) {
        console.error('Error deleting address:', error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ message: 'Invalid address ID format' });
        }
        res.status(500).json({ message: 'Server Error', details: error.message });
    }
});


// --- ADMIN ROUTES FOR USER MANAGEMENT ---

// 7. Get all users (Admin only)
// GET /api/users
router.get('/', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const users = await User.find({}).select('-password'); // Don't return passwords
    res.json(users);
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// 8. Get user by ID (Admin only)
// GET /api/users/:id
router.get('/:id', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error fetching user by ID:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});


// 9. Update User by ID (Admin only) - For firstName, lastName, email, phoneNumber, role
// PUT /api/users/:id
router.put('/:id', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (user) {
      user.firstName = req.body.firstName || user.firstName;
      user.lastName = req.body.lastName || user.lastName;
      user.email = req.body.email || user.email;
      user.phoneNumber = req.body.phoneNumber || user.phoneNumber;

      if (req.body.role && ['customer', 'admin', 'delivery-agent'].includes(req.body.role)) {
        user.role = req.body.role;
      }

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
        role: updatedUser.role,
        isBlocked: updatedUser.isBlocked,
        addresses: updatedUser.addresses, // Include addresses in response
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error updating user by admin:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email already in use by another account.' });
    }
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});


// 10. Block/Unblock User (Admin only)
// PUT /api/users/:id/block
router.put('/:id/block', protect, authorizeRoles('admin'), async (req, res) => {
    const { isBlocked } = req.body;

    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ message: 'Admins cannot block their own account.' });
        }

        user.isBlocked = typeof isBlocked === 'boolean' ? isBlocked : user.isBlocked;

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            email: updatedUser.email,
            phoneNumber: updatedUser.phoneNumber,
            role: updatedUser.role,
            isBlocked: updatedUser.isBlocked,
            addresses: updatedUser.addresses, // Include addresses in response
            message: `User ${updatedUser.firstName} ${updatedUser.lastName} has been ${updatedUser.isBlocked ? 'blocked' : 'unblocked'}.`
        });

    } catch (error) {
        console.error('Error blocking/unblocking user:', error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ message: 'Invalid user ID format' });
        }
        res.status(500).json({ message: 'Server Error', details: error.message });
    }
});


// 11. Delete User (Admin only)
// DELETE /api/users/:id
router.delete('/:id', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user._id.toString() === req.user._id.toString()) {
        return res.status(400).json({ message: 'Admins cannot delete their own account.' });
    }

    await user.deleteOne();
    res.json({ message: 'User removed' });
  } catch (error) {
    console.error('Error deleting user:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;