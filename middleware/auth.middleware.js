const jwt = require("jsonwebtoken");
const User = require("../model/User.model");
const { isUserBlocked, blockedResponseBody } = require("../utility/userBlock");

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
      // Admin hard-deleted this account: surfaced to the mobile client
      // so it can clear the JWT and show the "no longer available" screen.
      return res.status(401).json({
        success: false,
        code: "USER_NOT_FOUND",
        userId: decoded.user?.id ? String(decoded.user.id) : null,
        message: "Your account is no longer available. Please sign up again or contact support.",
      });
    }
    if (isUserBlocked(user)) {
      // Block can be applied AFTER the JWT was issued. We honor it on every
      // request so a stale token never outlives the admin's decision.
      return res.status(403).json(blockedResponseBody(user));
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
    // For optional-auth routes we silently ignore blocked or missing
    // users (they fall through as anonymous). Hard enforcement happens
    // in `protect` for any route that actually needs the identity.
    if (user && !isUserBlocked(user)) {
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
