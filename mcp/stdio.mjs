import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { makeServer } from './server.mjs';

await makeServer().connect(new StdioServerTransport());
