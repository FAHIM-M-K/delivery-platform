// backend/models/Order.js

const mongoose = require('mongoose');

// Define the schema for individual items within an order
const orderItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quantity: { type: Number, required: true, default: 1 }, // Changed from 'qty' to 'quantity' and added default: 1
  image: { type: String, required: false }, // Image URL of the product at time of order
  price: { type: Number, required: true }, // Price at time of order
  product: { // Reference to the actual Product document
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Product', // Refers to the Product model
  },
});

// Define the main Order schema
const orderSchema = new mongoose.Schema(
  {
    user: { // Reference to the User who placed the order
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User', // Refers to the User model
    },
    orderItems: [orderItemSchema], // Array of order items using the schema defined above
    shippingAddress: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
      phone: { type: String, required: true } // RESTORED: phone field
    },
    paymentMethod: {
      type: String,
      required: true,
    },
    paymentResult: { // Details from payment gateway (e.g., PayPal, Stripe)
      id: { type: String },
      status: { type: String },
      update_time: { type: String },
      email_address: { type: String },
    },
    taxPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    shippingPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    totalPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    isPaid: {
      type: Boolean,
      required: true,
      default: false,
    },
    paidAt: {
      type: Date,
    },
    isDelivered: {
      type: Boolean,
      required: true,
      default: false,
    },
    deliveredAt: {
      type: Date,
    },
    // Order status for delivery agents/admin
    orderStatus: {
      type: String,
      enum: ['Pending', 'Processing', 'Out for Delivery', 'Delivered', 'Cancelled'],
      default: 'Pending',
    },
    // Optional: For delivery agent assignment
    deliveryAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Reference to a user with 'delivery-agent' role
      default: null
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;