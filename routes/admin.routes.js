const express = require("express");
const adminController = require("../controller/admin.controller");
const { protect, requireAdmin } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect, requireAdmin);

router.get("/searches", adminController.listSearchLogs);
router.get("/provider-selections", adminController.listProviderSelections);
router.get("/support-tickets", adminController.listSupportTickets);
router.patch("/support-tickets/:id", adminController.updateSupportTicket);

module.exports = router;
