import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { LANDMARKS } from '../../public/core.mjs';
import { makeServer, buildFeedLoader } from '../server.mjs';
import { buildWorker } from '../worker.mjs';

const now = Date.parse('2026-11-19T19:00:00Z');
const snapshot = { updatedAt: now-5000, rows: [
  { id:'x', name:'Near Dock', lat:LANDMARKS.island.lat, lon:LANDMARKS.island.lon, count:5, ebikes:3, docks:6, pickup:true, returning:true, reportedAt:now-2000 }
]};
async function clientWith(loadFeed) {
  const server=makeServer({loadFeed,now:()=>now});
  const client=new Client({name:'contract-eval',version:'1.0.0'});
  const [c,s]=InMemoryTransport.createLinkedPair();
  await server.connect(s);
  await client.connect(c);
  return [client,server];
}
test('MCP tool is discoverable, read-only, and refuses unsupported or private location fields', async () => {
  let calls=0;
  const [c,s]=await clientWith(async()=>{calls++;return snapshot});
  try {
    const {tools}=await c.listTools();
    assert.equal(tools.length,1);
    assert.equal(tools[0].name,'recommend_dock');
    assert.equal(tools[0].annotations.readOnlyHint,true);
    assert.equal(tools[0].inputSchema.additionalProperties,false);
    const privateInput=await c.callTool({name:'recommend_dock',arguments:{landmark:'Roosevelt Island',lat:40,lon:-73}});
    assert.equal(privateInput.isError,true);
    const unknown=await c.callTool({name:'recommend_dock',arguments:{landmark:'Unknown origin'}});
    assert.equal(unknown.structuredContent.status,'invalid_input');
    assert.equal(calls,0);
  } finally { await c.close(); await s.close(); }
});
test('source outage responses are structured and never make a recommendation',async()=>{
  const [c,s]=await clientWith(async()=>{throw Error('source unavailable')});
  try{
    const r=await c.callTool({name:'recommend_dock',arguments:{landmark:'Roosevelt Island',mode:'return'}});
    assert.equal(r.structuredContent.status,'unavailable');
    assert.equal(r.structuredContent.recommendation,null);
    assert.ok(!r.structuredContent.message.includes('source unavailable'));
  }finally{await c.close();await s.close()}
});
test('feed requests are coalesced and are refreshed after operator TTL',async()=>{
  let clock=now,calls=0;
  const load=buildFeedLoader({now:()=>clock,read:async()=>{calls++;return snapshot}});
  assert.deepEqual(await Promise.all([load(),load(),load()]),[snapshot,snapshot,snapshot]);
  assert.equal(calls,1);
  clock+=59_000; await load(); assert.equal(calls,1);
  clock+=1000; await load(); assert.equal(calls,2);
});
const wire=(value, headers={})=>new Request('https://example.org/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...headers},body:JSON.stringify(value)});
test('stateless HTTP transport answers initialize and repeated tool-list requests',async()=>{
  const app=buildWorker(()=>makeServer({loadFeed:async()=>snapshot,now:()=>now}));
  let r=await app.fetch(wire({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'probe',version:'1.0'}}}));
  assert.equal(r.status,200);
  assert.equal((await r.json()).result.serverInfo.name,'dock-signal');
  for(let i=2;i<4;i++){
    r=await app.fetch(wire({jsonrpc:'2.0',id:i,method:'tools/list'}));
    assert.equal(r.status,200);
    assert.equal((await r.json()).result.tools[0].name,'recommend_dock');
  }
});
test('HTTP transport rejects foreign browser origins, large bodies and non-MCP paths',async()=>{
  const app=buildWorker();
  assert.equal((await app.fetch(wire({}, {origin:'https://example.net'}))).status,403);
  assert.equal((await app.fetch(wire({payload:'a'.repeat(17_000)}))).status,413);
  assert.equal((await app.fetch(new Request('https://example.org/other'))).status,404);
  assert.equal((await app.fetch(new Request('https://example.org/health'))).status,200);
});
