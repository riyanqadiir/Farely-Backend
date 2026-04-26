const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const feedbackController = require("../controller/feedback.controller");

router.use(protect);
router.post("/", feedbackController.submit);

module.exports = router;
