# SportStream

Live sports streaming app built for the take-home assignment. Uses the same HLS.js player stack as `frontend/`, but loads streams from YAML instead of IPTV M3U playlists.

## Quick start

```bash
cd sports-streaming
npm install
npm run dev          # uses activeProfile from config/streams.yaml (default: test)
npm run dev:test     # force Apple HLS test streams
npm run dev:production  # force Buffstreams production profile
```

Open http://localhost:3001

### YouTube live streams

Add entries to `config/streams.yaml`:

```yaml
- type: youtube
  channelUrl: https://www.youtube.com/@NFL   # or /channel/UC...
```

On load, the app calls `/api/youtube/live` (Vite dev proxy) to scrape the channel's live page and check if it is broadcasting. If live, the card shows **Live** and opens a YouTube channel live embed (`/embed/live_stream?channel=...`); if not, the card shows **Not live** and is not clickable.

Supported channel URL formats: `/channel/UC...`, `/@handle`, `/user/name`. No YouTube Data API key required.

**Note:** YouTube live detection runs through the Vite dev server only (`npm run dev`). For production deploys, move the proxy logic to a backend route.

## Config profiles

Edit `config/streams.yaml`:

| Profile | Purpose | Source |
|---------|---------|--------|
| `test` | Development / QA | Apple official HLS sample streams |
| `production` | Live demo | Buffstreams (update URLs with live m3u8 endpoints) |

Switch profiles:

1. Set `activeProfile: test` or `activeProfile: production` in YAML, **or**
2. Set env var `VITE_STREAM_PROFILE=test|production`

## Architecture vs frontend

| frontend | sports-streaming |
|----------|------------------|
| Fetches IPTV-org M3U playlists | Loads curated streams from YAML |
| Generic TV categories (news, movies, sports…) | Sports-only (basketball, football, soccer, cricket) |
| `iptvService.ts` M3U parser | `streamService.ts` YAML loader + manifest health checks |
| Port 3000 | Port 3001 |

Shared: HLS.js with `lowLatencyMode`, Safari native HLS fallback, ABR quality selector, channel switching, PiP, volume persistence.

## Production URLs (Buffstreams)

Buffstreams pages embed streams rather than publishing stable public m3u8 URLs. Before your demo:

1. Open the live game page on Buffstreams
2. Extract the current HLS/m3u8 URL from network devtools
3. Paste into `config/streams.yaml` under `profiles.production.streams`

## Trade-offs

- **YAML over IPTV**: Predictable demo streams, no dependency on iptv-org availability; manual URL updates for live games.
- **Apple HLS for test**: Reliable ABR/latency testing without flaky aggregator sources.
- **Client-side health checks**: Validates manifest reachability on load; does not guarantee full playback if CDN blocks browser CORS mid-stream.
