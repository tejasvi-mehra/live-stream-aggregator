# Live Stream Aggregator

Sports live-stream aggregator built for the take-home assignment. It uses the same HLS.js player stack as `frontend/`, but loads a curated catalog from YAML instead of IPTV M3U playlists.

Package name: `live-stream-aggregator`

## Quick start

```bash
npm install
npm run dev               # uses activeProfile from config/streams.yaml (default: test)
npm run dev:test          # force test profile
npm run dev:production    # force production profile
npm run build             # static production build
npm run preview           # preview the production build
```

Open http://localhost:3001

Optional env (copy `.env.example` → `.env`):

```bash
# Disable all YouTube sources at build time (no UI toggle)
VITE_YOUTUBE_ENABLED=false

# Override YAML activeProfile without editing streams.yaml
VITE_STREAM_PROFILE=production
```

## Config structure

Streams are defined in `config/streams.yaml` as **categories → events → streams**:

```yaml
activeProfile: test

profiles:
  test:
    description: Apple HLS sample streams for development and QA.
    categories:
      - id: basketball
        name: Basketball
        events:
          - id: demo-basketball
            name: Demo Basketball
            logo: https://example.com/logo.png
            streams:
              - url: https://example.com/stream/master.m3u8
              - url: https://example.com/stream/backup.m3u8
              - type: youtube
                channelUrl: https://www.youtube.com/@ChannelHandle
```

### Stream fields

| Field | Applies to | Description |
|-------|------------|-------------|
| `url` | HLS (default) | Direct m3u8 manifest URL |
| `type: youtube` | YouTube | Marks source as a YouTube channel |
| `channelUrl` | YouTube | Channel page (`/channel/UC...`, `/@handle`, `/user/name`) |
| `channelId` | YouTube | Optional `UC...` ID; resolved automatically when omitted |
| `hidden: true` | Any | Backend-only source — used for playback/failover, not shown on event cards |

### Profiles

| Profile | Purpose | Contents |
|---------|---------|----------|
| `test` | Development / QA | Apple HLS demo streams only — same two manifests shared across all sports, no YouTube, no hidden sources |
| `production` | Live demo | Curated mix of HLS, YouTube, and hidden backend sources across basketball, cricket, football, motorsport, and soccer |

Switch profiles via `activeProfile` in YAML or `VITE_STREAM_PROFILE=test|production`.

## Features

### Catalog and UI

- Events grouped by sport category (alphabetically)
- Search and category filter pills
- Event cards show live/offline status, source count, and YouTube badge when applicable
- Empty sport categories are still shown with a “No events for this category” message when filtered down to zero events

### Multi-source playback

Each event can have multiple sources. The player footer shows clickable source links:

- HLS sources → **Source 1**, **Source 2**, …
- YouTube sources → **YouTube 1**, **YouTube 2**, …

Numbering is per type and includes hidden backend sources in order.

**Next / Prev** cycles playable sources within the same event only (not across events).

**Failover:** on a fatal HLS error, the player automatically tries the next playable source in YAML order.

**Hidden sources** (e.g. backend HLS URLs in production) are not listed on event cards but participate in playback, failover, and source numbering.

### HLS player

- HLS.js with `lowLatencyMode`, Safari native HLS fallback
- ABR quality selector, picture-in-picture, volume/mute persistence
- Auto-play next source toggle

### YouTube live streams

Add a YouTube source to any event:

```yaml
- type: youtube
  channelUrl: https://www.youtube.com/@NFL
```

On load the app calls `/api/youtube/live` (Vite dev proxy) to:

1. Resolve `@handle` URLs to a channel ID (page scrape — no YouTube Data API key)
2. Check the channel's `/live` page for a live broadcast
3. Mark the event playable only when live

Playback uses the channel live iframe embed:

`https://www.youtube.com/embed/live_stream?channel=CHANNEL_ID`

Supported channel URL formats: `/channel/UC...`, `/@handle`, `/user/name`.

**Kill switch:** set `VITE_YOUTUBE_ENABLED=false` in `.env` to strip all YouTube sources from the catalog at build time. There is no client-side toggle.

**Note:** YouTube live detection runs through the Vite dev server only (`npm run dev`). For a deployed static build, move the proxy logic to a backend route.

### Health checks

On app load, the catalog runs reachability checks:

- **HLS:** fetches the manifest and validates `#EXTM3U`
- **YouTube:** calls the dev proxy live check described above

Events are clickable only when at least one source is playable.

## Project layout

```
live-stream-aggregator/
├── config/streams.yaml      # Catalog profiles
├── services/
│   ├── streamService.ts     # YAML load, health checks, failover, catalog helpers
│   └── youtubeService.ts    # YouTube live client + embed URL builder
├── plugins/youtubeApi.ts    # Dev-server proxy for YouTube live scraping
├── components/
│   ├── EventCard.tsx        # Event tile with status badges
│   ├── VideoPlayer.tsx      # HLS player with failover
│   ├── YouTubePlayer.tsx    # YouTube channel live embed
│   ├── SourceSwitcher.tsx   # Multi-source footer links
│   └── ...
└── assets/                  # Production event logos (referenced as /assets/...)
```

## Architecture vs frontend

| frontend | live-stream-aggregator |
|----------|------------------------|
| Fetches IPTV-org M3U playlists | Loads curated streams from YAML |
| Generic TV categories | Sports categories with events |
| `iptvService.ts` M3U parser | `streamService.ts` YAML loader + health checks |
| Single stream per channel | Multiple sources per event with failover |
| Port 3000 | Port 3001 |

Shared: HLS.js, Safari native fallback, ABR quality selector, PiP, volume persistence.

## Updating production streams

Production HLS URLs (including aggregator sources) change frequently. To update:

1. Open the live event page or inspect network traffic for the current m3u8 URL
2. Paste into `config/streams.yaml` under the relevant event in `profiles.production`
3. Use `hidden: true` for backend-only sources that should not appear on the event card

For YouTube events, only `channelUrl` (and optionally `channelId`) is needed — the app handles live detection and embed playback.

## Trade-offs

- **YAML over IPTV:** Predictable demo streams; manual URL updates for live games.
- **Apple HLS test profile:** Reliable ABR/latency testing without flaky live sources.
- **YouTube scrape vs Data API:** No API key or quota limits; less reliable than the official API and requires a server-side proxy in production.
- **Client-side HLS health checks:** Validates manifest reachability on load; does not guarantee playback if CDN blocks browser CORS mid-stream.
- **Hidden sources:** Keeps aggregator/backend URLs off the UI while still enabling failover within an event.
