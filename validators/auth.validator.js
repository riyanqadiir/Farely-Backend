const { body } = require("express-validator");

const signup = [
  body("fullName")
    .trim()
    .notEmpty()
    .withMessage("Full name is required")
    .isLength({ max: 120 })
    .withMessage("Name cannot exceed 120 characters"),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Provide a valid email")
    .normalizeEmail(),
  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone number is required")
    .isLength({ min: 10, max: 15 })
    .withMessage("Phone must be 10–15 digits"),
  body("countryCode")
    .optional()
    .trim()
    .matches(/^\+\d{1,4}$/)
    .withMessage("Invalid country code (e.g. +92)"),
  body("gender")
    .optional()
    .trim()
    .isIn(["male", "female", "other", ""])
    .withMessage("Invalid gender"),
  body("otpChannel")
    .optional()
    .isIn(["phone", "email"])
    .withMessage("otpChannel must be phone or email"),
];

const verifyOtp = [
  body("identifier").trim().notEmpty().withMessage("Email or phone is required"),
  body("channel").isIn(["phone", "email"]).withMessage("Channel must be phone or email"),
  body("purpose").isIn(["signup", "forgot_password"]).withMessage("Invalid purpose"),
  body("otp")
    .trim()
    .notEmpty()
    .withMessage("OTP is required")
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be 6 digits")
    .isNumeric()
    .withMessage("OTP must be numeric"),
];

const setPassword = [
  body("identifier").trim().notEmpty().withMessage("Email or phone is required"),
  body("channel").isIn(["phone", "email"]).withMessage("Channel must be phone or email"),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("Password must contain uppercase, lowercase and number"),
  body("confirmPassword")
    .notEmpty()
    .withMessage("Confirm password is required")
    .custom((value, { req }) => value === req.body.password)
    .withMessage("Passwords do not match"),
];

const login = [
  body("loginId")
    .trim()
    .notEmpty()
    .withMessage("Email or phone is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

const forgotPassword = [
  body("channel").isIn(["phone", "email"]).withMessage("Channel must be phone or email"),
  body("identifier").trim().notEmpty().withMessage("Email or phone is required"),
];

const resetPassword = [
  body("identifier").trim().notEmpty().withMessage("Email or phone is required"),
  body("channel").isIn(["phone", "email"]).withMessage("Channel must be phone or email"),
  body("otp")
    .optional()
    .trim()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage("OTP must be 6 digits when provided"),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("Password must contain uppercase, lowercase and number"),
  body("confirmPassword")
    .notEmpty()
    .withMessage("Confirm password is required")
    .custom((value, { req }) => value === req.body.password)
    .withMessage("Passwords do not match"),
];

const resendOtp = [
  body("identifier").trim().notEmpty().withMessage("Email or phone is required"),
  body("channel").isIn(["phone", "email"]).withMessage("Channel must be phone or email"),
  body("purpose").isIn(["signup", "forgot_password"]).withMessage("Invalid purpose"),
];

/** Logged-in user only (Bearer token). Separate from forgot-password / reset-password. */
const changePassword = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  body("newPassword")
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters")
    .matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("New password must contain uppercase, lowercase and number")
    .custom((value, { req }) => String(value) !== String(req.body.currentPassword))
    .withMessage("New password must be different from your current password"),
  body("confirmNewPassword")
    .notEmpty()
    .withMessage("Confirm new password is required")
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage("New passwords do not match"),
];

module.exports = {
  signup,
  verifyOtp,
  setPassword,
  login,
  forgotPassword,
  resetPassword,
  resendOtp,
  changePassword,
};
