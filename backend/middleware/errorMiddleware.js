// backend/middleware/errorMiddleware.js

// Middleware for handling 404 Not Found errors
const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error); // Pass the error to the next error-handling middleware
};

// General error handling middleware
const errorHandler = (err, req, res, next) => {
    let statusCode = res.statusCode === 200 ? 500 : res.statusCode; // If status is 200 (default), set to 500 for error
    let message = err.message;

    // Handle Mongoose Bad ObjectId (CastError)
    if (err.name === 'CastError' && err.kind === 'ObjectId') {
        statusCode = 404;
        message = 'Resource not found';
    }

    // Handle Mongoose Validation Error
    if (err.name === 'ValidationError') {
        statusCode = 400;
        // Collect all validation messages
        message = Object.values(err.errors).map(val => val.message).join(', ');
    }

    // Handle Mongoose Duplicate Key Error (e.g., unique email, product name, category name)
    if (err.code === 11000) {
        statusCode = 400;
        // Extract the duplicated field name from the error message
        const field = Object.keys(err.keyValue)[0];
        message = `Duplicate field value: '${err.keyValue[field]}'. A ${field} with that value already exists.`;
    }

    res.status(statusCode).json({
        message: message,
        // Only include stack trace in development for debugging
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};

module.exports = { notFound, errorHandler };