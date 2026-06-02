
import yaml from 'js-yaml';
import {
  StreamCategory,
  StreamEvent,
  StreamHealthStatus,
  StreamSource,
  StreamsConfig,
  StreamType,
} from '../types';
import { resolveYouTubeLive } from './youtubeService';
import streamsYaml from '../config/streams.yaml?raw';

const config = yaml.load(streamsYaml) as StreamsConfig;

const envProfile = import.meta.env.VITE_STREAM_PROFILE as 'test' | 'production' | undefined;

const getActiveProfileKey = (): 'test' | 'production' => {
  if (envProfile === 'test' || envProfile === 'production') {
    return envProfile;
  }
  return config.activeProfile;
};

export const getProfileMeta = () => {
  const key = getActiveProfileKey();
  return {
    key,
    description: config.profiles[key].description,
  };
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

export const loadConfiguredCatalog = (): StreamCategory[] => {
  const profile = config.profiles[getActiveProfileKey()];

  const categories = profile.categories.map((category) => ({
    id: category.id,
    name: category.name,
    events: category.events.map((event) => ({
      id: event.id,
      name: event.name,
      logo: event.logo,
      categoryId: category.id,
      categoryName: category.name,
      streams: event.streams.map((source, index) => buildSource(event.id, source, index)),
    })),
  }));

  return isYouTubeDisabled() ? stripYouTubeFromCatalog(categories) : categories;
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

  return categories
    .filter((category) => categoryId === 'all' || category.id === categoryId)
    .map((category) => ({
      ...category,
      events: category.events
        .filter((event) => event.streams.some((source) => !source.hidden))
        .filter((event) => {
          if (!normalizedQuery) return true;
          return (
            event.name.toLowerCase().includes(normalizedQuery) ||
            category.name.toLowerCase().includes(normalizedQuery)
          );
        }),
    }));
};

const checkHlsStreamHealth = async (url: string): Promise<StreamHealthStatus> => {
  const started = performance.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      signal: controller.signal,
      headers: { Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, */*' },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = await response.text();
    if (!body.includes('#EXTM3U')) {
      throw new Error('Response is not a valid HLS manifest');
    }

    return {
      reachable: true,
      latencyMs: Math.round(performance.now() - started),
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      reachable: false,
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
};

export const checkSourceHealth = async (source: StreamSource): Promise<StreamSource> => {
  if (source.type === 'youtube') {
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
  }

  const status = await checkHlsStreamHealth(source.url);
  return { ...source, status };
};

const checkEventHealth = async (event: StreamEvent): Promise<StreamEvent> => {
  const streams = await Promise.all(event.streams.map((source) => checkSourceHealth(source)));
  return { ...event, streams };
};

export const checkCatalogHealth = async (categories: StreamCategory[]): Promise<StreamCategory[]> => {
  return Promise.all(
    categories.map(async (category) => ({
      ...category,
      events: await Promise.all(category.events.map((event) => checkEventHealth(event))),
    }))
  );
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

const getVisibleSources = (event: StreamEvent): StreamSource[] => {
  return event.streams.filter((source) => !source.hidden);
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
  currentSourceId: string
): StreamSource | null => {
  const currentIndex = event.streams.findIndex((source) => source.id === currentSourceId);
  if (currentIndex === -1) {
    return getFirstPlayableSource(event);
  }

  for (let offset = 1; offset < event.streams.length; offset += 1) {
    const candidate = event.streams[(currentIndex + offset) % event.streams.length];
    if (isSourcePlayable(candidate)) {
      return candidate;
    }
  }

  return null;
};

export const getEventSourceSummary = (event: StreamEvent) => {
  const visibleSources = getVisibleSources(event);
  const hasYouTube = visibleSources.some((source) => source.type === 'youtube');
  const visiblePlayable = visibleSources.filter(isSourcePlayable);
  const bestLatency = visiblePlayable.find((source) => source.status?.latencyMs != null)?.status
    ?.latencyMs;

  return {
    hasYouTube,
    isLive: isEventPlayable(event),
    sourceCount: visibleSources.length,
    bestLatency,
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
