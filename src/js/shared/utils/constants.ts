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

