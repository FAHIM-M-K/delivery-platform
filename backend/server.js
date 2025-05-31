// server.js

require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const mongoose = require('mongoose'); // Import mongoose
const app = express();
const PORT = process.env.PORT || 5000; // Define the port, use environment variable or default to 5000

// Import product routes
// Make sure this path is correct relative to server.js
// If your productRoutes.js is in 'backend/routes/productRoutes.js'
// and server.js is in 'backend/server.js', then '../routes/productRoutes' is correct.
const productRoutes = require('./routes/productRoutes'); // <--- Ensure this path is correct!
const userRoutes = require('./routes/userRoutes');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB Atlas');
    // Start the server ONLY after successful database connection
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Access it at: http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    // Log the full error object for more detail in debugging
    console.error(error);
    process.exit(1); // Exit process with failure
  });

// Middleware to parse JSON bodies from incoming requests
// This is crucial for POST/PUT requests to read req.body
app.use(express.json()); // <--- IMPORTANT: This must be before any routes that expect JSON body

// Basic route: Home page
app.get('/', (req, res) => {
  res.send('Welcome to the Supermarket Delivery Backend!');
});

// Use product routes
// All routes defined in productRoutes.js will be prefixed with /api/products
app.use('/api/products', productRoutes); // <--- This line is likely the source of the error if productRoutes is not a function
app.use('/api/users', userRoutes); 
