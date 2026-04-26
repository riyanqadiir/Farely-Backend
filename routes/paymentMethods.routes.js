const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const controller = require("../controller/paymentMethods.controller");

router.use(protect);
router.get("/", controller.listPaymentMethods);
router.post("/", controller.addPaymentMethod);
router.patch("/:id", controller.updatePaymentMethod);
router.delete("/:id", controller.removePaymentMethod);

module.exports = router;
