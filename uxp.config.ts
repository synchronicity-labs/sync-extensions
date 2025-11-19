import { version } from "./package.json";

// UXP Configuration
const isProduction = typeof process !== "undefined" && process.env?.NODE_ENV === "production";
const isPackage = typeof process !== "undefined" && process.env?.UXP_PACKAGE === "true";

const config = {
  id: "com.sync.extension",
  name: "sync.",
  version,
  manifestVersion: 6,
  requiredRuntimeVersion: 12.0,
  hosts: [
    { app: "AEFT", minVersion: "24.0.0" },
    { app: "PPRO", minVersion: "24.0.0" },
  ],
  port: 3001,
  servePort: 5000,
  panel: {
    mainPath: "./main/index.html",
    name: "main",
    label: "sync.",
    width: 480,
    height: 700,
    minWidth: 385,
    minHeight: 400,
    maxWidth: 2000,
    maxHeight: 2000,
  },
  icons: {
    normal: "./js/assets/icons/blue_icon.png",
    darkNormal: "./js/assets/icons/blue_icon.png",
  },
  copyAssets: [
    "js/assets/icons",
    "js/lib",
    "server/package.json",
    "server/server.ts",
    "server/serverConfig.ts",
    "server/telemetry.ts",
    "server/routes",
    "server/services",
    "server/utils",
    "shared",
  ],
  copyFolders: ["js/panels/ppro/epr", "bin", "server/node_modules"],
  isProduction,
  isPackage,
};

export default config;
