/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_CATALOG_URL?: string;
  readonly VITE_YOUTUBE_ENABLED?: string;
  readonly VITE_STREAM_PROFILE?: 'test' | 'production';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
