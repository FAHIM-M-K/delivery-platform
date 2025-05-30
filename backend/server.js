// server.js

require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const mongoose = require('mongoose'); // Import mongoose
const app = express();
const PORT = process.env.PORT || 5000; // Get PORT from .env or default to 5000

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
    process.exit(1); // Exit process with failure
  });

// Middleware to parse JSON bodies from incoming requests
app.use(express.json());

// Basic route: Home page
app.get('/', (req, res) => {
  res.send('Welcome to the Supermarket Delivery Backend!');
});

// Example API route: Get all products (dummy data for now, will connect to DB later)
app.get('/api/products', (req, res) => {
  const products = [
    { id: 1, name: 'Apple', price: 1.50, category: 'Fresh Food' },
    { id: 2, name: 'Milk', price: 3.00, category: 'Dairy & Eggs' },
  ];
  res.json(products);
});

// We will add more routes and models here later