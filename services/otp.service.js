const bcrypt = require("bcryptjs");
const OtpVerification = require("../model/OtpVerification.model");

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_RESEND = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const LOCKOUT_MINUTES = 60;

function generateNumericOtp(length = OTP_LENGTH) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

async function hashOtp(otp) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(otp, salt);
}

async function compareOtp(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * Create or update OTP record. Returns { otp, record } or throws.
 */
async function createOrResendOtp({ identifier, channel, purpose }) {
  const normalizedId = channel === "email" ? identifier.trim().toLowerCase() : identifier.trim();
  let record = await OtpVerification.findOne({
    identifier: normalizedId,
    channel,
    purpose,
    verified: false,
  }).sort({ createdAt: -1 });

  const now = new Date();
  const cooldownMs = RESEND_COOLDOWN_SECONDS * 1000;
  const lockoutMs = LOCKOUT_MINUTES * 60 * 1000;

  if (record) {
    if (record.lockedUntil && record.lockedUntil > now) {
      const err = new Error("Too many attempts. Try again later.");
      err.statusCode = 429;
      err.retryAfter = Math.ceil((record.lockedUntil - now) / 1000);
      throw err;
    }
    if (record.resendCount >= MAX_RESEND) {
      record.lockedUntil = new Date(now.getTime() + lockoutMs);
      record.resendCount = 0;
      await record.save();
      const err = new Error("Max resend limit reached. Try again later.");
      err.statusCode = 429;
      err.retryAfter = Math.ceil(lockoutMs / 1000);
      throw err;
    }
    const lastResend = record.lastResendAt || record.createdAt;
    if (lastResend && now - lastResend < cooldownMs) {
      const err = new Error("Please wait before requesting another OTP.");
      err.statusCode = 429;
      err.retryAfter = RESEND_COOLDOWN_SECONDS - Math.floor((now - lastResend) / 1000);
      throw err;
    }
  }

  const otp = generateNumericOtp();
  const otpHash = await hashOtp(otp);
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

  if (record) {
    record.otpHash = otpHash;
    record.expiresAt = expiresAt;
    record.resendCount += 1;
    record.lastResendAt = now;
    record.lockedUntil = null;
    await record.save();
  } else {
    record = await OtpVerification.create({
      identifier: normalizedId,
      channel,
      purpose,
      otpHash,
      expiresAt,
      resendCount: 1,
      lastResendAt: now,
    });
  }

  return { otp, record };
}

/**
 * Create/update a "pending" record for Twilio Verify flow (no OTP stored; Twilio sends & checks).
 * Same cooldown/lockout rules. Returns { record }.
 */
async function createOrResendOtpForTwilioVerify({ identifier, purpose }) {
  const channel = "phone";
  const normalizedId = identifier.trim();
  let record = await OtpVerification.findOne({
    identifier: normalizedId,
    channel,
    purpose,
    verified: false,
  }).sort({ createdAt: -1 });

  const now = new Date();
  const cooldownMs = RESEND_COOLDOWN_SECONDS * 1000;
  const lockoutMs = LOCKOUT_MINUTES * 60 * 1000;

  if (record) {
    if (record.lockedUntil && record.lockedUntil > now) {
      const err = new Error("Too many attempts. Try again later.");
      err.statusCode = 429;
      err.retryAfter = Math.ceil((record.lockedUntil - now) / 1000);
      throw err;
    }
    if (record.resendCount >= MAX_RESEND) {
      record.lockedUntil = new Date(now.getTime() + lockoutMs);
      record.resendCount = 0;
      await record.save();
      const err = new Error("Max resend limit reached. Try again later.");
      err.statusCode = 429;
      err.retryAfter = Math.ceil(lockoutMs / 1000);
      throw err;
    }
    const lastResend = record.lastResendAt || record.createdAt;
    if (lastResend && now - lastResend < cooldownMs) {
      const err = new Error("Please wait before requesting another OTP.");
      err.statusCode = 429;
      err.retryAfter = RESEND_COOLDOWN_SECONDS - Math.floor((now - lastResend) / 1000);
      throw err;
    }
  }

  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

  if (record) {
    record.expiresAt = expiresAt;
    record.resendCount += 1;
    record.lastResendAt = now;
    record.lockedUntil = null;
    await record.save();
  } else {
    record = await OtpVerification.create({
      identifier: normalizedId,
      channel,
      purpose,
      twilioVerify: true,
      expiresAt,
      resendCount: 1,
      lastResendAt: now,
    });
  }

  return { record };
}

/**
 * Verify OTP. Returns the OtpVerification record if valid; throws otherwise.
 * For twilioVerify records, caller (auth) must use smsService.checkVerifySms and then mark verified.
 */
async function verifyOtp({ identifier, channel, purpose, otp }) {
  const normalizedId = channel === "email" ? identifier.trim().toLowerCase() : identifier.trim();
  const record = await OtpVerification.findOne({
    identifier: normalizedId,
    channel,
    purpose,
    verified: false,
  }).sort({ createdAt: -1 });

  if (!record) {
    const err = new Error("Invalid or expired OTP.");
    err.statusCode = 400;
    throw err;
  }
  if (record.lockedUntil && record.lockedUntil > new Date()) {
    const err = new Error("Too many attempts. Try again later.");
    err.statusCode = 429;
    throw err;
  }
  if (record.expiresAt < new Date()) {
    const err = new Error("OTP has expired.");
    err.statusCode = 400;
    throw err;
  }

  if (record.twilioVerify) {
    const err = new Error("Use Twilio Verify check in auth layer.");
    err.statusCode = 400;
    throw err;
  }

  const valid = await compareOtp(String(otp).trim(), record.otpHash);
  if (!valid) {
    const err = new Error("Invalid OTP.");
    err.statusCode = 400;
    throw err;
  }

  record.verified = true;
  record.verifiedAt = new Date();
  await record.save();
  return record;
}

module.exports = {
  generateNumericOtp,
  createOrResendOtp,
  createOrResendOtpForTwilioVerify,
  verifyOtp,
  OTP_EXPIRY_MINUTES,
  MAX_RESEND,
  RESEND_COOLDOWN_SECONDS,
  LOCKOUT_MINUTES,
};
