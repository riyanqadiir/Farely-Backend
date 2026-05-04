const rideSimulationService = require("../service/rideSimulation.service");
const pakistanFuelService = require("../service/pakistanFuel.service");
const RideSearchLog = require("../model/RideSearchLog.model");
const ProviderSelectionLog = require("../model/ProviderSelectionLog.model");
const RideHandoff = require("../model/RideHandoff.model");
const { emitOutboxEvent } = require("../services/outbox.service");

const SERVICE_AREA = {
  // Pakistan bounding box (coarse service area guardrail).
  minLat: 23.5,
  maxLat: 37.2,
  minLng: 60.8,
  maxLng: 77.9,
};
// Approximate Pakistan polygon (clockwise). Used after bbox check to avoid accepting nearby foreign points.
const PAKISTAN_POLYGON = [
  { latitude: 24.0, longitude: 61.0 },
  { latitude: 25.3, longitude: 61.2 },
  { latitude: 26.5, longitude: 61.5 },
  { latitude: 28.0, longitude: 62.0 },
  { latitude: 29.5, longitude: 62.0 },
  { latitude: 31.0, longitude: 63.0 },
  { latitude: 32.5, longitude: 63.8 },
  { latitude: 34.0, longitude: 65.2 },
  { latitude: 35.5, longitude: 66.8 },
  { latitude: 36.8, longitude: 69.5 },
  { latitude: 36.7, longitude: 72.0 },
  { latitude: 35.3, longitude: 73.8 },
  { latitude: 34.0, longitude: 74.9 },
  { latitude: 31.2, longitude: 74.6 },
  { latitude: 29.0, longitude: 71.8 },
  { latitude: 27.5, longitude: 69.5 },
  { latitude: 25.8, longitude: 67.8 },
  { latitude: 24.8, longitude: 66.6 },
  { latitude: 24.2, longitude: 64.5 },
  { latitude: 24.0, longitude: 61.0 },
];
const MIN_TRIP_KM = 0.3;
const MAX_TRIP_KM = 250;

function parseCarAcFlag(carAc) {
  return carAc === true || carAc === "true" || carAc === 1 || carAc === "1";
}

/** AC option only applies when ride type is car. */
function effectiveCarAc(rideType, carAcFlag) {
  const rt = String(rideType || "car").trim().toLowerCase();
  return rt === "car" && Boolean(carAcFlag);
}

function toFiniteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function inServiceArea({ latitude, longitude }) {
  const inBbox = (
    latitude >= SERVICE_AREA.minLat
    && latitude <= SERVICE_AREA.maxLat
    && longitude >= SERVICE_AREA.minLng
    && longitude <= SERVICE_AREA.maxLng
  );
  if (!inBbox) return false;

  // Ray-casting point-in-polygon test.
  let inside = false;
  for (let i = 0, j = PAKISTAN_POLYGON.length - 1; i < PAKISTAN_POLYGON.length; j = i++) {
    const yi = PAKISTAN_POLYGON[i].latitude;
    const xi = PAKISTAN_POLYGON[i].longitude;
    const yj = PAKISTAN_POLYGON[j].latitude;
    const xj = PAKISTAN_POLYGON[j].longitude;
    const intersect =
      yi > latitude !== yj > latitude
      && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function parseAndValidateCoords({ pickupLat, pickupLng, destinationLat, destinationLng }) {
  const pLat = toFiniteNumber(pickupLat);
  const pLng = toFiniteNumber(pickupLng);
  const dLat = toFiniteNumber(destinationLat);
  const dLng = toFiniteNumber(destinationLng);

  if (pLat == null || pLng == null || dLat == null || dLng == null) {
    const err = new Error("Pickup and destination coordinates are required.");
    err.statusCode = 400;
    throw err;
  }
  if (
    pLat < -90 || pLat > 90 || dLat < -90 || dLat > 90
    || pLng < -180 || pLng > 180 || dLng < -180 || dLng > 180
  ) {
    const err = new Error("Invalid map coordinates. Please select valid locations.");
    err.statusCode = 400;
    throw err;
  }

  const pickupCoords = { latitude: pLat, longitude: pLng };
  const destinationCoords = { latitude: dLat, longitude: dLng };

  if (!inServiceArea(pickupCoords) || !inServiceArea(destinationCoords)) {
    const err = new Error("This route is outside our current service area (Pakistan).");
    err.statusCode = 400;
    throw err;
  }

  const distanceKm = haversineKm(pLat, pLng, dLat, dLng);
  if (distanceKm < MIN_TRIP_KM) {
    const err = new Error("Pickup and destination are too close. Please choose a longer route.");
    err.statusCode = 400;
    throw err;
  }
  if (distanceKm > MAX_TRIP_KM) {
    const err = new Error("Route is too long for in-city ride comparison. Please choose a shorter trip.");
    err.statusCode = 400;
    throw err;
  }

  return { pickupCoords, destinationCoords };
}

async function compare(req, res, next) {
  try {
    const {
      pickup,
      destination,
      pickupLat,
      pickupLng,
      destinationLat,
      destinationLng,
      rideType,
      carAc,
      rideId,
      action,
    } = req.body || {};

    const carAcEffective = effectiveCarAc(rideType, parseCarAcFlag(carAc));

    const isBookMode = Boolean(rideId) || action === "book";
    if (isBookMode) {
      const data = rideSimulationService.bookRide(rideId);
      return res.json(data);
    }

    const { pickupCoords, destinationCoords } = parseAndValidateCoords({
      pickupLat,
      pickupLng,
      destinationLat,
      destinationLng,
    });

    const { liveCalibration } = req.body || {};

    const fuelSnap = await pakistanFuelService.getPakistanFuelSnapshot();
    const data = rideSimulationService.findRides({
      pickup,
      destination,
      pickupCoords,
      destinationCoords,
      rideType,
      carAc: carAcEffective,
      liveCalibration,
      fuelMultiplier: fuelSnap.fuelMultiplierForRides,
      fuelPricingSource: fuelSnap.source,
    });
    data.pakistanFuel = {
      petrolPkrPerL: fuelSnap.petrolPkrPerL,
      dieselPkrPerL: fuelSnap.dieselPkrPerL,
      source: fuelSnap.source,
      effectiveFrom: fuelSnap.effectiveFrom,
      fuelMultiplierForRides: fuelSnap.fuelMultiplierForRides,
      baselinePetrolPkrUsed: fuelSnap.baselinePetrolPkrUsed,
      fetchedAt: fuelSnap.fetchedAt,
    };
    const searchLog = await RideSearchLog.create({
      userId: req.userId,
      pickup,
      destination,
      pickupCoords,
      destinationCoords,
      rideType: data.rideType,
      carAc: Boolean(data.carAc),
      distanceKm: data.distanceKm,
      baseFare: data.baseFare,
      perKmRate: data.perKmRate,
      estimateNotice: data.estimateNotice || "",
      comparisons: (data.comparisons || []).map((item) => ({
        provider: item.provider,
        name: item.name,
        fare: item.fare,
        eta: item.eta,
        estimateConfidence: item.estimateConfidence,
      })),
    });
    await emitOutboxEvent("ride.search.created", searchLog._id, {
      id: String(searchLog._id),
      userId: String(req.userId),
      pickup,
      destination,
      pickupCoords,
      destinationCoords,
      rideType: data.rideType,
      carAc: Boolean(data.carAc),
      createdAt: searchLog.createdAt,
    });
    data.searchLogId = searchLog._id;
    return res.json(data);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ msg: err.message });
    }
    next(err);
  }
}

