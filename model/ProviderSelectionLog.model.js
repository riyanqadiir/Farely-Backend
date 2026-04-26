const mongoose = require("mongoose");

const ProviderSelectionLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    searchLogId: { type: mongoose.Schema.Types.ObjectId, ref: "RideSearchLog", default: null, index: true },
    provider: { type: String, required: true, trim: true },
    rideType: { type: String, default: "car" },
    carAc: { type: Boolean, default: false },
    estimatedFare: { type: Number, default: null },
    redirectAttempted: { type: Boolean, default: false },
    redirectSucceeded: { type: Boolean, default: false },
    redirectMode: { type: String, enum: ["deep_link", "fallback_url", "store", "unknown"], default: "unknown" },
    failureReason: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProviderSelectionLog", ProviderSelectionLogSchema);
