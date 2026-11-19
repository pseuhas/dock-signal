import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDMARKS, sample } from '../../public/core.mjs';
import { recommendDock, PUBLIC_LANDMARKS } from '../recommendation.mjs';
const now=Date.parse('2026-11-19T18:00:00Z');
const station=(id,latitudeDelta,fields={})=>({
  id,name:'Dock '+id,lat:LANDMARKS.island.lat+latitudeDelta,lon:LANDMARKS.island.lon,
  bikes:4,docks:2,classics:3,ebikes:1,installed:true,renting:true,returning:true,reportedAt:now-20000,...fields
});
const snapshot=(rows,updatedAt=now-10000)=>({ rows,updatedAt });
const input={landmark:'Roosevelt Island',mode:'pickup'};
test('does not accept private location, coordinates or unknown parameters',()=>{
  for (const payload of [{landmark:'40.7573,-73.9541'}, {...input,lat:40.7573}, {...input,gps:{}},
    {landmark:'14 Main Street'}, {...input,mode:'unknown'}, null]) {
    const out=recommendDock(payload,null,now);
    assert.equal(out.status,'invalid_input');
    assert.deepEqual(out.supported_landmarks,PUBLIC_LANDMARKS);
    assert.equal(Object.hasOwn(out,'landmark'),false);
  }
});
test('no upstream snapshot, mock state, bad future header and stale feed fail closed',()=>{
  for (const data of [null,sample(now),snapshot([],now+1)]) {
    const out=recommendDock(input,data,now);
    assert.equal(out.status,'unavailable'); assert.equal(out.recommendation,null);
    assert.equal(out.backup,null);
  }
  const stale=recommendDock(input,snapshot([station('a',.0001)],now-301000),now);
  assert.equal(stale.status,'stale');
  assert.equal(stale.source_age_seconds,301);
  assert.equal(stale.recommendation,null);
});
test('caps availability bonus and chooses a distinct, usable backup',()=>{
  const out=recommendDock(input,snapshot([station('lone',.001,{bikes:1}),
    station('buffer',.0014,{bikes:6}),station('far',.006,{bikes:999}),
    station('closed',.0001,{renting:false}),station('later',.0001,{reportedAt:now+1})]),now);
  assert.equal(out.status,'ok'); assert.equal(out.recommendation.name,'Dock buffer');
  assert.equal(out.backup.name,'Dock lone'); assert.equal(out.source_age_seconds,10);
  const directions=new URL(out.recommendation.directions_url);
  assert.equal(directions.searchParams.get('travelmode'),'walking');
  assert.equal(directions.searchParams.has('origin'),false);
  assert.equal(Object.hasOwn(out.recommendation,'walking_minutes'),false);
});
test('separates return and e-bike modes; rejects stale station observations',()=>{
  const rows=[station('nodocks',.0002,{docks:0,ebikes:1}),station('nostart',.0004,{renting:false,docks:8,ebikes:3}),
    station('old',.0001,{reportedAt:now-300001,docks:8})];
  const result=recommendDock({landmark:'Roosevelt Island Tramway',mode:'return'},snapshot(rows),now);
  assert.equal(result.recommendation.name,'Dock nostart'); assert.equal(result.backup,null);
  const ebike=recommendDock({...input,mode:'electric'},snapshot(rows),now);
  assert.equal(ebike.recommendation.name,'Dock nodocks'); assert.equal(ebike.backup,null);
  assert.equal(recommendDock({...input,mode:'return'},snapshot(rows.slice(0,1)),now).status,'no_results');
});

