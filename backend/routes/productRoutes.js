// routes/productRoutes.js

const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const mongoose = require('mongoose'); // Import mongoose to use mongoose.Types.ObjectId
const Category = require('../models/Category'); // This import is fine, it's just not directly used in THIS file's logic
const { check, validationResult } = require('express-validator'); // <--- ENSURE THIS IS IMPORTED


// 1. Get Low Stock Products (Admin only)
// GET /api/products/admin/low-stock?threshold=10
router.get('/admin/low-stock', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    // Get the threshold from query parameters, default to 10 if not provided
    const threshold = parseInt(req.query.threshold) || 10;

    // Find products where countInStock is less than the threshold
    // Sort them by countInStock in ascending order to see the lowest first
    const lowStockProducts = await Product.find({ countInStock: { $lt: threshold } })
                                        .sort({ countInStock: 1 });

    res.json(lowStockProducts);

  } catch (error) {
    console.error('Error fetching low stock products:', error);
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});

// --- Product CRUD Operations ---

// 1. GET all products (Public & Admin) - No protection needed for viewing products
// GET /api/products

// @desc    Get all products with search, filter, sort, and pagination
// @route   GET /api/products
// @access  Public (for now, will add admin-specific later if needed)
router.get('/', async (req, res) => {
  try {
    const {
      keyword, // Search by product name or description
      category, // Filter by category ID
      minPrice, // Minimum price
      maxPrice, // Maximum price
      sortBy, // Field to sort by (e.g., 'price', 'name', 'createdAt')
      order, // Sort order ('asc' for ascending, 'desc' for descending)
      page = 1, // Current page number (default to 1)
      limit = 10 // Number of items per page (default to 10)
    } = req.query; // Extract query parameters from the request URL

    let query = {}; // This object will build our MongoDB query

    // --- 1. Search by Keyword ---
    if (keyword) {
      query.$or = [
        { name: { $regex: keyword, $options: 'i' } }, // Case-insensitive search for name
        { description: { $regex: keyword, $options: 'i' } } // Case-insensitive search for description
      ];
    }

    // --- 2. Filter by Category ---
    if (category) {
      // Validate if the provided category ID is a valid MongoDB ObjectId
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({ message: 'Invalid category ID format' });
      }
      // Convert the string category ID to a Mongoose ObjectId
      query.category = new mongoose.Types.ObjectId(category);
    }

    // --- 3. Filter by Price Range ---
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) {
        query.price.$gte = parseFloat(minPrice); // $gte means 'greater than or equal to'
      }
      if (maxPrice) {
        query.price.$lte = parseFloat(maxPrice); // $lte means 'less than or equal to'
      }
    }

    // --- 4. Pagination ---
    const skip = (parseInt(page) - 1) * parseInt(limit); // Calculate how many documents to skip
    const pageSize = parseInt(limit); // Number of items per page (default to 10)

    // --- 5. Sorting ---
    let sortOptions = {};
    if (sortBy) {
      // Default to ascending if order is not specified or invalid
      sortOptions[sortBy] = (order && order.toLowerCase() === 'desc') ? -1 : 1;
    } else {
      // Default sort (e.g., by creation date newest first)
      sortOptions.createdAt = -1;
    }

    // Execute the query
    const products = await Product.find(query)
      .sort(sortOptions) // Apply sorting
      .skip(skip) // Apply pagination skip
      .limit(pageSize) // Apply pagination limit
      .populate('category', 'name'); // Optionally populate category name for better response

    // Get total count for pagination metadata
    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / pageSize);

    res.status(200).json({
      products,
      page: parseInt(page),
      pages: totalPages,
      totalProducts,
      limit: pageSize
    });

  } catch (error) {
    console.error(`Error fetching products: ${error.message}`);
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});

// 2. GET a single product by ID (Public & Admin) - No protection needed for viewing a single product
// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category', 'name'); // Populate category here too

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    console.error('Error fetching product by ID:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid product ID format' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});


