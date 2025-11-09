/**
 * Centralized host application constants and detection
 *
 * This file defines the canonical host identifiers used throughout the codebase.
 * All host detection and comparison should use these constants.
 *
 * Client-side uses uppercase format: "AEFT" | "PPRO"
 * Server-side uses lowercase format: "ae" | "premiere"
 */
// Canonical host identifiers (client-side format - uppercase)
export const HOST_IDS = {
    AEFT: "AEFT",
    PPRO: "PPRO",
};
// Canonical host identifiers (server-side format - lowercase)
export const HOST_APP_IDS = {
    AE: "ae",
    PREMIERE: "premiere",
};
// Host display names
export const HOST_NAMES = {
    AEFT: "After Effects",
    PPRO: "Premiere Pro",
};
/**
 * Convert client-side host ID (uppercase) to server-side APP_ID (lowercase)
 */
export function hostIdToAppId(hostId) {
    if (hostId === HOST_IDS.AEFT)
        return HOST_APP_IDS.AE;
    if (hostId === HOST_IDS.PPRO)
        return HOST_APP_IDS.PREMIERE;
    throw new Error(`Invalid hostId: ${hostId}. Expected ${HOST_IDS.AEFT} or ${HOST_IDS.PPRO}`);
}
/**
 * Convert server-side APP_ID (lowercase) to client-side host ID (uppercase)
 */
export function appIdToHostId(appId) {
    if (appId === HOST_APP_IDS.AE)
        return HOST_IDS.AEFT;
    if (appId === HOST_APP_IDS.PREMIERE)
        return HOST_IDS.PPRO;
    throw new Error(`Invalid appId: ${appId}. Expected ${HOST_APP_IDS.AE} or ${HOST_APP_IDS.PREMIERE}`);
}
/**
 * Check if a string matches any known host identifier (case-insensitive)
 */
export function isKnownHostId(value) {
    const upper = value.toUpperCase();
    const lower = value.toLowerCase();
    return (upper === HOST_IDS.AEFT ||
        upper === HOST_IDS.PPRO ||
        lower === HOST_APP_IDS.AE ||
        lower === HOST_APP_IDS.PREMIERE);
}
/**
 * Normalize a host identifier to client-side format (uppercase)
 */
export function normalizeToHostId(value) {
    const upper = value.toUpperCase();
    if (upper === HOST_IDS.AEFT || upper === "AEFT" || upper === "AE" || upper === "AFTEREFFECTS") {
        return HOST_IDS.AEFT;
    }
    if (upper === HOST_IDS.PPRO || upper === "PPRO" || upper === "PREMIERE" || upper === "PREM") {
        return HOST_IDS.PPRO;
    }
    throw new Error(`Cannot normalize host identifier: ${value}`);
}
/**
 * Normalize a host identifier to server-side format (lowercase)
 */
export function normalizeToAppId(value) {
    const upper = value.toUpperCase();
    if (upper === HOST_IDS.AEFT || upper === "AEFT" || upper === "AE" || upper === "AFTEREFFECTS") {
        return HOST_APP_IDS.AE;
    }
    if (upper === HOST_IDS.PPRO || upper === "PPRO" || upper === "PREMIERE" || upper === "PREM") {
        return HOST_APP_IDS.PREMIERE;
    }
    throw new Error(`Cannot normalize host identifier: ${value}`);
}
