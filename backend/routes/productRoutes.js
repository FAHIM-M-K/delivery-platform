// routes/productRoutes.js

const express = require('express');
const router = express.Router(); // <--- Ensure this line is present and creates a router
const Product = require('../models/Product'); // Import the Product model

// --- Product CRUD Operations ---

// 1. GET all products (Public & Admin)
// GET /api/products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find({});
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// 2. GET a single product by ID (Public & Admin)
// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

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

// 3. CREATE a new product (Admin Only)
// POST /api/products
router.post('/', async (req, res) => {
  try {
    const { name, description, price, stockQuantity, category, subCategory, images, isOnSale, discountPrice } = req.body;

    const product = new Product({
      name,
      description,
      price,
      stockQuantity,
      category,
      subCategory,
      images,
      isOnSale,
      discountPrice
    });

    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
  } catch (error) {
    console.error('Error creating product:', error);
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
    res.status(500).json({ message: 'Server Error' });
  }
});

// 4. UPDATE an existing product (Admin Only)
// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, description, price, stockQuantity, category, subCategory, images, isOnSale, discountPrice } = req.body;

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    product.name = name !== undefined ? name : product.name; // Use !== undefined to allow empty strings or 0
    product.description = description !== undefined ? description : product.description;
    product.price = price !== undefined ? price : product.price;
    product.stockQuantity = stockQuantity !== undefined ? stockQuantity : product.stockQuantity;
    product.category = category !== undefined ? category : product.category;
    product.subCategory = subCategory !== undefined ? subCategory : product.subCategory;
    product.images = images !== undefined ? images : product.images;
    product.isOnSale = isOnSale !== undefined ? isOnSale : product.isOnSale;
    product.discountPrice = discountPrice !== undefined ? discountPrice : product.discountPrice;

    const updatedProduct = await product.save();
    res.json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
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
    res.status(500).json({ message: 'Server Error' });
  }
});

// 5. DELETE a product (Admin Only)
// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
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

module.exports = router; // <--- ENSURE THIS LINE IS PRESENT AND EXPORTS THE ROUTER