import type { HlsConfig } from 'hls.js';

export const HLS_JS_VERSION = '1.6.16';

export type StreamProfile = 'test' | 'production';

export interface RecoveryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  stallThresholdMs: number;
}

export const getRecoveryConfig = (profile: StreamProfile): RecoveryConfig => ({
  maxAttempts: profile === 'production' ? 2 : 5,
  baseDelayMs: profile === 'production' ? 500 : 1000,
  stallThresholdMs: profile === 'production' ? 3000 : 4000,
});

export const shouldFailoverAfterAttempt = (attempt: number, maxAttempts: number): boolean =>
  attempt > maxAttempts;

const SHARED_HLS_CONFIG: Partial<HlsConfig> = {
  enableWorker: true,
  startLevel: -1,
  capLevelToPlayerSize: true,
  abrEwmaDefaultEstimate: 500000,
  abrBandWidthFactor: 0.9,
  abrBandWidthUpFactor: 0.7,
  fragLoadingMaxRetry: 6,
  fragLoadingRetryDelay: 1000,
  manifestLoadingMaxRetry: 4,
  manifestLoadingRetryDelay: 1000,
  levelLoadingMaxRetry: 4,
  levelLoadingRetryDelay: 1000,
};

export const getHlsConfig = (profile: StreamProfile): Partial<HlsConfig> => {
  if (profile === 'test') {
    return {
      ...SHARED_HLS_CONFIG,
      lowLatencyMode: false,
      backBufferLength: 30,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
    };
  }

  return {
    ...SHARED_HLS_CONFIG,
    lowLatencyMode: true,
    backBufferLength: 30,
    maxBufferLength: 20,
    maxMaxBufferLength: 30,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 10,
    liveDurationInfinity: true,
    highBufferWatchdogPeriod: 1,
    nudgeOffset: 0.1,
    nudgeMaxRetry: 5,
    maxLiveSyncPlaybackRate: 1.5,
  };
};

/** @deprecated Use getHlsConfig('production') */
export const LIVE_HLS_CONFIG = getHlsConfig('production');
