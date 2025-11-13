/**
 * Centralized host application constants and detection
 * 
 * This file defines the canonical host identifiers used throughout the codebase.
 * All host detection and comparison should use these constants.
 * 
 * Client-side uses uppercase format: "AEFT" | "PPRO" | "RESOLVE"
 * Server-side uses lowercase format: "ae" | "premiere" | "resolve"
 * 
 * NOTE: This is the SOURCE OF TRUTH for all host constants and utilities.
 * Used by both client-side (TypeScript) and server-side (TypeScript) code.
 */

// Canonical host identifiers (client-side format - uppercase)
export const HOST_IDS = {
  AEFT: "AEFT",
  PPRO: "PPRO",
  RESOLVE: "RESOLVE",
} as const;

export type HostId = typeof HOST_IDS[keyof typeof HOST_IDS];

// Canonical host identifiers (server-side format - lowercase)
export const HOST_APP_IDS = {
  AE: "ae",
  PREMIERE: "premiere",
  RESOLVE: "resolve",
} as const;

export type HostAppId = typeof HOST_APP_IDS[keyof typeof HOST_APP_IDS];

// Host display names
export const HOST_NAMES = {
  AEFT: "After Effects",
  PPRO: "Premiere Pro",
  RESOLVE: "DaVinci Resolve",
} as const;

// Host metadata
export interface HostConfig {
  hostId: HostId;
  hostName: string;
  isAE: boolean;
}

/**
 * Convert client-side host ID (uppercase) to server-side APP_ID (lowercase)
 */
export function hostIdToAppId(hostId: HostId): HostAppId {
  if (hostId === HOST_IDS.AEFT) return HOST_APP_IDS.AE;
  if (hostId === HOST_IDS.PPRO) return HOST_APP_IDS.PREMIERE;
  if (hostId === HOST_IDS.RESOLVE) return HOST_APP_IDS.RESOLVE;
  throw new Error(`Invalid hostId: ${hostId}. Expected ${HOST_IDS.AEFT}, ${HOST_IDS.PPRO}, or ${HOST_IDS.RESOLVE}`);
}

/**
 * Convert server-side APP_ID (lowercase) to client-side host ID (uppercase)
 */
export function appIdToHostId(appId: HostAppId): HostId {
  if (appId === HOST_APP_IDS.AE) return HOST_IDS.AEFT;
  if (appId === HOST_APP_IDS.PREMIERE) return HOST_IDS.PPRO;
  if (appId === HOST_APP_IDS.RESOLVE) return HOST_IDS.RESOLVE;
  throw new Error(`Invalid appId: ${appId}. Expected ${HOST_APP_IDS.AE}, ${HOST_APP_IDS.PREMIERE}, or ${HOST_APP_IDS.RESOLVE}`);
}

/**
 * Check if a string matches any known host identifier (case-insensitive)
 */
export function isKnownHostId(value: string): value is HostId | HostAppId {
  const upper = value.toUpperCase();
  const lower = value.toLowerCase();
  return (
    upper === HOST_IDS.AEFT ||
    upper === HOST_IDS.PPRO ||
    upper === HOST_IDS.RESOLVE ||
    lower === HOST_APP_IDS.AE ||
    lower === HOST_APP_IDS.PREMIERE ||
    lower === HOST_APP_IDS.RESOLVE
  );
}

/**
 * Normalize a host identifier to client-side format (uppercase)
 */
export function normalizeToHostId(value: string): HostId {
  const upper = value.toUpperCase();
  if (upper === HOST_IDS.AEFT || upper === "AEFT" || upper === "AE" || upper === "AFTEREFFECTS") {
    return HOST_IDS.AEFT;
  }
  if (upper === HOST_IDS.PPRO || upper === "PPRO" || upper === "PREMIERE" || upper === "PREM") {
    return HOST_IDS.PPRO;
  }
  if (upper === HOST_IDS.RESOLVE || upper === "RESOLVE" || upper === "DAVINCI" || upper === "DAVINCIRESOLVE") {
    return HOST_IDS.RESOLVE;
  }
  throw new Error(`Cannot normalize host identifier: ${value}`);
}

/**
 * Normalize a host identifier to server-side format (lowercase)
 */
export function normalizeToAppId(value: string): HostAppId {
  const upper = value.toUpperCase();
  if (upper === HOST_IDS.AEFT || upper === "AEFT" || upper === "AE" || upper === "AFTEREFFECTS") {
    return HOST_APP_IDS.AE;
  }
  if (upper === HOST_IDS.PPRO || upper === "PPRO" || upper === "PREMIERE" || upper === "PREM") {
    return HOST_APP_IDS.PREMIERE;
  }
  if (upper === HOST_IDS.RESOLVE || upper === "RESOLVE" || upper === "DAVINCI" || upper === "DAVINCIRESOLVE") {
    return HOST_APP_IDS.RESOLVE;
  }
  throw new Error(`Cannot normalize host identifier: ${value}`);
}

