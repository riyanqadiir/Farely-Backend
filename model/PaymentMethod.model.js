const mongoose = require("mongoose");

const PaymentMethodSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, trim: true, default: "Card" },
    brand: { type: String, trim: true, default: "visa" },
    last4: { type: String, trim: true, default: "0000" },
    expMonth: { type: String, trim: true, default: "12" },
    expYear: { type: String, trim: true, default: "30" },
    stripePaymentMethodId: { type: String, required: true, index: true },
    isDefault: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

PaymentMethodSchema.index({ userId: 1, stripePaymentMethodId: 1 }, { unique: true });

module.exports = mongoose.model("PaymentMethod", PaymentMethodSchema);
