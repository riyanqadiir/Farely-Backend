const User = require("../model/User.model");
const OtpVerification = require("../model/OtpVerification.model");
const otpService = require("../services/otp.service");
const emailService = require("../services/email.service");
const smsService = require("../services/sms.service");
const { signToken } = require("../middleware/auth.middleware");
const { OAuth2Client } = require("google-auth-library");

// Support Android, iOS, and Web client: token audience can be any of these
const googleAudiences = [
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_WEB_CLIENT_ID,
].filter(Boolean);
const hasGoogleAuth = googleAudiences.length > 0;
const isTwilioVerifyEnabled = process.env.ENABLE_TWILIO_VERIFY === "true";
const isPhoneOtpEnabled = process.env.ENABLE_PHONE_OTP === "true";

const PASSWORD_RESET_COOLDOWN_HOURS = 24;

function normalizeIdentifier(val, channel) {
  const s = String(val).trim();
  return channel === "email" ? s.toLowerCase() : s;
}

function fullPhone(phone, countryCode) {
  const p = phone.replace(/\D/g, "");
  const cc = (countryCode || "+92").replace(/\D/g, "");
  return (cc ? "+" + cc : "") + p;
}

function phoneOtpDisabled(channel, res) {
  if (channel !== "phone" || isPhoneOtpEnabled) return false;
  res.status(400).json({
    success: false,
    message: "Phone OTP is disabled right now. Please use email verification.",
  });
  return true;
}

/**
 * POST /auth/signup
 * Body: fullName, email, phone, countryCode?, gender?
 * Creates pending user (or finds by email/phone), sends OTP. Frontend then calls verify-otp then set-password.
 */
async function signup(req, res, next) {
  try {
    const { fullName, email, phone, countryCode, gender } = req.body;
    const emailNorm = email.trim().toLowerCase();
    const phoneNorm = fullPhone(phone, countryCode);

    let user = await User.findOne({ $or: [{ email: emailNorm }, { phone: phoneNorm }] });
    if (user) {
      if (user.password) {
        return res.status(400).json({
          success: false,
          message: "An account with this email or phone already exists. Please log in.",
        });
      }
      user.fullName = fullName;
      user.gender = gender || user.gender;
      user.phone = phoneNorm;
      user.countryCode = countryCode || user.countryCode;
      user.email = emailNorm;
      await user.save();
    } else {
      user = await User.create({
        fullName,
        email: emailNorm,
        phone: phoneNorm,
        countryCode: countryCode || "+92",
        gender: gender || "",
        emailVerified: false,
        phoneVerified: false,
      });
    }

    const channel = "email";
    const identifier = emailNorm;
    const useTwilioVerify =
      channel === "phone" &&
      isTwilioVerifyEnabled &&
      process.env.TWILIO_VERIFY_SERVICE_SID &&
      !process.env.TWILIO_PHONE_NUMBER;

    if (channel === "email") {
      const { otp, record } = await otpService.createOrResendOtp({
        identifier,
        channel,
        purpose: "signup",
      });
      await emailService.sendOtpEmail(identifier, otp, "signup");
    } else if (useTwilioVerify) {
      await otpService.createOrResendOtpForTwilioVerify({
        identifier,
        purpose: "signup",
      });
      await smsService.startVerifySms(identifier);
    } else {
      const { otp, record } = await otpService.createOrResendOtp({
        identifier,
        channel,
        purpose: "signup",
      });
      await smsService.sendOtpSms(identifier, otp);
    }

    res.status(200).json({
      success: true,
      message: "OTP sent. Verify to continue.",
      tempUserId: user._id.toString(),
      channel,
      identifier: channel === "email" ? undefined : undefined,
      retryAfter: otpService.RESEND_COOLDOWN_SECONDS,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        retryAfter: err.retryAfter,
      });
    }
    next(err);
  }
}

/**
 * POST /auth/resend-otp
 */
