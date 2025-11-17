/**
 * Unified response utilities for consistent API responses
 * Ensures all routes return responses in a consistent format
 */

import { Response } from 'express';
import { tlog } from './log';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  ok?: false;
  timestamp?: string;
}

/**
 * Standard success response format
 */
export interface SuccessResponse<T = unknown> {
  ok: true;
  data?: T;
  message?: string;
  timestamp?: string;
}

/**
 * Sends a standardized error response
 * @param res - Express response object
 * @param statusCode - HTTP status code
 * @param error - Error message
 * @param logPrefix - Optional prefix for logging
 */
export function sendError(
  res: Response,
  statusCode: number,
  error: string,
  logPrefix?: string
): void {
  if (res.headersSent) {
    if (logPrefix) {
      try {
        tlog(`[${logPrefix}] Headers already sent, cannot send error response`);
      } catch (_) {}
    }
    return;
  }

  const response: ErrorResponse = {
    error,
    ok: false,
    timestamp: new Date().toISOString()
  };

  if (logPrefix) {
    try {
      tlog(`[${logPrefix}] Error ${statusCode}:`, error);
    } catch (_) {}
  }

  res.status(statusCode).json(response);
}

/**
 * Sends a standardized success response
 * @param res - Express response object
 * @param data - Optional data to include
 * @param message - Optional success message
 */
export function sendSuccess<T>(
  res: Response,
  data?: T,
  message?: string
): void {
  if (res.headersSent) {
    return;
  }

  const response: SuccessResponse<T> = {
    ok: true,
    timestamp: new Date().toISOString()
  };

  if (data !== undefined) {
    response.data = data;
  }

  if (message) {
    response.message = message;
  }

  res.json(response);
}

/**
 * Handles errors in async route handlers consistently
 * @param error - Error object
 * @param res - Express response object
 * @param logPrefix - Optional prefix for logging
 * @param defaultMessage - Default error message if error has no message
 */
export function handleRouteError(
  error: unknown,
  res: Response,
  logPrefix?: string,
  defaultMessage = 'Internal server error'
): void {
  const errorMessage = error instanceof Error 
    ? error.message 
    : String(error || defaultMessage);
  
  sendError(res, 500, errorMessage, logPrefix);
}

/**
 * Validates that response hasn't been sent before sending
 * @param res - Express response object
 * @returns True if response can be sent, false otherwise
 */
export function canSendResponse(res: Response): boolean {
  return !res.headersSent;
}
