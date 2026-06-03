import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG_URL, getCatalogUrl } from './catalogUrl';

describe('catalogUrl', () => {
  it('defaults to the GitHub raw streams.yaml URL', () => {
    expect(DEFAULT_CATALOG_URL).toBe(
      'https://raw.githubusercontent.com/tejasvi-mehra/live-stream-aggregator/main/config/streams.yaml'
    );
    expect(getCatalogUrl()).toBe(DEFAULT_CATALOG_URL);
  });
});
