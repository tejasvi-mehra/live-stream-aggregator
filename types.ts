
export type StreamType = 'hls' | 'youtube';

export interface StreamAudioTrackConfig {
  url: string;
  label?: string;
}

export interface StreamSourceConfig {
  type?: StreamType;
  url?: string;
  channelUrl?: string;
  channelId?: string;
  hidden?: boolean;
  audio?: StreamAudioTrackConfig[];
}

export interface StreamEventConfig {
  id: string;
  name: string;
  logo: string;
  streams: StreamSourceConfig[];
}

export interface StreamCategoryConfig {
  id: string;
  name: string;
  events: StreamEventConfig[];
}

export interface StreamProfile {
  description: string;
  categories: StreamCategoryConfig[];
}

export interface StreamsConfig {
  activeProfile: 'test' | 'production';
  profiles: {
    test: StreamProfile;
    production: StreamProfile;
  };
}

export interface StreamAudioTrack {
  id: string;
  url: string;
  label?: string;
  playbackUrl?: string;
  status?: StreamHealthStatus;
}

export interface StreamSource {
  id: string;
  eventId: string;
  type: StreamType;
  url: string;
  channelUrl?: string;
  channelId?: string;
  hidden: boolean;
  audioTracks?: StreamAudioTrack[];
  playbackUrl?: string;
  status?: StreamHealthStatus;
  liveTitle?: string;
}

export interface StreamEvent {
  id: string;
  name: string;
  logo: string;
  categoryId: string;
  categoryName: string;
  streams: StreamSource[];
}

export interface StreamCategory {
  id: string;
  name: string;
  events: StreamEvent[];
}

export interface StreamHealthStatus {
  reachable: boolean;
  latencyMs: number | null;
  checkedAt: string;
  error?: string;
  uncertain?: boolean;
}

export interface CatalogHealthResult {
  categories: StreamCategory[];
  healthUnavailable: boolean;
}