async function resendOtp(req, res, next) {
  try {
    const { identifier, channel, purpose } = req.body;
    if (phoneOtpDisabled(channel, res)) return;
    const normalizedId = normalizeIdentifier(identifier, channel);
    const useTwilioVerify =
      channel === "phone" &&
      isTwilioVerifyEnabled &&
      process.env.TWILIO_VERIFY_SERVICE_SID &&
      !process.env.TWILIO_PHONE_NUMBER;

    if (channel === "email") {
      const { otp, record } = await otpService.createOrResendOtp({
        identifier: normalizedId,
        channel,
        purpose,
      });
      await emailService.sendOtpEmail(normalizedId, otp, purpose);
    } else if (useTwilioVerify) {
      await otpService.createOrResendOtpForTwilioVerify({
        identifier: normalizedId,
        purpose,
      });
      await smsService.startVerifySms(normalizedId);
    } else {
      const { otp, record } = await otpService.createOrResendOtp({
        identifier: normalizedId,
        channel,
        purpose,
      });
      await smsService.sendOtpSms(normalizedId, otp);
    }

    res.status(200).json({
      success: true,
      message: "OTP resent.",
      retryAfter: otpService.RESEND_COOLDOWN_SECONDS,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        retryAfter: err.retryAfter,
      });
    }
    next(err);
  }
}

/**
 * POST /auth/verify-otp
 * Body: identifier, channel, purpose, otp
 * For signup: marks OTP verified. Frontend redirects to set-password with same identifier/channel.
 */
async function verifyOtp(req, res, next) {
  try {
    const { identifier, channel, purpose, otp } = req.body;
    if (phoneOtpDisabled(channel, res)) return;
    const normalizedId = normalizeIdentifier(identifier, channel);

    if (channel === "phone" && isTwilioVerifyEnabled && process.env.TWILIO_VERIFY_SERVICE_SID) {
      const OtpVerification = require("../model/OtpVerification.model");
      const record = await OtpVerification.findOne({
        identifier: normalizedId,
        channel: "phone",
        purpose,
        verified: false,
      }).sort({ createdAt: -1 });

      if (record && record.twilioVerify) {
        const { status } = await smsService.checkVerifySms(normalizedId, String(otp).trim());
        if (status === "approved") {
          record.verified = true;
          record.verifiedAt = new Date();
          await record.save();
          return res.status(200).json({
            success: true,
            message: "OTP verified.",
            identifier: normalizedId,
            channel,
            purpose,
          });
        }
        return res.status(400).json({ success: false, message: "Invalid or expired OTP." });
      }
    }

    await otpService.verifyOtp({
      identifier: normalizedId,
      channel,
      purpose,
      otp,
    });

    res.status(200).json({
      success: true,
      message: "OTP verified.",
      identifier: normalizedId,
      channel,
      purpose,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
}

/**
 * POST /auth/set-password
 * Body: identifier, channel, password, confirmPassword
 * After signup OTP verified: set password and mark email/phone verified, then login.
 */
async function setPassword(req, res, next) {
  try {
    const { identifier, channel, password } = req.body;
    if (phoneOtpDisabled(channel, res)) return;
    const normalizedId = normalizeIdentifier(identifier, channel);

    const otpRecord = await OtpVerification.findOne({
      identifier: normalizedId,
      channel,
      purpose: "signup",
      verified: true,
    }).sort({ verifiedAt: -1 });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "Please complete OTP verification first.",
      });
    }

    const query = channel === "email" ? { email: normalizedId } : { phone: normalizedId };
    const user = await User.findOne(query).select("+password");
    if (!user) {
      return res.status(400).json({ success: false, message: "User not found." });
    }

    user.password = password;
    if (channel === "email") user.emailVerified = true;
    else user.phoneVerified = true;
    user.passwordChangedAt = new Date();
    await user.save();

    const token = signToken({ user: { id: user._id.toString(), role: user.role } });
    res.status(200).json({
      success: true,
      message: "Password set. You are now signed in.",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/login
 * Body: loginId (email or phone), password
 */
async function login(req, res, next) {
  try {
    const { loginId, password } = req.body;
    const id = loginId.trim().toLowerCase();
    const user = await User.findOne({
      $or: [{ email: id }, { phone: id.replace(/\s/g, "") }],
    }).select("+password");

    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: "Invalid email/phone or password." });
    }

    const bcrypt = require("bcryptjs");
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: "Invalid email/phone or password." });
    }

    const token = signToken({ user: { id: user._id.toString(), role: user.role } });
    const u = user.toJSON ? user.toJSON() : user;
    delete u.password;
    res.status(200).json({ success: true, token, user: u });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/google
 * Body: idToken (from Google Sign-In)
 */
