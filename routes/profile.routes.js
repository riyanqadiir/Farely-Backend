const express = require("express");
const router = express.Router();
const profileController = require("../controller/profile.controller");
const { protect } = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware").validate;
const profileValidators = require("../validators/profile.validator");

router.use(protect);

router.get("/", profileController.getProfile);
router.put("/", profileValidators.updateProfile, validate, profileController.updateProfile);
router.post("/heartbeat", profileController.heartbeat);
router.post("/photo", profileController.uploadPhoto);

module.exports = router;
