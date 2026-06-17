// Aggregator estimation service (no provider API integration).
// Produces explainable fare estimates using distance and provider coefficients.

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

/**
 * Pakistani city grids force ride-share routes ~20-30% longer than great-circle
 * (one-ways, canal/ringroad detours). Scale haversine for fare math only;
 * ETA stays on raw haversine to avoid double-inflating travel time.
 */
const URBAN_DISTANCE_FACTOR = 1.25;

function urbanRoadKm(haversine) {
  return haversine * URBAN_DISTANCE_FACTOR;
}

function calcEtaMinutes(distanceKm, avgSpeedKmh = 28) {
  const minutes = (distanceKm / avgSpeedKmh) * 60;
  return Math.max(1, Math.round(minutes));
}

/**
 * Heuristic PK urban ride costs (no official APIs).
 * Calibrated against captured Yango / Bykea Lahore fares mid-2026:
 *   Bykea Car (no-AC) ≈ Rs.801 for 14.76 km; Yango Comfort ≈ Rs.686.
 * Provider tilts + Pakistan POL multiplier (~1.09 at petrol Rs.399.86/L)
 * sit on top, so the per-km rates here are deliberately ~22% lower than
 * the live captured PKR/km to leave room for those multipliers.
 */
const RIDE_TYPE_BASE = {
  bike: { baseFare: 75, perKmRate: 24 },
  rickshaw: { baseFare: 95, perKmRate: 28 },
  car: { baseFare: 90, perKmRate: 38 },
  /** Car with AC — meaningful uplift vs no-AC car bucket (typical PK provider gap). */
  car_ac: { baseFare: 110, perKmRate: 46 },
  premium: { baseFare: 140, perKmRate: 60 },
};

/**
 * Default fuel factor when live POL snapshot is not applied (see pakistanFuel.service).
 * Kept modest so estimates track in-app quotes; raise via env / fuel service when POL spikes.
 */
const FUEL_SURCHARGE_MULTIPLIER = 1.03;

const PROVIDER_CONFIG = {
  /** Yango: lighter fleet (e.g. Alto). Tilt close to but below Bykea. */
  Yango: {
    baseAdd: 8,
    etaMultiplier: 1.0,
    confidence: 0.78,
    priceTilt: 0.95,
  },
  /** Bykea: heavier local fleet (e.g. Wagon R). Higher tilt; min spread vs Yango enforced below. */
  Bykea: {
    baseAdd: 18,
    etaMultiplier: 1.02,
    confidence: 0.75,
    priceTilt: 1.12,
  },
};

/** Bykea must read higher than Yango on the same route (PK market), even if scrapes round the same. */
const MIN_BYKEA_VS_YANGO_RATIO = 1.15;

function enforceYangoBykeaFareSpread(comparisons) {
  if (!Array.isArray(comparisons)) return comparisons;
  const out = comparisons.map((c) => ({ ...c }));
  const yi = out.findIndex((c) => c.provider === 'Yango');
  const bi = out.findIndex((c) => c.provider === 'Bykea');
  if (yi < 0 || bi < 0) return out;
  const yFare = Number(out[yi].fare);
  const bFare = Number(out[bi].fare);
  if (!Number.isFinite(yFare) || !Number.isFinite(bFare)) return out;
  const minBykea = Math.max(Math.round(yFare * MIN_BYKEA_VS_YANGO_RATIO), yFare + 15);
  if (bFare >= minBykea) return out;
  out[bi] = { ...out[bi], fare: minBykea };
  return out;
}

/** Asia/Karachi demand bump for rush / weekend (caps total surge). */
function pakistanDemandMultiplier(date = new Date()) {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      hour: 'numeric',
      hour12: false,
    }).format(date),
    10
  );
  const weekday = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
  }).format(date);
  const isFri = weekday === 'Fri';
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';

  let m = 1.0;
  if (hour >= 7 && hour <= 10) m = Math.max(m, 1.06);
  if (hour >= 17 && hour <= 21) m = Math.max(m, 1.12);
  if (hour >= 22 || hour <= 5) m = Math.max(m, 1.04);
  if (isFri && hour >= 16 && hour <= 21) m = Math.max(m, 1.16);
  if (isWeekend && hour >= 12 && hour <= 23) m = Math.max(m, 1.08);
  return Math.min(1.18, m);
}

