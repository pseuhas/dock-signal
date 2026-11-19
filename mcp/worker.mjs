import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { makeServer } from './server.mjs';

const MAX_BODY_BYTES = 16_384;

// One server per HTTP request; no user sessions, request bodies or location are stored.
export function buildWorker(serverFactory = makeServer) {
  return {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === '/health' && request.method === 'GET') {
        return Response.json({ status: 'ok', name: 'dock-signal' }, { headers: { 'cache-control': 'no-store' } });
      }
      if (pathname !== '/mcp') return new Response('Not found', { status: 404 });
      if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: { Allow: 'POST' } });
      if (!request.headers.get('content-type')?.includes('application/json')) {
        return new Response('Use application/json', { status: 415 });
      }
      if (request.headers.get('origin')) return new Response('Browser origins not accepted', { status: 403 });
      const reader = request.body?.getReader();
      if (!reader) return new Response('Empty body', { status: 400 });
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) { await reader.cancel(); return new Response('Body too large', { status: 413 }); }
        chunks.push(value);
      }
      let body;
      try { body = JSON.parse(await new Blob(chunks).text()); }
      catch { return new Response('Invalid JSON', { status: 400 }); }
      const cleanRequest = new Request(request, { body: JSON.stringify(body) });
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      const server = serverFactory();
      await server.connect(transport);
      try {
        return await transport.handleRequest(cleanRequest, { parsedBody: body });
      } finally {
        await server.close();
      }
    }
  };
}

export default buildWorker();
