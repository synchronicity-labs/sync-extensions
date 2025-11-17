/**
 * Centralized constants for the application
 * Prevents magic strings and numbers scattered throughout the codebase
 */

// localStorage keys
export const STORAGE_KEYS = {
  SYNC_SETTINGS: "syncSettings",
  SYNC_JOBS: "syncJobs",
  UPLOADED_VIDEO_URL: "uploadedVideoUrl",
  UPLOADED_AUDIO_URL: "uploadedAudioUrl",
  SELECTED_VIDEO_URL: "selectedVideoUrl",
  SELECTED_AUDIO_URL: "selectedAudioUrl",
  ACTIVE_TAB: "sync_activeTab",
} as const;

// Timeout durations (in milliseconds)
export const TIMEOUTS = {
  TOAST_DEFAULT: 3000,
  TOAST_SHORT: 1000,
  TOAST_MEDIUM: 5000,
  TOAST_LONG: 10000,
  RETRY_DELAY: 100,
  RETRY_DELAY_MEDIUM: 500,
  RETRY_DELAY_LONG: 2000,
  FOCUS_DELAY: 100,
  ANIMATION_DELAY: 300,
  THUMBNAIL_TIMEOUT: 10000,
  API_KEY_CHECK_INTERVAL: 1000,
  DUBBING_TIMEOUT: 300000, // 5 minutes
} as const;

// Common percentages
export const PERCENTAGES = {
  FULL: 100,
  HALF: 50,
  QUARTER: 25,
} as const;

// Z-index layers
export const Z_INDEX = {
  DROPDOWN: 100,
  MODAL: 1000,
  TOOLTIP: 1100,
  TOAST: 10000,
  INFINITE_LOADER: 10001,
  TTS_MODAL: 10002,
  TTS_VOICE_SELECTOR: 10003,
  TTS_VOICE_CLONE: 10004,
  TTS_DROPDOWN: 10005,
} as const;

// Volume slider defaults
export const VOLUME = {
  DEFAULT: 100,
  MIN: 0,
  MAX: 100,
} as const;

// String length limits for logging/display
export const STRING_LIMITS = {
  LOG_PREVIEW: 50,
  LOG_ERROR: 100,
  LOG_URL: 200,
} as const;

// Common timeout delays (in milliseconds)
export const DELAYS = {
  FOCUS: 100,
  FOCUS_SHORT: 50,
  ANIMATION: 300,
  RETRY: 100,
  RETRY_MEDIUM: 500,
  RETRY_LONG: 2000,
  UPLOAD_VISUAL_HIDE: 200,
  SETUP_RETRY: 100,
  THUMBNAIL_GENERATION: 100,
  THUMBNAIL_TIMEOUT: 10000,
  API_KEY_CHECK: 1000,
  SERVER_STATUS_CHECK: 5000,
  DUBBING_TIMEOUT: 300000, // 5 minutes
  HEALTH_CHECK: 3000,
  AUTO_START_TIMEOUT: 2000,
} as const;

