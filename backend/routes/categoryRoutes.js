// routes/categoryRoutes.js

const express = require('express');
const router = express.Router();
const Category = require('../models/Category'); // Import the Category model
const { protect, authorizeRoles } = require('../middleware/authMiddleware'); // Import middleware
const mongoose = require('mongoose'); // For ObjectId validation
const { check, validationResult } = require('express-validator'); // Import check and validationResult

// --- Category CRUD Operations ---

// 1. GET all categories (Public)
// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
router.get('/', async (req, res) => {
    try {
        const categories = await Category.find({}).populate('parentCategory', 'name'); // Populate parent category name
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// 2. GET a single category by ID (Public)
// @desc    Get category by ID
// @route   GET /api/categories/:id
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        // Add ID format validation at the beginning
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Invalid category ID format' });
        }

        const category = await Category.findById(req.params.id).populate('parentCategory', 'name'); // Populate parent category name

        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }
        res.json(category);
    } catch (error) {
        console.error('Error fetching category by ID:', error);
        // Your existing error handling for ObjectId.kind, now combined with explicit check
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ message: 'Invalid category ID format' });
        }
        res.status(500).json({ message: 'Server Error' });
    }
});

// 3. CREATE a new category (Admin Only) - MODIFIED WITH VALIDATION
// @desc    Create a new category
// @route   POST /api/categories
// @access  Private/Admin
router.post(
    '/',
    protect,
    authorizeRoles('admin'),
    [ // Start of validation middleware
        check('name', 'Category name is required').not().isEmpty(),
        check('name', 'Category name must be unique').custom(async (value) => {
            const existingCategory = await Category.findOne({ name: value });
            if (existingCategory) {
                throw new Error('A category with this name already exists.');
            }
        }),
        check('description', 'Description must be a string').optional().isString(),
        check('parentCategory', 'Parent category ID must be a valid ObjectId')
            .optional()
            .custom((value) => mongoose.Types.ObjectId.isValid(value)),
        check('parentCategory', 'Parent category not found')
            .optional()
            .custom(async (value) => {
                const parentCategory = await Category.findById(value);
                if (!parentCategory) {
                    throw new Error('Parent category not found with the provided ID.');
                }
            }),
        check('imageUrl', 'Image URL must be a valid URL').optional().isURL(),
    ], // End of validation middleware
    async (req, res) => {
        // Check for validation errors from express-validator
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, description, parentCategory, imageUrl } = req.body;

        try {
            // Your existing check for name uniqueness is now handled by express-validator's custom check
            // No need for a separate `categoryExists` check here
            
            const category = new Category({
                name,
                description,
                parentCategory: parentCategory || null, // Set to null if not provided
                imageUrl
            });

            const createdCategory = await category.save();
            res.status(201).json(createdCategory);
        } catch (error) {
            console.error('Error creating category:', error);
            // Consolidated error handling
            if (error.code === 11000) { // Duplicate key error from Mongoose (if unique index is hit directly)
                return res.status(400).json({ message: 'Category with this name already exists.' });
            }
            if (error.name === 'ValidationError') { // Mongoose validation error
                let errors = {};
                Object.keys(error.errors).forEach((key) => {
                    errors[key] = error.errors[key].message;
                });
                return res.status(400).json({ message: 'Validation Error', errors });
            }
            res.status(500).json({ message: 'Server Error' });
        }
    }
);

// 4. UPDATE an existing category (Admin Only) - MODIFIED WITH VALIDATION
// @desc    Update a category by ID
// @route   PUT /api/categories/:id
// @access  Private/Admin
router.put(
    '/:id',
    protect,
    authorizeRoles('admin'),
    [ // Start of validation middleware
        check('name', 'Category name must not be empty').not().isEmpty().optional(),
        check('name', 'Category name must be unique').optional().custom(async (value, { req }) => {
            const existingCategory = await Category.findOne({ name: value });
            // If a category with this name exists, ensure it's the *same* category being updated
            if (existingCategory && existingCategory._id.toString() !== req.params.id) {
                throw new Error('A category with this name already exists.');
            }
        }),
        check('description', 'Description must be a string').optional().isString(),
        check('parentCategory', 'Parent category ID must be a valid ObjectId')
            .optional()
            .custom((value) => mongoose.Types.ObjectId.isValid(value)),
        check('parentCategory', 'Parent category not found or circular reference')
            .optional()
            .custom(async (value, { req }) => {
                // Prevent category from being its own parent
                if (value === req.params.id) {
                    throw new Error('A category cannot be its own parent.');
                }
                const parentCategory = await Category.findById(value);
                if (!parentCategory) {
                    throw new Error('Parent category not found with the provided ID.');
                }
                // Optional: For complex nested structures, you might add logic here
                // to prevent circular dependencies (e.g., A -> B -> C -> A).
                // This typically involves recursive checks.
            }),
        check('imageUrl', 'Image URL must be a valid URL').optional().isURL(),
    ], // End of validation middleware
    async (req, res) => {
        // Check for validation errors from express-validator
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, description, parentCategory, imageUrl } = req.body;

        try {
            // Validate category ID from params first
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ message: 'Invalid category ID format' });
            }

            const category = await Category.findById(req.params.id);

            if (!category) {
                return res.status(404).json({ message: 'Category not found' });
            }

            // Your existing name uniqueness check is now handled by express-validator's custom check
            // No need for a separate `nameExists` check here

            // Update fields if provided in the request body
            if (name !== undefined) category.name = name;
            if (description !== undefined) category.description = description;
            // Handle parentCategory: set to null if explicitly provided as null, otherwise update if defined
            if (parentCategory !== undefined) {
                category.parentCategory = parentCategory === null ? null : parentCategory;
            }
            if (imageUrl !== undefined) category.imageUrl = imageUrl;

            const updatedCategory = await category.save();
            res.json(updatedCategory);
        } catch (error) {
            console.error('Error updating category:', error);
            // Consolidated error handling
            if (error.kind === 'ObjectId') { // Mongoose casting error for ID in URL
                return res.status(400).json({ message: 'Invalid category ID format' });
            }
            if (error.name === 'ValidationError') { // Mongoose schema validation error
                let messages = Object.values(error.errors).map(val => val.message);
                return res.status(400).json({ message: 'Validation Error: ' + messages.join(', ') });
            }
            if (error.code === 11000) { // Duplicate key error from Mongoose
                return res.status(400).json({ message: 'Category with this name already exists.' });
            }
            res.status(500).json({ message: 'Server Error' });
        }
    }
);

// 5. DELETE a category (Admin Only)
// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
router.delete('/:id', protect, authorizeRoles('admin'), async (req, res) => {
    try {
        // Validate category ID from params first
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Invalid category ID format' });
        }

        const category = await Category.findByIdAndDelete(req.params.id);

        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        // TODO: Future consideration: What happens to products in this category?
        // Options:
        // 1. Prevent deletion if products exist in category.
        // 2. Set category field of related products to null or a default category.
        // For now, we'll allow deletion, but be mindful of data integrity.

        res.json({ message: 'Category removed' });
    } catch (error) {
        console.error('Error deleting category:', error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ message: 'Invalid category ID format' });
        }
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;