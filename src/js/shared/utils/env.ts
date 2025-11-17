/**
 * Environment detection utilities
 * Detects development vs production mode safely
 */

/**
 * Check if we're running in development mode
 * @returns true if in dev mode (localhost), false otherwise
 */
export const isDevMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const href = window.location.href || '';
  return href.includes('localhost') || 
         href.includes('127.0.0.1') ||
         (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development');
};

/**
 * Get the base URL for the application
 * @returns base URL (localhost in dev, empty string in production)
 */
export const getBaseUrl = (): string => {
  return isDevMode() ? 'http://localhost:3001' : '';
};

/**
 * Reload the panel safely (only in dev mode)
 * In production, just reloads the current page
 */
export const reloadPanel = (): void => {
  if (typeof window === 'undefined' || !window.location) return;
  
  if (isDevMode()) {
    const currentUrl = window.location.href;
    if (currentUrl.includes('localhost:3001')) {
      // Already on localhost - just reload
      window.location.reload();
    } else {
      // Not on localhost - redirect to localhost first
      window.location.href = 'http://localhost:3001/main/index.html';
    }
  } else {
    // In production, just reload
    window.location.reload();
  }
};

