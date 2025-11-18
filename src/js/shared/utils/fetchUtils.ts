/**
 * Centralized fetch utilities
 * Provides consistent error handling and response parsing
 */

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
