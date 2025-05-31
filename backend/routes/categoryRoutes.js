// routes/categoryRoutes.js

const express = require('express');
const router = express.Router();
const Category = require('../models/Category'); // Import the Category model
const { protect, authorizeRoles } = require('../middleware/authMiddleware'); // Import middleware

// --- Category CRUD Operations ---

// 1. GET all categories (Public)
// GET /api/categories
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
// GET /api/categories/:id
router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).populate('parentCategory', 'name'); // Populate parent category name

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    console.error('Error fetching category by ID:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid category ID format' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// 3. CREATE a new category (Admin Only)
// POST /api/categories
router.post('/', protect, authorizeRoles('admin'), async (req, res) => {
  const { name, description, parentCategory, imageUrl } = req.body;

  try {
    // Check if category with this name already exists
    const categoryExists = await Category.findOne({ name });
    if (categoryExists) {
      return res.status(400).json({ message: 'Category with this name already exists.' });
    }

    const category = new Category({
      name,
      description,
      parentCategory,
      imageUrl
    });

    const createdCategory = await category.save();
    res.status(201).json(createdCategory);
  } catch (error) {
    console.error('Error creating category:', error);
    if (error.name === 'ValidationError') {
      let errors = {};
      Object.keys(error.errors).forEach((key) => {
        errors[key] = error.errors[key].message;
      });
      return res.status(400).json({ message: 'Validation Error', errors });
    }
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Category with this name already exists.' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// 4. UPDATE an existing category (Admin Only)
// PUT /api/categories/:id
router.put('/:id', protect, authorizeRoles('admin'), async (req, res) => {
  const { name, description, parentCategory, imageUrl } = req.body;

  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if updating name would cause a duplicate (only if name is changed)
    if (name && name !== category.name) {
      const nameExists = await Category.findOne({ name });
      if (nameExists && nameExists._id.toString() !== category._id.toString()) {
        return res.status(400).json({ message: 'Another category with this name already exists.' });
      }
    }

    category.name = name !== undefined ? name : category.name;
    category.description = description !== undefined ? description : category.description;
    category.parentCategory = parentCategory !== undefined ? parentCategory : category.parentCategory;
    category.imageUrl = imageUrl !== undefined ? imageUrl : category.imageUrl;

    const updatedCategory = await category.save();
    res.json(updatedCategory);
  } catch (error) {
    console.error('Error updating category:', error);
    if (error.name === 'ValidationError') {
      let errors = {};
      Object.keys(error.errors).forEach((key) => {
        errors[key] = error.errors[key].message;
      });
      return res.status(400).json({ message: 'Validation Error', errors });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// 5. DELETE a category (Admin Only)
// DELETE /api/categories/:id
router.delete('/:id', protect, authorizeRoles('admin'), async (req, res) => {
  try {
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