async function googleAuth(req, res, next) {
  try {
    if (!hasGoogleAuth) {
      return res.status(503).json({ success: false, message: "Google Sign-In is not configured." });
    }
    const { idToken } = req.body;
    const ticket = await new (require("google-auth-library").OAuth2Client)().verifyIdToken({
      idToken,
      audience: googleAudiences,
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = (payload.email || "").toLowerCase();
    const name = payload.name || payload.given_name || "";

    let user = await User.findOne({ googleId });
    if (!user) {
      user = await User.findOne({ email });
      if (user) {
        user.googleId = googleId;
        user.fullName = user.fullName || name;
        user.emailVerified = true;
        await user.save();
      } else {
        user = await User.create({
          googleId,
          email,
          fullName: name,
          emailVerified: true,
          phoneVerified: false,
        });
      }
    }

    const token = signToken({ user: { id: user._id.toString(), role: user.role } });
    const u = user.toJSON ? user.toJSON() : user;
    res.status(200).json({ success: true, token, user: u });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    next(err);
  }
}

/**
 * POST /auth/forgot-password
 * Body: channel (phone | email), identifier
 * Sends OTP. Frontend then calls verify-forgot-password-otp then reset-password.
 */
async function forgotPassword(req, res, next) {
  try {
    const { channel, identifier } = req.body;
    if (phoneOtpDisabled(channel, res)) return;
    const normalizedId = normalizeIdentifier(identifier, channel);

    const user = await User.findOne(
      channel === "email" ? { email: normalizedId } : { phone: normalizedId }
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this " + (channel === "email" ? "email" : "phone number") + ".",
      });
    }

    const lastReset = user.passwordResetRequestedAt || user.lastPasswordResetAt;
    if (lastReset) {
      const hoursSince = (Date.now() - new Date(lastReset).getTime()) / (1000 * 60 * 60);
      if (hoursSince < PASSWORD_RESET_COOLDOWN_HOURS) {
        return res.status(429).json({
          success: false,
          message: `You can request a password reset again in ${Math.ceil(PASSWORD_RESET_COOLDOWN_HOURS - hoursSince)} hours.`,
          retryAfter: Math.ceil((PASSWORD_RESET_COOLDOWN_HOURS - hoursSince) * 3600),
        });
      }
    }

    const useTwilioVerify =
      channel === "phone" &&
      isTwilioVerifyEnabled &&
      process.env.TWILIO_VERIFY_SERVICE_SID &&
      !process.env.TWILIO_PHONE_NUMBER;

    if (channel === "email") {
      const { otp } = await otpService.createOrResendOtp({
        identifier: normalizedId,
        channel,
        purpose: "forgot_password",
      });
      await emailService.sendOtpEmail(normalizedId, otp, "forgot_password");
    } else if (useTwilioVerify) {
      await otpService.createOrResendOtpForTwilioVerify({
        identifier: normalizedId,
        purpose: "forgot_password",
      });
      await smsService.startVerifySms(normalizedId);
    } else {
      const { otp } = await otpService.createOrResendOtp({
        identifier: normalizedId,
        channel,
        purpose: "forgot_password",
      });
      await smsService.sendOtpSms(normalizedId, otp);
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { passwordResetRequestedAt: new Date() } }
    );

    res.status(200).json({
      success: true,
      message: "Verification code sent.",
      channel,
      retryAfter: otpService.RESEND_COOLDOWN_SECONDS,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        retryAfter: err.retryAfter,
      });
    }
    next(err);
  }
}

