# Architecture Documentation

## Overview

This codebase is a React-based extension for Adobe Premiere Pro, After Effects, and DaVinci Resolve that provides lipsync functionality. The application follows a modular architecture with clear separation of concerns.

## Directory Structure

```
src/js/
├── main/              # Main entry points and app initialization
├── shared/            # Shared code used across all hosts
│   ├── components/   # React components
│   ├── hooks/        # Custom React hooks
│   ├── utils/        # Utility functions and helpers
│   ├── types/        # TypeScript type definitions
│   └── styles/       # SCSS stylesheets
└── ...
```

## Core Principles

### 1. Centralization
- **Constants**: All magic strings/numbers centralized in `utils/constants.ts`
- **Storage**: All localStorage operations go through `utils/storage.ts`
- **Fetch**: All network requests use `utils/fetchUtils.ts`
- **Logging**: All logging goes through `utils/debugLog.ts`
- **Error Handling**: Centralized error logging in `utils/debugLog.ts`

### 2. Type Safety
- TypeScript throughout the codebase
- Shared types in `types/common.ts`
- Proper typing for all utilities and hooks
- Minimal use of `any` (only where necessary for backward compatibility)

### 3. Performance Optimization
- React.memo for expensive components
- useCallback for event handlers
- useMemo for expensive computations
- Lazy loading where appropriate

### 4. Error Handling
- Global error boundary (`GlobalErrorBoundary.tsx`)
- Consistent error logging to server
- Graceful degradation
- User-friendly error messages

## Key Patterns

### Utility Pattern
All utilities follow a consistent pattern:
- Single responsibility
- Type-safe interfaces
- Consistent error handling
- Documented with JSDoc comments

### Hook Pattern
Custom hooks:
- Encapsulate stateful logic
- Return consistent interfaces
- Handle cleanup in useEffect
- Use centralized utilities

### Component Pattern
Components:
- Functional components with hooks
- Memoized when expensive
- Error boundaries for critical sections
- Consistent prop interfaces

## File Organization

### Utils (`src/js/shared/utils/`)
- `constants.ts` - All application constants
- `storage.ts` - localStorage utilities
- `fetchUtils.ts` - Network request utilities
- `debugLog.ts` - Logging utilities (includes error logging)
- `stringUtils.ts` - String manipulation utilities
- `toast.ts` - Toast notification system
- `iconUtils.tsx` - Icon rendering utilities
- `env.ts` - Environment detection
- `serverConfig.ts` - Server configuration
- `thumbnails.ts` - Thumbnail generation
- `windowGlobals.ts` - Window global setup (backward compatibility)
- `clientHostDetection.ts` - Client-side host detection
- `clientVersion.ts` - Client version utilities
- `loader.ts` - Loading utilities

### Hooks (`src/js/shared/hooks/`)
- `useCore.ts` - Core functionality (auth, API)
- `useMedia.ts` - Media selection and upload
- `useHistory.ts` - Job history management
- `useSettings.ts` - Settings management
- `useTabs.tsx` - Tab navigation
- `useNLE.ts` - NLE integration
- `useAudioPlayer.ts` - Audio player functionality
- `useVideoPlayer.ts` - Video player functionality
- `useDragAndDrop.ts` - Drag and drop handling
- `useRecording.ts` - Recording functionality
- `useCost.ts` - Cost calculation
- `useServerAutoStart.ts` - Server auto-start
- `useJobs.ts` - Job management
- `useTTS.ts` - Text-to-speech functionality
- `useHostDetection.ts` - Host application detection
- `useOnboarding.ts` - Onboarding flow management

### Components (`src/js/shared/components/`)
- `App.tsx` - Main app component (in `src/js/main/`)
- `Header.tsx` - Header component
- `SourcesTab.tsx` - Sources tab UI
- `HistoryTab.tsx` - History tab UI
- `SettingsTab.tsx` - Settings tab UI
- `BottomBar.tsx` - Bottom action bar
- `GlobalErrorBoundary.tsx` - Global error handler
- `ModelSelector.tsx` - Model selection modal
- `URLInputModal.tsx` - URL input modal for remote media
- `TTSVoiceSelector.tsx` - Text-to-speech voice selection
- `TTSInterface.tsx` - Text-to-speech interface
- `TTSVoiceCloneModal.tsx` - Voice cloning modal
- `OnboardingModal.tsx` - Onboarding flow modal

## Data Flow

1. **User Action** → Component → Hook
2. **Hook** → Utility Functions → API/Storage
3. **Response** → Hook State Update → Component Re-render
4. **Errors** → Error Boundary → Logging → User Notification

## State Management

- **Local State**: React useState/useReducer
- **Persistent State**: localStorage via `storage.ts`
- **Global State**: Window globals (for backward compatibility)
- **Server State**: Fetched via hooks, cached in component state

## Error Handling Strategy

1. **Component Level**: Try-catch in event handlers
2. **Hook Level**: Error state management
3. **Global Level**: Error boundary catches React errors
4. **Network Level**: Retry logic with exponential backoff
5. **Logging**: All errors logged to server debug endpoint

## Performance Considerations

- Memoization for expensive components
- Callback memoization to prevent unnecessary re-renders
- Lazy loading for heavy components (future)
- Virtual scrolling for large lists (future)
- Intersection observer for thumbnail loading (future)

## Backward Compatibility

- Window globals maintained in `windowGlobals.ts`
- Legacy API support preserved
- Gradual migration path maintained

