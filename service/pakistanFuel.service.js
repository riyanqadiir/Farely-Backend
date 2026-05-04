/**
 * Pakistan POL (petrol / diesel) snapshot for Farely fare heuristics.
 *
 * There is no single guaranteed free “official OGRA JSON API” in the public domain.
 * This module uses a safe cascade:
 *   1) PAK_PETROL_PKR / PAK_DIESEL_PKR — manual OGRA snapshot (most exact for your deploy)
 *   2) PAK_FUEL_JSON_URL — your own JSON endpoint (e.g. Cloud Function that reads OGRA PDF/HTML)
 *   3) Best-effort OGRA notified-prices HTML parse (may break if OGRA changes markup)
 *   4) Fallback multiplier FUEL_SURCHARGE_FALLBACK
 *
 * OGRA official human-readable listings: https://www.ogra.org.pk/ (notified petroleum prices).
 */

const DEFAULT_BASELINE_PETROL = Number(process.env.FUEL_BASELINE_PETROL_PKR || 320);
const FALLBACK_MULT = Number(process.env.FUEL_SURCHARGE_FALLBACK || 1.03);
const CACHE_MS = Math.max(60_000, Number(process.env.PAK_FUEL_CACHE_MS || 6 * 3600 * 1000));
const OGRA_DEFAULT_URL = 'https://www.ogra.org.pk/index.php/notified-petroleum-prices';

let cache = { expiresAt: 0, snapshot: null };

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function toNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Fuel is only part of ride cost — map petrol PKR/L vs baseline to a bounded ride multiplier.
 */
function petrolToRideMultiplier(petrolPkrPerL) {
  if (!Number.isFinite(petrolPkrPerL) || petrolPkrPerL < 150 || petrolPkrPerL > 950) {
    return FALLBACK_MULT;
  }
  const delta = (petrolPkrPerL - DEFAULT_BASELINE_PETROL) / DEFAULT_BASELINE_PETROL;
  const m = 1 + delta * 0.38;
  return clamp(m, 0.96, 1.22);
}

function buildSnapshot(partial) {
  const petrol = toNum(partial.petrolPkrPerL);
  const diesel = toNum(partial.dieselPkrPerL);
  const mult = Number.isFinite(petrol)
    ? petrolToRideMultiplier(petrol)
    : FALLBACK_MULT;
  return {
    petrolPkrPerL: Number.isFinite(petrol) ? petrol : null,
    dieselPkrPerL: Number.isFinite(diesel) ? diesel : null,
    effectiveFrom: partial.effectiveFrom || null,
    source: partial.source || 'fallback',
    fetchedAt: new Date().toISOString(),
    fuelMultiplierForRides: mult,
    baselinePetrolPkrUsed: DEFAULT_BASELINE_PETROL,
  };
}

function parseUpstreamJson(data) {
  if (!data || typeof data !== 'object') return null;
  const root = data.data && typeof data.data === 'object' ? data.data : data;
  const petrol = toNum(
    root.petrolPkrPerL ?? root.petrol ?? root.ms ?? root.motorSpirit ?? root.petrolPrice
  );
  const diesel = toNum(
    root.dieselPkrPerL ?? root.diesel ?? root.hsd ?? root.highSpeedDiesel ?? root.dieselPrice
  );
  if (!Number.isFinite(petrol)) return null;
  return buildSnapshot({
    petrolPkrPerL: petrol,
    dieselPkrPerL: diesel,
    effectiveFrom: root.effectiveFrom ?? root.asOf ?? root.notifiedFrom ?? null,
    source: typeof root.source === 'string' ? root.source : 'json_url',
  });
}

