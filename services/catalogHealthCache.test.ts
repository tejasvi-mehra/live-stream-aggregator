import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  applyCachedHealthToCategories,
  mergeCatalogHealthResults,
  mergeEventHealthFromBatch,
  readCatalogHealthCache,
  resetBackgroundHealthState,
  shouldStartBackgroundHealth,
  writeCatalogHealthCache,
} from './catalogHealthCache';
import { isEventMarkedUnavailable } from './streamService';
import { StreamCategory, StreamEvent, StreamSource } from '../types';

const buildSource = (
  id: string,
  reachable: boolean,
  checkedAt: string,
  uncertain = false
): StreamSource => ({
  id,
  eventId: 'event-1',
  type: 'hls',
  url: `https://example.com/${id}.m3u8`,
  hidden: false,
  status: {
    reachable,
    latencyMs: reachable ? 100 : null,
    checkedAt,
    uncertain,
  },
});

const buildEvent = (streams: StreamSource[]): StreamEvent => ({
  id: 'event-1',
  name: 'Demo Event',
  logo: '',
  categoryId: 'basketball',
  categoryName: 'Basketball',
  streams,
});

const buildCategories = (event: StreamEvent): StreamCategory[] => [
  {
    id: 'basketball',
    name: 'Basketball',
    events: [event],
  },
];

describe('catalogHealthCache', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    resetBackgroundHealthState();
  });

  it('runs background health only once per page load', () => {
    expect(shouldStartBackgroundHealth()).toBe(true);
    expect(shouldStartBackgroundHealth()).toBe(false);
  });

  it('writes and reads cached event health for the active profile', () => {
    const event = buildEvent([buildSource('src-1', false, '2026-06-04T10:00:00.000Z')]);
    writeCatalogHealthCache('production', buildCategories(event));

    expect(readCatalogHealthCache('production')?.[0].streams[0].status?.reachable).toBe(false);
    expect(readCatalogHealthCache('test')).toBeNull();
  });

  it('keeps fresher per-event health when merging batch results', () => {
    const current = buildEvent([
      buildSource('src-1', true, '2026-06-04T11:00:00.000Z'),
    ]);
    const incoming = buildEvent([
      buildSource('src-1', false, '2026-06-04T10:00:00.000Z'),
    ]);

    const merged = mergeEventHealthFromBatch(current, incoming);
    expect(merged.streams[0].status?.reachable).toBe(true);
  });

  it('applies cached health onto a fresh catalog', () => {
    const cachedEvent = buildEvent([
      buildSource('event-1-src-0', false, '2026-06-04T10:00:00.000Z'),
    ]);
    cachedEvent.streams[0].id = 'event-1-src-0';

    const freshEvent: StreamEvent = {
      ...cachedEvent,
      streams: [
        {
          id: 'event-1-src-0',
          eventId: 'event-1',
          type: 'hls',
          url: 'https://example.com/a.m3u8',
          hidden: false,
        },
      ],
    };

    const merged = applyCachedHealthToCategories(buildCategories(freshEvent), [cachedEvent]);
    expect(merged[0].events[0].streams[0].status?.reachable).toBe(false);
  });

  it('merges health across categories by event id', () => {
    const current = buildCategories(
      buildEvent([buildSource('src-1', true, '2026-06-04T09:00:00.000Z')])
    );
    const incoming = buildCategories(
      buildEvent([buildSource('src-1', false, '2026-06-04T10:00:00.000Z')])
    );

    const merged = mergeCatalogHealthResults(current, incoming);
    expect(merged[0].events[0].streams[0].status?.reachable).toBe(false);
  });
});

describe('isEventMarkedUnavailable', () => {
  it('returns false before health is known', () => {
    const event = buildEvent([
      {
        id: 'src-1',
        eventId: 'event-1',
        type: 'hls',
        url: 'https://example.com/a.m3u8',
        hidden: false,
      },
    ]);

    expect(isEventMarkedUnavailable(event)).toBe(false);
  });

  it('returns false when health is uncertain', () => {
    const event = buildEvent([
      buildSource('src-1', false, '2026-06-04T10:00:00.000Z', true),
    ]);

    expect(isEventMarkedUnavailable(event)).toBe(false);
  });

  it('returns true when checked sources are all unavailable', () => {
    const event = buildEvent([
      buildSource('src-1', false, '2026-06-04T10:00:00.000Z'),
    ]);

    expect(isEventMarkedUnavailable(event)).toBe(true);
  });
});
