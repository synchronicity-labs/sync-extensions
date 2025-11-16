# Utilities Reference

## Overview

All utilities are located in `src/js/shared/utils/` and follow consistent patterns for error handling, type safety, and documentation.

## Core Utilities

### Constants (`constants.ts`)

Centralized constants for the entire application.

```typescript
import { STORAGE_KEYS, DELAYS } from "../utils/constants";

// Storage keys
STORAGE_KEYS.SYNC_SETTINGS
STORAGE_KEYS.SYNC_JOBS
STORAGE_KEYS.UPLOADED_VIDEO_URL
STORAGE_KEYS.UPLOADED_AUDIO_URL
STORAGE_KEYS.SELECTED_VIDEO_URL
STORAGE_KEYS.SELECTED_AUDIO_URL
STORAGE_KEYS.ACTIVE_TAB

// Time delays (milliseconds)
DELAYS.FOCUS
DELAYS.FOCUS_SHORT
DELAYS.ANIMATION
DELAYS.RETRY
DELAYS.RETRY_MEDIUM
DELAYS.RETRY_LONG
DELAYS.UPLOAD_VISUAL_HIDE
DELAYS.THUMBNAIL_TIMEOUT
DELAYS.API_KEY_CHECK
DELAYS.SERVER_STATUS_CHECK
DELAYS.DUBBING_TIMEOUT
DELAYS.HEALTH_CHECK
DELAYS.AUTO_START_TIMEOUT
```

### Storage (`storage.ts`)

Type-safe localStorage utilities with consistent error handling.

```typescript
import { getStorageItem, setStorageItem, getSettings, removeStorageItem } from "../utils/storage";
import { STORAGE_KEYS } from "../utils/constants";

// Get settings (returns empty object if not found)
const settings = getSettings();

// Get typed storage item
const videoUrl = getStorageItem<string>(STORAGE_KEYS.UPLOADED_VIDEO_URL);
const jobs = getStorageItem<Job[]>(STORAGE_KEYS.SYNC_JOBS, []); // with default

// Set storage item (auto-stringifies objects/arrays)
setStorageItem(STORAGE_KEYS.UPLOADED_VIDEO_URL, "https://example.com/video.mp4");
setStorageItem(STORAGE_KEYS.SYNC_JOBS, [{ id: "1", status: "completed" }]);

// Remove storage item
removeStorageItem(STORAGE_KEYS.UPLOADED_VIDEO_URL);
```

**Features:**
- Automatic JSON parsing/stringification
- Type-safe with generics
- Consistent error handling
- Default value support

### Fetch Utils (`fetchUtils.ts`)

Network request utilities with consistent error handling.

```typescript
import { parseJsonResponse, parseTextResponse, fetchJson, fetchJsonWithRetry } from "../utils/fetchUtils";

// Parse JSON response safely
const data = await parseJsonResponse<ResponseType>(response);
// Returns null on parse error

// Parse text response safely
const text = await parseTextResponse(response);
// Returns empty string on error

// Fetch with automatic JSON parsing
const result = await fetchJson<ResponseType>(url, options);
// Returns { ok: boolean, data: T | null, error: string | null }

// Fetch with retry logic
const result = await fetchJsonWithRetry<ResponseType>(url, options, "standard");
// Uses retry presets: "quick", "standard", "aggressive", "network"
```

**Features:**
- Safe JSON/text parsing
- Consistent error handling
- Retry logic support
- Type-safe responses

### Debug Logging (`debugLog.ts`)

Centralized logging system following industry standard log levels (RFC 5424).

```typescript
import { debugLog, debugInfo, debugWarn, debugError, logErrorBoundary, logFetchError } from "../utils/debugLog";

// DEBUG: Detailed diagnostic information (only in dev mode or when __ENABLE_DEBUG_LOGS is set)
debugLog("Detailed debug info", { data: "value" });

// INFO: General informational messages (only in dev mode or when __ENABLE_DEBUG_LOGS is set)
debugInfo("Operation started", { data: "value" });

// WARN: Warning messages (only in dev mode or when __ENABLE_DEBUG_LOGS is set)
debugWarn("Warning message", { context });

// ERROR: Error messages (always logged, critical for debugging)
debugError("Operation failed", error);

// Log React error boundary error
logErrorBoundary(error, errorInfo, "ComponentName");

// Log fetch error
logFetchError("operation_name", error, { context });
```

**Log Levels:**
- `DEBUG`: Detailed diagnostic information (dev/debug mode only)
- `INFO`: General informational messages (dev/debug mode only)
- `WARN`: Warning messages (dev/debug mode only)
- `ERROR`: Error messages (always logged, critical)

