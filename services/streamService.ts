
import yaml from 'js-yaml';
import {
  StreamCategory,
  StreamEvent,
  StreamHealthStatus,
  StreamSource,
  StreamsConfig,
  StreamType,
  CatalogHealthResult,
} from '../types';
import { resolveYouTubeLive } from './youtubeService';
import { apiUrl } from './apiBase';
import { getCatalogUrl } from './catalogUrl';
import { applyAudioTrackHealth } from './audioTracks';

const envProfile = import.meta.env.VITE_STREAM_PROFILE as 'test' | 'production' | undefined;

let cachedConfig: StreamsConfig | null = null;

export const SEARCH_RESULTS_CATEGORY_ID = 'search-results';

const getActiveProfileKey = (config: StreamsConfig): 'test' | 'production' => {
  if (envProfile === 'test' || envProfile === 'production') {
    return envProfile;
  }
  return config.activeProfile;
};

export const fetchStreamsConfig = async (refresh = false): Promise<StreamsConfig> => {
  if (cachedConfig && !refresh) {
    return cachedConfig;
  }

  const response = await fetch(getCatalogUrl(), {
    cache: 'no-store',
    headers: {
      Accept: 'text/yaml, text/plain, application/yaml, */*',
    },
  });

  if (!response.ok) {
    throw new Error(`Catalog fetch failed: HTTP ${response.status}`);
  }

  const parsed = yaml.load(await response.text()) as StreamsConfig;
  if (!parsed?.profiles) {
    throw new Error('Invalid catalog YAML: missing profiles');
  }

  cachedConfig = parsed;
  return parsed;
};

export interface LoadedCatalog {
  categories: StreamCategory[];
  featuredEventId: string | null;
  profile: {
    key: 'test' | 'production';
    description: string;
  };
}

export const getProfileMeta = () => {
  if (!cachedConfig) {
    const key =
      envProfile === 'test' || envProfile === 'production' ? envProfile : 'production';
    return { key, description: '' };
  }

  const key = getActiveProfileKey(cachedConfig);
  return {
    key,
    description: cachedConfig.profiles[key].description,
  };
};

const CATEGORY_SORT_ORDER: Record<string, number> = {
  basketball: 0,
  cricket: 1,
  football: 2,
  soccer: 3,
  motorsport: 4,
  'red-bull': 5,
  youtube: 6,
};

const sortCategories = (categories: StreamCategory[]): StreamCategory[] => {
  return [...categories].sort((a, b) => {
    const aOrder = CATEGORY_SORT_ORDER[a.id] ?? 999;
    const bOrder = CATEGORY_SORT_ORDER[b.id] ?? 999;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.name.localeCompare(b.name);
  });
};

const buildSource = (
  eventId: string,
  sourceConfig: StreamsConfig['profiles']['test']['categories'][number]['events'][number]['streams'][number],
  index: number
): StreamSource => {
  const type: StreamType = sourceConfig.type ?? 'hls';
  return {
    id: `${eventId}-src-${index}`,
    eventId,
    type,
    url: sourceConfig.url ?? '',
    channelUrl: sourceConfig.channelUrl,
    channelId: sourceConfig.channelId,
    hidden: sourceConfig.hidden === true,
    audioTracks: sourceConfig.audio?.map((track, audioIndex) => ({
      id: `${eventId}-src-${index}-audio-${audioIndex}`,
      url: track.url,
      label: track.label,
    })),
  };
};

const isYouTubeDisabled = (): boolean =>
  import.meta.env.VITE_YOUTUBE_ENABLED === 'false';

const stripYouTubeFromCatalog = (categories: StreamCategory[]): StreamCategory[] => {
  return categories.map((category) => ({
    ...category,
    events: category.events
      .map((event) => ({
        ...event,
        streams: event.streams.filter((source) => source.type !== 'youtube'),
      }))
      .filter(
        (event) =>
          event.streams.length > 0 && event.streams.some((source) => !source.hidden)
      ),
  }));
};

const buildCategoriesFromConfig = (config: StreamsConfig): StreamCategory[] => {
  const profile = config.profiles[getActiveProfileKey(config)];

  const categories = profile.categories.map((category) => ({
    id: category.id,
    name: category.name,
    events: category.events.map((event) => ({
      id: event.id,
      name: event.name,
      logo: event.logo,
      featured: event.featured === true,
      categoryId: category.id,
      categoryName: category.name,
      streams: event.streams.map((source, index) => buildSource(event.id, source, index)),
    })),
  }));

  return sortCategories(
    isYouTubeDisabled() ? stripYouTubeFromCatalog(categories) : categories
  );
};

