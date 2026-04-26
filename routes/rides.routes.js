const express = require("express");
const router = express.Router();
const ridesController = require("../controller/rides.controller");
const { protect } = require("../middleware/auth.middleware");

// Require auth like other protected resources.
router.use(protect);

// POST /rides/compare
router.post("/compare", ridesController.compare);

// POST /rides/estimate-min — minimum base fare for coords + ride type (no bookings)
router.post("/estimate-min", ridesController.estimateMin);
router.post("/provider-selection", ridesController.logProviderSelection);
router.post("/ride-handoff", ridesController.recordRideHandoff);
router.post("/ride-handoff/confirm", ridesController.confirmRideHandoff);
router.get("/history", ridesController.listRideHistory);
router.get("/pending-reviews", ridesController.listPendingRideReviews);

module.exports = router;

