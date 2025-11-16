/**
 * Centralized toast notification utility
 * Provides consistent messaging across the application
 */

export type ToastType = "info" | "success" | "error";

export interface ToastOptions {
  type?: ToastType;
  duration?: number;
  action?: { text: string; onClick: () => void };
}

// Track active toasts to prevent overlapping
const activeToasts: Array<{ element: HTMLElement; index: number }> = [];
const TOAST_SPACING = 60; // Space between stacked toasts in pixels

/**
 * Update positions of all active toasts
 */
const updateToastPositions = (): void => {
  activeToasts.forEach((toast, index) => {
    const offset = index * TOAST_SPACING;
    // Use negative offset to stack toasts upward from the bottom
    toast.element.style.transform = `translateX(-50%) translateY(-${offset}px)`;
    toast.index = index;
  });
};

/**
 * Remove toast from active list and update positions
 */
const removeToast = (toastElement: HTMLElement): void => {
  const index = activeToasts.findIndex(t => t.element === toastElement);
  if (index !== -1) {
    activeToasts.splice(index, 1);
    updateToastPositions();
  }
};

/**
 * Clear all active toasts
 */
const clearAllToasts = (): void => {
  // Remove all toasts from DOM and clear the array
  activeToasts.forEach(({ element }) => {
    element.classList.remove("show");
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    }, 0);
  });
  activeToasts.length = 0;
};

/**
 * Show a toast notification
 * Messages are automatically lowercased for consistency
 * Only one toast is shown at a time - existing toasts are cleared before showing a new one
 */
export const showToast = (
  message: string,
  options: ToastOptions | ToastType = "info"
): void => {
  // Clear all existing toasts before showing a new one
  clearAllToasts();

  // Handle legacy API where second param is just the type string
  const opts: ToastOptions =
    typeof options === "string"
      ? { type: options }
      : options || { type: "info" };

  const type = opts.type || "info";
  const duration = opts.duration || 3000;
  const lowercaseMessage = message.toLowerCase();

  const toast = document.createElement("div");
  toast.className = `history-toast history-toast-${type}`;

  if (opts.action) {
    const messageDiv = document.createElement("div");
    messageDiv.style.marginBottom = "8px";
    messageDiv.textContent = lowercaseMessage;
    toast.appendChild(messageDiv);

    const button = document.createElement("button");
    button.textContent = opts.action.text;
    button.style.cssText = `
      background: rgba(255,255,255,0.2);
      border: none;
      color: var(--text-primary);
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      margin-top: 8px;
      font-family: var(--font-family);
    `;
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      opts.action!.onClick();
      removeToast(toast);
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    });
    toast.appendChild(button);
  } else {
    toast.textContent = lowercaseMessage;
  }

  // Add to active toasts list
  const toastEntry = { element: toast, index: activeToasts.length };
  activeToasts.push(toastEntry);
  
  // Set initial position (off-screen)
  toast.style.transform = `translateX(-50%) translateY(100px)`;
  
  document.body.appendChild(toast);

  // Update all toast positions
  updateToastPositions();

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add("show");
    // Update position after show class is added (override CSS translateY)
    updateToastPositions();
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      removeToast(toast);
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
};

/**
 * Standardized toast messages
 * Use these constants for consistency across the app
 */
