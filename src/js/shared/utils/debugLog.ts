/**
 * Debug logging utility for UI components
 * Follows debug.md: logs are only written when logs/.debug flag file exists
 * Messages are sent to the server /debug endpoint which handles the flag check
 */

import { getApiUrl } from './serverConfig';

/**
 * Log a debug message to the server debug endpoint
 * Only writes to log files if logs/.debug flag file exists (checked by server)
 */
export function debugLog(message: string, data?: unknown): void {
  try {
    const hostConfig = window.HOST_CONFIG || {};
    const logData = {
      message: `[UI] ${message}`,
      data,
      timestamp: new Date().toISOString(),
      hostConfig,
    };
    
    // Also output to console
    console.log(`[UI] ${message}`, data || '');
    
    // Send to server debug endpoint (server checks for .debug flag)
    fetch(getApiUrl("/debug"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logData),
    }).catch(() => {});
  } catch (_) {
    // Silent failure - logging shouldn't break the app
  }
}

/**
 * Log an error to the server debug endpoint
 */
export function debugError(message: string, error?: unknown): void {
  try {
    const hostConfig = window.HOST_CONFIG || {};
    const logData = {
      message: `[UI] ERROR: ${message}`,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      hostConfig,
    };
    
    // Also output to console
    console.error(`[UI] ERROR: ${message}`, error || '');
    
    fetch(getApiUrl("/debug"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logData),
    }).catch(() => {});
  } catch (_) {
    // Silent failure
  }
}

/**
 * Log a warning to the server debug endpoint
 */
export function debugWarn(message: string, data?: unknown): void {
  try {
    const hostConfig = window.HOST_CONFIG || {};
    const logData = {
      message: `[UI] WARN: ${message}`,
      data,
      timestamp: new Date().toISOString(),
      hostConfig,
    };
    
    // Also output to console
    console.warn(`[UI] WARN: ${message}`, data || '');
    
    fetch(getApiUrl("/debug"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logData),
    }).catch(() => {});
  } catch (_) {
    // Silent failure
  }
}

