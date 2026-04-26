/**
 * Central error handler. Attach as last middleware.
 */
function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;
  const message = err.message || "Internal Server Error";

  if (process.env.NODE_ENV === "development") {
    console.error(err);
    return res.status(status).json({
      success: false,
      message,
      stack: err.stack,
    });
  }

  res.status(status).json({
    success: false,
    message: status === 500 ? "Internal Server Error" : message,
  });
}

module.exports = { errorHandler };
