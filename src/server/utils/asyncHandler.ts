/**
 * Async route handler wrapper for consistent error handling
 * Wraps async route handlers to catch errors and send consistent responses
 */

import { Request, Response, NextFunction } from 'express';
import { handleRouteError } from './response';
import { tlog } from './log';

/**
 * Wraps an async route handler to catch errors and send consistent responses
 * @param handler - Async route handler function
 * @param logPrefix - Optional prefix for logging errors
 * @returns Wrapped handler with error handling
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next?: NextFunction) => Promise<void | Response>,
  logPrefix?: string
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await handler(req, res, next);
    } catch (error) {
      if (logPrefix) {
        try {
          tlog(`[${logPrefix}] Unhandled error:`, error instanceof Error ? error.message : String(error));
        } catch (_) {}
      }
      handleRouteError(error, res, logPrefix);
    }
  };
}
