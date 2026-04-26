const SupportTicket = require("../model/SupportTicket.model");
const { emitOutboxEvent } = require("../services/outbox.service");

async function createTicket(req, res, next) {
  try {
    const { subject, description, category, priority } = req.body || {};
    if (!subject || !description) {
      return res.status(400).json({ success: false, message: "subject and description are required." });
    }
    const ticket = await SupportTicket.create({
      userId: req.userId,
      subject,
      description,
      category: category || "other",
      priority: priority || "medium",
    });
    await emitOutboxEvent("support.thread.created", ticket._id, {
      id: String(ticket._id),
      userId: String(req.userId),
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      customerEmail: req.user?.email || null,
      customerName: req.user?.fullName || null,
      createdAt: ticket.createdAt,
    });
    return res.status(201).json({ success: true, ticket });
  } catch (err) {
    next(err);
  }
}

module.exports = { createTicket };
