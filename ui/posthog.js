(function() {
  // Interceptors are set up in index.html BEFORE PostHog loads
  // This file handles PostHog initialization only
  
  if (typeof posthog === 'undefined' && typeof window.posthog === 'undefined') {
    return;
  }
  
  var ph = typeof posthog !== 'undefined' ? posthog : window.posthog;
  
  fetch('http://127.0.0.1:3000/telemetry/test')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var distinctId = data.distinctId || 'unknown';
      
      ph.init('phc_82dxgIiZvuUFV41LErIq8UGCNYmisHq8Fn3a4LGtsYO', {
        api_host: 'https://us.i.posthog.com',
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: false,
        disable_external_dependency_loading: true,
        persistence: 'localStorage',
        maskAllText: false,
        maskAllInputs: false,
        maskTextSelector: '[data-sensitive], .api-key-input, input[type="password"], input[name*="api"], input[name*="key"], input[id*="api"], input[id*="key"]',
        distinct_id: distinctId,
        flush_at: 1,
        flush_interval_ms: 1000,
        loaded: function(posthog) {
          // Add error handler for session recording
          try {
            if (posthog.sessionRecording) {
              // Hook into error handling if available
              if (typeof posthog.sessionRecording.onError === 'function') {
                posthog.sessionRecording.onError(function(error) {
                  // Log to server for debugging (no console in CEP)
                  fetch('http://127.0.0.1:3000/telemetry/posthog-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      distinctId: distinctId,
                      error: error.message || String(error),
                      errorType: 'session_recording_error',
                      timestamp: new Date().toISOString()
                    })
                  }).catch(function(err) {});
                });
              }
            }
          } catch(e) {
            // Silently fail - no console in CEP
          }
          
          // Manually initialize session recording for CEP/extensions
          setTimeout(function() {
            try {
              // Try PostHog extension API first (for disable_external_dependency_loading)
              if (window.__PosthogExtensions__ && typeof window.__PosthogExtensions__.initSessionRecording === 'function') {
                window.__PosthogExtensions__.initSessionRecording(posthog);
              }
              
              // Also try standard methods
              if (posthog && typeof posthog.startSessionRecording === 'function') {
                posthog.startSessionRecording();
              }
              if (posthog.sessionRecording && typeof posthog.sessionRecording.startRecording === 'function') {
                posthog.sessionRecording.startRecording();
              }
            } catch(e) {}
          }, 500);
          
          // Send status to server
          setTimeout(function() {
            fetch('http://127.0.0.1:3000/telemetry/posthog-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                distinctId: distinctId,
                posthogLoaded: true,
                sessionRecordingEnabled: !posthog.__loadedOptions || !posthog.__loadedOptions.disable_session_recording,
                sessionRecordingStarted: posthog.sessionRecordingStarted || false,
                hasSessionManager: typeof posthog.sessionManager !== 'undefined',
                sessionId: posthog.get_session_id ? posthog.get_session_id() : null
              })
            }).catch(function(err) {});
          }, 1500);
        }
      });
      
      ph.identify(distinctId, {
        syncExtensionId: distinctId,
        installId: distinctId,
        source: 'sync-extension'
      });
      
      ph.capture('ui_panel_loaded', {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      });
      
      // Test interceptor by making a manual PostHog request
      setTimeout(function() {
        try {
          // This should be intercepted
          fetch('https://us.i.posthog.com/e/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test: 'interceptor_check' })
          }).catch(function() {});
        } catch(e) {}
      }, 2000);
      
      // Force flush events immediately
      try {
        if (ph.flush && typeof ph.flush === 'function') {
          ph.flush();
        }
      } catch(e) {}
      
      // Set up event listeners
      function setupPostHogEvents() {
        var ph = typeof posthog !== 'undefined' ? posthog : (typeof window.posthog !== 'undefined' ? window.posthog : null);
        if (!ph) return;
        
        // Track tab switches
        document.querySelectorAll('.tab-switch').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var tab = btn.dataset.tab;
            ph.capture('ui_tab_switched', {
              tab: tab,
              timestamp: new Date().toISOString()
            });
          });
        });
        
        // Track button clicks
        document.querySelectorAll('[data-action]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var action = btn.dataset.action;
            ph.capture('ui_button_clicked', {
              action: action,
              timestamp: new Date().toISOString()
            });
          });
        });
        
        // Track model selection
        document.querySelectorAll('input[name="model"]').forEach(function(radio) {
          radio.addEventListener('change', function() {
            if (radio.checked) {
              ph.capture('ui_model_selected', {
                model: radio.value,
                timestamp: new Date().toISOString()
              });
            }
          });
        });
        
        // Track settings changes
        document.querySelectorAll('.api-key-input').forEach(function(input) {
          input.addEventListener('input', function() {
            ph.capture('ui_api_key_entered', {
              field: input.id,
              hasValue: input.value.length > 0,
              timestamp: new Date().toISOString()
            });
          });
        });
        
        // Track save location changes
        document.querySelectorAll('[data-save-location]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var location = btn.dataset.saveLocation;
            ph.capture('ui_save_location_changed', {
              location: location,
              timestamp: new Date().toISOString()
            });
          });
        });
        
        // Track render format changes
        document.querySelectorAll('[data-video-format], [data-audio-format]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var format = btn.dataset.videoFormat || btn.dataset.audioFormat;
            var type = btn.dataset.videoFormat ? 'video' : 'audio';
            ph.capture('ui_render_format_changed', {
              type: type,
              format: format,
              timestamp: new Date().toISOString()
            });
          });
        });
        
        // Track lipsync button clicks
        var lipsyncBtn = document.getElementById('lipsyncBtn');
        if (lipsyncBtn) {
          lipsyncBtn.addEventListener('click', function() {
            ph.capture('ui_run_clicked', {
              timestamp: new Date().toISOString()
            });
          });
        }
      }
      
      // Wait for DOM to be ready before setting up events
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupPostHogEvents);
      } else {
        setupPostHogEvents();
      }
    })
    .catch(function(e) {
      // Fallback initialization
      var fallbackId = 'unknown';
      ph.init('phc_82dxgIiZvuUFV41LErIq8UGCNYmisHq8Fn3a4LGtsYO', {
        api_host: 'https://us.i.posthog.com',
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: false,
        disable_external_dependency_loading: true,
        persistence: 'localStorage',
        maskAllText: false,
        maskAllInputs: false,
        maskTextSelector: '[data-sensitive], .api-key-input, input[type="password"], input[name*="api"], input[name*="key"], input[id*="api"], input[id*="key"]',
        loaded: function(posthog) {
          // Add error handler for session recording
          try {
            if (posthog.sessionRecording) {
              if (typeof posthog.sessionRecording.onError === 'function') {
                posthog.sessionRecording.onError(function(error) {
                  console.error('PostHog session recording error:', error);
                });
              }
            }
          } catch(e) {}
          
          try {
            if (posthog && typeof posthog.startSessionRecording === 'function') {
              posthog.startSessionRecording();
            }
            if (posthog.sessionRecording && typeof posthog.sessionRecording.startRecording === 'function') {
              posthog.sessionRecording.startRecording();
            }
          } catch(e) {}
        }
      });
      ph.identify(fallbackId, {
        syncExtensionId: fallbackId,
        installId: fallbackId,
        source: 'sync-extension'
      });
      ph.capture('ui_panel_loaded', {
        timestamp: new Date().toISOString(),
        fallback: true
      });
    });
})();

