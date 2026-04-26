const express = require("express");
const router = express.Router();
const authController = require("../controller/auth.controller");
const validate = require("../middleware/validate.middleware").validate;
const authValidators = require("../validators/auth.validator");
const { protect } = require("../middleware/auth.middleware");

router.post("/signup", authValidators.signup, validate, authController.signup);
router.post("/resend-otp", authValidators.resendOtp, validate, authController.resendOtp);
router.post("/verify-otp", authValidators.verifyOtp, validate, authController.verifyOtp);
router.post("/set-password", authValidators.setPassword, validate, authController.setPassword);
router.post("/login", authValidators.login, validate, authController.login);
router.post("/google", authValidators.googleIdToken, validate, authController.googleAuth);
router.post("/forgot-password", authValidators.forgotPassword, validate, authController.forgotPassword);
router.post(
  "/verify-forgot-password-otp",
  authValidators.verifyOtp,
  validate,
  authController.verifyForgotPasswordOtp
);
router.post("/reset-password", authValidators.resetPassword, validate, authController.resetPassword);
router.post(
  "/change-password",
  protect,
  authValidators.changePassword,
  validate,
  authController.changePassword
);

module.exports = router;
