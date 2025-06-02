// backend/routes/userRoutes.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const generateToken = require('../utils/generateToken');
const sendEmail = require('../utils/sendEmail');
const { check, validationResult } = require('express-validator');


// 1. User Registration - MODIFIED WITH FULL VALIDATION
// POST /api/users/register
router.post(
  '/register',
  [ // <--- START VALIDATION MIDDLEWARE
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
    check('firstName', 'First name is required').not().isEmpty(),
    check('lastName', 'Last name is required').not().isEmpty(),
    check('phoneNumber', 'A valid phone number is required').isMobilePhone('any', { strictMode: false }), // 'any' for global numbers, 'strictMode: false' to allow flexible formats
    check('passwordConfirm', 'Password confirmation is required').not().isEmpty(),
    check('passwordConfirm').custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
  ], // <--- END VALIDATION MIDDLEWARE
  async (req, res) => {
    // --- 1. Check for Validation Errors from express-validator ---
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, phoneNumber, role } = req.body;

    try {
      // --- 2. Check if user already exists ---
      const userExists = await User.findOne({ email });
      if (userExists) {
        // This is a redundant check with the unique index, but good for explicit messaging
        return res.status(400).json({ message: 'User already exists' });
      }

      // --- 3. Determine User Role ---
      let userRole = 'customer'; // Default role
      // This logic correctly assumes it might not be an admin call, so req.user might be undefined
      if (req.user && req.user.role === 'admin' && ['admin', 'delivery-agent'].includes(role)) {
        userRole = role; // Admin can assign specific roles
      }
      // Note: If /register is a public route, req.user will be undefined.
      // If you intend for this route to be ONLY for admins to create users,
      // then you would add `protect, authorizeRoles('admin')` before the `[check(...)]` middleware.
      // Assuming it's public for now based on your provided code structure.

      // --- 4. Create User ---
      const user = await User.create({
        email,
        password,
        firstName,
        lastName,
        phoneNumber,
        role: userRole,
      });

      // --- 5. Respond with User Data and Token ---
      if (user) {
        // Assuming generateToken is a utility function or a method on the User model
        const token = user.getSignedJwtToken ? user.getSignedJwtToken() : generateToken(user._id, user.role); // Adapt based on your `generateToken` implementation

        res.status(201).json({
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          isBlocked: user.isBlocked,
          addresses: user.addresses, // Include addresses in registration response as per your code
          token: token,
        });
      } else {
        // This else block might be redundant if User.create throws an error on failure,
        // but keeping it for consistency with your original code.
        res.status(400).json({ message: 'Invalid user data' });
      }
    } catch (error) {
      console.error('Error during user registration:', error);
      // --- 6. Handle Database/Mongoose Specific Errors ---
      if (error.name === 'ValidationError') {
        // Mongoose validation errors (e.g., from schema definition)
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({ message: messages.join(', ') });
      }
      if (error.code === 11000) {
        // Duplicate key error (e.g., unique email constraint)
        return res.status(400).json({ message: 'Email already registered.' });
      }
      res.status(500).json({ message: 'Server Error', details: error.message });
    }
  }
);

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

