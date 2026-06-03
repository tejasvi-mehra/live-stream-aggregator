import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  checkCatalogHealth,
  checkEventHealth,
  findFailoverSource,
  findNextPlayableSourceInEvent,
  getFeaturedEvent,
  isSourcePlayable,
  loadConfiguredCatalog,
} from './streamService';
import { StreamCategory, StreamEvent, StreamSource } from '../types';
import { getCatalogUrl } from './catalogUrl';

const sampleCatalogYaml = `
activeProfile: production
profiles:
  production:
    description: Test catalog
    categories:
      - id: basketball
        name: Basketball
        events:
          - id: event-1
            name: Demo
            logo: https://example.com/logo.png
            streams:
              - url: https://example.com/a.m3u8
`;

const buildSource = (
  id: string,
  reachable: boolean,
  overrides: Partial<StreamSource> = {}
): StreamSource => ({
  id,
  eventId: 'event-1',
  type: 'hls',
  url: `https://example.com/${id}.m3u8`,
  hidden: false,
  status: {
    reachable,
    latencyMs: reachable ? 100 : null,
    checkedAt: new Date().toISOString(),
  },
  ...overrides,
});

const buildEvent = (streams: StreamSource[]): StreamEvent => ({
  id: 'event-1',
  name: 'Demo Event',
  logo: '',
  categoryId: 'basketball',
  categoryName: 'Basketball',
  streams,
});

describe('loadConfiguredCatalog', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_CATALOG_URL', '');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === getCatalogUrl()) {
          return new Response(sampleCatalogYaml, {
            status: 200,
            headers: { 'Content-Type': 'text/yaml' },
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('loads categories from the hosted YAML URL', async () => {
    const result = await loadConfiguredCatalog(true);
    expect(result.profile.key).toBe('production');
    expect(result.profile.description).toBe('Test catalog');
    expect(result.categories[0].events[0].streams[0].url).toBe('https://example.com/a.m3u8');
    expect(result.featuredEventId).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      getCatalogUrl(),
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('uses the first featured event in YAML file order', async () => {
    const featuredYaml = `
activeProfile: production
profiles:
  production:
    description: Featured catalog
    categories:
      - id: basketball
        name: Basketball
        events:
          - id: second-featured
            name: Second Featured
            featured: true
            streams:
              - url: https://example.com/second.m3u8
      - id: soccer
        name: Soccer
        events:
          - id: first-featured
            name: First Featured
            featured: true
            streams:
              - url: https://example.com/first.m3u8
`;

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(featuredYaml, { status: 200 }))
    );

    const result = await loadConfiguredCatalog(true);
    expect(result.featuredEventId).toBe('second-featured');
    expect(getFeaturedEvent(result.categories, result.featuredEventId)?.name).toBe(
      'Second Featured'
    );
  });

  it('sorts categories by the configured display order', async () => {
    const orderedYaml = `
activeProfile: production
profiles:
  production:
    description: Ordered catalog
    categories:
      - id: youtube
        name: YouTube Live Streams
        events:
          - id: yt-1
            name: Channel
            streams:
              - type: youtube
                channelId: UCZkd1SsoIdSY-8FEvvwRyEw
      - id: soccer
        name: Soccer
        events:
          - id: soccer-1
            name: Soccer Match
            streams:
              - url: https://example.com/soccer.m3u8
      - id: basketball
        name: Basketball
        events:
          - id: bb-1
            name: Basketball Game
            streams:
              - url: https://example.com/basketball.m3u8
`;

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(orderedYaml, { status: 200 }))
    );

    const result = await loadConfiguredCatalog(true);
    expect(result.categories.map((category) => category.id)).toEqual([
      'basketball',
      'soccer',
      'youtube',
    ]);
  });
});

describe('checkCatalogHealth', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/hls/health/batch') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              results: {
                'https://example.com/a.m3u8': {
                  reachable: true,
                  latencyMs: 42,
                  checkedAt: '2026-06-02T00:00:00.000Z',
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.includes('/api/youtube/live')) {
          return new Response(JSON.stringify({ isLive: false, error: 'Not live' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the batch health endpoint for HLS sources', async () => {
    const categories: StreamCategory[] = [
      {
        id: 'basketball',
        name: 'Basketball',
        events: [
          {
            id: 'event-1',
            name: 'Demo',
            logo: '',
            categoryId: 'basketball',
            categoryName: 'Basketball',
            streams: [buildSource('src-0', false, { url: 'https://example.com/a.m3u8' })],
          },
        ],
      },
    ];

    const result = await checkCatalogHealth(categories);
    expect(result.healthUnavailable).toBe(false);
    expect(result.categories[0].events[0].streams[0].status?.reachable).toBe(true);
    expect(result.categories[0].events[0].streams[0].playbackUrl).toContain('/api/hls/proxy?url=');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3002/api/hls/health/batch',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('falls back to degraded HLS health when batch check fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network error');
      })
    );

    const categories: StreamCategory[] = [
      {
        id: 'basketball',
        name: 'Basketball',
        events: [
          {
            id: 'event-1',
            name: 'Demo',
            logo: '',
            categoryId: 'basketball',
            categoryName: 'Basketball',
            streams: [buildSource('src-0', false, { url: 'https://example.com/a.m3u8' })],
          },
        ],
      },
    ];

    const result = await checkCatalogHealth(categories);
    expect(result.healthUnavailable).toBe(true);
    expect(result.categories[0].events[0].streams[0].status?.uncertain).toBe(true);
    expect(isSourcePlayable(result.categories[0].events[0].streams[0])).toBe(true);
  });
});

describe('checkEventHealth', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/hls/health/batch') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              results: {
                'https://example.com/a.m3u8': {
                  reachable: true,
                  latencyMs: 42,
                  checkedAt: '2026-06-02T00:00:00.000Z',
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('checks only the selected event URLs', async () => {
    const event = buildEvent([buildSource('src-0', false, { url: 'https://example.com/a.m3u8' })]);
    const result = await checkEventHealth(event);

    expect(result.healthUnavailable).toBe(false);
    expect(result.event.streams[0].status?.reachable).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3002/api/hls/health/batch',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ urls: ['https://example.com/a.m3u8'] }),
      })
    );
  });
});

describe('findFailoverSource', () => {
  it('returns the next playable source in YAML order', () => {
    const event = buildEvent([
      buildSource('src-0', false),
      buildSource('src-1', true),
      buildSource('src-2', true),
    ]);

    expect(findFailoverSource(event, 'src-0')?.id).toBe('src-1');
    expect(findFailoverSource(event, 'src-1')?.id).toBe('src-2');
  });

  it('wraps around to the first playable source', () => {
    const event = buildEvent([
      buildSource('src-0', true),
      buildSource('src-1', false),
    ]);

    expect(findFailoverSource(event, 'src-1')?.id).toBe('src-0');
  });
});

describe('findNextPlayableSourceInEvent', () => {
  it('cycles only playable sources', () => {
    const event = buildEvent([
      buildSource('src-0', true),
      buildSource('src-1', false),
      buildSource('src-2', true),
    ]);

    expect(findNextPlayableSourceInEvent(event, 'src-0', 1)?.id).toBe('src-2');
  });
});

describe('isSourcePlayable', () => {
  it('requires channelId for YouTube sources', () => {
    const youtube = buildSource('yt-1', true, {
      type: 'youtube',
      channelId: 'UC1234567890123456789012',
      url: '',
    });
    expect(isSourcePlayable(youtube)).toBe(true);
    expect(isSourcePlayable({ ...youtube, channelId: undefined })).toBe(false);
  });
});
