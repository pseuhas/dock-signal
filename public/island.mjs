// Operator GBFS v2.3 stations reconciled with RIOC's four public station locations.
// Short codes cover legacy GBFS IDs; the location guard prevents accidental reuse of a moved ID.
const stops = [
  ['ad17bd9a-735b-4a11-8ad3-dc7800e342af', '6566.01', 40.753702, -73.958652],
  ['b47e5ffd-4215-4476-a89b-ebe52111f763', '6599.01', 40.757284, -73.953600],
  ['88bf1344-354f-4699-bdbd-1c2584fc41ee', '6814.01', 40.763909, -73.947721],
  ['2263855457844687416', '6881.01', 40.766359, -73.945787],
].map(([id, shortName, lat, lon]) => ({id, shortName, lat, lon}));

const LOCAL_RADIUS = 90;
export function onIslandOrigin(origin, distance) {
  // A named preset is certain. Browser fixes only trigger this rule near known island
  // anchors with enough headroom for the entire reported accuracy circle.
  if (origin.area === 'roosevelt-island') return true;
  const accuracy = origin.accuracy;
  return Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 45 &&
    stops.some(stop => distance(origin, stop) + accuracy <= LOCAL_RADIUS);
}

export function onIslandStation(row, distance) {
  return stops.some(stop => (row.id === stop.id || row.shortName === stop.shortName) &&
    distance(row, stop) <= LOCAL_RADIUS);
}
