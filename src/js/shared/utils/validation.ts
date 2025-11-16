/**
 * Input validation and sanitization utilities
 * Provides type-safe validation for URLs, API keys, file paths, etc.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate URL format
 * @param url URL string to validate
 * @param requireProtocol Whether to require http:// or https://
 * @returns Validation result
 */
export function validateUrl(url: string, requireProtocol: boolean = true): ValidationResult {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL must be a non-empty string' };
  }

  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  // Check for protocol if required
  if (requireProtocol && !trimmed.match(/^https?:\/\//i)) {
    return { valid: false, error: 'URL must start with http:// or https://' };
  }

  try {
    // Use URL constructor for validation
    const urlObj = new URL(trimmed);
    
    // Validate protocol
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { valid: false, error: 'URL must use http:// or https:// protocol' };
    }

    // Validate hostname
    if (!urlObj.hostname || urlObj.hostname.length === 0) {
      return { valid: false, error: 'URL must have a valid hostname' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Sanitize URL by removing dangerous characters and normalizing
 * @param url URL string to sanitize
 * @returns Sanitized URL or null if invalid
 */
export function sanitizeUrl(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Remove control characters and normalize whitespace
  const sanitized = trimmed
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Validate the sanitized URL
  const validation = validateUrl(sanitized, false);
  if (!validation.valid) {
    return null;
  }

  return sanitized;
}

/**
 * Validate API key format
 * @param apiKey API key string to validate
 * @param minLength Minimum length (default: 10)
 * @param maxLength Maximum length (default: 200)
 * @returns Validation result
 */
export function validateApiKey(
  apiKey: string,
  minLength: number = 10,
  maxLength: number = 200
): ValidationResult {
  if (!apiKey || typeof apiKey !== 'string') {
    return { valid: false, error: 'API key must be a non-empty string' };
  }

  const trimmed = apiKey.trim();
  
  if (trimmed.length < minLength) {
    return { valid: false, error: `API key must be at least ${minLength} characters long` };
  }

  if (trimmed.length > maxLength) {
    return { valid: false, error: `API key must be no more than ${maxLength} characters long` };
  }

  // Check for common invalid patterns
  if (trimmed === 'your-api-key' || trimmed === 'api-key' || trimmed.toLowerCase().includes('example')) {
    return { valid: false, error: 'API key appears to be a placeholder' };
  }

  return { valid: true };
}

/**
 * Sanitize API key by removing whitespace and dangerous characters
 * @param apiKey API key string to sanitize
 * @returns Sanitized API key
 */
export function sanitizeApiKey(apiKey: string): string {
  if (!apiKey || typeof apiKey !== 'string') {
    return '';
  }

  return apiKey
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\s+/g, ''); // Remove all whitespace
}

/**
 * Validate file path (basic validation for security)
 * @param filePath File path string to validate
 * @returns Validation result
 */
export function validateFilePath(filePath: string): ValidationResult {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'File path must be a non-empty string' };
  }

  const trimmed = filePath.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'File path cannot be empty' };
  }

  // Check for dangerous patterns (path traversal, null bytes, etc.)
  if (trimmed.includes('..') || trimmed.includes('\0')) {
    return { valid: false, error: 'File path contains invalid characters' };
  }

  // Check for absolute paths (on macOS/Unix)
  if (trimmed.startsWith('/') && !trimmed.startsWith('/Volumes/')) {
    // Allow /Volumes/ for macOS external drives
    // This is a basic check - adjust based on your needs
  }

  return { valid: true };
}

/**
 * Sanitize file path by removing dangerous characters
 * @param filePath File path string to sanitize
 * @returns Sanitized file path
 */
export function sanitizeFilePath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }

  return filePath
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\.\./g, '') // Remove path traversal attempts
    .replace(/\/+/g, '/') // Normalize slashes
    .replace(/\/$/, ''); // Remove trailing slash
}

/**
 * Validate model name
 * @param model Model name string to validate
 * @returns Validation result
 */
export function validateModelName(model: string): ValidationResult {
  if (!model || typeof model !== 'string') {
    return { valid: false, error: 'Model name must be a non-empty string' };
  }

  const trimmed = model.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Model name cannot be empty' };
  }

  // Check for valid model names (adjust based on your models)
  const validModels = [
    'lipsync-2-pro',
    'lipsync-2',
    'lipsync-1.9.0-beta',
  ];

  if (!validModels.includes(trimmed)) {
    return { valid: false, error: `Invalid model name: ${trimmed}` };
  }

  return { valid: true };
}

/**
 * Validate temperature value (0-1 range)
 * @param temperature Temperature value to validate
 * @returns Validation result
 */
export function validateTemperature(temperature: number): ValidationResult {
  if (typeof temperature !== 'number' || isNaN(temperature)) {
    return { valid: false, error: 'Temperature must be a number' };
  }

  if (temperature < 0 || temperature > 1) {
    return { valid: false, error: 'Temperature must be between 0 and 1' };
  }

  return { valid: true };
}

/**
 * Validate sync mode
 * @param syncMode Sync mode string to validate
 * @returns Validation result
 */
export function validateSyncMode(syncMode: string): ValidationResult {
  if (!syncMode || typeof syncMode !== 'string') {
    return { valid: false, error: 'Sync mode must be a non-empty string' };
  }

  const validModes = ['loop', 'bounce', 'cutoff', 'silence', 'remap'];
  
  if (!validModes.includes(syncMode)) {
    return { valid: false, error: `Invalid sync mode: ${syncMode}` };
  }

  return { valid: true };
}

/**
 * Validate and sanitize user input string
 * @param input Input string to validate and sanitize
 * @param maxLength Maximum allowed length
 * @returns Sanitized string or null if invalid
 */
export function validateAndSanitizeString(input: string, maxLength: number = 1000): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length > maxLength) {
    return null;
  }

  // Remove control characters
  const sanitized = trimmed.replace(/[\x00-\x1F\x7F]/g, '');
  
  return sanitized.length > 0 ? sanitized : null;
}

