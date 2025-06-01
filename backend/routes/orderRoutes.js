// backend/routes/orderRoutes.js

const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product'); // Import Product model
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const mongoose = require('mongoose');

// 1. Get Sales and Order Analytics (Admin only)
// GET /api/orders/admin/analytics
router.get('/admin/analytics', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    // Aggregate total sales and total orders
    const analytics = await Order.aggregate([
      {
        $group: {
          _id: null, // Group all documents into a single group
          totalSales: { $sum: '$totalPrice' }, // Sum up the totalPrice from all orders
          totalOrders: { $sum: 1 } // Count the total number of orders
        }
      },
      {
        $project: {
          _id: 0, // Exclude the _id field from the final output
          totalSales: 1,
          totalOrders: 1
        }
      }
    ]);

    // If there are no orders, the aggregation will return an empty array or an array with nulls/zeros
    if (analytics.length > 0) {
      res.json(analytics[0]); // analytics will be an array, we want the first (and only) element
    } else {
      res.json({ totalSales: 0, totalOrders: 0 }); // Return zeros if no orders found
    }

  } catch (error) {
    console.error('Error fetching admin analytics:', error);
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});


// --- NEW TOP SELLING PRODUCTS ROUTE (FIXED) ---
// 2. Get Top Selling Products (Admin only)
// GET /api/orders/admin/top-products
router.get('/admin/top-products', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const topProducts = await Order.aggregate([
      // Stage 1: Deconstruct the 'orderItems' array from input documents
      { $unwind: '$orderItems' },
      // Stage 2: Group by product ID and sum quantities
      {
        $group: {
          _id: '$orderItems.product', // Group by the product ID
          totalSold: { $sum: '$orderItems.quantity' }, // CHANGED: Sum the 'quantity' field
          orderCount: { $sum: 1 } // Count how many times this product appeared in orders
        }
      },
      // Stage 3: Sort by total quantity sold in descending order
      { $sort: { totalSold: -1 } },
      // Stage 4: Limit to the top N products (e.g., top 5)
      { $limit: 5 }, // You can change this number (e.g., 10 for top 10)
      // Stage 5: Look up product details from the 'products' collection
      // This allows us to get the product's name and other details
      {
        $lookup: {
          from: 'products', // The collection to join with (MongoDB collection names are typically lowercase and plural)
          localField: '_id', // Field from the input documents (_id is the product ID from $group)
          foreignField: '_id', // Field from the 'products' collection
          as: 'productDetails' // The array field to add to the input documents
        }
      },
      // Stage 6: Deconstruct the 'productDetails' array (since $lookup returns an array)
      { $unwind: '$productDetails' },
      // Stage 7: Project to shape the output document
      {
        $project: {
          _id: 0, // Exclude the default _id field
          productId: '$productDetails._id',
          productName: '$productDetails.name',
          totalSold: '$totalSold',
          orderCount: '$orderCount'
          // You can include other productDetails fields if needed, e.g., 'category': '$productDetails.category'
        }
      }
    ]);

    res.json(topProducts);

  } catch (error) {
    console.error('Error fetching top selling products:', error);
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});
// --- END NEW TOP SELLING PRODUCTS ROUTE ---

// @desc    Create new order
// @route   POST /api/orders
// @access  Private (Users only)
router.post('/', protect, async (req, res) => {
  const {
    orderItems,
    shippingAddress,
    paymentMethod,
    itemsPrice,
    taxPrice,
    shippingPrice,
    totalPrice,
    deliveryInstructions,
  } = req.body;

  if (orderItems && orderItems.length === 0) {
    return res.status(400).json({ message: 'No order items' });
  } else {
    try {
      const session = await Order.startSession();
      session.startTransaction();

      try {
        // --- 1. Check Product Stock ---
        const productsInOrder = [];
        for (const item of orderItems) {
          const product = await Product.findById(item.product).session(session);

          if (!product) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: `Product not found: ${item.name}` });
          }

          // CHANGED: Use item.quantity for stock check
          if (product.stockQuantity < item.quantity) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: `Insufficient stock for ${product.name}. Available: ${product.stockQuantity}, Requested: ${item.quantity}` });
          }
          productsInOrder.push(product);
        }

        // --- 2. Create the Order ---
        const order = new Order({
          user: req.user._id,
          orderItems,
          shippingAddress,
          paymentMethod,
          itemsPrice,
          taxPrice,
          shippingPrice,
          totalPrice,
          deliveryInstructions,
          orderStatus: 'Pending',
        });

        const createdOrder = await order.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json(createdOrder);

      } catch (transactionError) {
        await session.abortTransaction();
        session.endSession();
        console.error('Transaction Error during order creation:', transactionError);
        res.status(500).json({ message: 'Order creation failed due to a transaction error.', details: transactionError.message });
      }
    } catch (error) {
      console.error('Error starting session for order creation:', error);
      res.status(500).json({ message: 'Server Error: Could not start transaction session.', details: error.message });
    }
  }
});

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

// @desc    Update order status (Admin and Delivery Agent)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin, Delivery Agent
router.put('/:id/status', protect, authorizeRoles('admin', 'delivery-agent'), async (req, res) => {
  const { orderStatus, assignedTo } = req.body;

  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

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
    res.json(updatedOrder);

  } catch (error) {
    console.error('Error updating order status:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }
    res.status(500).json({ message: 'Server Error' });
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