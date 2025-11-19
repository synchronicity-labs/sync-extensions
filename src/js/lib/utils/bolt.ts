// UXP Bolt Utilities
// Replaces CEP Bolt utilities with UXP equivalents

import { ns } from "../../../shared/shared";
import { callUXPFunction, getExtensionRoot, openLinkInBrowser } from "./uxp";
import { initializeUXP } from "./init-uxp";

/**
 * Initialize UXP host scripts
 */
export const initBolt = async (log = true) => {
  try {
    if (log) console.log("[initBolt] Initializing UXP...");
    
    // UXP host scripts are loaded automatically by the UXP runtime
    // We just need to initialize UXP-specific features
    initializeUXP();
    
    if (log) console.log("[initBolt] UXP initialized successfully");
  } catch (error) {
    console.error("[initBolt] Error initializing UXP:", error);
    throw error;
  }
};

/**
 * Call a UXP host script function
 */
export const evalTS = async <T = any>(
  functionName: string,
  ...args: any[]
): Promise<T> => {
  try {
    return await callUXPFunction<T>(functionName, ...args);
  } catch (error) {
    console.error(`[evalTS] Error calling ${functionName}:`, error);
    throw error;
  }
};

/**
 * Open link in browser (UXP)
 */
export { openLinkInBrowser };

/**
 * Get app background color (UXP)
 * UXP doesn't have the same theme API as CEP, so we return a default
 */
export const getAppBackgroundColor = () => {
  return {
    rgb: { r: 51, g: 51, b: 51 },
    hex: "#333333",
  };
};

/**
 * Subscribe to background color changes (UXP)
 * UXP doesn't have theme change events like CEP
 */
export const subscribeBackgroundColor = (callback: (color: string) => void) => {
  const color = getAppBackgroundColor();
  callback(`rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})`);
  // UXP doesn't have theme change events, so we just call once
};

/**
 * POSIX path converter
 */
export const posix = (str: string) => str.replace(/\\/g, "/");
