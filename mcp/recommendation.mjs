import { LANDMARKS, ageState, rankStations, walkingLink, FRESH_MS } from '../public/core.mjs';

const MODES = Object.freeze({
  pickup: 'bikes',
  return: 'open docks',
  classic: 'classic bikes',
  electric: 'e-bikes'
});
const ALIASES = Object.freeze({
  'roosevelt island tramway': 'island', 'roosevelt island': 'island',
  'grand central': 'grand', 'grand central terminal': 'grand',
  'hunters point': 'LIC', 'long island city': 'LIC', 'lic': 'LIC',
  'union square': 'union', 'brooklyn borough hall': 'brooklyn', 'borough hall': 'brooklyn',
  '125th & lenox': 'harlem', '125th and lenox': 'harlem'
});
export const PUBLIC_LANDMARKS = Object.freeze(Object.values(LANDMARKS).map(x=>x.name));
export const RECOMMENDATION_MODES = Object.freeze(Object.keys(MODES));

function parseInput(input) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype ||
      Object.keys(input).some(k => k !== 'landmark' && k !== 'mode') ||
      typeof input.landmark !== 'string' || input.landmark.length > 100) return null;
  const alias = input.landmark.normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/\s+/g,' ').trim();
  const key = Object.hasOwn(ALIASES,alias) ? ALIASES[alias] : null;
  const mode = input.mode ?? 'pickup';
  if (!key || typeof mode !== 'string' || !Object.hasOwn(MODES,mode)) return null;
  return { origin: LANDMARKS[key], mode };
}

const MAX_DISTANCE_M = 2500;
const OVER_100_M = 100;

export function recommendDock(input, snapshot, now = Date.now()) {
  const parsed = parseInput(input);
  if (!parsed) return {
    status:'invalid_input', supported_landmarks:PUBLIC_LANDMARKS, supported_modes:RECOMMENDATION_MODES,
    message:'Choose a supported public landmark and mode. Coordinates, private addresses and GPS are not accepted.'
  };
  const { origin, mode } = parsed;
  const sourceTime = snapshot?.updatedAt;
  const knownTimestamp = Number.isFinite(sourceTime) && sourceTime>0 && sourceTime<=now && sourceTime <= 8.64e15;
  const state = knownTimestamp && !snapshot.sample && Array.isArray(snapshot.rows)
    ? ageState(snapshot,now) : 'unavailable';
  const result = {
    status:state,
    landmark:origin.name,
    mode,
    source:'https://citibikenyc.com/system-data',
    source_updated_at_utc:knownTimestamp && !snapshot?.sample ? new Date(sourceTime).toISOString() : null,
    source_age_seconds:knownTimestamp && !snapshot?.sample ? Math.floor((now-sourceTime)/1000) : null,
    max_live_age_seconds:FRESH_MS/1000,
    distance_measure:'straight_line_meters',
    recommendation:null,
    backup:null,
    distance_limit_meters:MAX_DISTANCE_M
  };
  if (state!=='live') return {...result,
    message:state==='stale'
      ? 'Operator update is stale. No station recommendation until fresh data returns.'
      : 'Live operator data is unavailable. Example data is never used to make a recommendation.'
  };
  // Do not truncate the nearest candidates before applying a bounded availability adjustment.
  const rows=snapshot.rows.filter(r=>r && typeof r.id==='string' && typeof r.name==='string' &&
    Number.isFinite(r.lat) && Number.isFinite(r.lon) && Math.abs(r.lat)<=90 && Math.abs(r.lon)<=180 &&
    Number.isFinite(r.reportedAt) && r.reportedAt>0 && r.reportedAt<=now);
  const ranked=rankStations(rows,origin,{mode,limit:rows.length,radius:MAX_DISTANCE_M,now})
    .filter(x=>Number.isInteger(x.value) && x.value>0)
    .map(x=>({...x, score: x.distance - OVER_100_M*Math.min(5,x.value-1)/5}))
    .sort((a,b)=>a.score-b.score || a.distance-b.distance || a.id.localeCompare(b.id));
  if (!ranked.length) return {...result,status:'no_results',
    message:'No recently reported operational station has this availability within 2.5 km straight line.'};
  const primary=ranked[0];
  // Only give a backup for a distinct, operational station with the requested resource.
  const backup=ranked.find(r=>r.id!==primary.id && r.name!==primary.name)??null;
  const summarize = r => ({
    name:r.name,
    reported_count:r.value,
    resource:MODES[mode],
    straight_line_meters:Math.round(r.distance),
    station_reported_at_utc:new Date(r.reportedAt).toISOString(),
    directions_url:walkingLink(r)
  });
  return {...result,status:'ok',recommendation:summarize(primary),backup:backup?summarize(backup):null,
    message:'Ranked by straight-line proximity with a small bonus for more reported availability. No walking time is estimated. Counts can change on arrival; check live before leaving.'};
}

