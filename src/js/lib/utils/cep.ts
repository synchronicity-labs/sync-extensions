// UXP CEP Compatibility Layer
// Provides compatibility functions for code that still references CEP APIs

import { os } from "../cep/node";

/**
 * Register keyboard shortcuts (UXP)
 * UXP handles keyboard events differently than CEP
 */
export const keyRegisterOverride = () => {
  // UXP handles keyboard events automatically
  // No need to register all keys like in CEP
  console.log("[keyRegisterOverride] Keyboard events handled by UXP runtime");
};

/**
 * Text input patch for macOS (UXP)
 * UXP handles text input natively, but we keep this for compatibility
 */
export const textCepPatch = (e: KeyboardEvent) => {
  // UXP handles text input natively
  // This is kept for compatibility but may not be needed
};

/**
 * Prevent file drops on panel (UXP)
 */
export const dropDisable = () => {
  window.addEventListener("dragover", (e) => e.preventDefault(), false);
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    
    // Check if this is a drag from the app itself vs from Finder/File Explorer
    const dataTransfer = e.dataTransfer;
    const hasFiles = dataTransfer?.files && dataTransfer.files.length > 0;
    const hasFileTypes = dataTransfer?.types?.some((type: string) => 
      type === 'Files' || type === 'application/x-moz-file' || type.startsWith('application/x-ns-file')
    );
    
    // Only call selection function if NO files are being dragged (i.e., drag from app itself)
    if (hasFiles || hasFileTypes) {
      // This is a drag from Finder/File Explorer - just prevent default, don't call selection
      return;
    }
    
    // Determine which dropzone was targeted
    const target = e.target as HTMLElement;
    const videoDropzone = document.getElementById('videoDropzone');
    const audioDropzone = document.getElementById('audioDropzone');
    
    // Check if drop occurred over a dropzone
    const isOverVideoZone = videoDropzone && videoDropzone.contains(target);
    const isOverAudioZone = audioDropzone && audioDropzone.contains(target);
    
    // Determine the kind (video or audio) based on which dropzone was targeted
    let kind: 'video' | 'audio' | null = null;
    if (isOverVideoZone) {
      kind = 'video';
    } else if (isOverAudioZone) {
      kind = 'audio';
    } else {
      const videoSection = document.getElementById('videoSection');
      const audioSection = document.getElementById('audioSection');
      if (videoSection && videoSection.contains(target)) {
        kind = 'video';
      } else if (audioSection && audioSection.contains(target)) {
        kind = 'audio';
      }
    }
    
    if (!kind) {
      return;
    }
    
    // UXP host script communication
    try {
      const { callUXPFunction } = await import("./uxp");
      const { getHostConfig } = await import("../../shared/utils/clientHostDetection");
      const { HOST_IDS } = await import("../../../shared/host");
      const hostConfig = getHostConfig();
      const isAE = hostConfig?.hostId === HOST_IDS.AEFT;
      const isPPRO = hostConfig?.hostId === HOST_IDS.PPRO;
      
      if (isPPRO || isAE) {
        // Call UXP host script to get file path from selection
        const prefix = isPPRO ? "PPRO" : "AEFT";
        // Note: UXP doesn't have the same drag-from-app API as CEP
        // This would need to be implemented using UXP's selection APIs
        console.log(`[dropDisable] Drag from app detected for ${prefix}, kind: ${kind}`);
      }
    } catch (error) {
      const { debugError } = await import("../../shared/utils/debugLog");
      debugError("[dropDisable] Error handling fake drag-and-drop", error);
    }
  }, false);
};