/** One column per provider: ride-type label only (brand prefix applied when building the name). */
const PROVIDER_RIDE_LABELS = {
  Yango: {
    bike: 'Moto', rickshaw: 'Rickshaw', car: 'Comfort', car_ac: 'Comfort AC', premium: 'Premier',
  },
  Bykea: {
    bike: 'Bike', rickshaw: 'Rickshaw', car: 'Car', car_ac: 'Car AC', premium: 'Plus',
  },
};

const PROVIDER_BRAND = {
  Yango: 'Yango',
  Bykea: 'Bykea',
};

function providerDisplayName(provider, fareModel) {
  const label = PROVIDER_RIDE_LABELS[provider]?.[fareModel];
  const brand = PROVIDER_BRAND[provider];
  if (!label || !brand) return provider;
  return `${brand} ${label}`;
}

/**
 * Maps API rideType + optional car AC flag to a pricing / label bucket.
 * @param {string} rideType bike | rickshaw | car | premium
 * @param {boolean} [carAc] when rideType is car, true = with AC
 */
function resolveFareModel(rideType, carAc = false) {
  const r = String(rideType || 'car').trim().toLowerCase();
  if (r === 'bike') return 'bike';
  if (r === 'rickshaw') return 'rickshaw';
  if (r === 'premium') return 'premium';
  if (r === 'car') return carAc ? 'car_ac' : 'car';
  return 'car';
}

/**
 * Minimum fare for route + ride type (no provider markup, no booking side effects).
 * @param {number} distanceKm urban-road km (haversine × URBAN_DISTANCE_FACTOR)
 */
function computeBaseEstimate(rideType, distanceKm) {
  const model = RIDE_TYPE_BASE[rideType] || RIDE_TYPE_BASE.car;
  return {
    baseFare: Math.max(100, Math.round(model.baseFare + distanceKm * model.perKmRate)),
    perKmRate: model.perKmRate,
  };
}

/** Normalize client calibration rows to Yango / Bykea only (UI scrapes for this route). */
function parseLiveCalibrationRows(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out = [];
  for (const row of raw) {
    const fare = Number(row?.fare);
    const label = String(row?.provider || '').trim().toLowerCase();
    if (!Number.isFinite(fare) || fare < 80 || fare > 2_000_000) continue;
    let provider = '';
    if (label.includes('yango') || label.includes('yandex')) provider = 'Yango';
    else if (label.includes('bykea') || label.includes('bykia')) provider = 'Bykea';
    if (!provider) continue;
    out.push({ provider, fare });
  }
  return out;
}

/**
 * Blend model minimum with observed Yango/Bykea fares (same ride-type bucket).
 * Weight favors scrapes so the floor tracks what riders actually see in those apps.
 */
function blendBaseFareWithScrapes(modelBaseFare, scrapedRows) {
  if (!scrapedRows.length) {
    return { baseFare: modelBaseFare, calibratedFromScrapes: false };
  }
  const outlierCap = Math.min(80000, Math.max(18000, Math.round(modelBaseFare * 5)));
  const saneRows = scrapedRows.filter((r) => r.fare >= 80 && r.fare <= outlierCap);
  if (!saneRows.length) {
    return { baseFare: modelBaseFare, calibratedFromScrapes: false };
  }
  const fares = saneRows.map((r) => r.fare);
  const avg = fares.reduce((a, b) => a + b, 0) / fares.length;
  const minL = Math.min(...fares);
  const maxL = Math.max(...fares);
  const blended = Math.round(modelBaseFare * 0.28 + avg * 0.72);
  const clamped = Math.max(
    Math.round(minL * 0.92),
    Math.min(blended, Math.round(maxL * 1.12))
  );
  return {
    baseFare: Math.max(80, clamped),
    calibratedFromScrapes: true,
    scrapedSampleCount: fares.length,
  };
}

