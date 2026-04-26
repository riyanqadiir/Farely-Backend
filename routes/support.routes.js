const express = require("express");
const { protect } = require("../middleware/auth.middleware");
const supportController = require("../controller/support.controller");

const router = express.Router();

router.use(protect);
router.post("/tickets", supportController.createTicket);

module.exports = router;
