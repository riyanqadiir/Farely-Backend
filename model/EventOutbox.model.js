const mongoose = require("mongoose");

const EventOutboxSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    occurredAt: { type: String, required: true, index: true },
    version: { type: Number, default: 1, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    processedAt: { type: String, default: null, index: true },
    attemptCount: { type: Number, default: 0 },
    lastError: { type: String, default: null },
  },
  { timestamps: true, collection: "eventoutboxes" }
);

module.exports = mongoose.model("EventOutbox", EventOutboxSchema);
