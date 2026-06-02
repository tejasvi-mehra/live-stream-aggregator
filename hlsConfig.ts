import type { HlsConfig } from 'hls.js';

export const HLS_JS_VERSION = '1.6.16';

export type StreamProfile = 'test' | 'production';

export interface RecoveryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  stallThresholdMs: number;
}

const TEST_RECOVERY_CONFIG: RecoveryConfig = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  stallThresholdMs: 4000,
};

const PRODUCTION_RECOVERY_CONFIG: RecoveryConfig = {
  maxAttempts: 2,
  baseDelayMs: 500,
  stallThresholdMs: 3000,
};

export const getRecoveryConfig = (profile: StreamProfile): RecoveryConfig =>
  profile === 'production' ? PRODUCTION_RECOVERY_CONFIG : TEST_RECOVERY_CONFIG;

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

const TEST_HLS_CONFIG: Partial<HlsConfig> = {
  ...SHARED_HLS_CONFIG,
  lowLatencyMode: false,
  backBufferLength: 30,
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
};

const PRODUCTION_HLS_CONFIG: Partial<HlsConfig> = {
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

export const getHlsConfig = (profile: StreamProfile): Partial<HlsConfig> =>
  profile === 'test' ? TEST_HLS_CONFIG : PRODUCTION_HLS_CONFIG;

/** @deprecated Use getHlsConfig('production') */
export const LIVE_HLS_CONFIG = PRODUCTION_HLS_CONFIG;
