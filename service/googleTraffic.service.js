/**
 * Thin wrapper around the Google Distance Matrix API. Used to score
 * how congested a predefined area is right now vs. free-flow traffic.
 *
 * Cached in-memory for 5 minutes per origin/destination pair so even
 * frequent dashboard / mobile-app refreshes keep the Distance Matrix
 * bill low (24 zones × 12 calls/hour = ~7k calls/day worst case).
 */

const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 6000;
const cache = new Map();

function cacheKeyFor(origin, destination) {
  return `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}|${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
}

async function callDistanceMatrix(origin, destination, apiKey) {
  const url =
    "https://maps.googleapis.com/maps/api/distancematrix/json"
    + `?origins=${origin.lat},${origin.lng}`
    + `&destinations=${destination.lat},${destination.lng}`
    + "&departure_time=now"
    + "&traffic_model=best_guess"
    + `&key=${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status !== "OK") return null;

    const element = data?.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK" || !element.duration) return null;

    const duration = Number(element.duration.value || 0);
    const durationInTraffic = Number(
      (element.duration_in_traffic && element.duration_in_traffic.value) || duration
    );
    if (!Number.isFinite(duration) || duration <= 0) return null;

    return {
      duration,
      durationInTraffic,
      ratio: durationInTraffic / duration,
    };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function measureTraffic(origin, destination) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY && process.env.GOOGLE_MAPS_API_KEY.trim();
  if (!apiKey) return null;

  const key = cacheKeyFor(origin, destination);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.result;

  const result = await callDistanceMatrix(origin, destination, apiKey);
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY && process.env.GOOGLE_MAPS_API_KEY.trim());
}

/**
 * Map a duration_in_traffic / duration ratio to a fare surge tier.
 * Identical tiers to the admin so admin dashboard + mobile app agree.
 */
function surgeFromRatio(ratio) {
  let surgeMultiplier = 1.0;
  let surgeLevel = "normal";
  if (ratio >= 1.5) {
    surgeMultiplier = 1.5;
    surgeLevel = "high";
  } else if (ratio >= 1.25) {
    surgeMultiplier = 1.25;
    surgeLevel = "medium";
  } else if (ratio >= 1.1) {
    surgeMultiplier = 1.1;
    surgeLevel = "low";
  }
  return {
    surgeMultiplier,
    surgeLevel,
    surgePercent: Math.round((surgeMultiplier - 1) * 100),
  };
}

module.exports = {
  measureTraffic,
  isGoogleConfigured,
  surgeFromRatio,
};
