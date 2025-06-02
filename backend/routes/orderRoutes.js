// backend/routes/orderRoutes.js

const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const Category = require('../models/Category'); // Import Category model for lookup
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const mongoose = require('mongoose');
const sendEmail = require('../utils/sendEmail');
const { check, validationResult } = require('express-validator');


// 1. Get Sales and Order Analytics (Admin only) - Overall totals
// GET /api/orders/admin/analytics
router.get('/admin/analytics', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const analytics = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalPrice' },
          totalOrders: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          totalSales: 1,
          totalOrders: 1
        }
      }
    ]);

    if (analytics.length > 0) {
      res.json(analytics[0]);
    } else {
      res.json({ totalSales: 0, totalOrders: 0 });
    }

  } catch (error) {
    console.error('Error fetching admin analytics:', error);
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});


// 2. Get Top Selling Products (Admin only)
// GET /api/orders/admin/top-products
router.get('/admin/top-products', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const topProducts = await Order.aggregate([
      { $unwind: '$orderItems' },
      {
        $group: {
          _id: '$orderItems.product',
          totalSold: { $sum: '$orderItems.quantity' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productDetails'
        }
      },
      { $unwind: '$productDetails' },
      {
        $project: {
          _id: 0,
          productId: '$productDetails._id',
          productName: '$productDetails.name',
          totalSold: '$totalSold',
          orderCount: '$orderCount'
        }
      }
    ]);

    res.json(topProducts);

  } catch (error) {
    console.error('Error fetching top selling products:', error);
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});


// 3. Get Sales Report by Period (Admin only)
// GET /api/orders/admin/sales-report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/admin/sales-report', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Please provide both startDate and endDate query parameters (YYYY-MM-DD).' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid date format. Please use YYYY-MM-DD.' });
    }

    const salesReport = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: start,
            $lte: end
          }
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalPrice' },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$totalPrice' }
        }
      },
      {
        $project: {
          _id: 0,
          totalSales: 1,
          totalOrders: 1,
          averageOrderValue: 1
        }
      }
    ]);

    if (salesReport.length > 0) {
      res.json(salesReport[0]);
    } else {
      res.json({
        totalSales: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        message: `No sales data found between ${startDate} and ${endDate}.`
      });
    }

  } catch (error) {
    console.error('Error fetching sales report by period:', error);
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});


// --- NEW SALES REPORT BY CATEGORY ROUTE ---
// 4. Get Sales Report by Category (Admin only)
// GET /api/orders/admin/sales-by-category?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/admin/sales-by-category', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let matchQuery = {};

    // Apply date filtering if startDate and endDate are provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Set end date to the end of the day for inclusive range

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: 'Invalid date format. Please use YYYY-MM-DD.' });
      }
      matchQuery.createdAt = { $gte: start, $lte: end };
    }

    const salesByCategory = await Order.aggregate([
      // Stage 1: Filter orders by date range if specified
      { $match: matchQuery },
      // Stage 2: Deconstruct the 'orderItems' array
      { $unwind: '$orderItems' },
      // Stage 3: Look up product details to get the category ID
      {
        $lookup: {
          from: 'products', // The products collection
          localField: 'orderItems.product',
          foreignField: '_id',
          as: 'productDetails'
        }
      },
      // Stage 4: Unwind productDetails to access category directly
      { $unwind: '$productDetails' },
      // Stage 5: Look up category details to get the category name
      {
        $lookup: {
          from: 'categories', // The categories collection
          localField: 'productDetails.category', // The category ID from productDetails
          foreignField: '_id',
          as: 'categoryDetails'
        }
      },
      // Stage 6: Unwind categoryDetails (it's an array from lookup)
      { $unwind: '$categoryDetails' },
      // Stage 7: Group by category ID and name to sum sales and quantities
      {
        $group: {
          _id: '$categoryDetails._id',
          categoryName: { $first: '$categoryDetails.name' }, // Get the category name
          totalSales: { $sum: { $multiply: ['$orderItems.price', '$orderItems.quantity'] } }, // Sum of item price * quantity
          totalQuantitySold: { $sum: '$orderItems.quantity' }, // Sum of quantities
          orderCount: { $sum: 1 } // Count how many times items from this category appeared
        }
      },
      // Stage 8: Sort by total sales in descending order
      { $sort: { totalSales: -1 } },
      // Stage 9: Project to shape the output document
      {
        $project: {
          _id: 0,
          categoryId: '$_id',
          categoryName: 1,
          totalSales: { $round: ['$totalSales', 2] }, // Round to 2 decimal places
          totalQuantitySold: 1,
          orderCount: 1
        }
      }
    ]);

    res.json(salesByCategory);

  } catch (error) {
    console.error('Error fetching sales report by category:', error);
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});
// --- END NEW SALES REPORT BY CATEGORY ROUTE ---

