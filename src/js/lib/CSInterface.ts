/* Minimal CSInterface shim for CEP panels */
(function() {
  try {
    if ((window as any).CSInterface) return;
    
    const SystemPath = {
      APPLICATION: 'application',
      COMMON_FILES: 'commonFiles',
      EXTENSION: 'extension',
      HOST_APPLICATION: 'hostApplication',
      USER_DATA: 'userData'
    };
    
    interface CSInterface {
      evalScript(script: string, callback?: (result: string) => void): void;
      getSystemPath(pathType: string): string;
      openURLInDefaultBrowser(url: string): void;
    }
    
    interface CSInterfaceConstructor {
      new (): CSInterface;
      SystemPath: typeof SystemPath;
    }
    
    function CSInterfaceImpl(this: CSInterface) {}
    
    CSInterfaceImpl.prototype.evalScript = function(script: string, callback?: (result: string) => void): void {
      try {
        const cep = (window as any).__adobe_cep__;
        if (cep && typeof cep.evalScript === 'function') {
          cep.evalScript(script, (res: string) => { 
            if (callback) {
              try {
                callback(res); 
              } catch (e) {
                console.error('[CSInterface] Callback error:', e);
              }
            }
          });
        } else { 
          console.warn('[CSInterface] CEP evalScript not available');
          if (callback) callback(''); 
        }
      } catch (e) { 
        console.error('[CSInterface] evalScript error:', e);
        if (callback) callback(''); 
      }
    };
    
    CSInterfaceImpl.prototype.getSystemPath = function(pathType: string): string {
      try { 
        const cep = (window as any).__adobe_cep__;
        if (cep && cep.getSystemPath) {
          return cep.getSystemPath(pathType);
        }
        return ''; 
      } catch(e) { 
        console.error('[CSInterface] getSystemPath error:', e);
        return ''; 
      }
    };
    
    CSInterfaceImpl.prototype.openURLInDefaultBrowser = function(url: string): void {
      try {
        const cep = (window as any).__adobe_cep__;
        if (cep && typeof cep.openURLInDefaultBrowser === 'function') {
          cep.openURLInDefaultBrowser(url);
        } else {
          // Fallback to window.open
          window.open(url, '_blank');
        }
      } catch (e) {
        console.error('[CSInterface] openURLInDefaultBrowser error:', e);
        window.open(url, '_blank');
      }
    };
    
    (CSInterfaceImpl as any).SystemPath = ((window as any).__adobe_cep__ && (window as any).__adobe_cep__.SystemPath) 
      ? (window as any).__adobe_cep__.SystemPath 
      : SystemPath;
    
    (window as any).CSInterface = CSInterfaceImpl;
    
    // Log initialization
    console.log('[CSInterface] CSInterface shim initialized');
  } catch (e) {
    console.error('[CSInterface] Failed to initialize CSInterface shim:', e);
    // Create a minimal fallback
    (window as any).CSInterface = function() {};
    (window as any).CSInterface.prototype.evalScript = function() {};
    (window as any).CSInterface.prototype.getSystemPath = function() { return ''; };
    (window as any).CSInterface.prototype.openURLInDefaultBrowser = function(url: string) { window.open(url, '_blank'); };
  }
})();

