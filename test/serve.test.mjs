import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import test from 'node:test';

test('preview serves island module with JavaScript MIME type and rejects unknown paths',async()=>{
  const child=spawn(process.execPath,['scripts/serve.mjs'],{
    env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit'],
  });
  try{
    const [stdout]=await once(child.stdout,'data',{signal:AbortSignal.timeout(5000)});
    const origin=stdout.toString().match(/http:\/\/localhost:(\d+)/);
    assert.ok(origin,'preview must log its bound port');
    const base='http://127.0.0.1:'+origin[1];
    const response=await fetch(base+'/island.mjs',{signal:AbortSignal.timeout(3000)});
    assert.equal(response.status,200);
    assert.match(response.headers.get('Content-Type'),/^text\/javascript/);
    assert.match(await response.text(),/export function onIslandStation/);
    assert.equal((await fetch(base+'/unknown.mjs',{signal:AbortSignal.timeout(3000)})).status,404);
  }finally{
    child.kill();
  }
});
