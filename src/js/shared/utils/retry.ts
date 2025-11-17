/**
 * Retry utility for API calls and critical operations
 * Provides exponential backoff and configurable retry logic
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelay?: number;
  /** Exponential backoff multiplier (default: 2) */
  multiplier?: number;
  /** Custom retry condition - return true to retry, false to abort */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Callback before each retry attempt */
  onRetry?: (attempt: number, error: unknown) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  multiplier: 2,
  shouldRetry: () => true,
  onRetry: () => {},
};

/**
 * Calculate delay for exponential backoff
 */
function calculateDelay(attempt: number, initialDelay: number, maxDelay: number, multiplier: number): number {
  const delay = initialDelay * Math.pow(multiplier, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry (should return a Promise)
 * @param options Retry configuration options
 * @returns Promise that resolves with the function result or rejects after max retries
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt < opts.maxRetries && opts.shouldRetry(error, attempt)) {
        const delay = calculateDelay(attempt, opts.initialDelay, opts.maxDelay, opts.multiplier);
        opts.onRetry?.(attempt + 1, error);
        await sleep(delay);
        continue;
      }

      // Don't retry - throw the error
      throw error;
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Retry a fetch request with exponential backoff
 * @param url Request URL
 * @param options Fetch options
 * @param retryOptions Retry configuration
 * @returns Promise that resolves with the Response or rejects after max retries
 */
export async function retryFetch(
  url: string | URL,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  return retry(
    async () => {
      const response = await fetch(url, options);
      
      // Retry on network errors or 5xx server errors
      if (!response.ok && response.status >= 500) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
    },
    {
      shouldRetry: (error, attempt) => {
        // Don't retry on 4xx errors (client errors)
        if (error instanceof Error && error.message.includes('HTTP 4')) {
          return false;
        }
        return retryOptions.shouldRetry?.(error, attempt) ?? true;
      },
      ...retryOptions,
    }
  );
}

/**
 * Retry configuration presets for common scenarios
 */
export const RETRY_PRESETS = {
  /** Quick retry for UI operations (3 attempts, 500ms initial delay) */
  quick: {
    maxRetries: 3,
    initialDelay: 500,
    maxDelay: 2000,
  },
  /** Standard retry for API calls (3 attempts, 1s initial delay) */
  standard: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 5000,
  },
  /** Aggressive retry for critical operations (5 attempts, 2s initial delay) */
  aggressive: {
    maxRetries: 5,
    initialDelay: 2000,
    maxDelay: 10000,
  },
  /** Network retry for offline scenarios (5 attempts, 3s initial delay) */
  network: {
    maxRetries: 5,
    initialDelay: 3000,
    maxDelay: 15000,
  },
} as const;

