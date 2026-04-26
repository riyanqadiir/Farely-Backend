const jwt = require("jsonwebtoken");
const User = require("../model/User.model");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

if (!JWT_SECRET && process.env.NODE_ENV !== "test") {
  console.warn("JWT_SECRET is not set. Auth will fail.");
}

/**
 * Generate JWT for user (id + role).
 */
function signToken(payload, expiresIn = JWT_EXPIRES_IN) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * Verify JWT and attach user to req. Use for protected routes.
 */
async function protect(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Not authorized. Token missing." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.user?.id).select("+password").lean();
    if (!user) {
      return res.status(401).json({ success: false, message: "User no longer exists." });
    }
    req.user = user;
    req.userId = user._id.toString();
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Token expired. Please log in again." });
    }
    return res.status(401).json({ success: false, message: "Invalid token." });
  }
}

/**
 * Optional auth: attach user if token present, do not reject if missing.
 */
async function optionalAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.user?.id).lean();
    if (user) {
      req.user = user;
      req.userId = user._id.toString();
    }
  } catch (_) {}
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Not authorized." });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required." });
  }
  return next();
}

module.exports = {
  signToken,
  protect,
  optionalAuth,
  requireAdmin,
};
