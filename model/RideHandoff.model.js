const mongoose = require("mongoose");

/**
 * Persists when a user opens a provider app from Farely (aggregator handoff).
 * Links to RideSearchLog when available; duplicates key route fields for reporting.
 */
const RideHandoffSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    searchLogId: { type: mongoose.Schema.Types.ObjectId, ref: "RideSearchLog", default: null, index: true },
    selectionLogId: { type: mongoose.Schema.Types.ObjectId, ref: "ProviderSelectionLog", default: null },

    pickup: { type: String, trim: true, default: "" },
    destination: { type: String, trim: true, default: "" },
    pickupCoords: {
      type: {
        latitude: Number,
        longitude: Number,
      },
      default: undefined,
    },
    destinationCoords: {
      type: {
        latitude: Number,
        longitude: Number,
      },
      default: undefined,
    },

    rideType: { type: String, default: "car" },
    carAc: { type: Boolean, default: false },

    provider: { type: String, required: true, trim: true },
    providerRideName: { type: String, default: "" },
    estimatedFare: { type: Number, default: null },

    redirectSucceeded: { type: Boolean, default: false },
    redirectMode: { type: String, default: "unknown" },
    failureReason: { type: String, default: "" },
    openedUrl: { type: String, default: "" },

    status: {
      type: String,
      enum: [
        "route_planned",
        "handoff_opened",
        "handoff_failed",
        "ride_confirmed",
        "ride_not_taken",
      ],
      default: "handoff_opened",
    },
    userConfirmedTaken: { type: Boolean, default: null },
    userConfirmedAt: { type: Date, default: null },

    /** Live fare from provider app (accessibility). Kept separate from estimatedFare. */
    capturedFare: { type: Number, default: null },
    capturedFareAt: { type: Date, default: null },
    capturedProvider: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RideHandoff", RideHandoffSchema);
