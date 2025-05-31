// routes/orderRoutes.js

const express = require('express');
const router = express.Router();
const Order = require('../models/Order'); // Import the Order model
const Product = require('../models/Product'); // Will need Product to check stock
const { protect } = require('../middleware/authMiddleware'); // Import protect middleware

// --- Order Creation ---

// 1. Create a new order (Protected - only logged-in users can place orders)
// POST /api/orders
router.post('/', protect, async (req, res) => {
  const {
    orderItems,
    shippingAddress,
    paymentMethod,
    taxPrice,
    shippingPrice,
    totalPrice,
  } = req.body;

  // Basic validation: Check if orderItems exist and are not empty
  if (orderItems && orderItems.length === 0) {
    return res.status(400).json({ message: 'No order items' });
  }

  try {
    // You might want to implement more robust stock checking here.
    // For simplicity, we'll assume stock is sufficient for now,
    // or that it's handled on the frontend before placing the order.

    // Create the order
    const order = new Order({
      user: req.user._id, // User ID from the 'protect' middleware
      orderItems,
      shippingAddress,
      paymentMethod,
      taxPrice,
      shippingPrice,
      totalPrice,
      // isPaid, paidAt, isDelivered, deliveredAt will be updated later
    });

    const createdOrder = await order.save();
    res.status(201).json(createdOrder);
  } catch (error) {
    console.error('Error creating order:', error);
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

// We will add more order routes (get user's orders, get order by ID, update order status) later.

module.exports = router;