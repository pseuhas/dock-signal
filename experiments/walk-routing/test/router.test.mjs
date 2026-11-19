import test from 'node:test';
import assert from 'node:assert/strict';
import {compileOSM,walkable} from '../scripts/compiler.mjs';
import {prepareGraph,shortestPaths,walkRoute,snap,walkingGraphState,withWalks} from '../walk-router.mjs';
const NOW=Date.parse('2026-11-19T19:00:00Z');
const bounds=[40,-74,41,-73];
const n=(id,lat,lon,tags)=>({id,lat,lon,tags,type:'node'});
const w=(id,nodes,tags)=>({id,nodes,tags,type:'way'});
function specimen({legal=true}={}){
 const elements=[
  n(1,40.75,-73.957),n(2,40.75,-73.955),n(3,40.75,-73.949),
  n(4,40.752,-73.955),n(5,40.752,-73.949),n(6,40.751,-73.948),
  n(7,40.748,-73.961),n(8,40.75,-73.9551),n(9,40.748,-73.947),n(10,40.75,-73.948),
  w(10,[1,2,4],{highway:'footway'}),w(11,[3,5,6,10],{highway:'footway'}),
  w(12,[7,8,9],{highway:'pedestrian',bridge:'yes',foot:'designated',layer:'2'}),
  w(13,[4,5],{highway:'footway',bridge:'yes',...(legal?{}:{foot:'no'})})
 ];
 return {osm3s:{timestamp_osm_base:new Date(NOW-60_000).toISOString()},elements};
}
const origin=[40.75,-73.955], dest=[40.75,-73.949];
const asGraph=(opts)=>prepareGraph(compileOSM(specimen(opts),bounds));
test('routes over a genuinely connected bridge rather than joining visually overlapping ways',()=>{
 const g=asGraph(), route=walkRoute(g,shortestPaths(g,origin),dest);
 assert.ok(route&&route.meters>900);
 assert.ok(route.geometry.some(node=>node[0]===40.752));
 assert.ok(route.geometry.every(node=>node[1]!==-73.9551));
 assert.equal(walkRoute(asGraph({legal:false}),shortestPaths(asGraph({legal:false}),origin),dest),null);
});
test('refuses to snap to an elevated interior even when geometrically nearest',()=>{
 const g=asGraph();
 assert.equal(snap(g,[40.75,-73.9551]).idx,snap(g,origin).idx);
 assert.equal(snap(g,[40.748,-73.961]),null);
 assert.equal(snap(g,[40.75,-74.1]),null);
});
test('only compiles adjacent OSM nodes, and excludes prohibited access',()=>{
 const osm=specimen();osm.elements.push(w(20,[1,100000,3],{highway:'footway'}));
 assert.equal(compileOSM(osm,bounds).edges.length,compileOSM(specimen(),bounds).edges.length);
 assert.ok(!walkable({highway:'trunk',foot:'yes'}));
 assert.ok(!walkable({highway:'footway',foot:'private'}));
 assert.ok(!walkable({highway:'footway','access:conditional':'no @ night'}));
 assert.ok(!walkable({highway:'residential',sidewalk:'separate'}));
 assert.ok(walkable({highway:'pedestrian',bridge:'yes',foot:'designated',access:'no'}));
});
test('rejects historical routing graph and stale operator status, including stale rows inside fresh feed',()=>{
 const g=asGraph(), row={id:'eligible',installed:true,renting:true,bikes:2,reportedAt:NOW-4000,lat:dest[0],lon:dest[1]};
 const rows=[row,{...row,id:'stale',reportedAt:NOW-340000},{...row,id:'zero',bikes:0}];
 assert.equal(walkingGraphState(g,NOW),'current');
 assert.equal(walkingGraphState(g,NOW+31*86400000),'historical');
 const o={lat:origin[0],lon:origin[1]};
 const opts={now:NOW};
 const feed={updatedAt:NOW-6000,rows};
 assert.deepEqual(withWalks(g,o,feed,opts).map(x=>x.id),['eligible']);
 assert.equal(withWalks(g,o,{...feed,updatedAt:NOW-400000},opts),null);
 assert.equal(withWalks(g,o,{...feed,sample:true},opts),null);
 assert.equal(withWalks(g,o,{...feed,updatedAt:NOW+31*86400000},{now:NOW+31*86400000}),null);
});
