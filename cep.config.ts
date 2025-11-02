import type { CEPConfig } from "vite-cep-plugin";
import { version } from "./package.json";

const config: CEPConfig = {
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
    password: "",
    tsa: [
      "http://timestamp.digicert.com/", // Windows Only
      "http://timestamp.apple.com/ts01", // MacOS Only
    ],
    allowSkipTSA: false,
    sourceMap: false,
    jsxBin: "replace",
  },
  installModules: [],
  copyAssets: ["js/assets/icons", "js/lib", "server"],
  copyFolders: ["js/panels/ppro/epr"],
  copyZipAssets: [],
};

export default config;
