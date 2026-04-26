const mongoose = require("mongoose");

const SupportTicketSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    category: { type: String, enum: ["ride", "redirect", "account", "payment", "other"], default: "other" },
    status: { type: String, enum: ["open", "in_progress", "resolved"], default: "open", index: true },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium", index: true },
    assignedAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SupportTicket", SupportTicketSchema);
