/* Minimal CSInterface shim for CEP panels */
(function() {
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
          if (callback) callback(res); 
        });
      } else { 
        if (callback) callback(''); 
      }
    } catch (e) { 
      if (callback) callback(''); 
    }
  };
  
  CSInterfaceImpl.prototype.getSystemPath = function(pathType: string): string {
    try { 
      const cep = (window as any).__adobe_cep__;
      return (cep && cep.getSystemPath) ? cep.getSystemPath(pathType) : ''; 
    } catch(e) { 
      return ''; 
    }
  };
  
  (CSInterfaceImpl as any).SystemPath = ((window as any).__adobe_cep__ && (window as any).__adobe_cep__.SystemPath) 
    ? (window as any).__adobe_cep__.SystemPath 
    : SystemPath;
  
  (window as any).CSInterface = CSInterfaceImpl;
})();

