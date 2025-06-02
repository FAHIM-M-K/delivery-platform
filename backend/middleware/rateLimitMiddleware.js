// backend/middleware/rateLimitMiddleware.js

const rateLimit = require('express-rate-limit');

// General API rate limiter (e.g., for most GET requests, general Browse)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        message: 'Too many requests from this IP, please try again after 15 minutes',
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false,  // Disable the `X-RateLimit-*` headers
});

// Stricter rate limiter for authentication routes (login, register)
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Limit each IP to 5 requests per hour (for login/register attempts)
    message: {
        message: 'Too many authentication attempts from this IP, please try again after an hour',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter rate limiter for password reset requests (prevents spamming password reset emails)
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Limit each IP to 3 password reset requests per hour
    message: {
        message: 'Too many password reset requests from this IP, please try again after an hour',
    },
    standardHeaders: true,
    legacyHeaders: false,
});


module.exports = {
    apiLimiter,
    authLimiter,
    passwordResetLimiter
};