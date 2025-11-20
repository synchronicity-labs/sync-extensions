import { useState, useEffect, useCallback } from "react";
import { getStorageItem, setStorageItem, getSettings } from "../utils/storage";
import { STORAGE_KEYS } from "../utils/constants";
import { debugLog } from "../utils/debugLog";
import { isDevMode } from "../utils/env";

/**
 * Hook to manage onboarding state
 * Checks localStorage to determine if user has completed onboarding
 * Also checks if API key exists - if it does, onboarding is considered complete
 * Provides methods to mark onboarding as complete
 */
export const useOnboarding = () => {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean>(false); // Start as false, will be updated after check
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Check onboarding status on mount
  useEffect(() => {
    try {
      // In dev mode, check for URL parameter to force show onboarding
      if (isDevMode() && typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('showOnboarding') === 'true') {
          debugLog("[onboarding] Dev mode: URL parameter forces onboarding");
          setIsOnboardingComplete(false);
          setIsLoading(false);
          return;
        }
      }

      // Check if onboarding was explicitly marked as complete
      const completed = getStorageItem<boolean>(STORAGE_KEYS.ONBOARDING_COMPLETED, false);
      
      // Also check if API key exists - if it does, user has already completed onboarding
      const settings = getSettings();
      const hasApiKey = settings?.syncApiKey && settings.syncApiKey.trim().startsWith('sk-');
      
      // Onboarding is complete if explicitly marked OR if API key exists
      const isComplete = completed === true || hasApiKey === true;
      
      debugLog("[onboarding] Status check", { completed, hasApiKey, isComplete });
      setIsOnboardingComplete(isComplete);
      
      // If API key exists but onboarding wasn't marked complete, mark it now
      if (hasApiKey && !completed) {
        setStorageItem(STORAGE_KEYS.ONBOARDING_COMPLETED, true);
      }
    } catch (error) {
      debugLog("[onboarding] Error checking status", error);
      // Default to showing onboarding if we can't check
      setIsOnboardingComplete(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const completeOnboarding = useCallback(() => {
    try {
      setStorageItem(STORAGE_KEYS.ONBOARDING_COMPLETED, true);
      setIsOnboardingComplete(true);
      debugLog("[onboarding] Marked as complete");
    } catch (error) {
      debugLog("[onboarding] Error completing onboarding", error);
      // Still update state even if storage fails
      setIsOnboardingComplete(true);
    }
  }, []);

  const resetOnboarding = useCallback(() => {
    try {
      setStorageItem(STORAGE_KEYS.ONBOARDING_COMPLETED, false);
      setIsOnboardingComplete(false);
      debugLog("[onboarding] Reset onboarding");
    } catch (error) {
      debugLog("[onboarding] Error resetting onboarding", error);
      setIsOnboardingComplete(false);
    }
  }, []);

  return {
    isOnboardingComplete,
    isLoading,
    completeOnboarding,
    resetOnboarding,
    showOnboarding: !isOnboardingComplete && !isLoading,
  };
};