// @desc    Update user profile - MODIFIED FOR VALIDATION
// @route   PUT /api/users/profile
// @access  Private
router.put(
  '/profile',
  protect, // User must be logged in to update their profile
  [ // <--- START VALIDATION MIDDLEWARE ARRAY
    check('firstName', 'First name is required').not().isEmpty().optional(), // Optional since not all fields might be updated
    check('lastName', 'Last name is required').not().isEmpty().optional(), // Optional
    check('email', 'Please include a valid email').isEmail().optional(), // Optional, but if present, must be valid email
    check('phoneNumber', 'A valid phone number is required').isMobilePhone('any', { strictMode: false }).optional(), // Optional, but if present, must be valid phone number
    // Password validation is typically handled separately for profile updates, often needing old password confirmation.
    // For simplicity here, we'll assume password updates are done via a different endpoint or handled in a specific way.
    // If you add password here, you'd add: check('password', 'Password must be 6 or more characters').isLength({ min: 6 }).optional(),
  ], // <--- END VALIDATION MIDDLEWARE ARRAY
  async (req, res) => {
    // --- THIS BLOCK MUST BE AT THE VERY TOP OF YOUR ASYNC HANDLER ---
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // --- END CRITICAL VALIDATION CHECK BLOCK ---

    try {
      const user = await User.findById(req.user._id); // req.user._id comes from the 'protect' middleware

      if (user) {
        // Update fields if provided in the request body
        // Only update if the field is present in req.body AND is different from current value
        if (req.body.firstName !== undefined) user.firstName = req.body.firstName;
        if (req.body.lastName !== undefined) user.lastName = req.body.lastName;
        if (req.body.phoneNumber !== undefined) user.phoneNumber = req.body.phoneNumber;

        // Special handling for email: check for duplicates if email is being changed
        if (req.body.email !== undefined && req.body.email !== user.email) {
          const emailExists = await User.findOne({ email: req.body.email });
          if (emailExists && emailExists._id.toString() !== user._id.toString()) {
            return res.status(400).json({ message: 'This email is already in use by another account.' });
          }
          user.email = req.body.email;
        }

        // IMPORTANT: Password update is usually handled by a separate endpoint
        // that requires the old password for security reasons.
        // If you were to allow it here:
        // if (req.body.password) {
        //   user.password = req.body.password; // Mongoose pre-save hook handles hashing
        // }

        const updatedUser = await user.save();

        res.json({
          _id: updatedUser._id,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          email: updatedUser.email,
          phoneNumber: updatedUser.phoneNumber,
          role: updatedUser.role,
          isBlocked: updatedUser.isBlocked,
          addresses: updatedUser.addresses,
          token: user.getSignedJwtToken ? updatedUser.getSignedJwtToken() : undefined, // Assuming token regeneration might happen or use existing
        });
      } else {
        res.status(404).json({ message: 'User not found' });
      }
    } catch (error) {
      console.error('Error updating user profile:', error);
      // Handle Mongoose validation errors or other database errors
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({ message: messages.join(', ') });
      }
      if (error.code === 11000) { // Duplicate key error, e.g., if new email already exists
        return res.status(400).json({ message: 'This email is already registered.' });
      }
      res.status(500).json({ message: 'Server Error', details: error.message });
    }
  }
);

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

