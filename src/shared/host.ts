/**
 * Centralized host application constants and detection
 * 
 * This file defines the canonical host identifiers used throughout the codebase.
 * All host detection and comparison should use these constants.
 * 
 * NOTE: This is the SOURCE OF TRUTH for all host constants and utilities.
 * Used by both client-side (TypeScript) and server-side (TypeScript) code.
 * 
 * We use uppercase format as the canonical format: "AEFT" | "PPRO" | "RESOLVE"
 * Use toLowerCase() or toAppId() when lowercase format is needed (e.g., file paths, env vars).
 */

// Canonical host identifiers (uppercase format)
export const HOST_IDS = {
  AEFT: "AEFT",
  PPRO: "PPRO",
  RESOLVE: "RESOLVE",
} as const;

export type HostId = typeof HOST_IDS[keyof typeof HOST_IDS];

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
 * Convert host ID to lowercase format (for file paths, env vars, etc.)
 */
export function toAppId(hostId: HostId): string {
  return hostId.toLowerCase();
}

/**
 * Check if a string matches any known host identifier (case-insensitive)
 */
export function isKnownHostId(value: string): value is HostId {
  const upper = value.toUpperCase();
  return (
    upper === HOST_IDS.AEFT ||
    upper === HOST_IDS.PPRO ||
    upper === HOST_IDS.RESOLVE
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
 * Normalize a host identifier to lowercase format (for file paths, env vars, etc.)
 * Prefer normalizeToHostId() and use .toLowerCase() when needed
 */
export function normalizeToAppId(value: string): string {
  return normalizeToHostId(value).toLowerCase();
}

