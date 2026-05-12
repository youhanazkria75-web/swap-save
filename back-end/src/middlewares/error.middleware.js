const logger = require("../config/logger");

// Global Error Handler
exports.errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const requestId = req.requestId;

  logger.error(`[${requestId}] ${err.message}`, { stack: err.stack });

  return res.status(statusCode).json({
    success: false,
    requestId,
    message: err.message || "Server error",
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
};

// 404 Handler
exports.notFound = (req, res, next) => {
  const requestId = req.requestId;
  const message = `Route not found: ${req.method} ${req.originalUrl}`;

  logger.warn(`[${requestId}] ${message}`);

  return res.status(404).json({
    success: false,
    requestId,
    message,
  });
};