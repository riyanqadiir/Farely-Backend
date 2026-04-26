const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const walletController = require("../controller/wallet.controller");

router.get("/balance", protect, walletController.getBalance);
router.get("/history", protect, walletController.getHistory);
router.post("/topup", protect, walletController.topup);

// Ride payment recording (idempotent; prevents duplicates)
router.post("/pay", protect, walletController.payRide);

module.exports = router;

