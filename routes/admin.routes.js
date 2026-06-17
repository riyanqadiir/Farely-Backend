const express = require("express");
const adminController = require("../controller/admin.controller");
const { protect, requireAdmin } = require("../middleware/auth.middleware");

/**
 * IN_APP_ADMIN — `/admin` on this API (Farely “rider” backend).
 *
 * - Auth: mobile/rider JWT + `User.role === "admin"` (seeded ops accounts in the app DB).
 * - Scope: ride search logs, provider selection logs, legacy support tickets for debugging.
 *
 * FARELY_ADMIN_CONSOLE — separate Railway service + its own JWT (`farely-admin` repo).
 *
 * - Auth: `AdminUser` collection + `ADMIN_JWT_SECRET` (never the rider JWT).
 * - Scope: mobile user moderation (block / delete → writes `users` collection),
 *   traffic hotspots, support inbox, ingested ride snapshots, etc.
 *
 * The mobile app only talks to this server. Admin web talks to the admin API.
 * Both use the same Mongo URI / `users` collection for rider accounts.
 */
const router = express.Router();

router.use(protect, requireAdmin);

router.get("/searches", adminController.listSearchLogs);
router.get("/provider-selections", adminController.listProviderSelections);
router.get("/support-tickets", adminController.listSupportTickets);
router.patch("/support-tickets/:id", adminController.updateSupportTicket);

module.exports = router;
