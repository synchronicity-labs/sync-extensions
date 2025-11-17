/**
 * Centralized fetch utilities
 * Provides consistent error handling and response parsing with retry logic
 */

import { retryFetch, RETRY_PRESETS } from './retry';

/**
 * Safely parse JSON response, returning null on error
 * Used throughout the codebase for consistent error handling
 */
export const parseJsonResponse = async <T = unknown>(response: Response): Promise<T | null> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

/**
 * Safely parse text response, returning empty string on error
 */
export const parseTextResponse = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return "";
  }
};

/**
 * Fetch with automatic JSON parsing and error handling
 * Returns { ok: boolean, data: T | null, error: string | null }
 */
export const fetchJson = async <T = unknown>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; data: T | null; error: string | null }> => {
  try {
    const response = await fetch(url, options);
    const data = await parseJsonResponse<T>(response);
    
    if (!response.ok) {
      const errorMsg = data && typeof data === 'object' && 'error' in data
        ? String((data as Record<string, unknown>).error)
        : `HTTP ${response.status}`;
      return { ok: false, data: null, error: errorMsg };
    }
    
    return { ok: true, data, error: null };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { ok: false, data: null, error: errorMsg };
  }
};

/**
 * Fetch with retry logic and automatic JSON parsing
 * Uses standard retry preset by default
 */
export const fetchJsonWithRetry = async <T = unknown>(
  url: string,
  options?: RequestInit,
  retryPreset: keyof typeof RETRY_PRESETS = 'standard'
): Promise<{ ok: boolean; data: T | null; error: string | null }> => {
  try {
    const response = await retryFetch(url, options, RETRY_PRESETS[retryPreset]);
    const data = await parseJsonResponse<T>(response);
    
    if (!response.ok) {
      const errorMsg = data && typeof data === 'object' && 'error' in data
        ? String((data as Record<string, unknown>).error)
        : `HTTP ${response.status}`;
      return { ok: false, data: null, error: errorMsg };
    }
    
    return { ok: true, data, error: null };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { ok: false, data: null, error: errorMsg };
  }
};

