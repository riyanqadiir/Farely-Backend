const Feedback = require("../model/Feedback.model");
const { emitOutboxEvent } = require("../services/outbox.service");

async function submit(req, res, next) {
  try {
    const { stars, appExperience, timeSavingNote, source, handoffId, provider } = req.body || {};
    const s = Number(stars);
    if (!Number.isFinite(s) || s < 1 || s > 5) {
      return res.status(400).json({ success: false, message: "stars must be between 1 and 5." });
    }
    const exp = String(appExperience || "").trim();
    const timeNote = String(timeSavingNote || "").trim();
    if (exp.length < 3) {
      return res.status(400).json({ success: false, message: "Please describe your app experience (at least a few words)." });
    }
    if (timeNote.length < 3) {
      return res.status(400).json({ success: false, message: "Please tell us how Farely helped or saved you time." });
    }
    const src = String(source || "app").trim().slice(0, 64) || "app";
    const doc = await Feedback.create({
      userId: req.userId,
      stars: s,
      appExperience: exp,
      timeSavingNote: timeNote,
      source: src,
      handoffId: handoffId ? String(handoffId) : null,
      provider: provider ? String(provider).trim() : null,
    });
    await emitOutboxEvent("feedback.submitted", doc._id, {
      id: String(doc._id),
      userId: String(req.userId),
      stars: doc.stars,
      appExperience: doc.appExperience,
      timeSavingNote: doc.timeSavingNote,
      source: doc.source,
      handoffId: doc.handoffId,
      provider: doc.provider,
      createdAt: doc.createdAt,
    });
    return res.status(201).json({
      success: true,
      feedback: {
        id: String(doc._id),
        stars: doc.stars,
        createdAt: doc.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { submit };
