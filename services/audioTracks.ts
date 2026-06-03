import { StreamAudioTrack, StreamEvent, StreamHealthStatus, StreamSource } from '../types';
import { apiUrl } from './apiBase';

const wrapHlsPlaybackUrl = (url: string): string =>
  apiUrl(`/api/hls/proxy?url=${encodeURIComponent(url)}`);

export const getAudioPlaybackUrl = (track: StreamAudioTrack): string | undefined => {
  return track.playbackUrl ?? (track.url ? wrapHlsPlaybackUrl(track.url) : undefined);
};

export const isAudioTrackPlayable = (track: StreamAudioTrack): boolean => {
  return Boolean(track.status?.reachable && track.url);
};

export const getSourceAudioTracks = (source: StreamSource): StreamAudioTrack[] => {
  return source.audioTracks ?? [];
};

export const sourceUsesSeparateAudio = (source: StreamSource): boolean => {
  return getSourceAudioTracks(source).length > 0;
};

export const getEventAudioTracks = (event: StreamEvent): StreamAudioTrack[] => {
  const seen = new Set<string>();
  const tracks: StreamAudioTrack[] = [];

  for (const source of event.streams) {
    for (const track of getSourceAudioTracks(source)) {
      if (seen.has(track.url)) {
        continue;
      }
      seen.add(track.url);
      tracks.push(track);
    }
  }

  return tracks;
};

export const getFirstPlayableAudioTrack = (source: StreamSource): StreamAudioTrack | null => {
  return getSourceAudioTracks(source).find(isAudioTrackPlayable) ?? null;
};

export const findAudioTrackById = (
  event: StreamEvent,
  trackId: string
): StreamAudioTrack | null => {
  for (const source of event.streams) {
    const track = getSourceAudioTracks(source).find((item) => item.id === trackId);
    if (track) {
      return track;
    }
  }
  return null;
};

export const findFailoverAudioTrack = (
  event: StreamEvent,
  source: StreamSource,
  currentTrackId: string
): StreamAudioTrack | null => {
  const sourceTracks = getSourceAudioTracks(source);
  const currentIndex = sourceTracks.findIndex((track) => track.id === currentTrackId);

  for (let offset = 1; offset < sourceTracks.length; offset += 1) {
    const candidate = sourceTracks[(currentIndex + offset + sourceTracks.length) % sourceTracks.length];
    if (isAudioTrackPlayable(candidate)) {
      return candidate;
    }
  }

  for (const otherSource of event.streams) {
    if (otherSource.id === source.id) {
      continue;
    }
    const candidate = getFirstPlayableAudioTrack(otherSource);
    if (candidate) {
      return candidate;
    }
  }

  return null;
};

export const getAudioTrackLabel = (track: StreamAudioTrack, index: number): string => {
  return track.label ?? `Audio ${index + 1}`;
};

export const applyAudioTrackHealth = (
  tracks: StreamAudioTrack[] | undefined,
  healthByUrl: Record<string, StreamHealthStatus>,
  uncertain: boolean
): StreamAudioTrack[] | undefined => {
  if (!tracks?.length) {
    return tracks;
  }

  return tracks.map((track) => {
    if (uncertain) {
      return {
        ...track,
        status: {
          reachable: true,
          uncertain: true,
          latencyMs: null,
          checkedAt: new Date().toISOString(),
          error: 'Availability not verified',
        },
        playbackUrl: wrapHlsPlaybackUrl(track.url),
      };
    }

    const status = healthByUrl[track.url] ?? {
      reachable: false,
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      error: 'Health check missing from batch response',
    };

    return {
      ...track,
      status,
      playbackUrl: status.reachable ? wrapHlsPlaybackUrl(track.url) : undefined,
    };
  });
};