// 3. CREATE a new product (Admin Only) - MODIFIED WITH ACCURATE VALIDATION AND ERROR HANDLING
// POST /api/products
// Apply 'protect' to ensure user is logged in, and 'authorizeRoles('admin')' to ensure they are an admin
router.post(
  '/',
  protect,
  authorizeRoles('admin'),
  [ // <--- START VALIDATION MIDDLEWARE ARRAY (CRITICAL TO INCLUDE THIS ARRAY)
    check('name', 'Product name is required').not().isEmpty(),
    check('description', 'Product description is required').not().isEmpty(),
    check('price', 'Price is required and must be a positive number').isFloat({ gt: 0 }),
    check('stockQuantity', 'Stock quantity is required and must be a non-negative integer').isInt({ min: 0 }),

    // Category Validation - THIS IS THE CRUCIAL PART FOR YOUR CURRENT ERROR
    check('category', 'Category ID is required').not().isEmpty(),
    check('category', 'Category ID must be a valid ObjectId').custom((value) =>
      mongoose.Types.ObjectId.isValid(value)
    ),

    // SubCategory Validation (Optional, but validates if present)
    check('subCategory', 'SubCategory ID must be a valid ObjectId')
      .optional() // Allows subCategory to be absent
      .custom((value) => mongoose.Types.ObjectId.isValid(value)),

    // Images Validation
    check('images', 'Images are required and must be an array of URLs').isArray({ min: 1 }),
    check('images.*', 'Each image in the array must be a valid URL').isURL(), // Validates each URL in the array

    // Optional fields validation
    check('isOnSale', 'isOnSale must be a boolean').optional().isBoolean(),
    check('discountPrice', 'Discount price must be a non-negative number').optional().isFloat({ min: 0 }),
  ], // <--- END VALIDATION MIDDLEWARE ARRAY
  async (req, res) => {
    // --- THIS BLOCK MUST BE AT THE VERY TOP OF YOUR ASYNC HANDLER ---
    // Check for validation errors from express-validator BEFORE any Mongoose operations
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // --- END CRITICAL VALIDATION CHECK BLOCK ---

    const { name, description, price, stockQuantity, category, subCategory, images, isOnSale, discountPrice } = req.body;

    try {
      // Validate if main category ID exists in the database
      // This lookup will NOW ONLY happen if the category ID PASSED the ObjectId format check above
      const existingCategory = await Category.findById(category);
      if (!existingCategory) {
        return res.status(400).json({ message: 'Main Category not found with the provided ID.' });
      }

      // Optional: Validate if subCategory ID exists in the database if provided
      if (subCategory) {
          const existingSubCategory = await Category.findById(subCategory);
          if (!existingSubCategory) {
              return res.status(400).json({ message: 'SubCategory not found with the provided ID.' });
          }
      }

      const product = new Product({
        name,
        description,
        price,
        stockQuantity,
        category,
        subCategory,
        images,
        isOnSale: isOnSale || false,
        discountPrice: discountPrice || undefined
      });

      const createdProduct = await product.save();
      res.status(201).json(createdProduct);

    } catch (error) {
      console.error('Error creating product:', error);
      // Handle Database/Mongoose Specific Errors (These will only be hit if the express-validator passes)
      if (error.name === 'ValidationError') {
        let errors = {};
        Object.keys(error.errors).forEach((key) => {
          errors[key] = error.errors[key].message;
        });
        return res.status(400).json({ message: 'Validation Error', errors });
      }
      if (error.code === 11000) {
        return res.status(400).json({ message: 'Product with this name already exists.' });
      }
      // Generic server error for anything else unexpected
      res.status(500).json({ message: 'Server Error', details: error.message });
    }
  }
);

