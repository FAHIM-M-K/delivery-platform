// backend/utils/generateToken.js
// Purpose: This file creates and signs JSON Web Tokens (JWTs) for user authentication.

const jwt = require('jsonwebtoken'); // Import the jsonwebtoken library

/**
 * Generates a JSON Web Token (JWT) for a user.
 * This token is used to authenticate the user on subsequent requests.
 *
 * @param {string} id - The MongoDB ObjectId of the user.
 * @param {string} role - The role of the user (e.g., 'customer', 'admin').
 * @returns {string} The signed JWT.
 */
const generateToken = (id, role) => {
  // jwt.sign() creates the token
  // First argument: payload (data to store in the token, e.g., user ID and role)
  // Second argument: secret key (used to sign the token securely, from .env)
  // Third argument: options (e.g., expiration time)
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '30d', // The token will expire after 30 days
  });
};

// Export the generateToken function so it can be imported and used by other files
module.exports = generateToken;