export const resolveFeaturedEventId = (config: StreamsConfig): string | null => {
  const profile = config.profiles[getActiveProfileKey(config)];

  for (const category of profile.categories) {
    for (const event of category.events) {
      if (event.featured === true) {
        return event.id;
      }
    }
  }

  return null;
};

export const getFeaturedEvent = (
  categories: StreamCategory[],
  featuredEventId: string | null
): StreamEvent | null => {
  if (!featuredEventId) {
    return null;
  }

  const event = findEventById(categories, featuredEventId);
  if (!event || !isEventSelectable(event)) {
    return null;
  }

  return event;
};

export const loadConfiguredCatalog = async (refresh = false): Promise<LoadedCatalog> => {
  const config = await fetchStreamsConfig(refresh);
  const key = getActiveProfileKey(config);

  return {
    categories: buildCategoriesFromConfig(config),
    featuredEventId: resolveFeaturedEventId(config),
    profile: {
      key,
      description: config.profiles[key].description,
    },
  };
};

const flattenEvents = (categories: StreamCategory[]): StreamEvent[] => {
  return categories.flatMap((category) => category.events);
};

export const getVisibleEvents = (categories: StreamCategory[]): StreamEvent[] => {
  return flattenEvents(categories).filter((event) =>
    event.streams.some((source) => !source.hidden)
  );
};

export const filterCatalog = (
  categories: StreamCategory[],
  query: string,
  categoryId: string
): StreamCategory[] => {
  const normalizedQuery = query.trim().toLowerCase();
  const hasVisibleStream = (event: StreamEvent) =>
    event.streams.some((source) => !source.hidden);

  if (normalizedQuery) {
    const matches = categories.flatMap((category) =>
      category.events.filter(
        (event) =>
          hasVisibleStream(event) &&
          event.name.toLowerCase().includes(normalizedQuery)
      )
    );

    return [
      {
        id: SEARCH_RESULTS_CATEGORY_ID,
        name: 'Search Results',
        events: matches,
      },
    ];
  }

  return categories
    .filter((category) => categoryId === 'all' || category.id === categoryId)
    .map((category) => ({
      ...category,
      events: category.events.filter(hasVisibleStream),
    }))
    .filter((category) => category.events.length > 0);
};

