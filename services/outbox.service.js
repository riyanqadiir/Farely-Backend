const crypto = require("crypto");
const EventOutbox = require("../model/EventOutbox.model");

function makeEventId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function emitOutboxEvent(eventType, entityId, payload) {
  try {
    await EventOutbox.create({
      eventId: makeEventId(),
      eventType,
      entityId: String(entityId),
      occurredAt: new Date().toISOString(),
      version: 1,
      payload: payload || {},
    });
  } catch (err) {
    // Outbox should not block user-facing API paths in this phase.
    console.error("[outbox] emit failed:", err && err.message ? err.message : err);
  }
}

module.exports = { emitOutboxEvent };
