// models/Category.js

const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true, // Category names should be unique
    trim: true,
    maxlength: [50, 'Category name cannot be more than 50 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Category description cannot be more than 200 characters']
  },
  // Optional: a reference to a parent category for nested categories (e.g., 'Dairy' > 'Milk')
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category', // Reference the Category model itself
    default: null // Top-level categories will have no parent
  },
  // Optional: URL to an image representing the category
  imageUrl: {
    type: String,
    trim: true
  },
}, {
  timestamps: true // Adds createdAt and updatedAt fields automatically
});

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;