const checkHlsStreamHealthBatch = async (
  urls: string[]
): Promise<Record<string, StreamHealthStatus>> => {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  if (uniqueUrls.length === 0) {
    return {};
  }

  const response = await fetch(apiUrl('/api/hls/health/batch'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: uniqueUrls }),
  });

  if (!response.ok) {
    throw new Error(`Health batch failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { results?: Record<string, StreamHealthStatus> };
  return payload.results ?? {};
};

const checkYouTubeSourceHealth = async (source: StreamSource): Promise<StreamSource> => {
  const started = performance.now();
  const live = await resolveYouTubeLive(source.channelUrl, source.channelId);

  if (live.isLive && live.channelId) {
    return {
      ...source,
      channelId: live.channelId,
      liveTitle: live.title,
      status: {
        reachable: true,
        latencyMs: Math.round(performance.now() - started),
        checkedAt: new Date().toISOString(),
      },
    };
  }

  return {
    ...source,
    liveTitle: undefined,
    status: {
      reachable: false,
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      error: live.error ?? 'Not live',
    },
  };
};

export const wrapHlsPlaybackUrl = (url: string): string => {
  if (!url) {
    return url;
  }
  return apiUrl(`/api/hls/proxy?url=${encodeURIComponent(url)}`);
};

export const getStreamPlaybackUrl = (source: StreamSource): string => {
  if (source.type === 'youtube') {
    return source.url;
  }
  return source.playbackUrl ?? wrapHlsPlaybackUrl(source.url);
};

export const checkSourceHealth = async (source: StreamSource): Promise<StreamSource> => {
  if (source.type === 'youtube') {
    return checkYouTubeSourceHealth(source);
  }

  const response = await fetch(apiUrl(`/api/hls/health?url=${encodeURIComponent(source.url)}`));
  const status = (await response.json()) as StreamHealthStatus;
  return {
    ...source,
    status,
    playbackUrl: status.reachable ? wrapHlsPlaybackUrl(source.url) : undefined,
  };
};

const collectHlsUrls = (categories: StreamCategory[]): string[] => {
  const urls: string[] = [];
  for (const category of categories) {
    for (const event of category.events) {
      urls.push(...collectEventHlsUrls(event));
    }
  }
  return urls;
};

const collectEventHlsUrls = (event: StreamEvent): string[] => {
  const urls: string[] = [];
  for (const source of event.streams) {
    if (source.type !== 'youtube' && source.url) {
      urls.push(source.url);
    }
    for (const track of source.audioTracks ?? []) {
      if (track.url) {
        urls.push(track.url);
      }
    }
  }
  return urls;
};

const eventToCategory = (event: StreamEvent): StreamCategory => ({
  id: event.categoryId,
  name: event.categoryName,
  events: [event],
});

const applyHealthToEvent = async (
  event: StreamEvent
): Promise<{ event: StreamEvent; healthUnavailable: boolean }> => {
  try {
    const healthByUrl = await checkHlsStreamHealthBatch(collectEventHlsUrls(event));
    const [withHls] = applyHlsHealthResults([eventToCategory(event)], healthByUrl);
    const [withYouTube] = await attachYouTubeHealth([withHls]);
    return {
      event: withYouTube.events[0],
      healthUnavailable: false,
    };
  } catch {
    const [degraded] = applyDegradedHlsHealth([eventToCategory(event)]);
    const [withYouTube] = await attachYouTubeHealth([degraded]);
    return {
      event: withYouTube.events[0],
      healthUnavailable: true,
    };
  }
};

export const checkEventHealth = async (
  event: StreamEvent
): Promise<{ event: StreamEvent; healthUnavailable: boolean }> => {
  return applyHealthToEvent(event);
};

export const mergeEventIntoCategories = (
  categories: StreamCategory[],
  updatedEvent: StreamEvent
): StreamCategory[] => {
  return categories.map((category) => ({
    ...category,
    events: category.events.map((event) =>
      event.id === updatedEvent.id ? updatedEvent : event
    ),
  }));
};

const applyHlsHealthResults = (
  categories: StreamCategory[],
  healthByUrl: Record<string, StreamHealthStatus>
): StreamCategory[] => {
  return categories.map((category) => ({
    ...category,
    events: category.events.map((event) => ({
      ...event,
      streams: event.streams.map((source) => {
        if (source.type === 'youtube') {
          return source;
        }

        const status = healthByUrl[source.url] ?? {
          reachable: false,
          latencyMs: null,
          checkedAt: new Date().toISOString(),
          error: 'Health check missing from batch response',
        };

        return {
          ...source,
          status,
          playbackUrl: status.reachable ? wrapHlsPlaybackUrl(source.url) : undefined,
          audioTracks: applyAudioTrackHealth(source.audioTracks, healthByUrl, false),
        };
      }),
    })),
  }));
};

const applyDegradedHlsHealth = (categories: StreamCategory[]): StreamCategory[] => {
  const checkedAt = new Date().toISOString();
  return categories.map((category) => ({
    ...category,
    events: category.events.map((event) => ({
      ...event,
      streams: event.streams.map((source) => {
        if (source.type === 'youtube') {
          return source;
        }

        return {
          ...source,
          status: {
            reachable: true,
            uncertain: true,
            latencyMs: null,
            checkedAt,
            error: 'Availability not verified',
          },
          playbackUrl: wrapHlsPlaybackUrl(source.url),
          audioTracks: applyAudioTrackHealth(source.audioTracks, {}, true),
        };
      }),
    })),
  }));
};

const attachYouTubeHealth = async (categories: StreamCategory[]): Promise<StreamCategory[]> => {
  return Promise.all(
    categories.map(async (category) => ({
      ...category,
      events: await Promise.all(
        category.events.map(async (event) => ({
          ...event,
          streams: await Promise.all(
            event.streams.map(async (source) =>
              source.type === 'youtube' ? checkYouTubeSourceHealth(source) : source
            )
          ),
        }))
      ),
    }))
  );
};

export const checkCatalogHealth = async (
  categories: StreamCategory[]
): Promise<CatalogHealthResult> => {
  try {
    const healthByUrl = await checkHlsStreamHealthBatch(collectHlsUrls(categories));
    const withHls = applyHlsHealthResults(categories, healthByUrl);
    return {
      categories: await attachYouTubeHealth(withHls),
      healthUnavailable: false,
    };
  } catch {
    return {
      categories: await attachYouTubeHealth(applyDegradedHlsHealth(categories)),
      healthUnavailable: true,
    };
  }
};

export const refreshCatalogHealthInBackground = async (
  categories: StreamCategory[]
): Promise<StreamCategory[] | null> => {
  const result = await checkCatalogHealth(categories);
  if (result.healthUnavailable) {
    return null;
  }
  return result.categories;
};

export const isSourcePlayable = (source: StreamSource): boolean => {
  if (source.type === 'youtube') {
    return Boolean(source.status?.reachable && source.channelId);
  }
  return Boolean(source.status?.reachable && source.url);
};

export const isEventPlayable = (event: StreamEvent): boolean => {
  return event.streams.some(isSourcePlayable);
};

export const isEventSelectable = (event: StreamEvent): boolean => {
  return event.streams.some((source) => !source.hidden);
};

export const isEventMarkedUnavailable = (event: StreamEvent): boolean => {
  const visibleSources = event.streams.filter((source) => !source.hidden);
  if (visibleSources.length === 0) {
    return false;
  }

  const checkedSources = visibleSources.filter(
    (source) => source.status && !source.status.uncertain
  );
  if (checkedSources.length === 0) {
    return false;
  }

  return !isEventPlayable(event);
};

const getVisibleSources = (event: StreamEvent): StreamSource[] => {
  return event.streams.filter((source) => !source.hidden);
};

export const getFirstVisibleSource = (event: StreamEvent): StreamSource | null => {
  return getVisibleSources(event)[0] ?? null;
};

export const getFirstPlayableSource = (event: StreamEvent): StreamSource | null => {
  return event.streams.find(isSourcePlayable) ?? null;
};

export const findNextPlayableSourceInEvent = (
  event: StreamEvent,
  currentSourceId: string,
  direction: 1 | -1
): StreamSource | null => {
  const playable = event.streams.filter(isSourcePlayable);
  if (playable.length === 0) return null;

  const currentIndex = playable.findIndex((source) => source.id === currentSourceId);
  const startIndex = currentIndex === -1
    ? direction === 1
      ? 0
      : playable.length - 1
    : currentIndex;

  for (let step = 1; step <= playable.length; step += 1) {
    const index = (startIndex + direction * step + playable.length) % playable.length;
    const candidate = playable[index];
    if (candidate.id !== currentSourceId || playable.length === 1) {
      return candidate;
    }
  }

  return null;
};

export const findFailoverSource = (
  event: StreamEvent,
  currentSourceId: string,
  excludedSourceIds: ReadonlySet<string> = new Set()
): StreamSource | null => {
  const visibleSources = event.streams.filter((source) => !source.hidden);
  if (visibleSources.length === 0) {
    return null;
  }

  const currentIndex = visibleSources.findIndex((source) => source.id === currentSourceId);
  const startIndex = currentIndex === -1 ? 0 : currentIndex;

  for (let offset = 1; offset < visibleSources.length; offset += 1) {
    const candidate = visibleSources[(startIndex + offset) % visibleSources.length];
    if (!excludedSourceIds.has(candidate.id)) {
      return candidate;
    }
  }

  return null;
};

export const markEventSourcesUnavailable = (event: StreamEvent): StreamEvent => {
  const checkedAt = new Date().toISOString();

  return {
    ...event,
    streams: event.streams.map((source) => {
      if (source.hidden) {
        return source;
      }

      return {
        ...source,
        status: {
          reachable: false,
          latencyMs: null,
          checkedAt,
          error: 'Playback failed',
        },
        playbackUrl: undefined,
        audioTracks: source.audioTracks?.map((track) => ({
          ...track,
          status: {
            reachable: false,
            latencyMs: null,
            checkedAt,
            error: 'Playback failed',
          },
          playbackUrl: undefined,
        })),
      };
    }),
  };
};

export const getEventSourceSummary = (event: StreamEvent) => {
  const visibleSources = getVisibleSources(event);
  const hasYouTube = visibleSources.some((source) => source.type === 'youtube');
  const visiblePlayable = visibleSources.filter(isSourcePlayable);
  const bestLatency = visiblePlayable.find((source) => source.status?.latencyMs != null)?.status
    ?.latencyMs;
  const hasUncertainHealth = event.streams.some(
    (source) => source.status?.uncertain && !source.hidden
  );

  return {
    hasYouTube,
    isLive: isEventPlayable(event),
    sourceCount: visibleSources.length,
    bestLatency,
    hasUncertainHealth,
  };
};

export const findEventById = (
  categories: StreamCategory[],
  eventId: string
): StreamEvent | null => {
  for (const category of categories) {
    const event = category.events.find((item) => item.id === eventId);
    if (event) return event;
  }
  return null;
};

export const getSourceLabel = (event: StreamEvent, source: StreamSource): string => {
  if (source.type === 'youtube') {
    const youtubeSources = event.streams.filter((item) => item.type === 'youtube');
    const index = youtubeSources.findIndex((item) => item.id === source.id);
    return `YouTube ${index === -1 ? 1 : index + 1}`;
  }

  const hlsSources = event.streams.filter((item) => item.type !== 'youtube');
  const index = hlsSources.findIndex((item) => item.id === source.id);
  return `Source ${index === -1 ? 1 : index + 1}`;
};
