const mongoose = require("mongoose");

const RideSearchLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    pickup: { type: String, trim: true, default: "" },
    destination: { type: String, trim: true, default: "" },
    pickupCoords: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    destinationCoords: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    rideType: { type: String, default: "car" },
    carAc: { type: Boolean, default: false },
    distanceKm: { type: Number, required: true },
    baseFare: { type: Number, required: true },
    perKmRate: { type: Number, default: null },
    estimateNotice: { type: String, default: "" },
    comparisons: [
      {
        provider: String,
        name: String,
        fare: Number,
        eta: String,
        estimateConfidence: Number,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("RideSearchLog", RideSearchLogSchema);
