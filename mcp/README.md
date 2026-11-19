# Dock Signal MCP

A narrow, read-only decision tool for assistants. For example: “Which station near Roosevelt Island has an e-bike, and where should I walk if it's empty?” Pass an explicit public landmark. Precise coordinates, private addresses and arbitrary upstream URLs are not accepted. No model key is required.

## Run and evaluate

From the repository root:

```sh
npm ci --prefix mcp --ignore-scripts
npm test --prefix mcp
npm start --prefix mcp       # MCP stdio; connect an MCP-compatible client
```

Tool arguments: `{"landmark":"Roosevelt Island","mode":"electric"}`. Modes: `pickup`, `return`, `classic`, and `electric`. A successful result includes a reported count, straight-line distance, operator timestamps and a directions link per station. The link includes the station destination only, never the user's origin. Prefer the web app for private location-aware browsing.

The tests use injected clocks and fixtures to check stale/missing feeds, stale station observations, missing resource counts, backup diversity, location payload rejection, single-flight caching, and the actual MCP client/HTTP contracts. They do not measure model quality or claim predictive accuracy.

## Hosting and operation

`worker.mjs` implements stateless Streamable HTTP with JSON replies on POST /mcp. It has no subscriptions or streaming state; /health is liveness, not feed health. Normal upstream failures are structured tool results with no recommendation. Request bodies are bounded, browser origins are rejected, destinations are fixed and the public feed is coalesced for 60 seconds per isolate. Nothing is written to disk or logged by the app. Deploy in your own Worker account with Wrangler, and enforce rate limits at the edge before public launch. The Worker is not included in GitHub Pages and is not yet wired into ChatGPT. Client compatibility should be tested against that hosted URL before launch.

This is a deliberately small service, not a text-generation wrapper: the model selects a typed tool but doesn't compute distances, invent availability, or invent a route. Straight-line proximity plus a capped count bonus is transparent and easy to evaluate, but can mis-rank stations across water. An on-device pedestrian graph is a separate upgrade; see [the experimental router and its promotion gate](../experiments/walk-routing/README.md). We do not publish an archive of operator data.
