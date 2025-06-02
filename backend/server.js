// server.js

require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;

// Import routes
const productRoutes = require('./routes/productRoutes');
const userRoutes = require('./routes/userRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const orderRoutes = require('./routes/orderRoutes');
const paymentRoutes = require('./routes/paymentRoutes'); 
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware'); // Import error handling middleware
const { apiLimiter, authLimiter, passwordResetLimiter } = require('./middleware/rateLimitMiddleware'); // Import rate limit middleware

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB Atlas');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Access it at: http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    console.error(error);
    process.exit(1);
  }
);


// --- Middleware setup ---


// CORS Middleware - Configure this properly for production!
// For development, you can use: app.use(cors()); // Allows all origins
// For production, specify your frontend's origin:
const allowedOrigins = [
    'http://localhost:3000', // Your frontend development server
    'http://localhost:5173', // Another common frontend development port (e.g., Vite default)
    // Add your actual production frontend domain here when you deploy!
    // 'https://your-frontend-app.com'
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // Allowed HTTP methods
    credentials: true, // Allow cookies and authorization headers to be sent
    optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
}));

// For the Stripe webhook, we need the raw body, so we use a separate middleware.
// This MUST come BEFORE express.json() for the webhook to work correctly.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// Middleware to parse JSON bodies
// IMPORTANT: For webhook, you might need a different parser BEFORE app.use(express.json())
// For now, this is fine, but remember for webhooks.
app.use(express.json());

// --- Apply Rate Limiters ---
// Apply general API limiter to all API routes (except special cases below)
app.use('/api/', apiLimiter); // Apply to all /api/ routes first
app.post('/api/users/login', authLimiter);
app.post('/api/users/register', authLimiter);
// If you have a forgot password route, apply passwordResetLimiter
// app.post('/api/users/forgot-password', passwordResetLimiter); // Uncomment if you add this route

// Basic route
app.get('/', (req, res) => {
  res.send('Welcome to the Supermarket Delivery Backend!');
});

// Use routes
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes); 
app.use('/api/admin', adminDashboardRoutes); 

// --- Error Handling Middleware (MUST BE PLACED AFTER ALL ROUTES) ---
// Catches any requests to routes that don't exist
app.use(notFound);
// Catches and handles all other errors that occur in the application
app.use(errorHandler);