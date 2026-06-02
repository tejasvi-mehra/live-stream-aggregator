
export const API_BASE_REQUIRED_MESSAGE =
  'VITE_API_BASE is required (e.g. http://localhost:3002). Copy .env.example to .env and start the backend.';

export const getApiBase = (): string => {
  const env = import.meta.env.VITE_API_BASE as string | undefined;
  if (!env?.trim()) {
    throw new Error(API_BASE_REQUIRED_MESSAGE);
  }
  return env.replace(/\/$/, '');
};

export const assertApiBaseConfigured = (): void => {
  getApiBase();
};

export const apiUrl = (path: string): string => {
  const base = getApiBase();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};
