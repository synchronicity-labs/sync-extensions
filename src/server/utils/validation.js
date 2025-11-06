/**
 * Request validation utilities
 * Provides consistent validation functions for common request patterns
 */

/**
 * Validates that a string is non-empty
 * @param {string} value - The value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {string|null} - Returns null if valid, error message if invalid
 */
export function validateRequiredString(value, fieldName = 'field') {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    return `${fieldName} is required`;
  }
  return null;
}

/**
 * Validates that a value is a valid URL
 * @param {string} value - The URL to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {string|null} - Returns null if valid, error message if invalid
 */
export function validateUrl(value, fieldName = 'url') {
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
 * @param {number} value - The number to validate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {string} fieldName - Name of the field for error messages
 * @returns {string|null} - Returns null if valid, error message if invalid
 */
export function validateNumberRange(value, min, max, fieldName = 'number') {
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
 * @param {string} filePath - The file path to check
 * @param {string} fieldName - Name of the field for error messages
 * @returns {Promise<string|null>} - Returns null if valid, error message if invalid
 */
export async function validateFileExists(filePath, fieldName = 'file') {
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
 * @param {string} syncApiKey - The API key to validate
 * @returns {string|null} - Returns null if valid, error message if invalid
 */
export function validateSyncApiKey(syncApiKey) {
  return validateRequiredString(syncApiKey, 'syncApiKey');
}

/**
 * Validates a request has required body fields
 * @param {object} body - The request body
 * @param {string[]} requiredFields - Array of required field names
 * @returns {string|null} - Returns null if valid, error message if invalid
 */
export function validateRequiredFields(body, requiredFields) {
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

/**
 * Validates a job creation request
 * @param {object} body - The request body
 * @returns {object} - Object with isValid boolean and errors array
 */
export function validateJobRequest(body) {
  const errors = [];
  
  if (!body || typeof body !== 'object') {
    return { isValid: false, errors: ['Request body is required'] };
  }
  
  // syncApiKey is always required
  const apiKeyError = validateSyncApiKey(body.syncApiKey);
  if (apiKeyError) errors.push(apiKeyError);
  
  // Either URLs or paths must be provided
  const hasUrls = body.videoUrl && body.audioUrl;
  const hasPaths = body.videoPath && body.audioPath;
  
  if (!hasUrls && !hasPaths) {
    errors.push('Either (videoUrl and audioUrl) or (videoPath and audioPath) are required');
  }
  
  if (hasUrls) {
    const videoUrlError = validateUrl(body.videoUrl, 'videoUrl');
    if (videoUrlError) errors.push(videoUrlError);
    
    const audioUrlError = validateUrl(body.audioUrl, 'audioUrl');
    if (audioUrlError) errors.push(audioUrlError);
  }
  
  // Validate model if provided
  if (body.model && typeof body.model !== 'string') {
    errors.push('model must be a string');
  }
  
  // Validate temperature if provided
  if (body.temperature !== undefined) {
    const tempError = validateNumberRange(body.temperature, 0, 1, 'temperature');
    if (tempError) errors.push(tempError);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates file upload request
 * @param {object} body - The request body
 * @returns {object} - Object with isValid boolean and errors array
 */
export function validateUploadRequest(body) {
  const errors = [];
  
  if (!body || typeof body !== 'object') {
    return { isValid: false, errors: ['Request body is required'] };
  }
  
  const pathError = validateRequiredString(body.path, 'path');
  if (pathError) errors.push(pathError);
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

