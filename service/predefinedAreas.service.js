/**
 * Predefined "watch zones" across major Pakistani cities. Live traffic
 * is fetched from Google Distance Matrix between each area and its
 * city center to compute a real-time congestion-driven surge tier.
 *
 * Mirrors backend/src/predefined-areas.ts in the Farely Admin Console
 * so admin map + mobile app always see the same set of zones.
 */

const CITY_CENTERS = {
  lahore: { lat: 31.5204, lng: 74.3587 },
  karachi: { lat: 24.8607, lng: 67.0011 },
  islamabad: { lat: 33.6844, lng: 73.0479 },
  rawalpindi: { lat: 33.5651, lng: 73.0169 },
};

const PREDEFINED_AREAS = [
  { key: "lhr_gulberg",   name: "Gulberg III",         city: "Lahore",     lat: 31.5180, lng: 74.3429 },
  { key: "lhr_dha",       name: "DHA Phase 5",         city: "Lahore",     lat: 31.4761, lng: 74.4126 },
  { key: "lhr_mall",      name: "Mall Road",           city: "Lahore",     lat: 31.5616, lng: 74.3361 },
  { key: "lhr_liberty",   name: "Liberty Market",      city: "Lahore",     lat: 31.5169, lng: 74.3473 },
  { key: "lhr_anarkali",  name: "Anarkali Bazaar",     city: "Lahore",     lat: 31.5751, lng: 74.3084 },
  { key: "lhr_cantt",     name: "Lahore Cantonment",   city: "Lahore",     lat: 31.4936, lng: 74.3905 },
  { key: "lhr_johar",     name: "Johar Town",          city: "Lahore",     lat: 31.4697, lng: 74.2728 },
  { key: "lhr_iqbal",     name: "Iqbal Town",          city: "Lahore",     lat: 31.5052, lng: 74.2780 },
  { key: "lhr_township",  name: "Township",            city: "Lahore",     lat: 31.4474, lng: 74.3110 },

  { key: "khi_saddar",    name: "Saddar",              city: "Karachi",    lat: 24.8553, lng: 67.0274 },
  { key: "khi_clifton",   name: "Clifton",             city: "Karachi",    lat: 24.8138, lng: 67.0299 },
  { key: "khi_dha",       name: "DHA Karachi",         city: "Karachi",    lat: 24.8189, lng: 67.0533 },
  { key: "khi_nnaz",      name: "North Nazimabad",     city: "Karachi",    lat: 24.9343, lng: 67.0388 },
  { key: "khi_tariq",     name: "Tariq Road",          city: "Karachi",    lat: 24.8736, lng: 67.0567 },
  { key: "khi_gulshan",   name: "Gulshan-e-Iqbal",     city: "Karachi",    lat: 24.9234, lng: 67.0944 },
  { key: "khi_korangi",   name: "Korangi",             city: "Karachi",    lat: 24.8479, lng: 67.1414 },

  { key: "isb_f6",        name: "F-6 Markaz",          city: "Islamabad",  lat: 33.7234, lng: 73.0719 },
  { key: "isb_f7",        name: "F-7 Markaz",          city: "Islamabad",  lat: 33.7191, lng: 73.0567 },
  { key: "isb_f8",        name: "F-8 Markaz",          city: "Islamabad",  lat: 33.7066, lng: 73.0464 },
  { key: "isb_bluearea",  name: "Blue Area",           city: "Islamabad",  lat: 33.7155, lng: 73.0810 },
  { key: "isb_g9",        name: "G-9 Markaz",          city: "Islamabad",  lat: 33.6918, lng: 73.0334 },

  { key: "rwp_saddar",    name: "Saddar Rawalpindi",   city: "Rawalpindi", lat: 33.5973, lng: 73.0479 },
  { key: "rwp_raja",      name: "Raja Bazaar",         city: "Rawalpindi", lat: 33.6007, lng: 73.0481 },
  { key: "rwp_committee", name: "Committee Chowk",     city: "Rawalpindi", lat: 33.6418, lng: 73.0686 },
];

function getCityCenter(city) {
  const key = String(city || "").toLowerCase().trim();
  return CITY_CENTERS[key] || CITY_CENTERS.lahore;
}

function getCities() {
  return Array.from(new Set(PREDEFINED_AREAS.map((a) => a.city)));
}

module.exports = {
  CITY_CENTERS,
  PREDEFINED_AREAS,
  getCityCenter,
  getCities,
};
