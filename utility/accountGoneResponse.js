/**
 * Valid JWT but user row was hard-deleted (e.g. Farely Admin Console).
 * Shape must stay in sync with `protect` in auth.middleware.js and mobile `farelyApi`.
 */
function respondAccountNoLongerAvailable(res, userId = null) {
  return res.status(401).json({
    success: false,
    code: "USER_NOT_FOUND",
    userId: userId != null ? String(userId) : null,
    message: "Your account is no longer available. Please sign up again or contact support.",
  });
}

module.exports = { respondAccountNoLongerAvailable };
