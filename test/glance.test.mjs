import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LANDMARKS,FRESH_MS,closestAvailable,sample} from '../public/core.mjs';
const now=Date.parse('2026-11-19T18:40:00Z');
const origin=LANDMARKS.grand;
const base={...origin,installed:true,renting:true,returning:true,bikes:2,docks:1,ebikes:0,classics:2,reportedAt:now-5_000};
const rows=[
  {...base,id:'freshness',reportedAt:now-FRESH_MS-1},
  {...base,id:'closed',installed:false},
  {...base,id:'empty',bikes:0,docks:0,ebikes:0},
  {...base,id:'pickup',lat:origin.lat+.001,docks:0},
  {...base,id:'return',lat:origin.lat+.002,bikes:0,ebikes:0},
  {...base,id:'electric',lat:origin.lat+.003,ebikes:1,docks:0},
  {...base,id:'out-of-radius',lat:origin.lat+.04,ebikes:3}
];
const snapshot={updatedAt:now-1000,rows};
test('featured dock is the nearest fresh eligible match for the selected action',()=>{
  assert.equal(closestAvailable(snapshot,origin,'pickup',now).id,'pickup');
  assert.equal(closestAvailable(snapshot,origin,'return',now).id,'return');
  assert.equal(closestAvailable(snapshot,origin,'electric',now).id,'electric');
});
test('stale, missing, synthetic, and unavailable data never create featured recommendations',()=>{
  assert.equal(closestAvailable({...snapshot,updatedAt:now-FRESH_MS-1},origin,'pickup',now),null);
  assert.equal(closestAvailable({...snapshot,rows:rows.slice(0,3)},origin,'pickup',now),null);
  assert.equal(closestAvailable(sample(now),origin,'pickup',now),null);
  assert.equal(closestAvailable(null,origin,'pickup',now),null);
});
test('primary modes and answer precede optional settings and detailed results',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/Pick up a bike.*Return a bike/s);
  assert.ok(html.indexOf('id="featured"') < html.indexOf('<details'));
  assert.ok(html.indexOf('<details') < html.indexOf('id="stations"'));
  assert.match(html,/<a id="directions"[^>]* hidden>/);
});
