/**
 * Block-state helper shared by login and the auth middleware.
 *
 * The Farely Admin Console writes `blocked`, `blockedUntil`,
 * `blockedReason`, etc. directly to the users collection. We deliberately
 * compute the active-block state at read time so a temporary block
 * (blockedUntil in the future) auto-expires without any cron job.
 *
 * `blocked === true && blockedUntil === null`  → permanent
 * `blocked === true && blockedUntil > now()`   → temporary, still active
 * `blocked === true && blockedUntil <= now()`  → expired, treat as unblocked
 */
function isUserBlocked(user) {
  if (!user) return false;
  const b = user.blocked;
  const blockedFlag = b === true || b === 1 || String(b).toLowerCase() === "true";
  if (!blockedFlag) return false;
  if (!user.blockedUntil) return true;
  const until = new Date(user.blockedUntil).getTime();
  if (!Number.isFinite(until)) return true;
  return until > Date.now();
}

/**
 * Shape used for HTTP 403 ACCOUNT_BLOCKED responses. The mobile client
 * relies on this exact envelope to render the lock-out screen.
 */
function blockedResponseBody(user) {
  return {
    success: false,
    code: "ACCOUNT_BLOCKED",
    userId: user?._id ? String(user._id) : null,
    message:
      user?.blockedReason
        ? `Your account has been restricted: ${user.blockedReason}`
        : "Your account has been restricted by an administrator.",
    reason: user?.blockedReason || null,
    blockedAt: user?.blockedAt ? new Date(user.blockedAt).toISOString() : null,
    blockedUntil: user?.blockedUntil ? new Date(user.blockedUntil).toISOString() : null,
  };
}

module.exports = { isUserBlocked, blockedResponseBody };
