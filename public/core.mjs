import {onIslandOrigin, onIslandStation} from './island.mjs';
const ROOT = 'https://gbfs.citibikenyc.com/gbfs/en/';
export const FRESH_MS = 5 * 60_000;
export const MAX_CACHE_MS = 24 * 3600_000;
export const LANDMARKS = {
  island: {name:'Roosevelt Island',lat:40.7573,lon:-73.9541,area:'roosevelt-island'},
  grand: {name:'Grand Central',lat:40.7527,lon:-73.9772},
  LIC: {name:'Hunters Point',lat:40.7436,lon:-73.9567},
  union: {name:'Union Square',lat:40.7358,lon:-73.9904},
  brooklyn: {name:'Brooklyn Borough Hall',lat:40.6927,lon:-73.9904},
  harlem: {name:'125th & Lenox',lat:40.8081,lon:-73.9452}
};
function number(x) {
  if (typeof x === 'number') return x;
  if (typeof x === 'string' && x.trim() !== '') return Number(x);
  return NaN;
}
function count(x) {const n=number(x); return Number.isSafeInteger(n) && n>=0 ? n : null;}
function flag(x) {return x===true || x===1 || x==='1';}
function time(x) {
  const n=number(x);
  const ms=Number.isFinite(n) ? n*1000 : (typeof x==='string' ? Date.parse(x) : NaN);
  return Number.isFinite(ms) && ms>0 ? ms : null;
}
function entries(payload) {
  if (!Array.isArray(payload?.data?.stations)) throw new Error('Unexpected GBFS station schema');
  return payload.data.stations;
}
export function joinFeeds(info, status, now=Date.now()) {
  const updatedAt=time(status?.last_updated);
  if (!updatedAt || updatedAt>now+FRESH_MS) throw new Error('Invalid GBFS timestamp');
  const positions=new Map();
  for (const x of entries(info)) {
    if (x?.station_id==null || typeof x.name!=='string' || !x.name.trim()) continue;
    const lat=number(x.lat), lon=number(x.lon);
    if (Math.abs(lat)<=90 && Math.abs(lon)<=180) positions.set(String(x.station_id),{name:x.name.trim(),lat,lon,shortName:typeof x.short_name==='string'?x.short_name:null,capacity:count(x.capacity)});
  }
  const rows=new Map();
  for (const x of entries(status)) {
    if (x?.station_id==null) continue;
    const id=String(x.station_id), loc=positions.get(id);
    if (!loc) continue;
    const reportedAt=time(x.last_reported);
    const bikes=count(x.num_bikes_available ?? x.num_vehicles_available), docks=count(x.num_docks_available);
    if (bikes==null || docks==null || reportedAt>now+FRESH_MS) continue;
    const electric=count(x.num_ebikes_available);
    const ebikes=electric!==null && electric<=bikes?electric:null;
    const prior=rows.get(id);
    if (prior && (prior.reportedAt??0)>=(reportedAt??0)) continue;
    rows.set(id,{id,...loc,bikes,docks,ebikes,classics:ebikes!==null?bikes-ebikes:null,installed:flag(x.is_installed),renting:flag(x.is_renting),returning:flag(x.is_returning),reportedAt});
  }
  if (!rows.size) throw new Error('No matching Citi Bike stations');
  return {updatedAt,receivedAt:now,ttl:Math.max(30,Math.min(count(status.ttl)||45,180)),rows:[...rows.values()]};
}
export async function readFeeds(fetcher=fetch, now=Date.now, base=ROOT) {
  const read=async (name)=>{
    const response=await fetcher(base+name+'.json',{signal:AbortSignal.timeout(9000),credentials:'omit',cache:'no-cache',redirect:'error'});
    if (!response.ok) throw new Error('GBFS HTTP '+response.status);
    return response.json();
  };
  const [info,status]=await Promise.all([read('station_information'),read('station_status')]);
  return joinFeeds(info,status,now());
}
export function ageState(snapshot, now=Date.now()) {
  if (!snapshot) return 'unavailable';
  if (snapshot.sample) return 'sample';
  return now-snapshot.updatedAt>FRESH_MS ? 'stale' : 'live';
}
export function rankDistance(a,b) {
  const rad=Math.PI/180;
  const h=Math.sin((a.lat-b.lat)*rad/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((a.lon-b.lon)*rad/2)**2;
  return 2*6371000*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function valueFor(row,mode) {
  return ({pickup:row.bikes,return:row.docks,classic:row.classics,electric:row.ebikes})[mode];
}
export function rankStations(rows, origin, {mode='pickup',availableOnly=true,limit=12,radius=2500,liveOnly=true,now=Date.now()}={}) {
  return rows.map(row=>({...row,distance:rankDistance(origin,row),value:valueFor(row,mode),
    operational:row.installed&&(mode==='return'?row.returning:row.renting),
    current:!!row.reportedAt&&now-row.reportedAt<=FRESH_MS}))
    .filter(r=>r.distance<=radius && (!availableOnly||(r.operational&&r.value>0&&(!liveOnly||r.current))))
    .sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id)).slice(0,limit);
}
// Never present the across-water alternative as walkable. Wider results remain
// available under Nearby stations, labeled as distance-only, including during partial outages.
export function nearbyRecommendations(snapshot, origin, mode, now=Date.now()) {
  const island=onIslandOrigin(origin,rankDistance);
  const candidates=ageState(snapshot,now)==='live'
    ? rankStations(island?snapshot.rows.filter(row=>onIslandStation(row,rankDistance)):snapshot.rows,
      origin,{mode,availableOnly:true,limit:2,liveOnly:true,now})
    : [];
  return {island, best:candidates[0]??null, backup:candidates[1]??null};
}
export function closestAvailable(snapshot, origin, mode, now=Date.now()) {
  return nearbyRecommendations(snapshot,origin,mode,now).best;
}
export function walkingLink(row) {
  return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(row.lat+','+row.lon)+'&travelmode=walking';
}
export function sample(now=Date.now()) {
  const rows=Object.values(LANDMARKS).flatMap((p,i)=>[0,1,2].map((j)=>({
    id:'sample-'+i+'-'+j,name:'Example dock · '+p.name+' '+String.fromCharCode(65+j), lat:p.lat+(j-1)*.001,lon:p.lon+(2-j)*.0015,
    bikes:[6,1,0][j],docks:[8,2,0][j],ebikes:[2,0,0][j],classics:[4,1,0][j], installed:true,renting:j!==2,returning:j!==2,reportedAt:null
  })));
  return {sample:true,rows,updatedAt:null,receivedAt:now,ttl:45};
}
