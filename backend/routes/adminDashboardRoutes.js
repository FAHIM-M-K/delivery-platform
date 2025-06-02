// backend/routes/adminDashboardRoutes.js

const express = require('express');
const router = express.Router();
const User = require('../models/User'); // Import User model
const Product = require('../models/Product'); // Import Product model
const Order = require('../models/Order'); // Import Order model
const { protect, authorizeRoles } = require('../middleware/authMiddleware'); // Import auth middleware

// @desc    Get consolidated admin dashboard summary data
// @route   GET /api/admin/dashboard-summary
// @access  Private/Admin
router.get('/dashboard-summary', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    // Define date ranges for recent data (e.g., last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Use Promise.all to run multiple queries concurrently for efficiency
    const [
      totalUsers,
      totalProducts,
      totalOrders,
      totalSalesRevenue,
      ordersByStatus,
      newUsersLast30Days,
      salesLast30Days,
      revenueLast30Days
    ] = await Promise.all([
      // 1. Total Number of Users
      User.countDocuments(),

      // 2. Total Number of Products
      Product.countDocuments(),

      // 3. Total Number of Orders
      Order.countDocuments(),

      // 4. Total Sales Revenue (Sum of all completed orders' totalPrice)
      Order.aggregate([
        {
          $match: {
            isPaid: true // Only count paid orders for total revenue
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalPrice' }
          }
        }
      ]),

      // 5. Orders Count by Status
      Order.aggregate([
        {
          $group: {
            _id: '$orderStatus',
            count: { $sum: 1 }
          }
        }
      ]),

      // 6. New Users in Last 30 Days
      User.countDocuments({
        createdAt: { $gte: thirtyDaysAgo }
      }),

      // 7. Orders Placed in Last 30 Days
      Order.countDocuments({
        createdAt: { $gte: thirtyDaysAgo }
      }),

      // 8. Revenue in Last 30 Days
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: thirtyDaysAgo },
            isPaid: true
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalPrice' }
          }
        }
      ]),
    ]);

    // Format the results for the response
    const formattedOrdersByStatus = ordersByStatus.reduce((acc, status) => {
      acc[status._id.toLowerCase().replace(/\s/g, '')] = status.count; // e.g., "pending": 10
      return acc;
    }, {});

    res.json({
      totalUsers,
      totalProducts,
      totalOrders,
      totalSalesRevenue: totalSalesRevenue.length > 0 ? totalSalesRevenue[0].totalRevenue : 0,
      ordersByStatus: formattedOrdersByStatus,
      newUsersLast30Days,
      ordersLast30Days: salesLast30Days, // Renaming for clarity if needed
      revenueLast30Days: revenueLast30Days.length > 0 ? revenueLast30Days[0].totalRevenue : 0,
      last30DaysStartDate: thirtyDaysAgo.toISOString().split('T')[0], // For clarity on frontend
    });

  } catch (error) {
    console.error('Error fetching admin dashboard summary:', error);
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});

module.exports = router;