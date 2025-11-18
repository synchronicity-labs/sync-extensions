/**
 * Request validation utilities
 * Provides consistent validation functions for common request patterns
 */

/**
 * Validates that a string is non-empty
 */
export function validateRequiredString(value: unknown, fieldName = 'field'): string | null {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    return `${fieldName} is required`;
  }
  return null;
}

/**
 * Validates that a value is a valid URL
 */
export function validateUrl(value: unknown, fieldName = 'url'): string | null {
  if (!value || typeof value !== 'string') {
    return `${fieldName} is required`;
  }
  try {
    new URL(value);
    return null;
  } catch {
    return `${fieldName} must be a valid URL`;
  }
}

/**
 * Validates that a number is within a specified range
 */
export function validateNumberRange(value: unknown, min: number, max: number, fieldName = 'number'): string | null {
  if (typeof value !== 'number' || isNaN(value)) {
    return `${fieldName} must be a number`;
  }
  if (value < min || value > max) {
    return `${fieldName} must be between ${min} and ${max}`;
  }
  return null;
}

/**
 * Validates that a file path exists (async)
 */
export async function validateFileExists(filePath: unknown, fieldName = 'file'): Promise<string | null> {
  if (!filePath || typeof filePath !== 'string') {
    return `${fieldName} path is required`;
  }

  try {
    const fs = await import('fs');
    await fs.promises.access(filePath);
    return null;
  } catch {
    return `${fieldName} not found`;
  }
}

/**
 * Validates syncApiKey is present
 */
export function validateSyncApiKey(syncApiKey: unknown): string | null {
  return validateRequiredString(syncApiKey, 'syncApiKey');
}

/**
 * Validates a request has required body fields
 */
export function validateRequiredFields(body: unknown, requiredFields: string[]): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  for (const field of requiredFields) {
    if (!(field in body)) {
      return `${field} is required`;
    }
  }

  return null;
}

interface JobRequest {
  syncApiKey?: string;
  videoUrl?: string;
  audioUrl?: string;
  videoPath?: string;
  audioPath?: string;
  model?: string;
  temperature?: number;
}

/**
 * Validates a job creation request
 */
export function validateJobRequest(body: unknown): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return { isValid: false, errors: ['Request body is required'] };
  }

  const jobBody = body as JobRequest;

  // syncApiKey is always required
  const apiKeyError = validateSyncApiKey(jobBody.syncApiKey);
  if (apiKeyError) errors.push(apiKeyError);

  // Either URLs or paths must be provided
  const hasUrls = jobBody.videoUrl && jobBody.audioUrl;
  const hasPaths = jobBody.videoPath && jobBody.audioPath;

  if (!hasUrls && !hasPaths) {
    errors.push('Either (videoUrl and audioUrl) or (videoPath and audioPath) are required');
  }

  if (hasUrls) {
    const videoUrlError = validateUrl(jobBody.videoUrl, 'videoUrl');
    if (videoUrlError) errors.push(videoUrlError);

    const audioUrlError = validateUrl(jobBody.audioUrl, 'audioUrl');
    if (audioUrlError) errors.push(audioUrlError);
  }

  // Validate model if provided
  if (jobBody.model && typeof jobBody.model !== 'string') {
    errors.push('model must be a string');
  }

  // Validate temperature if provided
  if (jobBody.temperature !== undefined) {
    const tempError = validateNumberRange(jobBody.temperature, 0, 1, 'temperature');
    if (tempError) errors.push(tempError);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

