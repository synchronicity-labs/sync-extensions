import type { CEP_Config } from "vite-cep-plugin";
import { version } from "./package.json";

// Load environment variables - dotenv is loaded in vite.config.ts before this file is imported
// Password from environment variable to avoid committing secrets to git
// Set ZXP_PASSWORD in src/server/.env file (already in .gitignore) - note: .env is not copied to build

const config: CEP_Config = {
  id: "com.sync.extension",
  displayName: "sync.",
  version,
  symlink: "local",
  port: 3001,
  servePort: 5000,
  startingDebugPort: 8860,
  extensionManifestVersion: 6.0,
  requiredRuntimeVersion: 9.0,
  hosts: [
    { name: "AEFT", version: "[24.0,99.9]" },
    { name: "PPRO", version: "[24.0,99.9]" },
  ],
  type: "Panel",
  iconDarkNormal: "./js/assets/icons/blue_icon.png",
  iconNormal: "./js/assets/icons/blue_icon.png",
  iconDarkNormalRollOver: "./js/assets/icons/blue_icon.png",
  iconNormalRollOver: "./js/assets/icons/blue_icon.png",
  parameters: [
    "--allow-file-access-from-files",
    "--allow-insecure-localhost",
    "--disable-features=BlockInsecurePrivateNetworkRequests,OutOfBlinkCors",
    "--enable-nodejs",
    "--enable-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-web-security",
  ],
  width: 480,
  height: 700,
  minWidth: 400,
  minHeight: 400,
  maxWidth: 2000,
  maxHeight: 2000,
  panels: [
    {
      mainPath: "./main/index.html",
      name: "main",
      panelDisplayName: "sync.",
      scriptPath: "./jsx/index.jsxbin",
      autoVisible: true,
      width: 480,
      height: 700,
      minWidth: 400,
      minHeight: 400,
      maxWidth: 2000,
      maxHeight: 2000,
    },
  ],
  build: {
    jsxBin: "replace",
    sourceMap: false,
  },
  zxp: {
    country: "US",
    province: "CA",
    org: "sync.",
    // Password from environment variable to avoid committing secrets to git
    // Set ZXP_PASSWORD in .env file (already in .gitignore)
    password: process.env.ZXP_PASSWORD || "",
    // TSA URLs: vite-cep-plugin tries each URL in order until one succeeds
    // Order matters: put platform-specific TSA first for faster builds
    // macOS: http://timestamp.apple.com/ts01
    // Windows: http://timestamp.digicert.com/
    // Both will work on either platform, but ordering optimizes build time
    tsa: [
      "http://timestamp.apple.com/ts01", // macOS - works on both platforms
      "http://timestamp.digicert.com/", // Windows - works on both platforms
    ],
    allowSkipTSA: false,
    sourceMap: false,
    jsxBin: "replace",
  },
  installModules: [],
  copyAssets: ["js/assets/icons", "js/lib", "server/server.js", "server/config.js", "server/telemetry.js", "server/package.json", "server/routes", "server/services", "server/utils"],
  copyFolders: ["js/panels/ppro/epr", "bin", "server/node_modules"],
  copyZipAssets: [],
};

export default config;
