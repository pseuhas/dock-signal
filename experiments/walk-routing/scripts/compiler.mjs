const ATTRIBUTION='© OpenStreetMap contributors';
const LICENSE='https://opendatacommons.org/licenses/odbl/1-0/';
export const BOUNDS=[40.738,-73.979,40.780,-73.929];
const PATH=new Set('footway pedestrian path steps living_street residential unclassified service tertiary tertiary_link secondary secondary_link primary primary_link'.split(' '));
const deny=new Set(['no','private','customers','permit','delivery','agricultural','forestry','use_sidepath','destination']);
const allow=new Set(['yes','designated','permissive','official']);
const tight=new Set(['motorway','motorway_link','trunk','trunk_link','construction','proposed','raceway']);
const elevated=t=>typeof t.bridge==='string'&&t.bridge!=='no'||typeof t.tunnel==='string'&&t.tunnel!=='no'||Number(t.layer)>0;
export function walkable(t={}){
 if(!t.highway||tight.has(t.highway)||t.construction||t.proposed||t['foot:conditional']||t['access:conditional']||t.indoor==='yes'||deny.has(t.foot))return false;
 if(allow.has(t.foot))return PATH.has(t.highway)||t.highway==='cycleway';
 if(deny.has(t.access))return false;
 if(elevated(t)&&!['footway','steps','pedestrian','path'].includes(t.highway)&&!['yes','both','left','right'].includes(t.sidewalk))return false;
 if(t.sidewalk==='separate'||t['sidewalk:both']==='separate'||t.highway==='cycleway')return false;
 if(['primary','primary_link','secondary','secondary_link'].includes(t.highway)&&!['yes','both','left','right'].includes(t.sidewalk))return false;
 return PATH.has(t.highway);
}
function passable(t={}){
 if(deny.has(t.foot)||t['foot:conditional']||t['access:conditional'])return false;
 if(allow.has(t.foot))return true;
 if(deny.has(t.access))return false;
 return !t.barrier || ['bollard','cycle_barrier','stile','kissing_gate','entrance','kerb','cattle_grid'].includes(t.barrier);
}
export function compileOSM(doc,bounds=BOUNDS){
 if(!Array.isArray(doc?.elements)||!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite))throw new Error('Invalid extract');
 const stamp=doc.osm3s?.timestamp_osm_base;
 if(typeof stamp!=='string'||!Number.isFinite(Date.parse(stamp))||doc.remark)throw new Error('Missing valid complete OSM source timestamp');
 const raw=new Map(doc.elements.filter(n=>n.type==='node'&&Number.isSafeInteger(n.id)&&Number.isFinite(n.lat)&&Number.isFinite(n.lon)).map(n=>[n.id,n]));
 const ids=new Map(), nodes=[], edges=[], seen=new Set();
 const node=(n,maySnap)=>{
  if(ids.has(n.id)){const i=ids.get(n.id);nodes[i][2] ||= maySnap;return i;}
  const i=nodes.length;ids.set(n.id,i);nodes.push([n.lat,n.lon,maySnap]);return i;
 };
 const edge=(a,b)=>{const k=a+','+b;if(a!==b&&!seen.has(k)){edges.push([a,b]);seen.add(k);}};
 for(const way of doc.elements.filter(w=>w.type==='way'&&Array.isArray(w.nodes)&&walkable(w.tags)).sort((a,b)=>a.id-b.id)){
  const t=way.tags, closed=t['oneway:foot']==='yes'||t['oneway:foot']==='1'||t['oneway:foot']==='true',reverse=t['oneway:foot']==='-1';
  const maySnap=!elevated(t);
  for(let i=1;i<way.nodes.length;i++){
   const a=raw.get(way.nodes[i-1]),b=raw.get(way.nodes[i]);
   if(!a||!b||!passable(a.tags)||!passable(b.tags))continue;
   if([a,b].some(n=>n.lat<bounds[0]||n.lat>bounds[2]||n.lon<bounds[1]||n.lon>bounds[3]))continue;
   // Adjacent list entries only: never infer a connection from crossing lines or a missing node.
   const ai=node(a,maySnap),bi=node(b,maySnap);
   if(!reverse)edge(ai,bi);
   if(!closed)edge(bi,ai);
  }
 }
 if(!nodes.length||!edges.length)throw new Error('No walkable graph');
 return {schema:1,bounds,source:{provider:'OpenStreetMap',timestamp:stamp,attribution:ATTRIBUTION,license:LICENSE},nodes,edges};
}