// @desc    Update user by ID (Admin Only) - MODIFIED WITH VALIDATION
// @route   PUT /api/users/:id
// @access  Private/Admin
router.put(
  '/:id',
  protect,
  authorizeRoles('admin'), // Only admins can update other users
  [ // <--- START VALIDATION MIDDLEWARE ARRAY
    check('firstName', 'First name must not be empty').not().isEmpty().optional(),
    check('lastName', 'Last name must not be empty').not().isEmpty().optional(),
    check('email', 'Please include a valid email').isEmail().optional(),
    check('phoneNumber', 'A valid phone number is required').isMobilePhone('any', { strictMode: false }).optional(),

    // Validate role: ensure it's one of the allowed roles
    check('role', 'Invalid user role').optional().isIn(['customer', 'admin', 'deliveryAgent']),

    // Validate isBlocked: ensure it's a boolean
    check('isBlocked', 'isBlocked must be a boolean').optional().isBoolean(),

    // Validate addresses array (if you have addresses nested directly here)
    // Assuming addresses is an array of objects with 'street', 'city', etc.
    check('addresses', 'Addresses must be an array').optional().isArray(),
    check('addresses.*.street', 'Street is required for each address').not().isEmpty().optional(),
    check('addresses.*.city', 'City is required for each address').not().isEmpty().optional(),
    check('addresses.*.postalCode', 'Postal Code is required for each address').not().isEmpty().optional(),
    check('addresses.*.country', 'Country is required for each address').not().isEmpty().optional(),
    check('addresses.*.phone', 'Phone number is required for each address and must be valid').not().isEmpty().isMobilePhone('any', { strictMode: false }).optional(),

    // Password update typically has its own separate, more secure process,
    // often requiring current password verification. So we won't add password validation here.
  ], // <--- END VALIDATION MIDDLEWARE ARRAY
  async (req, res) => {
    // --- THIS BLOCK MUST BE AT THE VERY TOP OF YOUR ASYNC HANDLER ---
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // --- END CRITICAL VALIDATION CHECK BLOCK ---

    try {
      // Validate user ID from params first
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'Invalid user ID format' });
      }

      const user = await User.findById(req.params.id);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Prevent admin from updating their own role if they are the only admin
      // This is a complex logic that might require checking other admins or could be simplified.
      // For now, let's allow it, assuming there are other ways to manage admin roles if needed.

      // Handle email uniqueness if email is being changed
      if (req.body.email !== undefined && req.body.email !== user.email) {
        const emailExists = await User.findOne({ email: req.body.email });
        // Ensure the found email belongs to a DIFFERENT user
        if (emailExists && emailExists._id.toString() !== user._id.toString()) {
          return res.status(400).json({ message: 'This email is already in use by another account.' });
        }
        user.email = req.body.email; // Update email if valid and unique
      }

      // Update other fields if provided in the request body
      if (req.body.firstName !== undefined) user.firstName = req.body.firstName;
      if (req.body.lastName !== undefined) user.lastName = req.body.lastName;
      if (req.body.phoneNumber !== undefined) user.phoneNumber = req.body.phoneNumber;
      if (req.body.role !== undefined) user.role = req.body.role;
      if (req.body.isBlocked !== undefined) user.isBlocked = req.body.isBlocked;
      if (req.body.addresses !== undefined) user.addresses = req.body.addresses;

      // Note: Password updates should typically be handled by a separate, secure process
      // that requires old password verification. We're not handling it here.

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
        role: updatedUser.role,
        isBlocked: updatedUser.isBlocked,
        addresses: updatedUser.addresses,
      });

    } catch (error) {
      console.error('Error updating user by admin:', error);
      if (error.kind === 'ObjectId') { // Catches invalid ID format in :id parameter
        return res.status(400).json({ message: 'Invalid user ID format' });
      }
      if (error.name === 'ValidationError') {
        let messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({ message: 'Validation Error: ' + messages.join(', ') });
      }
      if (error.code === 11000) { // Duplicate key error, e.g., if new email already exists
        return res.status(400).json({ message: 'This email is already registered.' });
      }
      res.status(500).json({ message: 'Server Error', details: error.message });
    }
  }
);

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


// @desc    Get new user registration count by period (Admin only) - MODIFIED TO INCLUDE GROUPING
// @route   GET /api/users/admin/registration-count?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&groupBy=day|week|month|year
// @access  Private/Admin
router.get('/admin/registration-count', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const { startDate, endDate, groupBy } = req.query; // Added groupBy

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Please provide both startDate and endDate query parameters (YYYY-MM-DD).' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid date format. Please use YYYY-MM-DD.' });
    }

    let pipeline = [
      {
        $match: {
          createdAt: {
            $gte: start,
            $lte: end
          }
        }
      }
    ];

    // Conditional grouping based on 'groupBy' parameter
    if (groupBy) {
      let format;
      switch (groupBy.toLowerCase()) {
        case 'day':
          format = "%Y-%m-%d";
          break;
        case 'week':
          format = "%Y-%W"; // %W for week number (00-53) with Monday as the first day of the week
          break;
        case 'month':
          format = "%Y-%m";
          break;
        case 'year':
          format = "%Y";
          break;
        default:
          return res.status(400).json({ message: 'Invalid groupBy parameter. Accepted values are: day, week, month, year.' });
      }

      pipeline.push(
        {
          $group: {
            _id: { $dateToString: { format: format, date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { "_id": 1 } // Sort by the grouped date/period
        }
      );
    } else {
      // If no groupBy is provided, fall back to counting total users
      pipeline.push(
        {
          $count: 'totalNewUsers'
        }
      );
    }

    const result = await User.aggregate(pipeline);

    // Adapt response based on whether grouping occurred
    if (groupBy) {
      res.json(result); // result will be an array of { _id: "date", count: X }
    } else {
      if (result.length > 0) {
        res.json(result[0]); // result will be [{ totalNewUsers: X }]
      } else {
        res.json({
          totalNewUsers: 0,
          message: `No new user registrations found between ${startDate} and ${endDate}.`
        });
      }
    }

  } catch (error) {
    console.error('Error fetching new user registration count:', error);
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});

module.exports = router;