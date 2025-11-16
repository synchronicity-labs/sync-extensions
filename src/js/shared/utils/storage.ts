/**
 * Centralized localStorage utilities
 * Provides type-safe access to localStorage with consistent error handling
 */

import { STORAGE_KEYS } from "./constants";
import { debugLog } from "./debugLog";

/**
 * Get settings from localStorage with fallback to empty object
 * Used throughout the codebase - centralizes the parsing logic
 */
export const getSettings = (): Record<string, any> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SYNC_SETTINGS);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    debugLog("[storage] Failed to parse settings", error);
  }
  return {};
};

/**
 * Get a specific localStorage value
 */
export const getStorageItem = <T = string>(key: string, defaultValue: T | null = null): T | null => {
  try {
    const item = localStorage.getItem(key);
    if (item === null) return defaultValue;
    try {
      return JSON.parse(item) as T;
    } catch {
      return item as T;
    }
  } catch (error) {
    debugLog(`[storage] Failed to get item: ${key}`, error);
    return defaultValue;
  }
};

/**
 * Set a localStorage value
 */
export const setStorageItem = <T = any>(key: string, value: T): void => {
  try {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    localStorage.setItem(key, serialized);
  } catch (error) {
    debugLog(`[storage] Failed to set item: ${key}`, error);
  }
};

/**
 * Remove a localStorage item
 */
export const removeStorageItem = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    debugLog(`[storage] Failed to remove item: ${key}`, error);
  }
};

