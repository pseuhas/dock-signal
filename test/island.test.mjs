import test from 'node:test';
import assert from 'node:assert/strict';
import {LANDMARKS,FRESH_MS,nearbyRecommendations,rankStations,walkingLink,sample} from '../public/core.mjs';
const now=Date.parse('2026-11-23T12:00Z');
const reports={bikes:3,docks:2,ebikes:1,classics:2,installed:true,renting:true,returning:true,reportedAt:now-12000};
const tram={...reports,id:'b47e5ffd-4215-4476-a89b-ebe52111f763',lat:40.757284,lon:-73.9536};
const south={...reports,id:'legacy-gbfs-id',shortName:'6566.01',lat:40.753702,lon:-73.958652};
const motorgate={...reports,id:'88bf1344-354f-4699-bdbd-1c2584fc41ee',lat:40.763909,lon:-73.947721};
const north={...reports,id:'2263855457844687416',lat:40.766359,lon:-73.945787};
const west={...reports,id:'66dd4356-0aca-4d06-aa7c-3863bb44ef7c',lat:40.761227,lon:-73.960940};
const snapshot=rows=>({updatedAt:now-2000,rows});
test('Roosevelt Island avoids a closer Manhattan station and has a distinct island backup',()=>{
  const origin={...LANDMARKS.island,lat:40.7537,lon:-73.9586};
  const xs=[{...south,reportedAt:now-FRESH_MS-1},west,motorgate,north,{...tram,reportedAt:null}];
  assert.equal(rankStations(xs,origin,{now})[0].id,west.id);
  const out=nearbyRecommendations(snapshot(xs),origin,'pickup',now);
  assert.equal(out.best.id,motorgate.id);
  assert.equal(out.backup.id,north.id);
});
test('low accuracy/unknown geography preserves distance ranking; local fix scopes recommendations',()=>{
  const fix={lat:tram.lat,lon:tram.lon,accuracy:15};
  assert.equal(nearbyRecommendations(snapshot([south]),fix,'return',now).island,true);
  assert.equal(nearbyRecommendations(snapshot([south]),{...fix,accuracy:150},'return',now).island,false);
  assert.equal(nearbyRecommendations(snapshot([tram,west]),west,'pickup',now).best.id,west.id);
});
test('stale, missing, unknown count, moved identity, and sample never become island recommendations',()=>{
  const origin=LANDMARKS.island;
  const cases=[
    snapshot([{...tram,ebikes:null},west]),
    snapshot([{...tram,reportedAt:null},west]),
    snapshot([{...tram,reportedAt:now-FRESH_MS-1},west]),
    snapshot([{...west,id:tram.id}]),
    {...snapshot([tram]),updatedAt:now-FRESH_MS-1},
    sample(now),null,
  ];
  for(const x of cases) assert.deepEqual(nearbyRecommendations(x,origin,'electric',now),{island:true,best:null,backup:null});
  assert.equal(nearbyRecommendations(snapshot([south]),origin,'return',now).best.id,south.id);
  assert.equal(new URL(walkingLink(tram)).searchParams.has('origin'),false);
});
