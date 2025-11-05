/**
 * Centralized server configuration
 * This ensures all API calls use the same server URL
 */

const DEFAULT_SERVER_PORT = 3000;
const DEFAULT_SERVER_HOST = "127.0.0.1";

/**
 * Get the server port from window config or default
 */
export const getServerPort = (): number => {
  return (window as any).__syncServerPort || DEFAULT_SERVER_PORT;
};

/**
 * Get the server host from window config or default
 */
export const getServerHost = (): string => {
  return (window as any).__syncServerHost || DEFAULT_SERVER_HOST;
};

/**
 * Get the full server URL (e.g., "http://127.0.0.1:3000")
 */
export const getServerUrl = (): string => {
  return `http://${getServerHost()}:${getServerPort()}`;
};

/**
 * Build a full API endpoint URL
 * @param endpoint - API endpoint path (e.g., "/health", "/upload")
 */
export const getApiUrl = (endpoint: string): string => {
  const base = getServerUrl();
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${base}${path}`;
};