/**
 * POST /auth/verify-forgot-password-otp
 * Same as verify-otp with purpose forgot_password. Frontend then shows set-new-password form.
 */
async function verifyForgotPasswordOtp(req, res, next) {
  return verifyOtp(req, res, next);
}

const RESET_PASSWORD_VERIFIED_WINDOW_MINUTES = 15;

/**
 * POST /auth/reset-password
 * Body: identifier, channel, password, confirmPassword [, otp ]
 * If otp provided: verify it then reset. If not: require a recently verified forgot_password OTP for this identifier.
 */
async function resetPassword(req, res, next) {
  try {
    const { identifier, channel, otp, password } = req.body;
    if (phoneOtpDisabled(channel, res)) return;
    const normalizedId = normalizeIdentifier(identifier, channel);

    if (otp) {
      await otpService.verifyOtp({
        identifier: normalizedId,
        channel,
        purpose: "forgot_password",
        otp,
      });
    } else {
      const since = new Date(Date.now() - RESET_PASSWORD_VERIFIED_WINDOW_MINUTES * 60 * 1000);
      const verifiedRecord = await OtpVerification.findOne({
        identifier: normalizedId,
        channel,
        purpose: "forgot_password",
        verified: true,
        verifiedAt: { $gte: since },
      });
      if (!verifiedRecord) {
        return res.status(400).json({
          success: false,
          message: "Please verify your code first (or enter OTP again).",
        });
      }
    }

    const query = channel === "email" ? { email: normalizedId } : { phone: normalizedId };
    const user = await User.findOne(query).select("+password");
    if (!user) {
      return res.status(400).json({ success: false, message: "User not found." });
    }

    user.password = password;
    user.passwordChangedAt = new Date();
    user.lastPasswordResetAt = new Date();
    user.passwordResetRequestedAt = null;
    await user.save();

    if (user.email && channel === "email") {
      await emailService.sendTransactionalEmail(
        user.email,
        "Password changed",
        "<p>Your Farely password was changed successfully. If you did not do this, contact support.</p>"
      );
    }

    const token = signToken({ user: { id: user._id.toString(), role: user.role } });
    const u = user.toJSON ? user.toJSON() : user;
    delete u.password;
    res.status(200).json({
      success: true,
      message: "Password reset successfully.",
      token,
      user: u,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
}

/**
 * POST /auth/change-password (requires Bearer token)
 * Body: currentPassword, newPassword, confirmNewPassword
 * For users who already have a password. Not the same as forgot-password → reset-password (OTP flow).
 */
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.userId).select("+password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message:
          "This account has no password (e.g. Google-only). Use Forgot password on the login screen to set a password first.",
      });
    }

    const bcrypt = require("bcryptjs");
    const match = await bcrypt.compare(String(currentPassword), user.password);
    if (!match) {
      return res.status(400).json({ success: false, message: "Current password is incorrect." });
    }

    const sameAsOld = await bcrypt.compare(String(newPassword), user.password);
    if (sameAsOld) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from your current password.",
      });
    }

    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    const token = signToken({ user: { id: user._id.toString(), role: user.role } });
    const u = user.toJSON ? user.toJSON() : user;
    delete u.password;
    res.status(200).json({
      success: true,
      message: "Password changed successfully.",
      token,
      user: u,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  signup,
  resendOtp,
  verifyOtp,
  setPassword,
  login,
  googleAuth,
  forgotPassword,
  verifyForgotPasswordOtp,
  resetPassword,
  changePassword,
};
