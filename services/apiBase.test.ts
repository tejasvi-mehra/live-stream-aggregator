import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { API_BASE_REQUIRED_MESSAGE, apiUrl, getApiBase } from './apiBase';

describe('apiBase', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE', 'http://localhost:3002');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a trimmed API base without trailing slash', () => {
    vi.stubEnv('VITE_API_BASE', 'http://localhost:3002/');
    expect(getApiBase()).toBe('http://localhost:3002');
  });

  it('builds absolute API URLs', () => {
    expect(apiUrl('/api/hls/health')).toBe('http://localhost:3002/api/hls/health');
  });

  it('throws when VITE_API_BASE is missing', () => {
    vi.stubEnv('VITE_API_BASE', '');
    expect(() => getApiBase()).toThrow(API_BASE_REQUIRED_MESSAGE);
  });
});
