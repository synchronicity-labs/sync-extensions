/**
 * String utility functions
 * Centralizes common string transformations used throughout the codebase
 */

/**
 * Format model name for display
 * Converts "lipsync-2-pro" to "Lipsync 2 Pro"
 * Used in multiple places - centralized here
 */
export const formatModelName = (model: string): string => {
  return model.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

/**
 * Truncate string with ellipsis for display/logging
 */
export const truncate = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + "...";
};

/**
 * Normalize string to lowercase (for consistent comparisons)
 */
export const normalize = (str: string): string => {
  return str.toLowerCase().trim();
};

/**
 * Format time in seconds to MM:SS format
 * Used for video/audio player time displays
 */
export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