**Features:**
- Industry standard log levels (RFC 5424)
- Consistent behavior across all log levels
- Environment-aware (dev vs production)
- Server-side logging via `/debug` endpoint
- Errors always logged (critical for debugging)
- Silent failure (doesn't break app)

### String Utils (`stringUtils.ts`)

String manipulation utilities.

```typescript
import { formatModelName, formatTime, truncate, normalize } from "../utils/stringUtils";

// Format model name: "lipsync-2-pro" → "Lipsync 2 Pro"
const formatted = formatModelName("lipsync-2-pro");

// Format time: 125 → "2:05"
const timeStr = formatTime(125);

// Truncate string with ellipsis
const short = truncate("Very long string", 10); // "Very long..."

// Normalize string (lowercase + trim)
const normalized = normalize("  HELLO  "); // "hello"
```

### Validation (`validation.ts`)

Input validation and sanitization utilities.

```typescript
import { validateUrl, sanitizeUrl, validateApiKey, sanitizeApiKey, validateFilePath, sanitizeFilePath, validateModelName, validateTemperature, validateSyncMode } from "../utils/validation";

// URL validation
const urlValidation = validateUrl("https://example.com");
if (urlValidation.valid) {
  const sanitized = sanitizeUrl("https://example.com");
}

// API key validation
const keyValidation = validateApiKey(apiKey);
if (keyValidation.valid) {
  const sanitized = sanitizeApiKey(apiKey);
}

// File path validation
const pathValidation = validateFilePath("/path/to/file");
const sanitized = sanitizeFilePath("/path/to/file");

// Model name validation
const modelValidation = validateModelName("lipsync-2-pro");

// Temperature validation (0-1)
const tempValidation = validateTemperature(0.5);

// Sync mode validation
const modeValidation = validateSyncMode("loop");
```

**Features:**
- Consistent ValidationResult interface
- Sanitization functions
- Security-focused (removes dangerous characters)
- Type-safe

### Retry Logic (`retry.ts`)

Retry utilities with exponential backoff.

```typescript
import { retry, retryFetch, RETRY_PRESETS } from "../utils/retry";

// Retry a function
const result = await retry(
  async () => {
    return await someAsyncOperation();
  },
  {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    exponentialBackoff: true,
    shouldRetry: (error) => {
      // Custom retry logic
      return error.message !== "Fatal error";
    },
    onRetry: (attempt, error) => {
      debugLog(`Retry attempt ${attempt}`, { error });
    }
  }
);

// Retry fetch request
const response = await retryFetch(url, options, RETRY_PRESETS.standard);

// Presets available:
RETRY_PRESETS.quick      // 3 retries, 500ms initial delay
RETRY_PRESETS.standard   // 3 retries, 1s initial delay
RETRY_PRESETS.aggressive // 5 retries, 2s initial delay
RETRY_PRESETS.network    // 5 retries, 3s initial delay
```

**Features:**
- Exponential backoff
- Configurable retry conditions
- Preset configurations
- Callback support

### Toast Notifications (`toast.ts`)

Toast notification system with consistent messaging.

```typescript
import { showToast, ToastMessages } from "../utils/toast";

// Basic toast
showToast("Operation completed", { type: "success" });

// Toast with duration
showToast("Loading...", { type: "info", duration: 5000 });

// Toast with action button
showToast("Error occurred", {
  type: "error",
  action: {
    text: "Retry",
    onClick: () => handleRetry()
  }
});

// Use predefined messages
showToast(ToastMessages.VIDEO_UPLOADED_SUCCESSFULLY);
showToast(ToastMessages.UPLOAD_FAILED("Network error"));
```

**Features:**
- Consistent styling
- Auto-positioning
- Action button support
- Predefined message constants

### Icon Utils (`iconUtils.tsx`)

Render Lucide icons as HTML strings for dynamic content.

```typescript
import { renderIconAsHTML } from "../utils/iconUtils";

// Render icon as HTML string
const iconHTML = renderIconAsHTML("play", { size: 18 });
element.innerHTML = iconHTML;

// With className
const iconHTML = renderIconAsHTML("check", { 
  size: 16, 
  className: "icon-checkmark" 
});
```

**Available Icons:**
- `x`, `cloud-download`, `copy-plus`, `link`, `eraser`
- `wifi-off`, `check`, `list-video`, `folder-open-dot`
- `alert-circle`, `key-round`, `clapperboard`, `video`
- `play`, `pause`, `arrow-right`, `arrow-right-to-line`
- `volume2`, `volume-2`, `volumex`, `volume-x`

### Environment Detection (`env.ts`)

Environment and host detection utilities.

```typescript
import { isDevMode, getBaseUrl, reloadPanel } from "../utils/env";

// Check if in development mode
if (isDevMode()) {
  // Dev-only code
}

// Get base URL
const baseUrl = getBaseUrl(); // "http://localhost:3001" in dev, "" in prod

// Reload panel safely
reloadPanel();
```

## Utility Best Practices

1. **Always use centralized utilities** - Don't duplicate functionality
2. **Import from correct files** - Check where constants/types are exported
3. **Use TypeScript generics** - Get type safety benefits
4. **Handle errors gracefully** - Utilities handle errors internally
5. **Follow naming conventions** - Use consistent naming patterns

## Adding New Utilities

When adding a new utility:

1. Create file in `src/js/shared/utils/`
2. Follow existing patterns
3. Add JSDoc comments
4. Export from file
5. Add to this documentation
6. Update imports in consuming files

## Migration Guide

### From Direct localStorage
```typescript
// Old
const value = localStorage.getItem("key");
localStorage.setItem("key", JSON.stringify(data));

// New
import { getStorageItem, setStorageItem } from "../utils/storage";
import { STORAGE_KEYS } from "../utils/constants";
const value = getStorageItem<string>(STORAGE_KEYS.KEY);
setStorageItem(STORAGE_KEYS.KEY, data);
```

### From Direct fetch
```typescript
// Old
const response = await fetch(url);
const data = await response.json().catch(() => null);

// New
import { parseJsonResponse } from "../utils/fetchUtils";
const response = await fetch(url);
const data = await parseJsonResponse<DataType>(response);
```

### From console.log
```typescript
// Old
console.log("Message");
console.error("Error", error);

// New
import { debugLog, debugError } from "../utils/debugLog";
debugLog("Message");
debugError("Error", error);
```

