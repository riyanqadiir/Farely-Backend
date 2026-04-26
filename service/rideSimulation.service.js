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

function calcEtaMinutes(distanceKm, avgSpeedKmh = 28) {
  const minutes = (distanceKm / avgSpeedKmh) * 60;
  return Math.max(1, Math.round(minutes));
}

const RIDE_TYPE_BASE = {
  bike: { baseFare: 90, perKmRate: 28 },
  rickshaw: { baseFare: 120, perKmRate: 34 },
  car: { baseFare: 150, perKmRate: 40 },
  /** Car with AC — between car and premium for demo coefficients. */
  car_ac: { baseFare: 175, perKmRate: 46 },
  premium: { baseFare: 240, perKmRate: 62 },
};

const PROVIDER_CONFIG = {
  /** Uber: estimates only until Rider API is enabled (no in-app booking). */
  Uber: { multiplier: 0.98, baseAdd: 12, etaMultiplier: 1.0, confidence: 0.82 },
  Yango: { multiplier: 0.96, baseAdd: 10, etaMultiplier: 1.0, confidence: 0.8 },
  /** Bike-first local player; coefficients slightly below car-first apps for bike-like estimates. */
  Bykea: { multiplier: 0.9, baseAdd: 8, etaMultiplier: 1.05, confidence: 0.68 },
};

/** One column per provider: ride-type label only (brand prefix applied when building the name). */
const PROVIDER_RIDE_LABELS = {
  Yango: {
    bike: 'Moto', rickshaw: 'Rickshaw', car: 'Comfort', car_ac: 'Comfort AC', premium: 'Premier',
  },
  Uber: {
    bike: 'Moto', rickshaw: 'Rickshaw', car: 'UberX', car_ac: 'Comfort', premium: 'Premier',
  },
  Bykea: {
    bike: 'Bike', rickshaw: 'Rickshaw', car: 'Car', car_ac: 'Car AC', premium: 'Plus',
  },
};

const PROVIDER_BRAND = {
  Uber: 'Uber',
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
 */
function computeBaseEstimate(rideType, distanceKm) {
  const model = RIDE_TYPE_BASE[rideType] || RIDE_TYPE_BASE.car;
  return {
    baseFare: Math.max(80, Math.round(model.baseFare + distanceKm * model.perKmRate)),
    perKmRate: model.perKmRate,
  };
}

function estimateMinFare({ pickupCoords, destinationCoords, rideType, carAc }) {
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

  const distanceKm = haversineKm(lat1, lon1, lat2, lon2);
  const fareModel = resolveFareModel(rideType, carAc);
  const base = computeBaseEstimate(fareModel, distanceKm);

  return {
    baseFare: base.baseFare,
    perKmRate: base.perKmRate,
    distanceKm: Number(distanceKm.toFixed(2)),
    rideType: String(rideType || 'car').trim().toLowerCase(),
    carAc: fareModel === 'car_ac',
    fareModel,
    estimateConfidence: 0.78,
    pricingModel: 'base_fare_plus_per_km',
  };
}

function findRides({ pickup, destination, pickupCoords, destinationCoords, rideType, carAc }) {
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

  const distanceKm = haversineKm(
    pickupCoords.latitude,
    pickupCoords.longitude,
    destinationCoords.latitude,
    destinationCoords.longitude
  );
  const userRideType = String(rideType || 'car').trim().toLowerCase();
  const fareModel = resolveFareModel(userRideType, carAc);
  const base = computeBaseEstimate(fareModel, distanceKm);
  const providers = Object.keys(PROVIDER_CONFIG);

  const comparisons = providers.map((provider) => {
    const cfg = PROVIDER_CONFIG[provider];
    const estimate = Math.max(
      base.baseFare,
      Math.round((base.baseFare + cfg.baseAdd) * cfg.multiplier)
    );
    const etaMins = calcEtaMinutes(distanceKm * cfg.etaMultiplier);
    return {
      id: `${provider.toLowerCase()}_${Date.now()}`,
      provider,
      name: providerDisplayName(provider, fareModel),
      fare: estimate,
      eta: `${etaMins} mins`,
      rideType: userRideType,
      carAc: fareModel === 'car_ac',
      fareModel,
      distanceKm: Number(distanceKm.toFixed(2)),
      estimateConfidence: cfg.confidence,
      pricingBreakdown: {
        baseFare: base.baseFare,
        perKmRate: base.perKmRate,
        providerMultiplier: cfg.multiplier,
        providerBaseAdd: cfg.baseAdd,
      },
      isEstimate: true,
    };
  });

  return {
    baseFare: base.baseFare,
    perKmRate: base.perKmRate,
    distanceKm: Number(distanceKm.toFixed(2)),
    rideType: userRideType,
    carAc: fareModel === 'car_ac',
    fareModel,
    pricingModel: 'base_fare_plus_per_km_with_provider_coefficients',
    estimateNotice: 'Final fare and booking confirmation happen inside provider apps.',
    comparisons,
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
};

