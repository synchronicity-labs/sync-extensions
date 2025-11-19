// UXP Initialization
// Replaces CEP initialization

import { dropDisable } from "./cep";
import { reloadPanel } from "../../shared/utils/env";

export const initializeUXP = () => {
  // Initialize UXP-specific features
  dropDisable(); // Prevent file drops on panel
  
  // UXP doesn't have flyout menus or context menus like CEP
  // These would need to be implemented using UXP APIs if needed
  console.log("[init-uxp] UXP initialized");
  
  // Set up reload handler
  if (typeof window !== "undefined") {
    // UXP panels can be reloaded via window.location.reload()
    (window as any).reloadPanel = reloadPanel;
  }
};
