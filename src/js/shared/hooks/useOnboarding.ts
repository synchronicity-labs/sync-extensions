import { useState, useEffect, useCallback } from "react";
import { getStorageItem, setStorageItem } from "../utils/storage";
import { STORAGE_KEYS } from "../utils/constants";
import { debugLog } from "../utils/debugLog";
import { isDevMode } from "../utils/env";

/**
 * Hook to manage onboarding state
 * Checks localStorage to determine if user has completed onboarding
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

      const completed = getStorageItem<boolean>(STORAGE_KEYS.ONBOARDING_COMPLETED, false);
      debugLog("[onboarding] Status check", { completed });
      setIsOnboardingComplete(completed === true);
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