async function estimateMin(req, res, next) {
  try {
    const {
      pickupLat,
      pickupLng,
      destinationLat,
      destinationLng,
      rideType,
      carAc,
      liveCalibration,
    } = req.body || {};

    const carAcEffective = effectiveCarAc(rideType, parseCarAcFlag(carAc));

    const { pickupCoords, destinationCoords } = parseAndValidateCoords({
      pickupLat,
      pickupLng,
      destinationLat,
      destinationLng,
    });

    const data = rideSimulationService.estimateMinFare({
      pickupCoords,
      destinationCoords,
      rideType,
      carAc: carAcEffective,
      liveCalibration,
    });
    return res.json(data);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ msg: err.message });
    }
    next(err);
  }
}

async function logProviderSelection(req, res, next) {
  try {
    const {
      searchLogId,
      provider,
      rideType,
      carAc,
      estimatedFare,
      redirectAttempted,
      redirectSucceeded,
      redirectMode,
      failureReason,
    } = req.body || {};

    const carAcEffective = effectiveCarAc(rideType || "car", parseCarAcFlag(carAc));

    if (!provider) {
      return res.status(400).json({ msg: "provider is required" });
    }

    const created = await ProviderSelectionLog.create({
      userId: req.userId,
      searchLogId: searchLogId || null,
      provider,
      rideType: rideType || "car",
      carAc: carAcEffective,
      estimatedFare: typeof estimatedFare === "number" ? estimatedFare : null,
      redirectAttempted: Boolean(redirectAttempted),
      redirectSucceeded: Boolean(redirectSucceeded),
      redirectMode: redirectMode || "unknown",
      failureReason: failureReason || "",
    });
    await emitOutboxEvent("ride.provider_selection.created", created._id, {
      id: String(created._id),
      userId: String(req.userId),
      searchLogId: created.searchLogId ? String(created.searchLogId) : null,
      provider: created.provider,
      rideType: created.rideType,
      carAc: created.carAc,
      estimatedFare: created.estimatedFare,
      redirectAttempted: created.redirectAttempted,
      redirectSucceeded: created.redirectSucceeded,
      createdAt: created.createdAt,
    });

    return res.status(201).json({ success: true, id: created._id });
  } catch (err) {
    next(err);
  }
}

