import { describe, expect, it, vi, afterEach } from 'vitest';
import { DEFAULT_CATALOG_URL, getCatalogUrl } from './catalogUrl';

describe('catalogUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to the GitHub raw streams.yaml URL', () => {
    vi.stubEnv('VITE_CATALOG_URL', '');
    expect(getCatalogUrl()).toBe(DEFAULT_CATALOG_URL);
  });
});