async function fetchJsonUpstream() {
  const url = String(process.env.PAK_FUEL_JSON_URL || '').trim();
  if (!url) return null;
  const headers = { Accept: 'application/json' };
  const key = String(process.env.PAK_FUEL_API_KEY || '').trim();
  const headerName = String(process.env.PAK_FUEL_API_KEY_HEADER || 'Authorization').trim();
  if (key) {
    if (headerName.toLowerCase() === 'authorization') {
      headers.Authorization = key.toLowerCase().startsWith('bearer ') ? key : `Bearer ${key}`;
    } else {
      headers[headerName] = key;
    }
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return null;
  const data = await res.json();
  return parseUpstreamJson(data);
}

function tryParseManualEnv() {
  const petrol = toNum(process.env.PAK_PETROL_PKR);
  const diesel = toNum(process.env.PAK_DIESEL_PKR);
  if (!Number.isFinite(petrol)) return null;
  return buildSnapshot({
    petrolPkrPerL: petrol,
    dieselPkrPerL: diesel,
    effectiveFrom: process.env.PAK_FUEL_EFFECTIVE_FROM || null,
    source: 'env_manual',
  });
}

function extractFromOgraHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const h = html.replace(/\s+/g, ' ');
  const tryPair = (petrolRe, dieselRe) => {
    const pm = h.match(petrolRe);
    const dm = h.match(dieselRe);
    const p = pm ? toNum(pm[1]) : null;
    const d = dm ? toNum(dm[1]) : null;
    if (Number.isFinite(p)) return { petrol: p, diesel: d };
    return null;
  };
  let pair = tryPair(
    /Motor\s+Spirit[^0-9]{0,220}?(?:Rs\.?|PKR|Rs)\s*([0-9]{2,3}(?:\.[0-9]{1,2})?)/i,
    /High\s+Speed\s+Diesel[^0-9]{0,220}?(?:Rs\.?|PKR|Rs)\s*([0-9]{2,3}(?:\.[0-9]{1,2})?)/i
  );
  if (!pair) {
    pair = tryPair(
      /(?:MS|Motor\s+Spirit)[^0-9]{0,120}([0-9]{2,3}(?:\.[0-9]{1,2})?)\s*(?:Rs|PKR)/i,
      /(?:HSD|High\s+Speed\s+Diesel)[^0-9]{0,120}([0-9]{2,3}(?:\.[0-9]{1,2})?)\s*(?:Rs|PKR)/i
    );
  }
  if (!pair) return null;
  if (pair.petrol < 150 || pair.petrol > 950) return null;
  return pair;
}

async function fetchOgraHtml() {
  if (String(process.env.PAK_FUEL_SKIP_OGRA || '').toLowerCase() === 'true') return null;
  const url = String(process.env.OGRA_PETROL_PAGE_URL || OGRA_DEFAULT_URL).trim();
  const res = await fetch(url, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const pair = extractFromOgraHtml(html);
  if (!pair) return null;
  return buildSnapshot({
    petrolPkrPerL: pair.petrol,
    dieselPkrPerL: pair.diesel,
    effectiveFrom: null,
    source: 'ogra_html',
  });
}

async function buildFreshSnapshot() {
  const manual = tryParseManualEnv();
  if (manual) return manual;

  try {
    const j = await fetchJsonUpstream();
    if (j) return j;
  } catch (_) {}

  try {
    const o = await fetchOgraHtml();
    if (o) return o;
  } catch (_) {}

  return buildSnapshot({
    petrolPkrPerL: null,
    dieselPkrPerL: null,
    effectiveFrom: null,
    source: 'fallback',
  });
}

/**
 * Cached snapshot for ride pricing + GET /rides/pakistan-fuel.
 */
async function getPakistanFuelSnapshot() {
  const now = Date.now();
  if (cache.snapshot && now < cache.expiresAt) {
    return cache.snapshot;
  }
  const snap = await buildFreshSnapshot();
  cache = { snapshot: snap, expiresAt: now + CACHE_MS };
  return snap;
}

function clearPakistanFuelCache() {
  cache = { expiresAt: 0, snapshot: null };
}

module.exports = {
  getPakistanFuelSnapshot,
  clearPakistanFuelCache,
  petrolToRideMultiplier,
  DEFAULT_BASELINE_PETROL,
  FALLBACK_MULT,
};