async function recordRideHandoff(req, res, next) {
  try {
    const {
      searchLogId,
      selectionLogId,
      pickup,
      destination,
      pickupCoords,
      destinationCoords,
      rideType,
      carAc,
      provider,
      providerRideName,
      estimatedFare,
      redirectSucceeded,
      redirectMode,
      failureReason,
      openedUrl,
    } = req.body || {};

    const carAcEffective = effectiveCarAc(rideType || "car", parseCarAcFlag(carAc));

    if (!provider || typeof provider !== "string") {
      return res.status(400).json({ msg: "provider is required" });
    }

    const doc = await RideHandoff.create({
      userId: req.userId,
      searchLogId: searchLogId || null,
      selectionLogId: selectionLogId || null,
      pickup: pickup || "",
      destination: destination || "",
      ...(pickupCoords && typeof pickupCoords.latitude === "number"
        && typeof pickupCoords.longitude === "number"
        ? { pickupCoords }
        : {}),
      ...(destinationCoords && typeof destinationCoords.latitude === "number"
        && typeof destinationCoords.longitude === "number"
        ? { destinationCoords }
        : {}),
      rideType: rideType || "car",
      carAc: carAcEffective,
      provider: provider.trim(),
      providerRideName: providerRideName || "",
      estimatedFare: typeof estimatedFare === "number" ? estimatedFare : null,
      redirectSucceeded: Boolean(redirectSucceeded),
      redirectMode: redirectMode || "unknown",
      failureReason: failureReason || "",
      openedUrl: typeof openedUrl === "string" ? openedUrl.slice(0, 2000) : "",
      status: redirectSucceeded ? "handoff_opened" : "handoff_failed",
    });
    await emitOutboxEvent("ride.handoff.created", doc._id, {
      id: String(doc._id),
      userId: String(req.userId),
      provider: doc.provider,
      rideType: doc.rideType,
      pickup: doc.pickup,
      destination: doc.destination,
      pickupCoords: doc.pickupCoords || null,
      destinationCoords: doc.destinationCoords || null,
      estimatedFare: doc.estimatedFare,
      status: doc.status,
      redirectSucceeded: doc.redirectSucceeded,
      createdAt: doc.createdAt,
      city: "Lahore",
    });

    return res.status(201).json({ success: true, id: doc._id });
  } catch (err) {
    next(err);
  }
}

async function confirmRideHandoff(req, res, next) {
  try {
    const { handoffId, taken } = req.body || {};
    if (!handoffId) {
      return res.status(400).json({ msg: "handoffId is required" });
    }
    if (typeof taken !== "boolean") {
      return res.status(400).json({ msg: "taken must be boolean" });
    }

    const handoff = await RideHandoff.findOne({ _id: handoffId, userId: req.userId });
    if (!handoff) {
      return res.status(404).json({ msg: "Ride handoff not found" });
    }

    handoff.userConfirmedTaken = taken;
    handoff.userConfirmedAt = new Date();
    handoff.status = taken ? "ride_confirmed" : "ride_not_taken";
    await handoff.save();
    await emitOutboxEvent(taken ? "ride.handoff.confirmed" : "ride.handoff.rejected", handoff._id, {
      id: String(handoff._id),
      userId: String(req.userId),
      provider: handoff.provider,
      rideType: handoff.rideType,
      pickup: handoff.pickup,
      destination: handoff.destination,
      pickupCoords: handoff.pickupCoords || null,
      destinationCoords: handoff.destinationCoords || null,
      estimatedFare: handoff.estimatedFare,
      status: handoff.status,
      redirectSucceeded: handoff.redirectSucceeded,
      userConfirmedAt: handoff.userConfirmedAt,
      createdAt: handoff.createdAt,
      city: "Lahore",
    });

    return res.json({ success: true, id: handoff._id, status: handoff.status });
  } catch (err) {
    next(err);
  }
}

async function listRideHistory(req, res, next) {
  try {
    const docs = await RideHandoff.find({
      userId: req.userId,
      status: "ride_confirmed",
      userConfirmedTaken: true,
    })
      .sort({ userConfirmedAt: -1, createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({ success: true, rides: docs });
  } catch (err) {
    next(err);
  }
}

async function pakistanFuel(req, res, next) {
  try {
    const snap = await pakistanFuelService.getPakistanFuelSnapshot();
    return res.json({
      success: true,
      petrolPkrPerL: snap.petrolPkrPerL,
      dieselPkrPerL: snap.dieselPkrPerL,
      effectiveFrom: snap.effectiveFrom,
      source: snap.source,
      fuelMultiplierForRides: snap.fuelMultiplierForRides,
      baselinePetrolPkrUsed: snap.baselinePetrolPkrUsed,
      fetchedAt: snap.fetchedAt,
      note:
        'Official OGRA publishes fortnightly prices on ogra.org.pk; there is no stable public JSON API. '
        + 'Set PAK_PETROL_PKR after each OGRA notification, or PAK_FUEL_JSON_URL to your own JSON feed, for exact figures.',
    });
  } catch (err) {
    next(err);
  }
}

async function listPendingRideReviews(req, res, next) {
  try {
    const docs = await RideHandoff.find({
      userId: req.userId,
      redirectSucceeded: true,
      status: "handoff_opened",
      userConfirmedTaken: null,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({ success: true, rides: docs });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  compare,
  estimateMin,
  pakistanFuel,
  logProviderSelection,
  recordRideHandoff,
  confirmRideHandoff,
  listRideHistory,
  listPendingRideReviews,
};