// @desc    Create new order (MODIFIED: Calculates prices server-side & adds validation)
// @route   POST /api/orders
// @access  Private (Users only)
router.post(
  '/',
  protect, // User must be logged in to create an order
  [ // <--- START VALIDATION MIDDLEWARE ARRAY (Ensure this entire array is included)
    // Validate orderItems array
    check('orderItems', 'Order must contain at least one product').isArray({ min: 1 }),
    check('orderItems.*.product', 'Product ID is required for each item').not().isEmpty(),
    check('orderItems.*.product', 'Product ID must be a valid ObjectId').custom((value) =>
      mongoose.Types.ObjectId.isValid(value)
    ),
    check('orderItems.*.name', 'Product name is required for each item').not().isEmpty(),
    check('orderItems.*.quantity', 'Quantity must be a positive integer for each item').isInt({ gt: 0 }),
    check('orderItems.*.price', 'Price must be a positive number for each item').isFloat({ gt: 0 }),
    check('orderItems.*.image', 'Product image URL is required for each item').not().isEmpty().isURL(),

    // Validate shippingAddress fields - THIS NOW INCLUDES PHONE
    check('shippingAddress.address', 'Shipping address is required').not().isEmpty(),
    check('shippingAddress.city', 'City is required').not().isEmpty(),
    check('shippingAddress.postalCode', 'Postal Code is required').not().isEmpty(),
    check('shippingAddress.country', 'Country is required').not().isEmpty(),
    check('shippingAddress.phone', 'Shipping phone number is required and must be valid')
      .not().isEmpty() // Ensures it's not empty
      .isMobilePhone('any', { strictMode: false }), // <--- THIS CHECKS FOR VALID PHONE NUMBER FORMAT

    // Validate paymentMethod and deliveryInstructions (optional but if provided, ensure string)
    check('paymentMethod', 'Payment method must be a string').optional().isString(),
    check('deliveryInstructions', 'Delivery instructions must be a string').optional().isString(),
  ], // <--- END VALIDATION MIDDLEWARE ARRAY
  async (req, res) => {
    // --- THIS BLOCK MUST BE AT THE VERY TOP OF YOUR ASYNC HANDLER ---
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // --- END CRITICAL VALIDATION CHECK BLOCK ---

    const {
      orderItems,
      shippingAddress,
      paymentMethod,
      deliveryInstructions,
    } = req.body;

    // Initial check for empty order items (redundant with express-validator, but keeps your original logic)
    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ message: 'No order items' });
    }

    const session = await Order.startSession();
    session.startTransaction();

    try {
      let calculatedItemsPrice = 0;
      const newOrderItems = []; // This will hold verified and sanitized order items

      for (const item of orderItems) {
        const product = await Product.findById(item.product).session(session);

        if (!product) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({ message: `Product not found: ${item.name || item.product}` });
        }

        // --- SECURITY CHECK: VERIFY PRICE FROM DATABASE ---
        if (product.price !== item.price) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: `Price mismatch for product: ${product.name}. Expected: ${product.price}, Received: ${item.price}` });
        }

        if (product.stockQuantity < item.quantity) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: `Insufficient stock for ${product.name}. Available: ${product.stockQuantity}, Requested: ${item.quantity}` });
        }

        calculatedItemsPrice += product.price * item.quantity;

        newOrderItems.push({
          name: product.name,
          quantity: item.quantity,
          image: product.images && product.images.length > 0 ? product.images[0] : item.image,
          price: product.price,
          product: product._id,
        });
      }

      const TAX_RATE = 0.05;
      const SHIPPING_COST = 10.00;

      const calculatedTaxPrice = calculatedItemsPrice * TAX_RATE;
      const calculatedShippingPrice = SHIPPING_COST;
      const calculatedTotalPrice = calculatedItemsPrice + calculatedTaxPrice + calculatedShippingPrice;

      const order = new Order({
        user: req.user._id,
        orderItems: newOrderItems,
        shippingAddress: { // Construct shippingAddress explicitly to match schema fields
            address: shippingAddress.address,
            city: shippingAddress.city,
            postalCode: shippingAddress.postalCode,
            country: shippingAddress.country,
            phone: shippingAddress.phone, // <--- PHONE IS NOW INCLUDED HERE
            // Add any other specific fields from your shippingAddress schema if needed
        },
        paymentMethod,
        itemsPrice: calculatedItemsPrice.toFixed(2),
        taxPrice: calculatedTaxPrice.toFixed(2),
        shippingPrice: calculatedShippingPrice.toFixed(2),
        totalPrice: calculatedTotalPrice.toFixed(2),
        deliveryInstructions,
        orderStatus: 'Pending',
      });

      const createdOrder = await order.save({ session });

      for (const item of newOrderItems) {
          const product = await Product.findById(item.product).session(session);
          if (product) {
              product.stockQuantity -= item.quantity;
              await product.save({ session });
          }
      }

      await session.commitTransaction();
      session.endSession();

      res.status(201).json(createdOrder);

    } catch (transactionError) {
      await session.abortTransaction();
      session.endSession();
      console.error('Transaction Error during order creation:', transactionError);

      if (transactionError.kind === 'ObjectId') {
          return res.status(400).json({ message: 'Invalid ID format in order items' });
      }
      if (transactionError.name === 'ValidationError') {
          const messages = Object.values(transactionError.errors).map(val => val.message);
          return res.status(400).json({ message: 'Validation Error: ' + messages.join(', ') });
      }
      if (transactionError.code === 11000) {
          return res.status(400).json({ message: 'Duplicate data detected during order processing.' });
      }

      res.status(500).json({ message: 'Order creation failed due to an unexpected server error.', details: transactionError.message });

    } finally {
        if (session.inTransaction()) {
            await session.abortTransaction(); // Double-check in case an error bypassed initial abort
        }
        if (session.isActive) {
            session.endSession();
        }
    }
  }
);

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private (User specific, Admin can view all)
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('orderItems.product', 'name images');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this order' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error fetching order by ID:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// @desc    Get all orders (Admin only)
// @route   GET /api/orders
// @access  Private/Admin
router.get('/', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const orders = await Order.find({}).populate('user', 'id name');
    res.json(orders);
  } catch (error) {
    console.error('Error fetching all orders:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});


// @desc    Update order status (Admin and Delivery Agent) - MODIFIED FOR EMAIL NOTIFICATIONS
// @route   PUT /api/orders/:id/status
// @access  Private/Admin, Delivery Agent
router.put('/:id/status', protect, authorizeRoles('admin', 'delivery-agent'), async (req, res) => {
  const { orderStatus, assignedTo } = req.body;

  try {
    // Populate user and orderItems.product to get details needed for the email
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email') // Get user's name and email
      .populate('orderItems.product', 'name'); // Get product name for email content

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const oldOrderStatus = order.orderStatus; // Store old status to check for changes

    if (req.user.role === 'admin') {
      order.orderStatus = orderStatus || order.orderStatus;
      if (assignedTo) {
        order.assignedTo = assignedTo;
      }
    } else if (req.user.role === 'delivery-agent') {
      if (order.assignedTo && order.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to update this order' });
      }

      const validAgentStatuses = ['Out for Delivery', 'Delivered', 'Cancelled'];
      if (orderStatus && validAgentStatuses.includes(orderStatus)) {
        order.orderStatus = orderStatus;
      } else {
        return res.status(400).json({ message: `Delivery agents can only change status to: ${validAgentStatuses.join(', ')}` });
      }
    } else {
      return res.status(403).json({ message: 'Not authorized to update order status' });
    }

    const updatedOrder = await order.save();

    // --- SEND EMAIL NOTIFICATION IF STATUS CHANGED ---
    if (updatedOrder.orderStatus !== oldOrderStatus) {
      const orderItemsList = updatedOrder.orderItems.map(item => `${item.name} (${item.quantity})`).join(', ');
      const emailContent = `
        <p>Dear ${updatedOrder.user.name},</p>
        <p>Your order #${updatedOrder._id} status has been updated!</p>
        <p><strong>Old Status:</strong> ${oldOrderStatus}</p>
        <p><strong>New Status:</strong> ${updatedOrder.orderStatus}</p>
        <p><strong>Order Items:</strong> ${orderItemsList}</p>
        <p><strong>Total Price:</strong> $${updatedOrder.totalPrice}</p>
        <p>Thank you for shopping with us!</p>
        <p>The ${process.env.EMAIL_FROM_NAME} Team</p>
      `;

      try {
        await sendEmail({
          email: updatedOrder.user.email,
          subject: `Order Status Update: Your Order #${updatedOrder._id}`,
          html: emailContent,
        });
        console.log(`Order status update email sent for order ${updatedOrder._id} to ${updatedOrder.user.email}`);
      } catch (emailError) {
        console.error(`Failed to send order status email for order ${updatedOrder._id}:`, emailError);
        // Optionally, you might want to return an error, but usually, email failures
        // don't stop the main operation from succeeding.
      }
    }
    // --- END EMAIL NOTIFICATION LOGIC ---

    res.json(updatedOrder);

  } catch (error) {
    console.error('Error updating order status:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});

// @desc    Get orders assigned to a specific delivery agent
// @route   GET /api/orders/assigned/:agentId
// @access  Private/Admin, Delivery Agent (only for themselves)
router.get('/assigned/:agentId', protect, authorizeRoles('admin', 'delivery-agent'), async (req, res) => {
  if (req.user.role === 'delivery-agent' && req.user._id.toString() !== req.params.agentId) {
    return res.status(403).json({ message: 'Not authorized to view other agents\' assigned orders' });
  }

  try {
    const assignedOrders = await Order.find({ assignedTo: req.params.agentId })
      .populate('user', 'name email')
      .populate('orderItems.product', 'name images');

    res.json(assignedOrders);
  } catch (error) {
    console.error('Error fetching assigned orders:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid agent ID format' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});


// @desc    Admin: Delete an order
// @route   DELETE /api/orders/:id
// @access  Private/Admin
router.delete('/:id', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    await order.deleteOne();
    res.json({ message: 'Order removed' });
  } catch (error) {
    console.error('Error deleting order:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});


module.exports = router;