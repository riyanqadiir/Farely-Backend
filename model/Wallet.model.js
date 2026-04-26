const mongoose = require("mongoose");

// Keep a simple wallet doc per user (optional), while User.walletBalance is still the source of truth.
const WalletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    balance: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Wallet", WalletSchema);

