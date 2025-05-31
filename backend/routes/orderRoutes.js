// routes/orderRoutes.js

const express = require('express');
const router = express.Router();
const Order = require('../models/Order'); // Import the Order model
const Product = require('../models/Product'); // Will need Product to check stock
const { protect, authorizeRoles } = require('../middleware/authMiddleware'); // Import protect middleware

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


// --- NEW: Order Retrieval and Management ---

// 2. GET all orders for a specific logged-in user (customer, delivery-agent, admin can see their own)
// GET /api/orders/myorders
router.get('/myorders', protect, async (req, res) => {
  try {
    // Find orders where the 'user' field matches the ID of the logged-in user
    // Populate 'user' with email, firstName, lastName
    // Populate 'orderItems.product' with name
    const orders = await Order.find({ user: req.user._id })
      .populate('user', 'email firstName lastName')
      .populate('orderItems.product', 'name'); // Populate product name for each item

    res.json(orders);
  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});


// --- NEW: Delivery Agent Specific Routes ---

// 3. GET orders available for delivery agents to pick up
// GET /api/orders/available
router.get('/available', protect, authorizeRoles('admin', 'delivery-agent'), async (req, res) => {
  try {
    // Orders that are 'Processing' and not yet assigned to any delivery agent
    const availableOrders = await Order.find({
      orderStatus: 'Processing', // Or 'Pending', depending on your exact workflow
      deliveryAgent: null // No agent assigned yet
    })
    .populate('user', 'email firstName lastName phoneNumber') // Show who ordered it
    .populate('orderItems.product', 'name price images'); // Show what's in the order

    res.json(availableOrders);
  } catch (error) {
    console.error('Error fetching available orders for delivery agent:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// 4. Delivery Agent accepts an order
// PUT /api/orders/:id/accept
router.put('/:id/accept', protect, authorizeRoles('delivery-agent'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if the order is in a state where it can be accepted
    if (order.orderStatus !== 'Pending' && order.orderStatus !== 'Processing') {
      return res.status(400).json({ message: `Order status is ${order.orderStatus}, cannot be accepted.` });
    }

    // Check if the order is already assigned
    if (order.deliveryAgent) {
      return res.status(400).json({ message: 'Order is already assigned to a delivery agent.' });
    }

    // Assign the current logged-in delivery agent to the order
    order.deliveryAgent = req.user._id;
    order.orderStatus = 'Out for Delivery'; // Update status upon acceptance

    const updatedOrder = await order.save();
    res.json(updatedOrder);

  } catch (error) {
    console.error('Error accepting order:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});


// 3. GET a single order by ID (Accessible by order owner, delivery agent, or admin)
// GET /api/orders/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'email firstName lastName phoneNumber') // Populate user details for the order
      .populate('orderItems.product', 'name price images'); // Populate product details for items

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Authorization check: Only owner, assigned delivery agent, or admin can view
    if (
      order.user._id.toString() !== req.user._id.toString() && // Not the owner
      !(req.user.role === 'admin') && // Not an admin
      !(req.user.role === 'delivery-agent' && order.deliveryAgent && order.deliveryAgent.toString() === req.user._id.toString()) // Not assigned delivery agent
    ) {
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

// --- NEW: Admin/Delivery Agent Specific Order Management ---

// 4. GET all orders (Admin Only)
// GET /api/orders
// Note: This route will conflict with 'POST /api/orders' if both are at the root path,
// so we'll place this *before* any other general '/api/orders' routes or specify a different path.
// However, since POST / is handled first, this GET / will apply to fetching ALL orders.
// It's common to have admin-specific routes under /api/admin/orders or /api/orders/admin.
// For now, let's keep it here, but remember the order of routes matters.
router.get('/', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    // Fetch all orders and populate user details and product names for items
    const orders = await Order.find({})
      .populate('user', 'id email firstName lastName phoneNumber')
      .populate('orderItems.product', 'name');
    res.json(orders);
  } catch (error) {
    console.error('Error fetching all orders (admin):', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// 5. Update order status (Admin & Delivery Agent)
// PUT /api/orders/:id/status
router.put('/:id/status', protect, authorizeRoles('admin', 'delivery-agent'), async (req, res) => {
  const { orderStatus } = req.body;

  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Authorization for Delivery Agent: Can only update if assigned to this order
    if (req.user.role === 'delivery-agent' && (!order.deliveryAgent || order.deliveryAgent.toString() !== req.user._id.toString())) {
      return res.status(403).json({ message: 'Delivery agent is not assigned to this order' });
    }

    // Validate new status against allowed enum values (already handled by Mongoose schema, but good to be explicit)
    const allowedStatuses = ['Pending', 'Processing', 'Out for Delivery', 'Delivered', 'Cancelled'];
    if (!allowedStatuses.includes(orderStatus)) {
      return res.status(400).json({ message: 'Invalid order status' });
    }

    order.orderStatus = orderStatus;

    // Set deliveredAt timestamp if status becomes 'Delivered'
    if (orderStatus === 'Delivered' && !order.deliveredAt) {
      order.deliveredAt = Date.now();
    } else if (orderStatus !== 'Delivered' && order.deliveredAt) {
      // If status changes from Delivered to something else, clear deliveredAt
      order.deliveredAt = undefined;
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

// 6. Assign delivery agent to an order (Admin Only)
// PUT /api/orders/:id/assign-agent
router.put('/:id/assign-agent', protect, authorizeRoles('admin'), async (req, res) => {
  const { deliveryAgentId } = req.body;

  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Optional: Verify if deliveryAgentId actually belongs to a 'delivery-agent' role user
    // This is a good practice for data integrity.
    const agent = await User.findById(deliveryAgentId);
    if (!agent || agent.role !== 'delivery-agent') {
      return res.status(400).json({ message: 'Invalid delivery agent ID or not a delivery agent' });
    }

    order.deliveryAgent = deliveryAgentId;
    const updatedOrder = await order.save();

    res.json(updatedOrder);
  } catch (error) {
    console.error('Error assigning delivery agent:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid order or agent ID format' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;