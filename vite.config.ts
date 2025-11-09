import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cep, runAction } from "vite-cep-plugin";
import path from "path";
import fs from "fs";
import { extendscriptConfig } from "./vite.es.config";
import dotenv from "dotenv";

// Load environment variables from src/server/.env file (shared with server config)
// MUST load before importing cep.config.ts to ensure ZXP_PASSWORD is available
dotenv.config({ path: path.resolve(process.cwd(), "src/server/.env") });

import cepConfig from "./cep.config";

const src = path.resolve(__dirname, "src");
const root = path.resolve(src, "js");
const devDist = "dist";
const cepDist = "cep";
const outDir = path.resolve(__dirname, devDist, cepDist);

const isProduction = process.env.NODE_ENV === "production";
const isPackage = process.env.ZXP_PACKAGE === "true";
const action = process.env.BOLT_ACTION;

let input = {};
cepConfig.panels.map((panel) => {
  input[panel.name] = path.resolve(root, panel.mainPath);
});

const config = {
  cepConfig,
  isProduction,
  isPackage,
  dir: `${__dirname}/${devDist}`,
  cepDist: cepDist,
  zxpDir: `${__dirname}/${devDist}/zxp`,
  zipDir: `${__dirname}/${devDist}/zip`,
  packages: cepConfig.installModules || [],
};

if (action) runAction(config, action);

// Helper to fix redirect path in built HTML (vite-cep-plugin injects /main/index.html but Vite serves /main/)
const fixRedirectPath = () => {
  if (!isProduction && !isPackage) {
    cepConfig.panels.forEach(panel => {
      const htmlPath = path.join(outDir, panel.name, 'index.html');
      if (fs.existsSync(htmlPath)) {
        let content = fs.readFileSync(htmlPath, 'utf-8');
        const originalContent = content;
        // Fix redirect: /main/index.html -> /main/ (Bolt CEP standard)
        content = content.replace(
          /window\.location\.href\s*=\s*['"]http:\/\/localhost:3001\/main\/index\.html['"]/g,
          "window.location.href = 'http://localhost:3001/main/'"
        );
        if (content !== originalContent) {
          fs.writeFileSync(htmlPath, content, 'utf-8');
        }
      }
    });
  }
};

export default defineConfig({
  plugins: [
    react(),
    cep(config),
    {
      name: 'bolt-cep-fix-redirect',
      enforce: 'post', // Run AFTER vite-cep-plugin to fix its redirect
      transformIndexHtml(html, context) {
        // Handle case where html might be undefined due to symlink errors
        if (!html || typeof html !== 'string') {
          console.warn('[bolt-cep-fix-redirect] transformIndexHtml received invalid html, returning empty string');
          return '';
        }
        
        // Fix redirect path during dev server transformation
        // This runs AFTER vite-cep-plugin transforms the HTML
        // Also add debugging to help diagnose issues
        let fixed = html.replace(
          /window\.location\.href\s*=\s*['"]http:\/\/localhost:3001\/main\/index\.html['"]/g,
          `window.location.href = 'http://localhost:3001/main/'`
        );
        
        // If we found and fixed a redirect, add debugging
        if (fixed !== html) {
          // Add debug logging before redirect
          fixed = fixed.replace(
            /(<script[^>]*>[\s\S]*?window\.location\.href\s*=\s*['"]http:\/\/localhost:3001\/main\/['"])/g,
            `$1; console.log('[CEP] Redirecting to dev server:', 'http://localhost:3001/main/');`
          );
        }
        
        return fixed;
      },
      buildEnd() {
        // Fix redirect path after build (vite-cep-plugin runs before this)
        fixRedirectPath();
        
        // Remove .debug file from dist/cep if it exists (CEP debug config, not user logging flag)
        // This should not be created for ZXP packages (symlink is disabled), but remove it as a safety measure
        if (isPackage) {
          const debugFile = path.join(outDir, '.debug');
          if (fs.existsSync(debugFile)) {
            try {
              fs.unlinkSync(debugFile);
              console.log('Removed .debug file from build output (CEP debug config, not user logging flag)');
            } catch (err) {
              console.warn('Failed to remove .debug file:', err);
            }
          }
          // Also check for nested .debug file
          const nestedDebugFile = path.join(outDir, cepDist, '.debug');
          if (fs.existsSync(nestedDebugFile)) {
            try {
              fs.unlinkSync(nestedDebugFile);
              console.log('Removed nested .debug file from build output');
            } catch (err) {
              console.warn('Failed to remove nested .debug file:', err);
            }
          }
        }
        
        // Remove META-INF directory from dist/cep in dev mode to prevent signature verification errors
        // META-INF is only needed for signed ZXP packages, not for dev mode
        if (!isPackage && !isProduction) {
          const metaInfDir = path.join(outDir, 'META-INF');
          if (fs.existsSync(metaInfDir)) {
            try {
              fs.rmSync(metaInfDir, { recursive: true, force: true });
              console.log('Removed META-INF directory from dev build (not needed for unsigned extensions)');
            } catch (err) {
              console.warn('Failed to remove META-INF directory:', err);
            }
          }
        }
      },
      buildStart() {
        // Fix redirect path in watch mode - use polling to catch vite-cep-plugin updates
        if (!isProduction && !isPackage) {
          // Poll every 500ms to fix redirect whenever vite-cep-plugin updates the HTML
          const pollInterval = setInterval(() => {
            fixRedirectPath();
          }, 500);
          
          // Clean up on process exit
          process.on('exit', () => clearInterval(pollInterval));
          process.on('SIGINT', () => {
            clearInterval(pollInterval);
            process.exit();
          });
        }
      },
      configureServer(server) {
        // Serve /main/index.html at /main/ (Bolt CEP standard)
        server.middlewares.use((req, res, next) => {
          if (req.url === '/main/index.html') {
            req.url = '/main/';
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: [{ find: "@esTypes", replacement: path.resolve(__dirname, "src") }],
    extensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler', // Use modern Sass API to avoid deprecation warnings
        silenceDeprecations: ['legacy-js-api'], // Fallback: silence if modern API not fully supported
      },
    },
  },
  root,
  base: isPackage ? "./" : "/", // Use relative paths for ZXP packages, absolute for dev
  clearScreen: false,
  server: {
    port: cepConfig.port || 3001,
    strictPort: true,
    hmr: {
      port: cepConfig.port || 3001,
      protocol: 'ws',
      host: 'localhost',
    },
    middlewareMode: false,
    fs: {
      allow: ['..'],
    },
  },
  preview: {
    port: cepConfig.servePort || 5000,
  },
  build: {
    sourcemap: isPackage ? cepConfig.zxp.sourceMap : cepConfig.build?.sourceMap,
    watch: isPackage ? null : {
      include: "src/jsx/**",
    },
    rollupOptions: {
      input,
      output: {
        format: "cjs",
        entryFileNames: "assets/[name]-[hash].cjs",
        chunkFileNames: "assets/[name]-[hash].cjs",
      },
    },
    target: "chrome74",
    outDir,
  },
});

// rollup es3 build
const outPathExtendscript = path.join("dist", cepDist, "jsx", "index.js");
extendscriptConfig(
  `src/jsx/index.ts`,
  outPathExtendscript,
  cepConfig,
  [".js", ".ts"],
  isProduction,
  isPackage,
);

