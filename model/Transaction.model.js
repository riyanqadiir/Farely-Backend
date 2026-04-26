const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // Idempotency key from client (prevents duplicates on retries/double taps)
    transactionId: { type: String, required: true, unique: true, index: true },

    // Optional: associate with simulated ride option / booking id
    rideId: { type: String, default: null, index: true },

    type: {
      type: String,
      enum: ["topup", "ride_payment"],
      required: true,
      index: true,
    },

    method: {
      type: String,
      enum: ["cash", "card", "wallet", "JazzCash"],
      required: true,
      index: true,
    },

    amount: { type: Number, required: true, min: 0 },

    // Any display metadata for receipts
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

// Prevent duplicate ride payments for the same ride per user (extra guard)
TransactionSchema.index(
  { userId: 1, rideId: 1, type: 1 },
  { unique: true, partialFilterExpression: { rideId: { $type: "string" }, type: "ride_payment" } }
);

module.exports = mongoose.model("Transaction", TransactionSchema);