export const ToastMessages = {
  // Loading states
  LOADING: "loading...",
  OPENING_VIDEO_PICKER: "opening video picker…",
  OPENING_AUDIO_PICKER: "opening audio picker…",
  VALIDATING_VIDEO: "validating video…",
  VALIDATING_AUDIO: "validating audio…",
  UPLOADING_VIDEO: "uploading video…",
  UPLOADING_AUDIO: "uploading audio…",
  RESOLVING_FILE_REFERENCE: "resolving file reference…",
  SAVING: "saving…",
  INSERTING: "inserting…",
  EXTRACTING_AUDIO: "extracting audio from video...",
  GENERATING_TTS: "generating speech...",
  DUBBING: (lang: string) => `dubbing to ${lang.toLowerCase()}...`,

  // Success states
  READY_FOR_LIPSYNC: "ready for lipsync",
  VIDEO_UPLOADED_SUCCESSFULLY: "video uploaded successfully",
  AUDIO_UPLOADED_SUCCESSFULLY: "audio uploaded successfully",
  VIDEO_URL_LOADED_SUCCESSFULLY: "video url loaded successfully",
  AUDIO_URL_LOADED_SUCCESSFULLY: "audio url loaded successfully",
  VIDEO_RECORDED_SUCCESSFULLY: "video recorded successfully",
  AUDIO_RECORDED_SUCCESSFULLY: "audio recorded successfully",
  AUDIO_EXTRACTED_SUCCESSFULLY: "audio extracted from video",
  SAVED_TO_PROJECT: "saved to project",
  SAVED_TO: (location: string) => `saved to ${location}`,
  INSERTED: (diag?: string) => `inserted${diag ? ` [${diag}]` : ""}`,
  OUTPUT_LINK_COPIED: "output link copied to clipboard",
  JOB_ID_COPIED: "job id copied to clipboard",
  GENERATION_LOADED: "generation loaded",
  GENERATION_PARAMETERS_RESTORED: "generation parameters restored. ready to lipsync!",
  TTS_GENERATED_SUCCESSFULLY: "tts audio generated successfully!",
  VOICE_CLONE_CREATED: "voice clone created successfully!",
  VOICE_DELETED_SUCCESSFULLY: "voice deleted successfully",
  RECORDING_SAVED: "recording saved",
  DUBBING_COMPLETED: (lang: string) => `dubbing to ${lang.toLowerCase()} completed`,

  // Error states
  INVALID_FILE_PATH: "invalid file path - please select file again",
  INVALID_FILE_PATH_UPLOAD: "invalid file path - please use upload button instead",
  ONLY_MP4_MOV_SUPPORTED: "only mp4 and mov supported",
  ONLY_MP3_WAV_SUPPORTED: "only mp3 and wav supported",
  VIDEO_EXCEEDS_1GB: "video exceeds 1gb (not allowed)",
  AUDIO_EXCEEDS_1GB: "audio exceeds 1gb (not allowed)",
  INVALID_VIDEO_URL_FORMAT: "invalid video url format",
  INVALID_AUDIO_URL_FORMAT: "invalid audio url format",
  VIDEO_UPLOAD_FAILED: (error: string) => `video upload failed: ${error.toLowerCase()}`,
  AUDIO_UPLOAD_FAILED: (error: string) => `audio upload failed: ${error.toLowerCase()}`,
  UPLOAD_FAILED: (error: string) => `upload failed: ${error}`,
  UPLOAD_ERROR: (error: string) => `upload error: ${error}`,
  RECORDING_FAILED: "failed to save recording",
  EXPORT_FAILED: (error: string) => `export failed: ${error}`,
  EXTRACT_AUDIO_FAILED: (error: string) => `error extracting audio: ${error}`,
  SAVE_FUNCTION_NOT_AVAILABLE: "save function not available",
  INSERT_FUNCTION_NOT_AVAILABLE: "insert function not available",
  FAILED_TO_SAVE: "failed to save",
  FAILED_TO_INSERT: "failed to insert",
  NOT_READY: "not ready",
  OUTPUT_PATH_NOT_AVAILABLE: "output path not available",
  FAILED_TO_COPY_OUTPUT_LINK: "failed to copy output link",
  FAILED_TO_COPY_JOB_ID: "failed to copy job id",
  JOB_NOT_FOUND: "job not found",
  JOB_NOT_COMPLETED: "job is not completed yet",
  INSERT_FAILED: (error?: string) => `insert failed${error ? ` (${error})` : ""}`,
  FAILED_TO_RESTORE_GENERATION_PARAMETERS: "failed to restore generation parameters",
  PLEASE_SELECT_TARGET_LANGUAGE: "please select a target language first",
  ELEVENLABS_API_KEY_REQUIRED: "elevenlabs api key required",
  ELEVENLABS_API_KEY_NOT_CONFIGURED: "elevenlabs api key not configured",
  NO_AUDIO_FILE_SELECTED: "no audio file selected",
  DUBBING_FAILED: (error: string) => `dubbing failed: ${error}`,
  PLEASE_ENTER_TEXT: "please enter some text first",
  TTS_GENERATION_FAILED: "failed to generate speech",
  VOICE_CLONE_FAILED: (error: string) => `failed to create voice clone: ${error}`,
  VOICE_DELETE_FAILED: (error: string) => `failed to delete voice: ${error}`,
  NO_PREVIEW_AVAILABLE: "no preview available for this voice",
  FAILED_TO_PLAY_PREVIEW: "failed to play preview",
  FILE_SIZE_TOO_LARGE: "file size must be less than 10MB",
  PLEASE_SELECT_AUDIO_FILE: "please select an audio file",
  FAILED_TO_UPLOAD_FILE: (error: string) => `failed to upload file: ${error}`,
  PLEASE_DROP_AUDIO_ONLY: "please drop audio files only",
  RECORDING_START_FAILED: (error: string) => `failed to start recording: ${error}`,
  RECORDING_SAVE_FAILED: (error: string) => `failed to save recording: ${error}`,
  NO_VIDEO_SELECTED: "no video selected",
  EXTRACT_AUDIO_FAILED_GENERAL: (error: string) => `failed to extract audio: ${error}`,
  FAILED_TO_PLAY_SAMPLE: "failed to play sample",
  PLEASE_ENTER_VOICE_NAME: "please enter a voice name",
  PLEASE_ADD_AUDIO_SAMPLE: "please add at least one audio sample",
  COULD_NOT_RESOLVE_PROJECT_FOLDER: "could not resolve project folder; open/switch to a saved project and try again",
  PLEASE_DROP_AUDIO_FILE: "please drop an audio file",
  PLEASE_DROP_VIDEO_FILE: "please drop a video file",
} as const;

