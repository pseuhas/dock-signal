# Dock Signal

A small, live NYC bike-share finder. Choose where to start, then see the nearest stations with a bike to pick up or a dock to return one into. There are separate classic and e-bike filters, an optional browser-location button, and a schematic to orient the list. Routes open in a mapping service; no route estimates are fabricated.

| Run | Command |
| --- | --- |
| Unit and contract tests | `npm test` (Node 22+, no install step) |
| Local preview | `npm start`; visit http://localhost:4173 |
| Offline UI fixture | open `/?demo=1` |
| Static deploy | In a public GitHub repo, select Settings → Pages → Source → GitHub Actions. The included workflow tests, uploads and deploys `public/` on main. |

## Signals and boundaries

- **Inputs:** two public [operator GBFS feeds](https://citibikenyc.com/system-data): station information supplies coordinates and display names; station status supplies availability. Both are requested in parallel, without credentials, and joined by station ID. Each refresh re-reads station metadata to handle stations moving or closing.
- **Freshness:** The app checks source time and each station’s last report. Overall feed age over five minutes is visibly stale. On a fresh feed, default results exclude stale individual reports, unknown or zero counts, and stations not accepting the selected action. A failed request retains the last observation in memory; after one day, it is discarded. Cold-start failure shows labeled fictional results. Sample and live data never mix. Polling is bounded to at most once per 30 seconds on a visible tab (plus manual refresh); Citi Bike reports a 60-second TTL.
- **Distance:** Haversine distance ranks eligible stations within 2.5 km, with an explicit straight-line label. That can rank a station across the East River ahead of a reachable station. The schematic is not a basemap, and actual walking directions depend on crossings and street access.
- **Availability:** Use operator pickup/return flags and reject invalid observations. A classic-bike count is total minus e-bikes only when both observed counts are coherent. A null is unknown, not zero. Counts are not reservations and can change.
- **Privacy / license:** The origin lives in JS memory only, never in GBFS requests, URLs or storage. Outbound directions send just the selected dock’s location to Google Maps; Google Maps may request a start location separately. No analytics, raw feed snapshots, avatars or camera footage are stored or redistributed. See [operator data sharing policy](https://citibikenyc.com/data-sharing-policy); independent, not official.

## Why this design

A current station-finder view needs two small public requests, not a streaming warehouse. Browser-side GBFS eliminates a proxy, API keys and recurring cost, avoids logging user coordinates, and can deploy as static files. Tradeoff: there is no server-side availability history or cross-client cache. A scheduler or queue is justified only if a future product needs aggregate history and has clearance under the operator's policy.

Vanilla ES modules and Node's test runner keep installation trivial; pure parsing, freshness and ranking functions are tested separately from rendering. An SVG schematic is intentionally lighter than a map embed and never requests external map tiles. Browser support assumes modern browsers with fetch, secure geolocation (HTTPS or localhost) and ES modules.