function estimateMinFare({ pickupCoords, destinationCoords, rideType, carAc, liveCalibration }) {
  if (!pickupCoords || !destinationCoords) {
    const err = new Error('Pickup and destination coordinates are required');
    err.statusCode = 400;
    throw err;
  }
  const lat1 = pickupCoords.latitude;
  const lon1 = pickupCoords.longitude;
  const lat2 = destinationCoords.latitude;
  const lon2 = destinationCoords.longitude;
  if (
    typeof lat1 !== 'number' || typeof lon1 !== 'number'
    || typeof lat2 !== 'number' || typeof lon2 !== 'number'
  ) {
    const err = new Error('Invalid coordinates');
    err.statusCode = 400;
    throw err;
  }

  const haversine = haversineKm(lat1, lon1, lat2, lon2);
  const distanceKm = urbanRoadKm(haversine);
  const fareModel = resolveFareModel(rideType, carAc);
  const base = computeBaseEstimate(fareModel, distanceKm);
  const scraped = parseLiveCalibrationRows(liveCalibration);
  const scrapeCap = Math.min(80000, Math.max(3500, Math.round(base.baseFare * 6)));
  const scrapedSane = scraped.filter((r) => r.fare <= scrapeCap);
  const { baseFare: blendedBase, calibratedFromScrapes, scrapedSampleCount } = blendBaseFareWithScrapes(
    base.baseFare,
    scrapedSane
  );

  return {
    baseFare: blendedBase,
    perKmRate: base.perKmRate,
    distanceKm: Number(distanceKm.toFixed(2)),
    rideType: String(rideType || 'car').trim().toLowerCase(),
    carAc: fareModel === 'car_ac',
    fareModel,
    estimateConfidence: calibratedFromScrapes ? 0.88 : 0.78,
    pricingModel: calibratedFromScrapes
      ? 'base_fare_plus_per_km_calibrated_yango_bykea'
      : 'base_fare_plus_per_km',
    calibratedFromScrapes: Boolean(calibratedFromScrapes),
    ...(typeof scrapedSampleCount === 'number' ? { scrapedSampleCount } : {}),
  };
}

function resolveFuelMultiplier(explicit) {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 0.94 && explicit <= 1.3) {
    return explicit;
  }
  return FUEL_SURCHARGE_MULTIPLIER;
}

