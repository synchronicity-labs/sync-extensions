// Inline ns value to avoid import issues in ExtendScript
// const ns = "com.sync.extension"; // from cep.config.ts
const ns = "com.sync.extension";

import * as aeft from "./aeft/aeft";
import * as ppro from "./ppro/ppro";

//@ts-ignore
const host = typeof $ !== "undefined" ? $ : window;

// A safe way to get the app name since some versions of Adobe Apps broken BridgeTalk in various places (e.g. After Effects 24-25)
const getAppNameSafely = (): ApplicationName | "unknown" => {
  const compare = (a: string, b: string) => {
    return a.toLowerCase().indexOf(b.toLowerCase()) > -1;
  };
  const exists = (a: any) => typeof a !== "undefined";
  const isBridgeTalkWorking =
    typeof BridgeTalk !== "undefined" &&
    typeof BridgeTalk.appName !== "undefined";

  if (isBridgeTalkWorking) {
    return BridgeTalk.appName;
  } else if (app) {
    //@ts-ignore
    if (exists(app.name)) {
      //@ts-ignore
      const name: string = app.name;
      if (compare(name, "photoshop")) return "photoshop";
      if (compare(name, "illustrator")) return "illustrator";
      if (compare(name, "audition")) return "audition";
      if (compare(name, "bridge")) return "bridge";
      if (compare(name, "indesign")) return "indesign";
    }
    //@ts-ignore
    if (exists(app.appName)) {
      //@ts-ignore
      const appName: string = app.appName;
      if (compare(appName, "after effects")) return "aftereffects";
      if (compare(appName, "animate")) return "animate";
    }
    //@ts-ignore
    if (exists(app.path)) {
      //@ts-ignore
      const path = app.path;
      if (compare(path, "premiere")) return "premierepro";
    }
  }
  return "unknown";
};

var appName = getAppNameSafely();
// Always set functions to ensure they're available regardless of app detection
try {
  // Default to ppro (Premiere Pro) - this ensures functions are always available
  host[ns] = ppro;
  
  // Override with aeft if we're in After Effects
  if (appName === "aftereffects" || appName === "aftereffectsbeta") {
    host[ns] = aeft;
  }
  
  // Also ensure functions are available globally as a fallback
  // This ensures PPRO_startBackend and AEFT_startBackend are accessible
  try {
    for (var key in ppro) {
      if (Object.prototype.hasOwnProperty.call(ppro, key)) {
        host[key] = ppro[key];
      }
    }
    for (var key in aeft) {
      if (Object.prototype.hasOwnProperty.call(aeft, key)) {
        host[key] = aeft[key];
      }
    }
  } catch(globalErr) {}
} catch(e) {
  // Last resort: try to set at least one
  try {
    host[ns] = ppro; // Always default to ppro
  } catch(e2) {}
}

const empty = {};
// prettier-ignore
export type Scripts = typeof empty
  & typeof aeft
  & typeof ppro
  ;

// https://extendscript.docsforadobe.dev/interapplication-communication/bridgetalk-class.html?highlight=bridgetalk#appname
type ApplicationName =
  | "aftereffects"
  | "aftereffectsbeta"
  | "premierepro"
  | "premiereprobeta";
