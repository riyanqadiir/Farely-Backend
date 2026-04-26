const mongoose = require("mongoose");

const FeedbackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    stars: { type: Number, required: true, min: 1, max: 5 },
    appExperience: { type: String, trim: true, maxlength: 4000, default: "" },
    timeSavingNote: { type: String, trim: true, maxlength: 4000, default: "" },
    source: { type: String, required: true, trim: true, index: true },
    handoffId: { type: String, default: null, index: true },
    provider: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Feedback", FeedbackSchema);
