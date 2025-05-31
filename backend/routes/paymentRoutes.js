// routes/paymentRoutes.js

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Initialize Stripe with your secret key
const Order = require('../models/Order'); // To fetch order details
const { protect } = require('../middleware/authMiddleware'); // For protected routes

// 1. Create Payment Intent
// POST /api/payments/create-payment-intent
// This route is called by the frontend when a user wants to pay for an order.
router.post('/create-payment-intent', protect, async (req, res) => {
  const { orderId } = req.body;

  try {
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // IMPORTANT: Verify the user owns the order before creating payment intent
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to pay for this order' });
    }

    // IMPORTANT: Only create payment intent for unpaid orders
    if (order.isPaid) {
      return res.status(400).json({ message: 'Order has already been paid for' });
    }

    // Stripe requires amount in cents/lowest common denominator (e.g., 100 for $1.00)
    const amountInCents = Math.round(order.totalPrice * 100);

    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd', // Or 'aed' for UAE Dirham if you set up your Stripe account for it
      metadata: { integration_check: 'accept_a_payment', order_id: order._id.toString() },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
    });

  } catch (error) {
    console.error('Error creating payment intent:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});

// --- FUTURE: Webhook Endpoint (Concept, not fully implemented here yet) ---
// Stripe will send events to this endpoint when payment status changes (e.g., succeeded, failed).
// This is crucial for updating your order's 'isPaid' status reliably.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    // In a real application, you'd verify the Stripe signature here for security.
    // const sig = req.headers['stripe-signature'];
    // let event;
    // try {
    //   event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    // } catch (err) {
    //   console.log(`Webhook Error: ${err.message}`);
    //   return res.status(400).send(`Webhook Error: ${err.message}`);
    // }

    // Handle the event
    // switch (event.type) {
    //   case 'payment_intent.succeeded':
    //     const paymentIntent = event.data.object;
    //     console.log(`PaymentIntent for ${paymentIntent.amount} was successful!`);
    //     // Then update your order in the database
    //     const orderId = paymentIntent.metadata.order_id;
    //     await Order.findByIdAndUpdate(orderId, {
    //       isPaid: true,
    //       paidAt: Date.now(),
    //       paymentResult: {
    //         id: paymentIntent.id,
    //         status: paymentIntent.status,
    //         update_time: Date.now(), // Use current timestamp
    //         email_address: paymentIntent.receipt_email || 'N/A'
    //       }
    //     });
    //     break;
    //   case 'payment_intent.payment_failed':
    //     const paymentIntentFailed = event.data.object;
    //     console.log(`PaymentIntent failed: ${paymentIntentFailed.last_payment_error?.message}`);
    //     // Handle failed payment (e.g., notify customer, log)
    //     break;
    //   // ... handle other event types
    //   default:
    //     console.log(`Unhandled event type ${event.type}`);
    // }

    // Return a 200 response to acknowledge receipt of the event
    res.json({ received: true });
});


module.exports = router;