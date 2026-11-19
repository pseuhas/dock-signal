import test from 'node:test';
import assert from 'node:assert/strict';
import {LANDMARKS,FRESH_MS,joinFeeds,rankStations,ageState,walkingLink,readFeeds,sample} from '../public/core.mjs';
const now=Date.parse('2026-01-01T17:00:00Z');
const seconds=now/1000;
const p=LANDMARKS.island;
const station=(id,d=0)=>({station_id:id,name:'Synthetic '+id,lat:p.lat+d,lon:p.lon,capacity:25});
const report=(id,e={})=>({station_id:id,num_bikes_available:8,num_ebikes_available:2,num_docks_available:3,is_installed:1,is_renting:1,is_returning:1,last_reported:seconds-15,...e});
const wrapper=(stations)=>({data:{stations},last_updated:seconds-20,ttl:60});
test('joins by id and excludes missing or invalid coordinates',()=>{
  const x=joinFeeds(wrapper([station('a'),{...station('b'),lat:null}]),wrapper([report('a'),report('b'),report('c')]),now);
  assert.equal(x.rows.length,1);assert.equal(x.rows[0].classics,6);assert.equal(x.rows[0].docks,3);assert.equal(x.updatedAt,now-20000);
});
test('supports alternate count field and does not guess missing electric counts',()=>{
  const x=joinFeeds(wrapper([station('a')]),wrapper([report('a',{num_bikes_available:null,num_vehicles_available:4,num_ebikes_available:9})]),now).rows[0];
  assert.equal(x.bikes,4);assert.equal(x.ebikes,null);assert.equal(x.classics,null);
});
test('deduplicates using most recent report and rejects future timestamps',()=>{
  const x=joinFeeds(wrapper([station('a'),station('b')]),wrapper([report('a',{last_reported:seconds-80}),report('a',{num_bikes_available:10}),report('b',{last_reported:seconds+400})]),now);
  assert.equal(x.rows.length,1);assert.equal(x.rows[0].bikes,10);
  assert.throws(()=>joinFeeds(wrapper([station('a')]),{...wrapper([report('a')]),last_updated:seconds+400},now),/timestamp/);
});
test('distinguishes pickup, return, freshness and empty results',()=>{
  const x=joinFeeds(wrapper([station('a'),station('b',.001),station('c',.002),station('d',.05)]),wrapper([report('a',{is_renting:0}),report('b'),report('c',{last_reported:seconds-400}),report('d')]),now);
  assert.deepEqual(rankStations(x.rows,p,{now}).map(r=>r.id),['b']);
  assert.deepEqual(rankStations(x.rows,p,{mode:'return',now}).map(r=>r.id),['a','b']);
  assert.deepEqual(rankStations(x.rows,p,{mode:'return',now,availableOnly:false}).map(r=>r.id),['a','b','c']);
  assert.deepEqual(rankStations(x.rows,p,{now,radius:10}),[]);
  assert.equal(ageState(x, x.updatedAt+FRESH_MS+1),'stale');
  assert.equal(ageState(sample(now),now),'sample');
});
test('feed requests omit credentials and propagate upstream failures',async()=>{
  const calls=[];
  const fetcher=async(url,opts)=>{calls.push([url,opts]);return {ok:true,json:async()=>url.includes('information')?wrapper([station('a')]):wrapper([report('a')])};};
  assert.equal((await readFeeds(fetcher,()=>now)).rows.length,1);
  assert.equal(calls.length,2);
  assert.ok(calls.every(([url,o])=>url.startsWith('https://gbfs.citibikenyc.com/')&&o.credentials==='omit'&&o.signal));
  await assert.rejects(readFeeds(async()=>({ok:false,status:429}),()=>now),/429/);
});
test('walking link includes station destination but no private origin',()=>{
  const u=new URL(walkingLink(station('a')));
  assert.equal(u.origin,'https://www.google.com');assert.equal(u.searchParams.get('travelmode'),'walking');
  assert.equal(u.searchParams.get('origin'),null);
});