// 4. UPDATE an existing product (Admin Only) - MODIFIED WITH VALIDATION
// PUT /api/products/:id
router.put(
  '/:id',
  protect,
  authorizeRoles('admin'),
  [ // <--- START VALIDATION MIDDLEWARE ARRAY
    check('name', 'Product name must not be empty').not().isEmpty().optional(),
    check('description', 'Product description must not be empty').not().isEmpty().optional(),
    check('price', 'Price must be a positive number').isFloat({ gt: 0 }).optional(),
    check('stockQuantity', 'Stock quantity must be a non-negative integer').isInt({ min: 0 }).optional(),

    // Category Validation (optional for update, but if present, must be valid)
    check('category', 'Category ID must be a valid ObjectId').optional().custom((value) =>
      mongoose.Types.ObjectId.isValid(value)
    ),

    // SubCategory Validation (optional for update, but if present, must be valid)
    check('subCategory', 'SubCategory ID must be a valid ObjectId')
      .optional()
      .custom((value) => mongoose.Types.ObjectId.isValid(value)),

    // Images Validation (optional for update, but if present, must be array of URLs)
    check('images', 'Images must be an array of URLs').optional().isArray({ min: 1 }),
    check('images.*', 'Each image in the array must be a valid URL').optional().isURL(),

    // Optional fields validation
    check('isOnSale', 'isOnSale must be a boolean').optional().isBoolean(),
    check('discountPrice', 'Discount price must be a non-negative number').optional().isFloat({ min: 0 }),
  ], // <--- END VALIDATION MIDDLEWARE ARRAY
  async (req, res) => {
    // --- THIS BLOCK MUST BE AT THE VERY TOP OF YOUR ASYNC HANDLER ---
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // --- END CRITICAL VALIDATION CHECK BLOCK ---

    const {
      name,
      description,
      price,
      stockQuantity,
      category,
      subCategory,
      images,
      isOnSale,
      discountPrice
    } = req.body;

    try {
      const product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      // Handle name uniqueness if name is changed
      if (name !== undefined && name !== product.name) {
        const nameExists = await Product.findOne({ name });
        if (nameExists && nameExists._id.toString() !== product._id.toString()) {
          return res.status(400).json({ message: 'Another product with this name already exists.' });
        }
      }

      // Check if main category ID exists if provided
      if (category !== undefined) {
        const existingCategory = await Category.findById(category);
        if (!existingCategory) {
          return res.status(400).json({ message: 'Main Category not found with the provided ID.' });
        }
      }

      // Check if subCategory ID exists if provided
      if (subCategory !== undefined) {
        const existingSubCategory = await Category.findById(subCategory);
        if (!existingSubCategory) {
          return res.status(400).json({ message: 'SubCategory not found with the provided ID.' });
        }
      }

      // Update fields if they are present in the request body
      if (name !== undefined) product.name = name;
      if (description !== undefined) product.description = description;
      if (price !== undefined) product.price = price;
      if (stockQuantity !== undefined) product.stockQuantity = stockQuantity;
      if (category !== undefined) product.category = category;
      if (subCategory !== undefined) product.subCategory = subCategory;
      if (images !== undefined) product.images = images;
      if (isOnSale !== undefined) product.isOnSale = isOnSale;
      if (discountPrice !== undefined) product.discountPrice = discountPrice;


      const updatedProduct = await product.save();
      res.json(updatedProduct);

    } catch (error) {
      console.error('Error updating product:', error);
      if (error.kind === 'ObjectId') { // Catches invalid format in :id parameter
        return res.status(400).json({ message: 'Invalid product ID format' });
      }
      if (error.name === 'ValidationError') {
        let errors = {};
        Object.keys(error.errors).forEach((key) => {
          errors[key] = error.errors[key].message;
        });
        return res.status(400).json({ message: 'Validation Error', errors });
      }
      if (error.code === 11000) {
        return res.status(400).json({ message: 'Product with this name already exists.' });
      }
      res.status(500).json({ message: 'Server Error', details: error.message });
    }
  }
);


// 5. DELETE a product (Admin Only)
// DELETE /api/products/:id
// Apply 'protect' and 'authorizeRoles('admin')'
router.delete('/:id', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ message: 'Product removed' });
  } catch (error) {
    console.error('Error deleting product:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid product ID format' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;