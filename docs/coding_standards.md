# Coding Standards

## General Principles

### 1. Consistency
- Use centralized utilities instead of duplicating code
- Follow established patterns throughout the codebase
- Use constants instead of magic strings/numbers

### 2. Type Safety
- Always use TypeScript types
- Avoid `any` unless absolutely necessary
- Define interfaces for complex objects
- Use generic types where appropriate

### 3. Error Handling
- Always handle errors gracefully
- Use centralized error logging ([debug.md](./debug.md))
- Provide user-friendly error messages
- Never silently swallow errors
- CEP panels do not have a browser console

### 4. Performance
- Memoize expensive components
- Use useCallback for event handlers passed to children
- Use useMemo for expensive computations
- Avoid unnecessary re-renders
- Avoid creating unneeded markdown docs

## Code Organization

### Imports Order
1. React imports
2. Third-party library imports
3. Internal component/hook imports
4. Utility imports
5. Type imports
6. Style imports (if any)

### File Structure
```typescript
// 1. Imports
import React from "react";
import { useState } from "react";

// 2. Types/Interfaces
interface Props {
  // ...
}

// 3. Constants (if file-specific)
const LOCAL_CONSTANT = "value";

// 4. Component/Hook
export const Component: React.FC<Props> = () => {
  // Implementation
};

// 5. Exports
export default Component;
```

## Naming Conventions

### Files
- **Components**: PascalCase (e.g., `HistoryTab.tsx`)
- **Hooks**: camelCase starting with `use` (e.g., `useHistory.ts`)
- **Utils**: camelCase (e.g., `fetchUtils.ts`)
- **Types**: camelCase (e.g., `common.ts`)

### Variables & Functions
- **Variables**: camelCase (e.g., `isLoading`)
- **Functions**: camelCase (e.g., `handleClick`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `STORAGE_KEYS`)
- **Types/Interfaces**: PascalCase (e.g., `Job`, `Settings`)

### React Components
- **Components**: PascalCase (e.g., `HistoryTab`)
- **Props**: PascalCase interface name (e.g., `HistoryTabProps`)
- **Hooks**: camelCase starting with `use` (e.g., `useHistory`)

## Utility Usage

### Storage
```typescript
// ✅ Correct
import { getStorageItem, setStorageItem } from "../utils/storage";
import { STORAGE_KEYS } from "../utils/constants";

const value = getStorageItem<string>(STORAGE_KEYS.UPLOADED_VIDEO_URL);
setStorageItem(STORAGE_KEYS.UPLOADED_VIDEO_URL, newValue);

// ❌ Wrong
const value = localStorage.getItem("uploadedVideoUrl");
localStorage.setItem("uploadedVideoUrl", newValue);
```

### Fetch
```typescript
// ✅ Correct
import { parseJsonResponse } from "../utils/fetchUtils";

const data = await parseJsonResponse<ResponseType>(response);

// ❌ Wrong
const data = await response.json().catch(() => null);
```

### Logging
```typescript
// ✅ Correct - Use appropriate log level
import { debugLog, debugInfo, debugWarn, debugError } from "../utils/debugLog";

debugLog("Detailed debug info", { data });      // DEBUG level
debugInfo("Operation started", { data });       // INFO level
debugWarn("Warning message", { context });      // WARN level
debugError("Operation failed", error);          // ERROR level (always logged)

// ❌ Wrong - Don't use console directly
console.log("Operation started");
console.error("Operation failed");

// ❌ Wrong - Don't log errors with debugLog
debugLog("Operation failed", error);  // Use debugError instead
```

### Constants
```typescript
// ✅ Correct
import { DELAYS } from "../utils/constants";

setTimeout(() => {}, DELAYS.RETRY);

// ❌ Wrong
setTimeout(() => {}, 100);
```

## Error Handling

### Component Level
```typescript
const handleAction = async () => {
  try {
    await performAction();
  } catch (error) {
    debugError("Action failed", error);
    showToast("Action failed", { type: "error" });
  }
};
```

### Hook Level
```typescript
const useCustomHook = () => {
  const [error, setError] = useState<string | null>(null);
  
  const performAction = async () => {
    try {
      // Action
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      debugError("Hook action failed", err);
    }
  };
  
  return { error, performAction };
};
```

### Error Boundaries
```typescript
// ✅ Correct
<ErrorBoundary>
  <Component />
</ErrorBoundary>

// Error boundary logs errors automatically
```

## Performance Best Practices

### Memoization
```typescript
// ✅ Memoize expensive components
export default memo(ExpensiveComponent);

// ✅ Memoize callbacks
const handleClick = useCallback(() => {
  // Handler logic
}, [dependencies]);

// ✅ Memoize expensive computations
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(data);
}, [data]);
```

### Avoid Unnecessary Re-renders
```typescript
// ✅ Correct - memoized callback
const handleClick = useCallback(() => {
  // Handler
}, [deps]);

// ❌ Wrong - new function on every render
const handleClick = () => {
  // Handler
};
```

## Type Safety

### Avoid `any`
```typescript
// ✅ Correct
interface Job {
  id: string;
  status: string;
}

const processJob = (job: Job) => {
  // ...
};

// ❌ Wrong
const processJob = (job: any) => {
  // ...
};
```

### Use Generic Types
```typescript
// ✅ Correct
const getStorageItem = <T>(key: string): T | null => {
  // ...
};

const settings = getStorageItem<Settings>(STORAGE_KEYS.SYNC_SETTINGS);

// ❌ Wrong
const getStorageItem = (key: string): any => {
  // ...
};
```

## Testing Considerations

- Functions should be pure where possible
- Side effects should be isolated
- Dependencies should be injectable
- Error cases should be testable

## Documentation

### JSDoc Comments
```typescript
/**
 * Formats a model name for display
 * Converts "lipsync-2-pro" to "Lipsync 2 Pro"
 * 
 * @param model - The model name to format
 * @returns Formatted model name
 */
export const formatModelName = (model: string): string => {
  // Implementation
};
```

### Inline Comments
- Use comments to explain "why", not "what"
- Keep comments up to date with code
- Remove commented-out code

## Git Practices

- Commit related changes together
- Write clear commit messages
- Keep commits focused and atomic
- Review changes before committing

