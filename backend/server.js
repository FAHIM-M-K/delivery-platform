// server.js

const express = require('express'); // Import the express library
const app = express(); // Create an instance of the express application
const PORT = process.env.PORT || 5000; // Define the port, use environment variable or default to 5000

// Middleware to parse JSON bodies from incoming requests
// This is important for handling data sent from the front-end (e.g., product details)
app.use(express.json());

// Basic route: Home page
app.get('/', (req, res) => {
  res.send('Welcome to the Supermarket Delivery Backend!');
});

// Example API route: Get all products (dummy data for now)
app.get('/api/products', (req, res) => {
  const products = [
    { id: 1, name: 'Apple', price: 1.50, category: 'Fresh Food' },
    { id: 2, name: 'Milk', price: 3.00, category: 'Dairy & Eggs' },
  ];
  res.json(products); // Send JSON response
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access it at: http://localhost:${PORT}`);
});