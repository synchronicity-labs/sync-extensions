/**
 * Server-side host detection utilities
 * Uses centralized host constants from shared/host.ts
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { HOST_APP_IDS, normalizeToAppId } from '../../shared/host.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Resolve EXT_ROOT: server/utils/host.js -> server/utils -> server -> src -> extension root
const EXT_ROOT = path.resolve(__dirname, '..', '..', '..');
const EXT_FOLDER = path.basename(EXT_ROOT);

/**
 * Detect APP_ID from extension manifest or environment
 * This is the single source of truth for server-side host detection
 * Returns lowercase format: "ae" | "premiere"
 * Throws an error if host cannot be determined
 */
export function detectAppId() {
  // First, check if HOST_APP environment variable is set (passed by client when starting server)
  const hostApp = process.env.HOST_APP;
  if (hostApp) {
    try {
      return normalizeToAppId(hostApp);
    } catch (error) {
      throw new Error(
        `Invalid HOST_APP environment variable: "${hostApp}". ` +
        `Expected: PPRO, PREMIERE, AEFT, AE, or AFTEREFFECTS. ` +
        `Error: ${error.message}`
      );
    }
  }

  // Manifest always contains both AEFT and PPRO (one extension for both hosts)
  // HOST_APP must be set to determine which host is running
  throw new Error(
    `Cannot determine host application (APP_ID). ` +
    `HOST_APP environment variable not set. ` +
    `Set HOST_APP environment variable (PPRO or AEFT) when starting the server.`
  );
}

