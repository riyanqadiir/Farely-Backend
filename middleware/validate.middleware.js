const { validationResult } = require("express-validator");

/**
 * Middleware to run express-validator and return 400 with errors if validation fails.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const extracted = errors.array().map((err) => ({
      field: err.path || err.param,
      message: err.msg,
    }));
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: extracted,
    });
  }
  next();
}

module.exports = { validate };
