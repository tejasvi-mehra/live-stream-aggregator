export const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/tejasvi-mehra/live-stream-aggregator/main/config/streams.yaml';

export const getCatalogUrl = (): string => {
  const env = import.meta.env.VITE_CATALOG_URL?.trim();
  return env || DEFAULT_CATALOG_URL;
};
