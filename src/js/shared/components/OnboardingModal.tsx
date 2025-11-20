import React, { useState, useEffect, useRef } from "react";
import { ArrowRight, ListVideo, FolderOpenDot, Info } from "lucide-react";
import { useOnboarding } from "../hooks/useOnboarding";
import { useSettings } from "../hooks/useSettings";
import { useHostDetection } from "../hooks/useHostDetection";
import { isDevMode } from "../utils/env";
import { HOST_IDS } from "../../../shared/host";
import animationGif from "../../assets/onboarding/animation.gif";
import keyImage from "../../assets/onboarding/key.png";
import penImage from "../../assets/onboarding/pen.png";
import ballImage from "../../assets/onboarding/ball.png";
import micImage from "../../assets/onboarding/mic.png";
import thumbImage from "../../assets/onboarding/thumb.png";
import "../styles/components/onboarding.scss";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TOTAL_PAGES = 6;

// Module-level GIF key - ensures same key even if component remounts
let globalGifKey: string | null = null;

const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  const { completeOnboarding } = useOnboarding();
  const { settings, setApiKey, setSaveLocation } = useSettings();
  const { hostConfig } = useHostDetection();
  const [currentPage, setCurrentPage] = useState(2);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [elevenlabsApiKeyInput, setElevenlabsApiKeyInput] = useState("");
  const [showPage2Content, setShowPage2Content] = useState(false);
  const [isPage6Fading, setIsPage6Fading] = useState(false);
  const [isFadingToBlack, setIsFadingToBlack] = useState(false);
  const [isScriptingEnabled, setIsScriptingEnabled] = useState(false);
  const [isCheckingScripting, setIsCheckingScripting] = useState(false);
  const [saveLocation, setSaveLocationState] = useState<"project" | "universal" | null>(null);
  // Use module-level key to ensure stability even if component remounts
  const gifKey = globalGifKey || (globalGifKey = `gif-${Date.now()}-${Math.random()}`);
  const scriptingCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fadeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const page6TimerRef = useRef<NodeJS.Timeout | null>(null);
  const page2GifTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previousIsOpenRef = useRef<boolean>(false);

  // Reset to page 1 only when modal first opens (transition from closed to open)
  useEffect(() => {
    const wasClosed = !previousIsOpenRef.current;
    const isNowOpen = isOpen;
    previousIsOpenRef.current = isOpen;

    if (!isOpen) {
      // Clean up all timers when modal closes
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
      if (page6TimerRef.current) {
        clearTimeout(page6TimerRef.current);
        page6TimerRef.current = null;
      }
      if (page2GifTimerRef.current) {
        clearTimeout(page2GifTimerRef.current);
        page2GifTimerRef.current = null;
      }
      setIsPage6Fading(false);
      setIsTransitioning(false);
      setShowPage2Content(false);
      globalGifKey = null;
      return;
    }

    // Only reset if modal just opened (was closed, now open)
    if (wasClosed && isNowOpen) {
      setCurrentPage(2);
      setIsTransitioning(false);
      setShowPage2Content(false);
      setIsPage6Fading(false);
      setIsFadingToBlack(false);
    }
  }, [isOpen]);

  // Initialize input values from settings when modal opens (without resetting page)
  useEffect(() => {
    if (isOpen) {
      setApiKeyInput(settings.syncApiKey || "");
      setElevenlabsApiKeyInput(settings.elevenlabsApiKey || "");
      setSaveLocationState((settings.saveLocation === "project" || settings.saveLocation === "universal") ? settings.saveLocation : null);
    }
  }, [isOpen, settings.syncApiKey, settings.saveLocation, settings.elevenlabsApiKey]);

  // Show GIF first on page 2, then fade in content after GIF finishes
  useEffect(() => {
    // Only run if modal is open, we're on page 2, and content isn't shown yet
    if (!isOpen || currentPage !== 2 || showPage2Content) {
      return;
    }

    // Wait for GIF to finish (5 seconds), then fade in page 2 content
    const gifDuration = 5000; // 5 seconds
    
    page2GifTimerRef.current = setTimeout(() => {
      setShowPage2Content(true);
    }, gifDuration);
    
    return () => {
      if (page2GifTimerRef.current) {
        clearTimeout(page2GifTimerRef.current);
        page2GifTimerRef.current = null;
      }
    };
  }, [isOpen, currentPage, showPage2Content]);

  const handleNext = () => {
    if (currentPage < TOTAL_PAGES) {
      setIsTransitioning(true);
      setTimeout(() => {
        let nextPage = currentPage + 1;
        
        // Skip page 3 if not After Effects and not in dev mode
        if (nextPage === 3 && !shouldShowScriptingPage) {
          nextPage = 4;
        }
        
        setCurrentPage(nextPage);
        setIsTransitioning(false);
      }, 300); // Match transition duration
    } else {
      handleComplete();
    }
  };

  // Auto-advance from page 6: show for 3 seconds, then fade out and complete onboarding
  useEffect(() => {
    if (!isOpen || currentPage !== 6 || isTransitioning) {
      return;
    }

    // Clear any existing timer
    if (page6TimerRef.current) {
      clearTimeout(page6TimerRef.current);
      page6TimerRef.current = null;
    }

    // Show page 6 for 3 seconds, then fade to black
    const displayDuration = 3000; // 3 seconds
    const fadeToBlackDuration = 500; // 500ms fade to black

    page6TimerRef.current = setTimeout(() => {
      setIsPage6Fading(true);
      setIsFadingToBlack(true);
      
      // After fade to black completes, finish onboarding
      // This will trigger overlay fade-out and main UI fade-in
      setTimeout(() => {
        handleComplete();
      }, fadeToBlackDuration);
    }, displayDuration);

    return () => {
      if (page6TimerRef.current) {
        clearTimeout(page6TimerRef.current);
        page6TimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentPage, isTransitioning]);

  const handlePrevious = () => {
    if (currentPage > 2) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentPage(currentPage - 1);
        setIsTransitioning(false);
      }, 300);
    }
  };

  const handleComplete = () => {
    completeOnboarding();
    onClose();
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setApiKeyInput(value);
    // Only update settings if we're on page 2 or later
    if (currentPage >= 2) {
      setApiKey(value, "sync");
    }
  };

  const handleElevenlabsApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setElevenlabsApiKeyInput(value);
    // Only update settings if we're on page 5 or later
    if (currentPage >= 5) {
      setApiKey(value, "elevenlabs");
    }
  };

  const isValidApiKey = apiKeyInput.trim().startsWith("sk-");
  const isValidElevenlabsApiKey = elevenlabsApiKeyInput.trim().startsWith("sk_");
  const isAfterEffects = hostConfig?.hostId === HOST_IDS.AEFT;
  const shouldShowScriptingPage = isAfterEffects || isDevMode();

  // Check scripting permissions for After Effects
  const checkScriptingPermissions = async (): Promise<boolean> => {
    if (!isAfterEffects || !window.CSInterface) {
      return false;
    }

    try {
      const cs = new window.CSInterface();
      const script = `
        (function() {
          try {
            // Try to write a test file to check scripting permissions
            var tempFolder = Folder.temp;
            var testFile = new File(tempFolder.fsName + "/sync_scripting_test.txt");
            testFile.open("w");
            testFile.write("test");
            testFile.close();
            testFile.remove();
            return JSON.stringify({ ok: true, enabled: true });
          } catch(e) {
            // If error contains "script" or "permission", likely scripting disabled
            var errorMsg = String(e).toLowerCase();
            if (errorMsg.indexOf("script") !== -1 || errorMsg.indexOf("permission") !== -1) {
              return JSON.stringify({ ok: true, enabled: false });
            }
            // Other errors might mean permissions are enabled but something else failed
            return JSON.stringify({ ok: true, enabled: true });
          }
        })()
      `;

      return new Promise((resolve) => {
        cs.evalScript(script, (result: string) => {
          try {
            const parsed = JSON.parse(result);
            resolve(parsed.enabled === true);
          } catch {
            resolve(false);
          }
        });
      });
    } catch {
      return false;
    }
  };

  // Poll scripting permissions when on page 3
  useEffect(() => {
    if (!isOpen || currentPage !== 3 || !shouldShowScriptingPage) {
      if (scriptingCheckIntervalRef.current) {
        clearInterval(scriptingCheckIntervalRef.current);
        scriptingCheckIntervalRef.current = null;
      }
      return;
    }

    setIsCheckingScripting(true);
    
    // In dev mode (browser), always show as enabled for testing
    if (isDevMode()) {
      setIsScriptingEnabled(true);
      setIsCheckingScripting(false);
      return;
    }

    // Check immediately
    checkScriptingPermissions().then((enabled) => {
      setIsScriptingEnabled(enabled);
      setIsCheckingScripting(false);
    });

    // Then check every 1 second
    scriptingCheckIntervalRef.current = setInterval(async () => {
      const enabled = await checkScriptingPermissions();
      setIsScriptingEnabled(enabled);
    }, 1000);

    return () => {
      if (scriptingCheckIntervalRef.current) {
        clearInterval(scriptingCheckIntervalRef.current);
        scriptingCheckIntervalRef.current = null;
      }
    };
  }, [isOpen, currentPage, shouldShowScriptingPage]);


  const handleContinueFromPage2 = () => {
    if (isValidApiKey) {
      handleNext();
    }
  };

  const handleContinueFromPage3 = () => {
    if (isScriptingEnabled) {
      handleNext();
    }
  };

  const handleContinueFromPage4 = () => {
    if (saveLocation) {
      // Save the selected location to settings (this updates localStorage)
      setSaveLocation(saveLocation);
      handleNext();
    }
  };

  const handleSkipOrContinueFromPage5 = () => {
    // If user has entered a valid API key, save it
    if (isValidElevenlabsApiKey) {
      setApiKey(elevenlabsApiKeyInput, "elevenlabs");
    }
    handleNext();
  };

  // Update settings when user changes selection on page 4
  useEffect(() => {
    if (currentPage === 4 && isOpen && saveLocation) {
      setSaveLocation(saveLocation);
    }
  }, [saveLocation, currentPage, isOpen, setSaveLocation]);

  const handleHereHowClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const url = "https://docs.sync.so/quickstart#create-your-api-key";
    // Open in default browser using CSInterface if available, otherwise fallback to window.open
    if (typeof window !== "undefined" && window.CSInterface) {
      try {
        const csInterface = new window.CSInterface();
        if (csInterface.openURLInDefaultBrowser) {
          csInterface.openURLInDefaultBrowser(url);
        } else {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      } catch (error) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleElevenlabsHereHowClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const url = "https://elevenlabs.io/docs/api-reference/service-accounts/api-keys/create";
    // Open in default browser using CSInterface if available, otherwise fallback to window.open
    if (typeof window !== "undefined" && window.CSInterface) {
      try {
        const csInterface = new window.CSInterface();
        if (csInterface.openURLInDefaultBrowser) {
          csInterface.openURLInDefaultBrowser(url);
        } else {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      } catch (error) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className={`onboarding-overlay ${isOpen ? "show" : ""} ${isFadingToBlack ? "fading-to-black" : ""}`}>
      <div className="onboarding-container">
        <div className={`onboarding-content ${isTransitioning ? "transitioning" : ""}`}>
          {/* Page 2: API Key Setup - Shows GIF first, then fades in content */}
          <div className={`onboarding-page onboarding-page-2 ${currentPage === 2 ? "active" : ""}`}>
            <div className="onboarding-page-content">
              {/* GIF Animation - shows first */}
              {!showPage2Content && (
                <div className="onboarding-animation-wrapper fade-in-delayed">
                  <img 
                    key={gifKey}
                    src={animationGif} 
                    alt="Animation" 
                    className="onboarding-animation"
                  />
                </div>
              )}

              {/* Page 2 Content - fades in after GIF */}
              {showPage2Content && (
                <>
                  <div className="onboarding-image-wrapper animate-in" style={{ animationDelay: "0ms" }}>
                    <img src={keyImage} alt="API Key" className="onboarding-image" />
                  </div>

                  <div className="onboarding-text-content animate-in" style={{ animationDelay: "300ms" }}>
                    <p className="onboarding-page-title">
                      <span>welcome. </span>let's get you setup
                    </p>
                    <p className="onboarding-page-title">
                      with a<span> sync.</span>
                      <span> api key. </span>
                      <a href="https://docs.sync.so/quickstart#create-your-api-key" className="onboarding-link" onClick={handleHereHowClick} target="_blank" rel="noopener noreferrer">
                        here's how
                      </a>
                    </p>
                  </div>

                  <div className="onboarding-input-section animate-in" style={{ animationDelay: "600ms" }}>
                    <div className="onboarding-input-wrapper">
                      <input
                        type="password"
                        className="onboarding-input"
                        placeholder="paste your api key here"
                        value={apiKeyInput}
                        onChange={handleApiKeyChange}
                        onKeyPress={(e) => {
                          if (e.key === "Enter" && isValidApiKey) {
                            handleContinueFromPage2();
                          }
                        }}
                      />
                      <button
                        className={`onboarding-continue-button ${isValidApiKey ? "active" : ""}`}
                        onClick={handleContinueFromPage2}
                        disabled={!isValidApiKey}
                      >
                        <span>continue</span>
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Page 3: Scripting Permissions (After Effects only, or dev mode) */}
          {shouldShowScriptingPage && (
            <div className={`onboarding-page onboarding-page-3 ${currentPage === 3 ? "active" : ""}`}>
              <div className="onboarding-page-content">
                <div className={`onboarding-image-wrapper ${currentPage === 3 ? "animate-in" : ""}`} style={{ animationDelay: "300ms" }}>
                  <img src={penImage} alt="Scripting Permissions" className="onboarding-image" />
                </div>

                <div className={`onboarding-text-content ${currentPage === 3 ? "animate-in" : ""}`} style={{ animationDelay: "600ms" }}>
                  <p className="onboarding-page-title">real quick - can you enable</p>
                  <p className="onboarding-page-title">scripting permissions?</p>
                  <p className="onboarding-page-title">&nbsp;</p>
                  <p className="onboarding-instructions">
                    go to settings &gt; scripting &amp; expressions, and select
                  </p>
                  <p className="onboarding-instructions">
                    &ldquo;allow scripts to write files and access network&rdquo;.
                  </p>
                </div>

                <div className={`onboarding-button-section ${currentPage === 3 ? "animate-in" : ""}`} style={{ animationDelay: "900ms" }}>
                  <button
                    className={`onboarding-enabled-button ${isScriptingEnabled ? "active" : ""}`}
                    onClick={handleContinueFromPage3}
                    disabled={!isScriptingEnabled}
                  >
                    <span>enabled</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Page 4: Save Location */}
          <div className={`onboarding-page onboarding-page-4 ${currentPage === 4 ? "active" : ""}`}>
            <div className="onboarding-page-content">
              <div className={`onboarding-image-wrapper ${currentPage === 4 ? "animate-in" : ""}`} style={{ animationDelay: "300ms" }}>
                <img src={ballImage} alt="Save Location" className="onboarding-image" />
              </div>

              <div className={`onboarding-text-content ${currentPage === 4 ? "animate-in" : ""}`} style={{ animationDelay: "600ms" }}>
                <p className="onboarding-page-title">perfect. want to save videos</p>
                <p className="onboarding-page-title">per project, or keep everything</p>
                <div className="onboarding-page-title" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  <span>in your documents folder?</span>
                  <span className="onboarding-tooltip-wrapper">
                    <Info size={16} className="onboarding-info-icon" />
                    <div className="onboarding-tooltip">
                      <strong>save location</strong>
                      per project saves outputs in a sync. outputs folder within each project directory. documents saves all outputs in a universal folder in your documents directory.
                    </div>
                  </span>
                </div>
              </div>

              <div className={`onboarding-toggle-section ${currentPage === 4 ? "animate-in" : ""}`} style={{ animationDelay: "900ms" }}>
                <div className="onboarding-toggle-wrapper">
                  <button
                    className={`onboarding-toggle-option ${saveLocation === "project" ? "active" : ""}`}
                    onClick={() => setSaveLocationState("project")}
                  >
                    <ListVideo size={18} className="onboarding-toggle-icon" />
                    <span>per project</span>
                  </button>
                  <button
                    className={`onboarding-toggle-option ${saveLocation === "universal" ? "active" : ""}`}
                    onClick={() => setSaveLocationState("universal")}
                  >
                    <FolderOpenDot size={18} className="onboarding-toggle-icon" />
                    <span>documents</span>
                  </button>
                </div>
              </div>

              <div className={`onboarding-button-section ${currentPage === 4 ? "animate-in" : ""}`} style={{ animationDelay: "1200ms" }}>
                <button
                  className={`onboarding-continue-button ${saveLocation ? "active" : ""}`}
                  onClick={handleContinueFromPage4}
                  disabled={!saveLocation}
                >
                  <span>continue</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Page 5: ElevenLabs API Key Setup */}
          <div className={`onboarding-page onboarding-page-5 ${currentPage === 5 ? "active" : ""}`}>
            <div className="onboarding-page-content">
              <div className={`onboarding-image-wrapper ${currentPage === 5 ? "animate-in" : ""}`} style={{ animationDelay: "300ms" }}>
                <img src={micImage} alt="ElevenLabs API Key" className="onboarding-image" />
              </div>

              <div className={`onboarding-text-content ${currentPage === 5 ? "animate-in" : ""}`} style={{ animationDelay: "600ms" }}>
                <p className="onboarding-page-title">almost there. want to enable</p>
                <p className="onboarding-page-title">
                  ai-powered dubbing<span> and </span>
                </p>
                <p className="onboarding-page-title">
                  text-to-speech<span>? </span>
                  <a href="https://elevenlabs.io/docs/api-reference/service-accounts/api-keys/create" className="onboarding-link" onClick={handleElevenlabsHereHowClick} target="_blank" rel="noopener noreferrer">
                    here's how
                  </a>
                </p>
              </div>

              <div className={`onboarding-input-section ${currentPage === 5 ? "animate-in" : ""}`} style={{ animationDelay: "900ms" }}>
                <div className="onboarding-input-wrapper">
                  <input
                    type="password"
                    className="onboarding-input"
                    placeholder="paste your api key here"
                    value={elevenlabsApiKeyInput}
                    onChange={handleElevenlabsApiKeyChange}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && (isValidElevenlabsApiKey || !elevenlabsApiKeyInput.trim())) {
                        handleSkipOrContinueFromPage5();
                      }
                    }}
                  />
                  <button
                    className="onboarding-continue-button active"
                    onClick={handleSkipOrContinueFromPage5}
                  >
                    <span>{isValidElevenlabsApiKey ? "continue" : "skip"}</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Page 6: End of Onboarding */}
          <div className={`onboarding-page onboarding-page-6 ${currentPage === 6 ? "active" : ""} ${isPage6Fading ? "fading" : ""}`}>
            <div className="onboarding-page-content">
              <div className={`onboarding-image-wrapper ${currentPage === 6 ? "animate-in" : ""}`} style={{ animationDelay: "300ms" }}>
                <img src={ballImage} alt="End of Onboarding" className="onboarding-image" />
              </div>

              <div className={`onboarding-text-content ${currentPage === 6 ? "animate-in" : ""}`} style={{ animationDelay: "600ms" }}>
                <p className="onboarding-page-title">
                  <span className="onboarding-text-light">time to</span>
                  <span> craft magic.</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
