import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFeeds } from '../public/core.mjs';
import { PUBLIC_LANDMARKS, RECOMMENDATION_MODES, recommendDock } from './recommendation.mjs';

export const DOCK_URL = 'https://pseuhas.github.io/dock-signal/';
export const inputSchema = z.strictObject({
  landmark: z.string().min(1).max(100).describe('Name of a public landmark, not a street address or GPS coordinates. Examples: ' + PUBLIC_LANDMARKS.join(', ') + '.'),
  mode: z.enum(RECOMMENDATION_MODES).default('pickup').describe('Any bike (pickup), open dock (return), classic bike, or e-bike (electric).')
});

const CACHE_MS = 60_000;

// Share one public-feed request per instance/window. Failures are never substituted with fixtures.
export function buildFeedLoader({ read = () => readFeeds(), now = Date.now } = {}) {
  let pending, result, checkedAt = -Infinity;
  return async () => {
    if (now() - checkedAt < CACHE_MS) return result;
    if (!pending) pending = Promise.resolve().then(read).catch(() => null)
      .then(value => { result = value; checkedAt = now(); return value; })
      .finally(() => { pending = undefined; });
    return pending;
  };
}
const sharedFeed = buildFeedLoader();

export function makeServer({ loadFeed = sharedFeed, now = Date.now } = {}) {
  const server = new McpServer({ name: 'dock-signal', version: '0.2.0', websiteUrl: DOCK_URL });
  server.registerTool('recommend_dock', {
    title: 'Find a New York City bike or dock',
    description: 'Return a station and backup near a named public landmark using reported bike-share availability. This is a straight-line suggestion, not an ETA. Do not submit a private address or precise location.',
    inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async args => {
    // Reject unsupported landmarks before making an upstream request.
    const preliminary = recommendDock(args, null, now());
    let structuredContent = preliminary;
    if (preliminary.status !== 'invalid_input') {
      const snapshot = await Promise.resolve().then(loadFeed).catch(() => null);
      structuredContent = recommendDock(args, snapshot, now());
    }
    structuredContent = { ...structuredContent, app_url: DOCK_URL };
    return {
      structuredContent,
      content: [{ type: 'text', text: JSON.stringify(structuredContent) }]
    };
  });
  return server;
}
