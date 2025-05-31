// models/Product.js

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // Basic Product Details
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true, // Removes whitespace from both ends of a string
    unique: true // Ensures product names are unique
  },
  description: {
    type: String,
    required: [true, 'Product description is required']
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [0, 'Price cannot be negative'] // Ensure price is not negative
  },
  // Inventory
  stockQuantity: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock quantity cannot be negative'], // Ensure stock is not negative
    default: 0 // Default to 0 if not provided
  },
  // Categorization
  category: {
    type: String,
    required: [true, 'Product category is required'],
    trim: true
  },
  subCategory: { // Optional, for more detailed organization
    type: String,
    trim: true
  },
  // Images (can store URLs to image hosting services)
  images: {
    type: [String], // Array of strings (URLs)
    default: []
  },
  // Promotional/Discount Information
  isOnSale: {
    type: Boolean,
    default: false
  },
  discountPrice: {
    type: Number,
    min: [0, 'Discount price cannot be negative'],
    validate: { // Custom validator to ensure discount price is less than original price
      validator: function(v) {
        // Only validate if isOnSale is true and discountPrice is provided
        return !this.isOnSale || v < this.price;
      },
      message: 'Discount price must be less than the original price'
    },
    // The required field is for if isOnSale is true, but it can be null if not on sale.
    // A direct 'required' based on a condition can be tricky. Let's make it optional by default
    // and handle the logic through validation or in the route if needed.
    // For simplicity, let's assume if isOnSale is true, discountPrice should be a number.
  },
  // Automatic Timestamps for Creation and Last Update
}, {
  timestamps: true // Adds createdAt and updatedAt fields automatically
});

// Create the Mongoose Model from the Schema
const Product = mongoose.model('Product', productSchema); // <--- Make sure this line exists!

module.exports = Product; // <--- THIS LINE IS CRUCIAL AND MUST BE PRESENT!