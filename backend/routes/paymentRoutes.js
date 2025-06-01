// backend/routes/paymentRoutes.js

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Order = require('../models/Order');
const Product = require('../models/Product'); // Import Product model
const { protect } = require('../middleware/authMiddleware');

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
      currency: 'usd',
      metadata: { integration_check: 'accept_a_payment', order_id: order._id.toString() },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
    });

  } catch (error) {
    console.error('[CREATE PI ERROR] Error creating payment intent:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});


// Stripe Webhook Endpoint
// POST /api/payments/webhook
router.post('/webhook', async (req, res) => {
  const rawBody = req.body;
  const signature = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log(`[WEBHOOK] Event received: ${event.type} for PI: ${event.data.object.id}`);
  } catch (err) {
    console.error(`[WEBHOOK ERROR] Signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log(`[WEBHOOK] PaymentIntent ${paymentIntent.id} succeeded for amount ${paymentIntent.amount}!`);

      const orderId = paymentIntent.metadata.order_id;
      console.log(`[WEBHOOK] Attempting to find Order with ID from metadata: ${orderId}`);

      if (!orderId) {
        console.warn(`[WEBHOOK WARN] payment_intent.succeeded received, but no order_id in metadata for PI: ${paymentIntent.id}.`);
        return res.status(400).send('No order ID in metadata for processing');
      }

      try {
        const session = await Order.startSession(); // Start a session for transaction
        session.startTransaction();

        try {
            const order = await Order.findById(orderId).session(session); // Use session for finding order

            if (!order) {
                console.warn(`[WEBHOOK WARN] Order with ID ${orderId} not found in DB for PI: ${paymentIntent.id}.`);
                await session.abortTransaction();
                session.endSession();
                return res.status(404).send('Order not found');
            }

            if (order.isPaid) {
                console.log(`[WEBHOOK] Order ${orderId} already marked as paid. No update needed.`);
                await session.abortTransaction(); // Still abort the transaction if nothing changed
                session.endSession();
                return res.json({ received: true });
            }

            // Update the order status in your database
            order.isPaid = true;
            order.paidAt = new Date(paymentIntent.created * 1000);
            order.paymentResult = {
                id: paymentIntent.id,
                status: paymentIntent.status,
                update_time: new Date(paymentIntent.created * 1000),
                email_address: paymentIntent.receipt_email ||
                                (paymentIntent.charges?.data && paymentIntent.charges.data.length > 0 ? paymentIntent.charges.data[0].billing_details?.email : undefined) ||
                                'N/A'
            };
            order.orderStatus = 'Processing'; // Optionally move to Processing after payment success

            // --- CRUCIAL: STOCK REDUCTION ---
            for (const item of order.orderItems) {
                const product = await Product.findById(item.product).session(session); // Find product within the transaction

                if (product) {
                    if (product.stockQuantity < item.quantity) {
                        // This case *should* ideally not happen if initial check in order creation is strong,
                        // but good to have a fallback.
                        console.error(`[WEBHOOK ERROR] Insufficient stock for product ${product.name} (ID: ${product._id}) during webhook stock reduction for Order ${orderId}. Requested: ${item.quantity}, Available: ${product.stockQuantity}`);
                        // You might want to handle this more robustly (e.g., alert admin, mark order as problematic)
                        await session.abortTransaction(); // Abort the whole transaction if stock is now insufficient
                        session.endSession();
                        return res.status(409).send(`Conflict: Insufficient stock for ${product.name}`);
                    }
                    product.stockQuantity -= item.quantity;
                    await product.save({ session }); // Save product changes within the transaction
                    console.log(`[WEBHOOK] Reduced stock for ${product.name}. New stock: ${product.stockQuantity}`);
                } else {
                    console.warn(`[WEBHOOK WARN] Product with ID ${item.product} not found during stock reduction for Order ${orderId}.`);
                }
            }
            // --- END STOCK REDUCTION ---

            await order.save({ session }); // Save order changes within the transaction
            await session.commitTransaction(); // Commit all changes if successful
            session.endSession();

            console.log(`[WEBHOOK SUCCESS] Order ${orderId} successfully updated to paid and Processing, and product stock reduced.`);

        } catch (transactionError) {
            await session.abortTransaction(); // Rollback all changes on error
            session.endSession();
            console.error(`[WEBHOOK DB ERROR] Transaction failed for order ${orderId}:`, transactionError);
            return res.status(500).send('Database transaction failed during webhook processing');
        }

      } catch (dbError) { // Catch for session start errors
        console.error(`[WEBHOOK DB ERROR] Failed to update order ${orderId} or start transaction:`, dbError);
        return res.status(500).send('Database operation failed');
      }
      break;

    case 'payment_intent.payment_failed':
      const paymentIntentFailed = event.data.object;
      console.log(`PaymentIntent ${paymentIntentFailed.id} failed: ${paymentIntentFailed.last_payment_error?.message}`);
      // TODO: Implement logic for failed payments (e.g., notify user, log, update order status to 'Failed')
      break;

    default:
      console.log(`[WEBHOOK INFO] Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;