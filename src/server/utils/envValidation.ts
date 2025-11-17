/**
 * Environment variable validation utilities
 * Ensures all required environment variables are present and valid
 */

import { tlogSync } from './log';

export interface EnvValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates environment variables for production readiness
 * @returns Validation result with errors and warnings
 */
export function validateEnvironment(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required for R2 uploads (optional but recommended)
  if (!process.env.R2_ACCESS_KEY) {
    warnings.push('R2_ACCESS_KEY not set - R2 uploads will be disabled');
  }
  if (!process.env.R2_SECRET_KEY) {
    warnings.push('R2_SECRET_KEY not set - R2 uploads will be disabled');
  }

  // Optional but recommended
  if (!process.env.POSTHOG_KEY) {
    warnings.push('POSTHOG_KEY not set - telemetry will be disabled');
  }

  // Validate R2 config if keys are provided
  if (process.env.R2_ACCESS_KEY && !process.env.R2_SECRET_KEY) {
    errors.push('R2_SECRET_KEY is required when R2_ACCESS_KEY is set');
  }
  if (process.env.R2_SECRET_KEY && !process.env.R2_ACCESS_KEY) {
    errors.push('R2_ACCESS_KEY is required when R2_SECRET_KEY is set');
  }

  // Validate R2 endpoint URL format if provided
  if (process.env.R2_ENDPOINT_URL) {
    try {
      const url = new URL(process.env.R2_ENDPOINT_URL);
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push('R2_ENDPOINT_URL must use http:// or https:// protocol');
      }
    } catch {
      errors.push('R2_ENDPOINT_URL must be a valid URL');
    }
  }

  // Validate NODE_ENV
  const validEnvs = ['development', 'production', 'test'];
  if (process.env.NODE_ENV && !validEnvs.includes(process.env.NODE_ENV)) {
    warnings.push(`NODE_ENV should be one of: ${validEnvs.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Logs environment validation results
 * @param result Validation result to log
 */
export function logEnvValidation(result: EnvValidationResult): void {
  if (result.errors.length > 0) {
    try {
      tlogSync('[env-validation] ERRORS:');
      result.errors.forEach(error => {
        tlogSync(`[env-validation]   - ${error}`);
      });
    } catch (_) {}
  }

  if (result.warnings.length > 0) {
    try {
      tlogSync('[env-validation] WARNINGS:');
      result.warnings.forEach(warning => {
        tlogSync(`[env-validation]   - ${warning}`);
      });
    } catch (_) {}
  }

  if (result.isValid && result.warnings.length === 0) {
    try {
      tlogSync('[env-validation] All environment variables validated successfully');
    } catch (_) {}
  }
}
