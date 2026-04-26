const RideSearchLog = require("../model/RideSearchLog.model");
const ProviderSelectionLog = require("../model/ProviderSelectionLog.model");
const SupportTicket = require("../model/SupportTicket.model");

async function listSearchLogs(req, res, next) {
  try {
    const q = String(req.query.q || "").trim();
    const filter = q
      ? { $or: [{ pickup: { $regex: q, $options: "i" } }, { destination: { $regex: q, $options: "i" } }] }
      : {};
    const data = await RideSearchLog.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function listProviderSelections(req, res, next) {
  try {
    const provider = String(req.query.provider || "").trim();
    const filter = provider ? { provider } : {};
    const data = await ProviderSelectionLog.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function listSupportTickets(req, res, next) {
  try {
    const status = String(req.query.status || "").trim();
    const filter = status ? { status } : {};
    const data = await SupportTicket.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function updateSupportTicket(req, res, next) {
  try {
    const { id } = req.params;
    const { status, priority, notes, assignedAdminId } = req.body || {};
    const ticket = await SupportTicket.findByIdAndUpdate(
      id,
      {
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(typeof notes === "string" ? { notes } : {}),
        ...(assignedAdminId ? { assignedAdminId } : {}),
      },
      { new: true }
    ).lean();
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found." });
    }
    return res.json({ success: true, ticket });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listSearchLogs,
  listProviderSelections,
  listSupportTickets,
  updateSupportTicket,
};
