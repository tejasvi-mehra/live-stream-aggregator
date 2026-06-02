import { describe, expect, it } from 'vitest';
import { getHlsConfig, getRecoveryConfig, shouldFailoverAfterAttempt } from './hlsConfig';

describe('getHlsConfig', () => {
  it('disables lowLatencyMode on the test profile', () => {
    expect(getHlsConfig('test').lowLatencyMode).toBe(false);
  });

  it('enables live tuning on the production profile', () => {
    expect(getHlsConfig('production').lowLatencyMode).toBe(true);
  });
});

describe('getRecoveryConfig', () => {
  it('uses faster failover limits on production profile', () => {
    expect(getRecoveryConfig('production')).toEqual({
      maxAttempts: 2,
      baseDelayMs: 500,
      stallThresholdMs: 3000,
    });
  });

  it('keeps longer recovery on test profile', () => {
    expect(getRecoveryConfig('test').maxAttempts).toBe(5);
  });
});

describe('shouldFailoverAfterAttempt', () => {
  it('switches source after two failed recoveries on production', () => {
    const { maxAttempts } = getRecoveryConfig('production');
    expect(shouldFailoverAfterAttempt(1, maxAttempts)).toBe(false);
    expect(shouldFailoverAfterAttempt(2, maxAttempts)).toBe(false);
    expect(shouldFailoverAfterAttempt(3, maxAttempts)).toBe(true);
  });
});
