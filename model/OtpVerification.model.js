const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const OTP_EXPIRY_MINUTES = 10;
const MAX_RESEND_COUNT = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const LOCKOUT_MINUTES_AFTER_MAX_RESEND = 60;

const OtpVerificationSchema = new mongoose.Schema(
  {
    identifier: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    channel: {
      type: String,
      enum: ["phone", "email"],
      required: true,
    },
    purpose: {
      type: String,
      enum: ["signup", "forgot_password"],
      required: true,
    },
    otpHash: { type: String, required: false }, // not set when using Twilio Verify
    twilioVerify: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
    resendCount: { type: Number, default: 0 },
    lastResendAt: { type: Date, default: null },
    maxResend: { type: Number, default: MAX_RESEND_COUNT },
    cooldownSeconds: { type: Number, default: RESEND_COOLDOWN_SECONDS },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

OtpVerificationSchema.index({ identifier: 1, purpose: 1, channel: 1 });
OtpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL optional

OtpVerificationSchema.statics.OTP_EXPIRY_MINUTES = OTP_EXPIRY_MINUTES;
OtpVerificationSchema.statics.MAX_RESEND_COUNT = MAX_RESEND_COUNT;
OtpVerificationSchema.statics.RESEND_COOLDOWN_SECONDS = RESEND_COOLDOWN_SECONDS;
OtpVerificationSchema.statics.LOCKOUT_MINUTES_AFTER_MAX_RESEND = LOCKOUT_MINUTES_AFTER_MAX_RESEND;

module.exports = mongoose.model("OtpVerification", OtpVerificationSchema);