function findRides({
  pickup,
  destination,
  pickupCoords,
  destinationCoords,
  rideType,
  carAc,
  liveCalibration,
  fuelMultiplier: fuelMultiplierExplicit,
  fuelPricingSource,
}) {
  if (!pickup || !destination) {
    const err = new Error('Please provide pickup and destination');
    err.statusCode = 400;
    throw err;
  }

  if (!pickupCoords || !destinationCoords) {
    const err = new Error('Pickup and destination coordinates are required for estimates');
    err.statusCode = 400;
    throw err;
  }

  const haversine = haversineKm(
    pickupCoords.latitude,
    pickupCoords.longitude,
    destinationCoords.latitude,
    destinationCoords.longitude
  );
  const distanceKm = urbanRoadKm(haversine);
  const userRideType = String(rideType || 'car').trim().toLowerCase();
  const fareModel = resolveFareModel(userRideType, carAc);
  const base = computeBaseEstimate(fareModel, distanceKm);
  const scraped = parseLiveCalibrationRows(liveCalibration);
  const scrapeCap = Math.min(80000, Math.max(3500, Math.round(base.baseFare * 6)));
  const scrapedSane = scraped.filter((r) => r.fare <= scrapeCap);
  const scrapedByProvider = new Map();
  for (const row of scrapedSane) {
    scrapedByProvider.set(row.provider, row.fare);
  }
  const blendMeta = blendBaseFareWithScrapes(base.baseFare, scrapedSane);
  const demandMul = pakistanDemandMultiplier();
  const fuelMul = resolveFuelMultiplier(fuelMultiplierExplicit);
  const coreEstimate = Math.max(base.baseFare, blendMeta.baseFare);

  const providers = Object.keys(PROVIDER_CONFIG);

  const comparisons = providers.map((provider) => {
    const cfg = PROVIDER_CONFIG[provider];
    const tilt = typeof cfg.priceTilt === 'number' ? cfg.priceTilt : 1;
    let estimate = Math.round(coreEstimate * tilt * demandMul * fuelMul + cfg.baseAdd);
    estimate = Math.max(base.baseFare, estimate);
    const live = scrapedByProvider.get(provider);
    let fare = estimate;
    let estimateConfidence = cfg.confidence;
    let fareSource;
    if (typeof live === 'number' && Number.isFinite(live) && live >= 80 && live <= Math.min(80000, coreEstimate * 6)) {
      fare = Math.round(estimate * 0.35 + live * 0.65);
      fare = Math.max(base.baseFare, fare);
      estimateConfidence = Math.min(0.96, cfg.confidence + 0.14);
      fareSource = 'scraped_blend';
    }
    const etaMins = calcEtaMinutes(haversine * cfg.etaMultiplier);
    return {
      id: `${provider.toLowerCase()}_${Date.now()}`,
      provider,
      name: providerDisplayName(provider, fareModel),
      fare,
      eta: `${etaMins} mins`,
      rideType: userRideType,
      carAc: fareModel === 'car_ac',
      fareModel,
      distanceKm: Number(distanceKm.toFixed(2)),
      estimateConfidence,
      pricingBreakdown: {
        baseFare: base.baseFare,
        perKmRate: base.perKmRate,
        blendedCore: blendMeta.baseFare,
        providerPriceTilt: tilt,
        demandMultiplier: demandMul,
        fuelMultiplier: fuelMul,
        providerBaseAdd: cfg.baseAdd,
      },
      isEstimate: true,
      ...(fareSource ? { fareSource } : {}),
    };
  });

  const comparisonsSpread = enforceYangoBykeaFareSpread(comparisons);

  return {
    baseFare: blendMeta.baseFare,
    calibratedFromScrapes: Boolean(blendMeta.calibratedFromScrapes),
    ...(typeof blendMeta.scrapedSampleCount === 'number'
      ? { scrapedSampleCount: blendMeta.scrapedSampleCount }
      : {}),
    perKmRate: base.perKmRate,
    distanceKm: Number(distanceKm.toFixed(2)),
    rideType: userRideType,
    carAc: fareModel === 'car_ac',
    fareModel,
    pricingModel: blendMeta.calibratedFromScrapes
      ? 'base_fare_plus_per_km_with_provider_coefficients_calibrated_yango_bykea'
      : 'base_fare_plus_per_km_with_provider_coefficients',
    estimateNotice: (() => {
      let msg =
        'Estimates are Farely heuristics (not official Yango/Bykea APIs). Yango is modeled cheaper than Bykea (typical Alto-class vs Wagon-R–class economics); a light peak-time bump applies in Asia/Karachi hours. ';
      if (fuelPricingSource && fuelPricingSource !== 'fallback') {
        msg += `Fuel factor uses POL snapshot (source: ${fuelPricingSource}). `;
      } else {
        msg += 'Fuel factor uses the default until PAK_PETROL_PKR, PAK_FUEL_JSON_URL, or OGRA parse succeeds — see GET /rides/pakistan-fuel. ';
      }
      msg += 'Final price is always in the provider app.';
      return msg;
    })(),
    comparisons: comparisonsSpread,
  };
}

function bookRide(rideId) {
  if (!rideId) {
    const err = new Error('rideId is required');
    err.statusCode = 400;
    throw err;
  }
  return {
    rideId: String(rideId),
    status: 'Redirect Pending',
    message: 'Farely does not book rides directly. Continue in provider app.',
  };
}

module.exports = {
  findRides,
  bookRide,
  estimateMinFare,
  FUEL_SURCHARGE_MULTIPLIER,
};

