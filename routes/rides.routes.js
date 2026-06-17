const express = require("express");
const router = express.Router();
const ridesController = require("../controller/rides.controller");
const { protect } = require("../middleware/auth.middleware");

// Require auth like other protected resources.
router.use(protect);

// POST /rides/compare
router.post("/compare", ridesController.compare);

// GET /rides/pakistan-fuel — OGRA-linked petrol/diesel snapshot + ride fuel multiplier (cached)
router.get("/pakistan-fuel", ridesController.pakistanFuel);

// POST /rides/estimate-min — minimum base fare for coords + ride type (no bookings)
router.post("/estimate-min", ridesController.estimateMin);
router.post("/provider-selection", ridesController.logProviderSelection);
router.post("/ride-handoff/plan-route", ridesController.planRideRoute);
router.post("/ride-handoff", ridesController.recordRideHandoff);
router.patch("/ride-handoff/:handoffId/capture", ridesController.updateHandoffCapture);
router.post("/ride-handoff/confirm", ridesController.confirmRideHandoff);
router.get("/history", ridesController.listRideHistory);
router.get("/pending-reviews", ridesController.listPendingRideReviews);

// GET /rides/traffic-hotspots — live Google-traffic surge per predefined zone.
// Mirrors the admin endpoint so the same tiers drive both surfaces.
router.get("/traffic-hotspots", ridesController.listTrafficHotspots);

module.exports = router;

