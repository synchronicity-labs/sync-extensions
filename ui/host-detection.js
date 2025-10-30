// Host detection - dynamically detects the host application
// Note: Extension-specific files in extensions/*/ui/host-detection.js override this
// This file is only used during development/testing
(function() {
  // First check if HOST_CONFIG is already set (by extension-specific file)
  if (window.HOST_CONFIG && window.HOST_CONFIG.hostId) {
    // Extension-specific file already set it, use that
    return;
  }
  
  var hostId = null;
  var hostName = null;
  var isAE = false;
  
  try {
    if (!window.CSInterface) {
      console.error('[host-detection] CSInterface not available, cannot detect host');
      return;
    }
    
    // Detect using CSInterface
    var cs = new CSInterface();
    var env = cs.getHostEnvironment && cs.getHostEnvironment();
    var appName = (env && (env.appName || '')) || '';
    var appId = (env && (env.appId || '')) || '';
    var nameU = String(appName).toUpperCase();
    var idU = String(appId).toUpperCase();
    
    if (idU.indexOf('AEFT') !== -1 || nameU.indexOf('AFTER EFFECTS') !== -1 || nameU.indexOf('AFTEREFFECTS') !== -1) {
      hostId = 'AEFT';
      hostName = 'After Effects';
      isAE = true;
    } else if (idU.indexOf('PPRO') !== -1 || nameU.indexOf('PREMIERE') !== -1) {
      hostId = 'PPRO';
      hostName = 'Premiere Pro';
      isAE = false;
    } else {
      // Fallback: check extension path
      try {
        var extPath = cs.getSystemPath(CSInterface.SystemPath.EXTENSION);
        if (extPath) {
          var extPathLower = extPath.toLowerCase();
          if (extPathLower.indexOf('ae') !== -1 || extPathLower.indexOf('aftereffects') !== -1) {
            hostId = 'AEFT';
            hostName = 'After Effects';
            isAE = true;
          } else if (extPathLower.indexOf('ppro') !== -1 || extPathLower.indexOf('premiere') !== -1) {
            hostId = 'PPRO';
            hostName = 'Premiere Pro';
            isAE = false;
          }
        }
      } catch(_) {}
    }
    
    // Only set HOST_CONFIG if we successfully detected the host
    if (hostId) {
      window.HOST_CONFIG = { hostId: hostId, hostName: hostName, isAE: isAE };
      console.log('[host-detection] Detected host: ' + hostName + ' (' + hostId + ')');
    } else {
      console.error('[host-detection] Could not detect host application. appName: "' + appName + '", appId: "' + appId + '"');
    }
  } catch(e) {
    console.error('[host-detection] Error detecting host: ' + String(e));
  }
})();
