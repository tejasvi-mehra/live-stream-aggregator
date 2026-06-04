import { StreamCategory, StreamEvent } from '../types';

const STORAGE_KEY = 'livestream.catalogHealth.v1';

const getSessionStorage = (): Storage | null => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
};

interface CatalogHealthCacheEntry {
  profileKey: string;
  events: StreamEvent[];
}

let backgroundHealthStarted = false;
let backgroundHealthCompleted = false;

export const hasBackgroundHealthCompleted = (): boolean => backgroundHealthCompleted;

export const shouldStartBackgroundHealth = (): boolean => {
  if (backgroundHealthStarted || backgroundHealthCompleted) {
    return false;
  }
  backgroundHealthStarted = true;
  return true;
};

export const markBackgroundHealthCompleted = (): void => {
  backgroundHealthCompleted = true;
};

export const readCatalogHealthCache = (profileKey: string): StreamEvent[] | null => {
  try {
    const storage = getSessionStorage();
    if (!storage) return null;

    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CatalogHealthCacheEntry;
    if (parsed.profileKey !== profileKey || !Array.isArray(parsed.events)) {
      return null;
    }

    return parsed.events;
  } catch {
    return null;
  }
};

export const writeCatalogHealthCache = (
  profileKey: string,
  categories: StreamCategory[]
): void => {
  try {
    const storage = getSessionStorage();
    if (!storage) return;

    const entry: CatalogHealthCacheEntry = {
      profileKey,
      events: categories.flatMap((category) => category.events),
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore quota or private-mode storage errors.
  }
};

const isNewerHealthCheck = (
  currentCheckedAt?: string,
  incomingCheckedAt?: string
): boolean => {
  if (!incomingCheckedAt) return false;
  if (!currentCheckedAt) return true;
  return Date.parse(incomingCheckedAt) >= Date.parse(currentCheckedAt);
};

export const mergeEventHealthFromBatch = (
  current: StreamEvent,
  incoming: StreamEvent
): StreamEvent => {
  const incomingSources = new Map(incoming.streams.map((source) => [source.id, source]));

  return {
    ...current,
    streams: current.streams.map((source) => {
      const incomingSource = incomingSources.get(source.id);
      if (!incomingSource?.status || incomingSource.status.uncertain) {
        return source;
      }

      if (
        source.status &&
        !source.status.uncertain &&
        !isNewerHealthCheck(source.status.checkedAt, incomingSource.status.checkedAt)
      ) {
        return source;
      }

      return {
        ...source,
        status: incomingSource.status,
        playbackUrl: incomingSource.playbackUrl,
        channelId: incomingSource.channelId,
        liveTitle: incomingSource.liveTitle,
        audioTracks: incomingSource.audioTracks ?? source.audioTracks,
      };
    }),
  };
};

export const mergeCatalogHealthResults = (
  current: StreamCategory[],
  incoming: StreamCategory[]
): StreamCategory[] => {
  const incomingEvents = new Map(
    incoming.flatMap((category) => category.events).map((event) => [event.id, event])
  );

  return current.map((category) => ({
    ...category,
    events: category.events.map((event) => {
      const incomingEvent = incomingEvents.get(event.id);
      return incomingEvent ? mergeEventHealthFromBatch(event, incomingEvent) : event;
    }),
  }));
};

export const applyCachedHealthToCategories = (
  categories: StreamCategory[],
  cachedEvents: StreamEvent[]
): StreamCategory[] => {
  const cachedById = new Map(cachedEvents.map((event) => [event.id, event]));
  return categories.map((category) => ({
    ...category,
    events: category.events.map((event) => {
      const cached = cachedById.get(event.id);
      return cached ? mergeEventHealthFromBatch(event, cached) : event;
    }),
  }));
};

/** @visibleForTesting */
export const resetBackgroundHealthState = (): void => {
  backgroundHealthStarted = false;
  backgroundHealthCompleted = false;
  getSessionStorage()?.removeItem(STORAGE_KEY);
};
