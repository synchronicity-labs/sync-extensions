import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cep, runAction } from "vite-cep-plugin";
import path from "path";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";
import { extendscriptConfig } from "./vite.es.config";
import dotenv from "dotenv";
import crypto from "crypto";

// Load environment variables from src/server/.env file (shared with server config)
// MUST load before importing cep.config.ts to ensure ZXP_PASSWORD is available
dotenv.config({ path: path.resolve(process.cwd(), "src/server/.env") });

import cepConfig from "./cep.config";

const src = path.resolve(__dirname, "src");
const root = path.resolve(src, "js");
const devDist = "dist";
const cepDist = "cep";
const resolveDist = "resolve";
const sharedDist = "shared"; // Shared UI build output
const outDir = path.resolve(__dirname, devDist, cepDist);
const sharedOutDir = path.resolve(__dirname, devDist, sharedDist);
const resolveOutDir = path.resolve(__dirname, devDist, resolveDist);

const isProduction = process.env.NODE_ENV === "production";
const isPackage = process.env.ZXP_PACKAGE === "true";
const isResolveBuild = process.env.RESOLVE_BUILD === "true";
const isResolvePackage = process.env.RESOLVE_PACKAGE === "true";
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

// Build Resolve plugin (file copying and installation)
async function buildResolvePlugin() {
  const resolveSrc = path.join(__dirname, 'src', 'resolve');
  const resolveDest = resolveOutDir;
  
  // Compile TypeScript files to JavaScript using esbuild
  const tsFiles = [
    { src: 'backend.ts', dest: 'backend.js' },
    { src: 'preload.ts', dest: 'preload.js' },
    { src: 'static/host-detection.resolve.ts', dest: 'static/host-detection.resolve.js' },
    { src: 'static/nle-resolve.ts', dest: 'static/nle-resolve.js' }
  ];
  
  if (tsFiles.length > 0) {
    try {
      const esbuild = require('esbuild');
      tsFiles.forEach(({ src, dest }) => {
        const srcFile = path.join(resolveSrc, src);
        const destFile = path.join(resolveDest, dest);
        if (fs.existsSync(srcFile)) {
          try {
            fs.mkdirSync(path.dirname(destFile), { recursive: true });
            esbuild.buildSync({
              entryPoints: [srcFile],
              bundle: false,
              platform: (src.includes('preload') || src.includes('backend')) ? 'node' : 'browser',
              target: 'es2020',
              format: 'cjs',
              outfile: destFile,
              external: (src.includes('preload') || src.includes('backend')) ? ['electron'] : [],
            });
            console.log(`Compiled ${src} to ${dest}`);
          } catch (error: any) {
            console.warn(`Failed to compile ${src}:`, error?.message || error);
            // Fallback: copy .ts file as-is (may need runtime compilation)
            fs.copyFileSync(srcFile, destFile.replace('.js', '.ts'));
            console.log(`Copied ${src} as .ts (compilation failed)`);
          }
        }
      });
    } catch (error: any) {
      console.warn('esbuild not available, copying .ts files as-is:', error?.message || error);
      tsFiles.forEach(({ src, dest }) => {
        const srcFile = path.join(resolveSrc, src);
        const destFile = path.join(resolveDest, dest);
        if (fs.existsSync(srcFile)) {
          fs.mkdirSync(path.dirname(destFile), { recursive: true });
          fs.copyFileSync(srcFile, destFile.replace('.js', '.ts'));
        }
      });
    }
  }
  
  // Copy Resolve-specific files (backend.js is compiled from backend.ts above)
  const filesToCopy = ['manifest.json', 'package.json', 'launch-electron.sh'];
  filesToCopy.forEach(file => {
    const srcFile = path.join(resolveSrc, file);
    const destFile = path.join(resolveDest, file);
    if (fs.existsSync(srcFile)) {
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.copyFileSync(srcFile, destFile);
      console.log(`Copied ${file} to ${destFile}`);
    }
  });
  
  // Copy Python API
  const pythonSrc = path.join(resolveSrc, 'python');
  const pythonDest = path.join(resolveDest, 'python');
  if (fs.existsSync(pythonSrc)) {
    fs.mkdirSync(pythonDest, { recursive: true });
    fs.cpSync(pythonSrc, pythonDest, { recursive: true });
    console.log(`Copied Python API to ${pythonDest}`);
  }
  
  // Static scripts are now compiled above, but also copy any remaining .js files
  const staticSrc = path.join(resolveSrc, 'static');
  const staticDest = path.join(resolveDest, 'static');
  if (fs.existsSync(staticSrc)) {
    fs.mkdirSync(staticDest, { recursive: true });
    // Copy any other files in static directory
    const staticFiles = fs.readdirSync(staticSrc);
    staticFiles.forEach(file => {
      if (file.endsWith('.js') && !file.includes('resolve')) {
        const srcScript = path.join(staticSrc, file);
        const destScript = path.join(staticDest, file);
        fs.copyFileSync(srcScript, destScript);
        console.log(`Copied ${file} to ${destScript}`);
      }
    });
  }
  
  // Copy bin folder
  const binSource = path.join(__dirname, 'bin');
  const binDest = path.join(resolveDest, 'static', 'bin');
  if (fs.existsSync(binSource)) {
    fs.mkdirSync(binDest, { recursive: true });
    fs.cpSync(binSource, binDest, { recursive: true });
    console.log(`Copied bin folder to ${binDest}`);
  }
  
  // Copy server folder (exclude node_modules, dereference symlinks)
  // Optimized: only copy if source is newer or destination doesn't exist
  // In production, always do a clean copy to ensure consistency
  const serverSource = path.join(__dirname, 'src', 'server');
  const serverDest = path.join(resolveDest, 'static', 'server');
  if (fs.existsSync(serverSource)) {
    // In production, always copy to ensure clean builds
    // In dev, use mtime check for faster iteration
    const needsCopy = isProduction || !fs.existsSync(serverDest) || 
      fs.statSync(serverSource).mtime > fs.statSync(serverDest).mtime;
    
    if (needsCopy) {
      // Remove existing destination for clean copy
      if (fs.existsSync(serverDest)) {
        fs.rmSync(serverDest, { recursive: true, force: true });
      }
      fs.mkdirSync(serverDest, { recursive: true });
      const items = fs.readdirSync(serverSource, { withFileTypes: true });
      for (const item of items) {
        if (item.name === 'node_modules') continue;
        const srcPath = path.join(serverSource, item.name);
        const destPath = path.join(serverDest, item.name);
        if (item.isDirectory()) {
          // Use dereference to copy actual files, not symlinks
          fs.cpSync(srcPath, destPath, { recursive: true, dereference: true });
        } else {
          // For files, check if it's a symlink and dereference
          const stat = fs.lstatSync(srcPath);
          if (stat.isSymbolicLink()) {
            const realPath = fs.readlinkSync(srcPath);
            const resolvedPath = path.isAbsolute(realPath) ? realPath : path.resolve(path.dirname(srcPath), realPath);
            if (fs.existsSync(resolvedPath)) {
              fs.copyFileSync(resolvedPath, destPath);
            } else {
              console.warn(`Warning: Symlink target not found: ${srcPath} -> ${realPath}`);
            }
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      }
      console.log(`Copied server folder to ${serverDest} (excluding node_modules, dereferencing symlinks)`);
    } else {
      console.log(`✓ Server folder up to date, skipping copy`);
    }
  }
  
  // Copy UI from CEP build
  const cepMainDir = path.join(outDir, 'main');
  const cepAssetsDir = path.join(outDir, 'assets');
  const resolveStaticDir = path.join(resolveDest, 'static');
  const sharedMainDir = path.join(sharedOutDir, 'main');
  const sharedAssetsDir = path.join(sharedOutDir, 'assets');
  
  const sourceMainDir = fs.existsSync(sharedMainDir) ? sharedMainDir : cepMainDir;
  const sourceAssetsDir = fs.existsSync(sharedAssetsDir) ? sharedAssetsDir : cepAssetsDir;
  
  // Wait for CEP build to complete if it's still building (for parallel builds)
  if (!fs.existsSync(sourceMainDir) && !fs.existsSync(cepMainDir)) {
    if (isProduction) {
      // In production, wait up to 30 seconds for CEP build to complete
      console.log('Waiting for CEP build to complete...');
      const maxWait = 30000; // 30 seconds
      const checkInterval = 500; // Check every 500ms
      let waited = 0;
      while (waited < maxWait && !fs.existsSync(sourceMainDir) && !fs.existsSync(cepMainDir)) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waited += checkInterval;
      }
      if (!fs.existsSync(sourceMainDir) && !fs.existsSync(cepMainDir)) {
        throw new Error('CEP UI build not found after waiting. Run "npm run build:adobe" first to build the UI.');
      }
      console.log('✓ CEP build found, continuing Resolve build');
    } else {
      console.warn('Warning: CEP build not found. Make sure CEP dev server is running.');
    }
  }
  
  // Copy index.html
  const sourceHtml = path.join(sourceMainDir, 'index.html');
  const resolveHtml = path.join(resolveStaticDir, 'index.html');
  if (fs.existsSync(sourceHtml)) {
    fs.mkdirSync(path.dirname(resolveHtml), { recursive: true });
    fs.copyFileSync(sourceHtml, resolveHtml);
    console.log(`✓ Copied UI index.html to ${resolveHtml}`);
  } else if (!isProduction) {
    const devHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>sync.</title>
  <script>
    window.location.href = 'http://localhost:3001/main/';
  </script>
</head>
<body>
  <p>Redirecting to dev server...</p>
</body>
</html>`;
    fs.mkdirSync(path.dirname(resolveHtml), { recursive: true });
    fs.writeFileSync(resolveHtml, devHtml);
    console.log(`✓ Created dev proxy HTML at ${resolveHtml}`);
  }
  
  // Copy assets
  if (fs.existsSync(sourceAssetsDir)) {
    const resolveAssetsDir = path.join(resolveStaticDir, 'assets');
    fs.mkdirSync(resolveAssetsDir, { recursive: true });
    fs.cpSync(sourceAssetsDir, resolveAssetsDir, { recursive: true });
    console.log(`✓ Copied UI assets to ${resolveAssetsDir}`);
  }
  
  // Copy js/lib, js/assets
  const cepJsLib = path.join(outDir, 'js', 'lib');
  const cepJsAssets = path.join(outDir, 'js', 'assets');
  const resolveJsDir = path.join(resolveStaticDir, 'js');
  
  if (fs.existsSync(cepJsLib)) {
    const resolveJsLib = path.join(resolveJsDir, 'lib');
    fs.mkdirSync(resolveJsLib, { recursive: true });
    fs.cpSync(cepJsLib, resolveJsLib, { recursive: true });
    console.log(`✓ Copied js/lib to ${resolveJsLib}`);
  }
  
  if (fs.existsSync(cepJsAssets)) {
    const resolveJsAssets = path.join(resolveJsDir, 'assets');
    fs.mkdirSync(resolveJsAssets, { recursive: true });
    fs.cpSync(cepJsAssets, resolveJsAssets, { recursive: true });
    console.log(`✓ Copied js/assets to ${resolveJsAssets}`);
    
    // Copy icons
    const resolveIconsDir = path.join(resolveStaticDir, 'icons');
    fs.mkdirSync(resolveIconsDir, { recursive: true });
    const cepIconsDir = path.join(cepJsAssets, 'icons');
    if (fs.existsSync(cepIconsDir)) {
      fs.cpSync(cepIconsDir, resolveIconsDir, { recursive: true });
      console.log(`✓ Copied icons to ${resolveIconsDir}`);
    }
  }
  
  // Create manifest.xml (Resolve requires XML for plugin discovery)
  const manifestXmlPath = path.join(resolveDest, 'manifest.xml');
  const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<BlackmagicDesign>
    <Plugin>
        <Id>com.sync.extension.resolve</Id>
        <Name>sync.</Name>
        <Version>0.1.0</Version>
        <Description>sync. Resolve integration</Description>
        <FilePath>backend.js</FilePath>
    </Plugin>
</BlackmagicDesign>`;
  fs.writeFileSync(manifestXmlPath, manifestXml);
  console.log('✓ Created manifest.xml (required for Resolve plugin discovery)');
  
  // Install dependencies in dist/resolve (production only)
  if (isProduction) {
    // Install server dependencies first (required for server to run)
    const serverDest = path.join(resolveDest, 'static', 'server');
    const serverPackageJson = path.join(serverDest, 'package.json');
    
    if (fs.existsSync(serverDest) && fs.existsSync(serverPackageJson)) {
      try {
        // Read root package.json to get production dependencies
        const rootPackageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
        const serverPackage = JSON.parse(fs.readFileSync(serverPackageJson, 'utf-8'));
        
        // Copy production dependencies from root to server package.json
        const newDependencies = rootPackageJson.dependencies || {};
        // Use deterministic comparison: sort keys and compare JSON
        const sortKeys = (obj: Record<string, string>) => 
          Object.keys(obj).sort().reduce((acc, key) => ({ ...acc, [key]: obj[key] }), {});
        const dependenciesChanged = 
          JSON.stringify(sortKeys(serverPackage.dependencies || {})) !== 
          JSON.stringify(sortKeys(newDependencies));
        
        serverPackage.dependencies = newDependencies;
        
        // Check if we need to reinstall dependencies
        // Also check package-lock.json if it exists for more reliable change detection
        const nodeModulesPath = path.join(serverDest, 'node_modules');
        const packageLockPath = path.join(serverDest, 'package-lock.json');
        const rootPackageLockPath = path.join(__dirname, 'package-lock.json');
        let lockFileChanged = false;
        
        if (fs.existsSync(packageLockPath) && fs.existsSync(rootPackageLockPath)) {
          try {
            const existingLock = fs.readFileSync(packageLockPath, 'utf-8');
            const rootLock = fs.readFileSync(rootPackageLockPath, 'utf-8');
            // Compare lock file content (more reliable than package.json)
            lockFileChanged = existingLock !== rootLock;
          } catch (err) {
            // If we can't read lock files, fall back to dependency comparison
            console.warn('Could not compare package-lock.json, using dependency comparison');
          }
        }
        
        const needsInstall = !fs.existsSync(nodeModulesPath) || dependenciesChanged || lockFileChanged;
        
        if (needsInstall) {
          // Write updated package.json
          fs.writeFileSync(serverPackageJson, JSON.stringify(serverPackage, null, 2));
          
          // Install server production dependencies with retry logic
          console.log('Installing server dependencies for Resolve...');
          let installSuccess = false;
          let retries = 2;
          
          while (!installSuccess && retries >= 0) {
            try {
              execSync('npm install --production --no-audit --no-fund', {
                cwd: serverDest,
                stdio: 'inherit',
                env: { ...process.env, npm_config_progress: 'false' },
                timeout: 300000 // 5 minute timeout
              });
              installSuccess = true;
              console.log('✓ Server dependencies installed');
            } catch (err: any) {
              if (retries > 0) {
                console.warn(`Install failed, retrying... (${retries} attempts remaining)`);
                retries--;
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
              } else {
                throw err;
              }
            }
          }
        } else {
          // Update package.json but skip install if dependencies haven't changed
          fs.writeFileSync(serverPackageJson, JSON.stringify(serverPackage, null, 2));
          console.log('✓ Resolve server dependencies up to date, skipping install');
        }
      } catch (err) {
        console.error('Failed to install server dependencies:', err);
        throw err;
      }
    }
    
    // Install Electron dependencies (check if already installed)
    const resolveNodeModules = path.join(resolveDest, 'node_modules');
    const resolvePackageJson = path.join(resolveDest, 'package.json');
    const needsElectronInstall = !fs.existsSync(resolveNodeModules) || 
      (fs.existsSync(resolvePackageJson) && 
       fs.statSync(resolvePackageJson).mtime > fs.statSync(resolveNodeModules).mtime);
    
    if (needsElectronInstall) {
      console.log('Installing Electron dependencies...');
      let installSuccess = false;
      let retries = 2;
      
      while (!installSuccess && retries >= 0) {
        try {
          execSync('npm install --production --no-audit --no-fund', {
            cwd: resolveDest,
            stdio: 'inherit',
            env: { ...process.env, npm_config_progress: 'false' },
            timeout: 300000 // 5 minute timeout
          });
          installSuccess = true;
          console.log('✓ Electron dependencies installed');
        } catch (err: any) {
          if (retries > 0) {
            console.warn(`Install failed, retrying... (${retries} attempts remaining)`);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
          } else {
            console.error('Failed to install Electron dependencies:', err);
            throw err;
          }
        }
      }
    } else {
      console.log('✓ Electron dependencies up to date, skipping install');
    }
    
    // Update manifest.json with Electron path (use actual Electron binary, not symlink)
    const manifestPath = path.join(resolveDest, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      // Try to find the actual Electron binary (not the symlink)
      const electronAppPath = path.join(resolveDest, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');
      const electronBinSymlink = path.join(resolveDest, 'node_modules', '.bin', 'electron');
      
      let electronPath = './node_modules/.bin/electron'; // Default to symlink
      
      if (fs.existsSync(electronAppPath)) {
        // Use the actual Electron binary
        electronPath = './node_modules/electron/dist/Electron.app/Contents/MacOS/Electron';
        console.log('Using actual Electron binary instead of symlink');
      } else if (fs.existsSync(electronBinSymlink)) {
        electronPath = './node_modules/.bin/electron';
        console.log('Using Electron symlink');
      }
      
      manifest.Process.Executable = electronPath;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`✓ Updated manifest.json with Electron path: ${electronPath}`);
    }
  }
  
  // Set executable permissions
  try {
    const nodeBinaries = path.join(resolveDest, 'static', 'bin');
    if (fs.existsSync(nodeBinaries)) {
      const walkDir = (dir: string) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            walkDir(filePath);
          } else if (file.startsWith('node')) {
            fs.chmodSync(filePath, 0o755);
          }
        }
      };
      walkDir(nodeBinaries);
    }
    
    const backendJs = path.join(resolveDest, 'backend.js');
    if (fs.existsSync(backendJs)) {
      fs.chmodSync(backendJs, 0o755);
    }
    
    const launchScript = path.join(resolveDest, 'launch-electron.sh');
    if (fs.existsSync(launchScript)) {
      fs.chmodSync(launchScript, 0o755);
    }
    
    const pythonScript = path.join(resolveDest, 'python', 'resolve_api.py');
    if (fs.existsSync(pythonScript)) {
      fs.chmodSync(pythonScript, 0o755);
    }
  } catch (err) {
    console.warn('Warning: Could not set executable permissions:', err);
  }
  
  // Package as ZIP for distribution (if RESOLVE_PACKAGE is set)
  if (isResolvePackage) {
    const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
    const zipPath = path.join(__dirname, devDist, `sync-resolve-plugin-v${version}.zip`);
    
    // Remove existing zip if it exists
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    
    console.log(`\nCreating Resolve plugin ZIP package...`);
    
    // Use native zip command (works on macOS/Linux, Windows needs PowerShell)
    try {
      if (process.platform === 'win32') {
        // Windows: Use PowerShell Compress-Archive
        const resolveDirName = path.basename(resolveDest);
        const parentDir = path.dirname(resolveDest);
        execSync(
          `powershell -Command "Compress-Archive -Path '${resolveDirName}' -DestinationPath '${path.basename(zipPath)}' -Force"`,
          { cwd: parentDir, stdio: 'inherit' }
        );
        // Move to final location if needed
        const tempZip = path.join(parentDir, path.basename(zipPath));
        if (fs.existsSync(tempZip) && tempZip !== zipPath) {
          fs.renameSync(tempZip, zipPath);
        }
      } else {
        // macOS/Linux: Use zip command
        execSync(
          `cd "${path.dirname(resolveDest)}" && zip -r "${zipPath}" "${path.basename(resolveDest)}"`,
          { stdio: 'inherit' }
        );
      }
      console.log(`✓ Created Resolve plugin ZIP: ${zipPath}`);
    } catch (err) {
      console.error('Failed to create ZIP package:', err);
      throw err;
    }
  } else {
    // Install to Resolve plugin directory (system-wide, not user-specific)
    // Resolve looks for plugins in /Library (system) not ~/Library (user)
    const pluginDir = path.join(
      '/Library',
      'Application Support',
      'Blackmagic Design',
      'DaVinci Resolve',
      'Workflow Integration Plugins',
      'sync.resolve'
    );
    
    console.log(`\nInstalling to Resolve plugin directory...`);
    
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
    fs.mkdirSync(pluginDir, { recursive: true });
    
    // Copy with dereference to resolve symlinks (DaVinci Resolve can't follow symlinks)
    fs.cpSync(resolveDest, pluginDir, { recursive: true, force: true, dereference: true });
    
    console.log(`✓ Installed to: ${pluginDir}`);
    console.log(`\nRestart DaVinci Resolve to load the plugin.`);
    console.log(`Plugin will appear in: Workspace > Workflow Integration > sync.\n`);
  }
}

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
      async buildEnd() {
        // Fix redirect path after build (vite-cep-plugin runs before this)
        fixRedirectPath();
        
        // Verify critical build artifacts exist
        if (isProduction || isPackage) {
          const criticalPaths = [
            path.join(outDir, 'main', 'index.html'),
            path.join(outDir, 'bin'),
            path.join(outDir, 'jsx', 'index.jsxbin')
          ];
          
          for (const criticalPath of criticalPaths) {
            if (!fs.existsSync(criticalPath)) {
              console.warn(`Warning: Critical build artifact missing: ${criticalPath}`);
              // Don't fail the build, but warn - some artifacts might be optional
            }
          }
        }
        
        // Copy top-level server TypeScript files to dist/cep/server/
        // Server runs with tsx, so it can execute TypeScript directly - no compilation needed
        if (isProduction || isPackage) {
          const serverSrc = path.join(__dirname, 'src', 'server');
          const serverDest = path.join(outDir, 'server');
          
          // Copy top-level server files that aren't in folders
          if (fs.existsSync(serverSrc) && fs.existsSync(serverDest)) {
            const topLevelFiles = ['server.ts', 'serverConfig.ts', 'telemetry.ts'];
            topLevelFiles.forEach((file) => {
              const srcFile = path.join(serverSrc, file);
              const destFile = path.join(serverDest, file);
              if (fs.existsSync(srcFile)) {
                fs.copyFileSync(srcFile, destFile);
              }
            });
          }
        }
        
        // After CEP build completes, create shared UI reference for Resolve
        // This is optional and non-blocking - CEP build is unaffected
        if (process.env.RESOLVE_BUILD !== 'true') {
          // Only create shared build if not already building Resolve (avoids duplicate work)
          const cepMainDir = path.join(outDir, 'main');
          const cepAssetsDir = path.join(outDir, 'assets');
          
          if (fs.existsSync(cepMainDir)) {
            try {
              const sharedMainDir = path.join(sharedOutDir, 'main');
              const sharedAssetsDir = path.join(sharedOutDir, 'assets');
              
              // Always update shared build to keep it in sync
              if (fs.existsSync(sharedMainDir)) {
                fs.rmSync(sharedMainDir, { recursive: true, force: true });
              }
              fs.mkdirSync(sharedMainDir, { recursive: true });
              fs.cpSync(cepMainDir, sharedMainDir, { recursive: true });
              
              if (fs.existsSync(cepAssetsDir)) {
                if (fs.existsSync(sharedAssetsDir)) {
                  fs.rmSync(sharedAssetsDir, { recursive: true, force: true });
                }
                fs.mkdirSync(path.dirname(sharedAssetsDir), { recursive: true });
                fs.cpSync(cepAssetsDir, sharedAssetsDir, { recursive: true });
              }
              
              console.log('✓ Created shared UI build from CEP output');
            } catch (err) {
              // Non-fatal - CEP build succeeded, shared build is just for Resolve
              console.warn('Warning: Failed to create shared UI build (non-fatal):', err.message);
            }
          }
        }
        
        // CRITICAL: Ensure bin folder with bundled Node binaries is copied to dist/cep
        // This is required for the extension to work without system Node.js
        const binSource = path.join(__dirname, 'bin');
        const binDest = path.join(outDir, 'bin');
        if (fs.existsSync(binSource)) {
          try {
            // Remove existing bin folder if it exists
            if (fs.existsSync(binDest)) {
              fs.rmSync(binDest, { recursive: true, force: true });
            }
            // Copy bin folder recursively
            fs.cpSync(binSource, binDest, { recursive: true });
            console.log('Copied bin folder with bundled Node binaries to dist/cep/bin');
          } catch (err) {
            console.error('CRITICAL: Failed to copy bin folder:', err);
            throw err; // Fail the build if bin folder cannot be copied
          }
        } else {
          console.error('CRITICAL: bin folder not found at:', binSource);
          throw new Error('bin folder with Node binaries is required but not found');
        }
        
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
        
        // Install production dependencies for server (required for extension to work)
        // With workspaces, server dependencies are in root node_modules, so we need to install them in dist
        if (isProduction || isPackage) {
          const serverDest = path.join(outDir, 'server');
          const serverPackageJson = path.join(serverDest, 'package.json');
          
          if (fs.existsSync(serverDest) && fs.existsSync(serverPackageJson)) {
            try {
              // Read root package.json to get production dependencies
              const rootPackageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
              const serverPackage = JSON.parse(fs.readFileSync(serverPackageJson, 'utf-8'));
              
        // Copy production dependencies from root to server package.json
        const newDependencies = rootPackageJson.dependencies || {};
        // Use deterministic comparison: sort keys and compare JSON
        const sortKeys = (obj: Record<string, string>) => 
          Object.keys(obj).sort().reduce((acc, key) => ({ ...acc, [key]: obj[key] }), {});
        const dependenciesChanged = 
          JSON.stringify(sortKeys(serverPackage.dependencies || {})) !== 
          JSON.stringify(sortKeys(newDependencies));
        
        serverPackage.dependencies = newDependencies;
        
        // Check if we need to reinstall dependencies
        // Also check package-lock.json if it exists for more reliable change detection
        const nodeModulesPath = path.join(serverDest, 'node_modules');
        const packageLockPath = path.join(serverDest, 'package-lock.json');
        const rootPackageLockPath = path.join(__dirname, 'package-lock.json');
        let lockFileChanged = false;
        
        if (fs.existsSync(packageLockPath) && fs.existsSync(rootPackageLockPath)) {
          try {
            const existingLock = fs.readFileSync(packageLockPath, 'utf-8');
            const rootLock = fs.readFileSync(rootPackageLockPath, 'utf-8');
            // Compare lock file content (more reliable than package.json)
            lockFileChanged = existingLock !== rootLock;
          } catch (err) {
            // If we can't read lock files, fall back to dependency comparison
            console.warn('Could not compare package-lock.json, using dependency comparison');
          }
        }
        
        const needsInstall = !fs.existsSync(nodeModulesPath) || dependenciesChanged || lockFileChanged;
              
              if (needsInstall) {
                // Write updated package.json
                fs.writeFileSync(serverPackageJson, JSON.stringify(serverPackage, null, 2));
                
              // Install production dependencies with retry logic
              console.log('Installing production dependencies for server...');
              let installSuccess = false;
              let retries = 2;
              
              while (!installSuccess && retries >= 0) {
                try {
                  execSync('npm install --production --no-audit --no-fund', {
                    cwd: serverDest,
                    stdio: 'inherit',
                    env: { ...process.env, npm_config_progress: 'false' },
                    timeout: 300000 // 5 minute timeout
                  });
                  installSuccess = true;
                  console.log('✓ Server production dependencies installed');
                } catch (err: any) {
                  if (retries > 0) {
                    console.warn(`Install failed, retrying... (${retries} attempts remaining)`);
                    retries--;
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
                  } else {
                    throw err;
                  }
                }
              }
              } else {
                // Update package.json but skip install if dependencies haven't changed
                fs.writeFileSync(serverPackageJson, JSON.stringify(serverPackage, null, 2));
                console.log('✓ Server dependencies up to date, skipping install');
              }
            } catch (err) {
              console.error('CRITICAL: Failed to install server dependencies:', err);
              throw err; // Fail the build if server dependencies cannot be installed
            }
          }
        }
        
        // Build Resolve plugin if RESOLVE_BUILD is set
        if (isResolveBuild) {
          await buildResolvePlugin();
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

