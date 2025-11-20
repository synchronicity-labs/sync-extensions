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
import { fileURLToPath } from "url";

dotenv.config({ path: path.resolve(process.cwd(), "src/server/.env") });

import cepConfig from "./cep.config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const src = path.resolve(__dirname, "src");
const root = path.resolve(src, "js");
const devDist = "dist";
const cepDist = "cep";
const resolveDist = "resolve";
const sharedDist = "shared";
const outDir = path.resolve(__dirname, devDist, cepDist);
const sharedOutDir = path.resolve(__dirname, devDist, sharedDist);
const resolveOutDir = path.resolve(__dirname, devDist, resolveDist);

const isProduction = process.env.NODE_ENV === "production";
const isPackage = process.env.ZXP_PACKAGE === "true";
const isResolveBuild = process.env.RESOLVE_BUILD === "true";
const isResolvePackage = process.env.RESOLVE_PACKAGE === "true";
const action = process.env.BOLT_ACTION;

let input: Record<string, string> = {};
cepConfig.panels.forEach((panel) => {
  const resolvedPath = path.resolve(root, panel.mainPath);
  if (fs.existsSync(resolvedPath)) {
    input[panel.name] = resolvedPath;
  } else {
    console.warn(`Warning: Panel entry point not found: ${resolvedPath}`);
  }
});

if (Object.keys(input).length === 0) {
  throw new Error('No valid panel entry points found. Check cep.config.ts panels configuration.');
}

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

let resolvePluginWatcher: any = null;

async function buildResolvePlugin() {
  const resolveSrc = path.join(__dirname, 'src', 'resolve');
  const resolveDest = resolveOutDir;
  
  const tsFiles = [
    { src: 'backend.ts', dest: 'backend.js' },
    { src: 'preload.ts', dest: 'preload.js' },
    { src: 'static/host-detection.resolve.ts', dest: 'static/host-detection.resolve.js' },
    { src: 'static/nle-resolve.ts', dest: 'static/nle-resolve.js' }
  ];
  
  if (tsFiles.length > 0) {
    console.log(`\n🔨 Building Resolve plugin TypeScript files...`);
    try {
      console.log('   Loading esbuild...');
      const esbuildModule = await import('esbuild');
      const esbuild = esbuildModule.default || esbuildModule;
      console.log('   ✓ esbuild loaded');
      
      for (const { src, dest } of tsFiles) {
        const srcFile = path.join(resolveSrc, src);
        const destFile = path.join(resolveDest, dest);
        console.log(`   Compiling ${src} -> ${dest}...`);
        if (fs.existsSync(srcFile)) {
          try {
            fs.mkdirSync(path.dirname(destFile), { recursive: true });
            if (fs.existsSync(destFile)) {
              fs.unlinkSync(destFile);
            }
            const buildResult = esbuild.buildSync({
              entryPoints: [srcFile],
              bundle: false,
              platform: (src.includes('preload') || src.includes('backend')) ? 'node' : 'browser',
              target: 'es2020',
              format: 'cjs',
              outfile: destFile,
            });
            
            if (!fs.existsSync(destFile)) {
              throw new Error(`Compilation succeeded but output file not found: ${destFile}`);
            }
            
            console.log(`✓ Compiled ${src} to ${dest} (${fs.statSync(destFile).size} bytes)`);
          } catch (error: any) {
            console.error(`❌ Failed to compile ${src}:`, error?.message || error);
            console.error(`   Source: ${srcFile}`);
            console.error(`   Dest: ${destFile}`);
            throw new Error(`Failed to compile ${src} to ${dest}: ${error?.message || error}`);
          }
        }
      }
    } catch (error: any) {
      console.error('❌ CRITICAL: esbuild compilation failed:', error?.message || error);
      console.error('   Stack:', error?.stack);
      throw new Error(`Failed to compile Resolve plugin TypeScript files: ${error?.message || error}`);
    }
  } else {
    console.log('⚠️  No TypeScript files to compile for Resolve plugin');
  }
  
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
  
  const pythonSrc = path.join(resolveSrc, 'python');
  const pythonDest = path.join(resolveDest, 'python');
  if (fs.existsSync(pythonSrc)) {
    fs.mkdirSync(pythonDest, { recursive: true });
    fs.cpSync(pythonSrc, pythonDest, { recursive: true });
    console.log(`Copied Python API to ${pythonDest}`);
  }
  
  const staticSrc = path.join(resolveSrc, 'static');
  const staticDest = path.join(resolveDest, 'static');
  if (fs.existsSync(staticSrc)) {
    fs.mkdirSync(staticDest, { recursive: true });
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
  
  const binSource = path.join(__dirname, 'bin');
  const binDest = path.join(resolveDest, 'static', 'bin');
  if (fs.existsSync(binSource)) {
    fs.mkdirSync(binDest, { recursive: true });
    fs.cpSync(binSource, binDest, { recursive: true });
    console.log(`Copied bin folder to ${binDest}`);
  }
  
  const serverSource = path.join(__dirname, 'src', 'server');
  const serverDest = path.join(resolveDest, 'static', 'server');
  if (fs.existsSync(serverSource)) {
    const needsCopy = isProduction || !fs.existsSync(serverDest) || 
      fs.statSync(serverSource).mtime > fs.statSync(serverDest).mtime;
    
    if (needsCopy) {
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
          fs.cpSync(srcPath, destPath, { recursive: true, dereference: true });
        } else {
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
  
  const cepMainDir = path.join(outDir, 'main');
  const cepAssetsDir = path.join(outDir, 'assets');
  const resolveStaticDir = path.join(resolveDest, 'static');
  const sharedMainDir = path.join(sharedOutDir, 'main');
  const sharedAssetsDir = path.join(sharedOutDir, 'assets');
  
  let sourceMainDir = fs.existsSync(sharedMainDir) ? sharedMainDir : cepMainDir;
  let sourceAssetsDir = fs.existsSync(sharedAssetsDir) ? sharedAssetsDir : cepAssetsDir;
  
  if (!fs.existsSync(sourceMainDir) && !fs.existsSync(cepMainDir)) {
    if (isProduction) {
      console.log('Waiting for CEP build to complete...');
      const maxWait = 30000;
      const checkInterval = 500;
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
  
  if (sourceMainDir === sharedMainDir && !fs.existsSync(sharedMainDir)) {
    console.log('Shared build not found, using CEP build directly');
    sourceMainDir = cepMainDir;
    sourceAssetsDir = cepAssetsDir;
  }
  
  const sourceHtml = path.join(sourceMainDir, 'index.html');
  if (fs.existsSync(sourceHtml) && fs.existsSync(sourceAssetsDir)) {
    const htmlStat = fs.statSync(sourceHtml);
    const assetsStat = fs.statSync(sourceAssetsDir);
    const timeDiff = Math.abs(htmlStat.mtimeMs - assetsStat.mtimeMs);
    if (timeDiff > 5000) {
      console.warn(`Warning: HTML and assets timestamps differ by ${Math.round(timeDiff / 1000)}s - may be from different builds`);
    }
  }
  
  const resolveHtml = path.join(resolveStaticDir, 'index.html');
  if (fs.existsSync(sourceHtml)) {
    fs.mkdirSync(path.dirname(resolveHtml), { recursive: true });
    let htmlContent = fs.readFileSync(sourceHtml, 'utf-8');
    
    const assetMatches = htmlContent.matchAll(/(href|src)=["']([^"']*assets\/[^"']*)["']/g);
    for (const match of assetMatches) {
      const assetPath = match[2];
      const filename = assetPath.split('/').pop();
      if (filename && fs.existsSync(sourceAssetsDir)) {
        const assetFiles = fs.readdirSync(sourceAssetsDir);
        const fileExists = assetFiles.some(f => f === filename || f.startsWith(filename.split('-')[0] + '-'));
        if (!fileExists) {
          console.warn(`Warning: Referenced asset "${filename}" not found in assets directory. Available files: ${assetFiles.slice(0, 3).join(', ')}...`);
        }
      }
    }
    
    htmlContent = htmlContent.replace(/href=["']\.\.\/assets\//g, 'href="./assets/');
    htmlContent = htmlContent.replace(/src=["']\.\.\/assets\//g, 'src="./assets/');
    fs.writeFileSync(resolveHtml, htmlContent, 'utf-8');
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
  
  if (fs.existsSync(sourceAssetsDir)) {
    const resolveAssetsDir = path.join(resolveStaticDir, 'assets');
    if (fs.existsSync(resolveAssetsDir)) {
      fs.rmSync(resolveAssetsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(resolveAssetsDir, { recursive: true });
    fs.cpSync(sourceAssetsDir, resolveAssetsDir, { recursive: true, force: true });
    console.log(`✓ Copied UI assets to ${resolveAssetsDir}`);
  }
  
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
    
    const resolveIconsDir = path.join(resolveStaticDir, 'icons');
    fs.mkdirSync(resolveIconsDir, { recursive: true });
    const cepIconsDir = path.join(cepJsAssets, 'icons');
    if (fs.existsSync(cepIconsDir)) {
      fs.cpSync(cepIconsDir, resolveIconsDir, { recursive: true });
      console.log(`✓ Copied icons to ${resolveIconsDir}`);
    }
  }
  
  // Read version from package.json for Resolve manifest
  const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
  
  const manifestXmlPath = path.join(resolveDest, 'manifest.xml');
  const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<BlackmagicDesign>
    <Plugin>
        <Id>com.sync.extension.resolve</Id>
        <Name>sync.</Name>
        <Version>${version}</Version>
        <Description>sync. Resolve integration</Description>
        <FilePath>backend.js</FilePath>
    </Plugin>
</BlackmagicDesign>`;
  fs.writeFileSync(manifestXmlPath, manifestXml);
  console.log(`✓ Created manifest.xml with version ${version}`);
  
  if (isProduction) {
    const serverDest = path.join(resolveDest, 'static', 'server');
    const serverPackageJson = path.join(serverDest, 'package.json');
    
    if (fs.existsSync(serverDest) && fs.existsSync(serverPackageJson)) {
      try {
        const serverSrcPackageJson = path.join(__dirname, 'src', 'server', 'package.json');
        const serverSrcPackage = JSON.parse(fs.readFileSync(serverSrcPackageJson, 'utf-8'));
        const serverPackage = JSON.parse(fs.readFileSync(serverPackageJson, 'utf-8'));
        
        const newDependencies = serverSrcPackage.dependencies || {};
        const sortKeys = (obj: Record<string, string>) => 
          Object.keys(obj).sort().reduce((acc, key) => ({ ...acc, [key]: obj[key] }), {});
        const dependenciesChanged = 
          JSON.stringify(sortKeys(serverPackage.dependencies || {})) !== 
          JSON.stringify(sortKeys(newDependencies));
        
        serverPackage.dependencies = newDependencies;
        
        const nodeModulesPath = path.join(serverDest, 'node_modules');
        const packageLockPath = path.join(serverDest, 'package-lock.json');
        const rootPackageLockPath = path.join(__dirname, 'package-lock.json');
        let lockFileChanged = false;
        
        if (fs.existsSync(packageLockPath) && fs.existsSync(rootPackageLockPath)) {
          try {
            const existingLock = fs.readFileSync(packageLockPath, 'utf-8');
            const rootLock = fs.readFileSync(rootPackageLockPath, 'utf-8');
            lockFileChanged = existingLock !== rootLock;
          } catch (err) {
            console.warn('Could not compare package-lock.json, using dependency comparison');
          }
        }
        
        const needsInstall = !fs.existsSync(nodeModulesPath) || dependenciesChanged || lockFileChanged;
        
        if (needsInstall) {
          fs.writeFileSync(serverPackageJson, JSON.stringify(serverPackage, null, 2));
          const packageLockPath = path.join(serverDest, 'package-lock.json');
          if (!fs.existsSync(packageLockPath) && fs.existsSync(rootPackageLockPath)) {
            fs.copyFileSync(rootPackageLockPath, packageLockPath);
          }
          
          console.log('Installing server dependencies for Resolve...');
          let installSuccess = false;
          let retries = 2;
          
          while (!installSuccess && retries >= 0) {
            try {
              execSync('npm install --omit=dev --no-audit --no-fund --prefer-offline --silent --package-lock', {
                cwd: serverDest,
                stdio: 'inherit',
                env: { ...process.env, npm_config_progress: 'false' },
                timeout: 300000
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
          fs.writeFileSync(serverPackageJson, JSON.stringify(serverPackage, null, 2));
          console.log('✓ Resolve server dependencies up to date, skipping install');
        }
      } catch (err) {
        console.error('Failed to install server dependencies:', err);
        throw err;
      }
    }
    
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
          const installCmd = 'npm install --omit=dev --no-audit --no-fund --prefer-offline --silent --package-lock';
          execSync(installCmd, {
            cwd: resolveDest,
            stdio: 'inherit',
            env: { ...process.env, npm_config_progress: 'false' },
            timeout: 300000
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
    
    const manifestPath = path.join(resolveDest, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      // Read version from package.json for Resolve manifest
      const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
      
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const electronAppPath = path.join(resolveDest, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');
      const electronBinSymlink = path.join(resolveDest, 'node_modules', '.bin', 'electron');
      
      let electronPath = './node_modules/.bin/electron';
      
      if (fs.existsSync(electronAppPath)) {
        electronPath = './node_modules/electron/dist/Electron.app/Contents/MacOS/Electron';
        console.log('Using actual Electron binary instead of symlink');
      } else if (fs.existsSync(electronBinSymlink)) {
        electronPath = './node_modules/.bin/electron';
        console.log('Using Electron symlink');
      }
      
      manifest.Process.Executable = electronPath;
      manifest.Version = version;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`✓ Updated manifest.json with Electron path: ${electronPath} and version: ${version}`);
    }
  }
  
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
  
  if (isResolvePackage) {
    // Read version from environment variable (set by release script) or package.json
    let version = process.env.VERSION;
    if (!version) {
      const packageJsonPath = path.join(__dirname, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      version = packageJson.version;
    }
    
    if (!version || version === '0' || version === '0.0.0') {
      throw new Error(`Invalid version "${version}". Version must be in format X.Y.Z (e.g., 0.9.55). Check package.json or set VERSION environment variable.`);
    }
    
    console.log(`📦 Creating Resolve plugin ZIP with version: ${version}`);
    
    // Clean up old Resolve plugin zip files (keep only current version)
    try {
      const distDir = path.join(__dirname, devDist);
      if (fs.existsSync(distDir)) {
        const files = fs.readdirSync(distDir);
        files.forEach(file => {
          // Clean up both old naming conventions
          const isOldSyncResolve = file.startsWith('sync-resolve-plugin-v') && file.endsWith('.zip');
          const isOldDavinci = file.startsWith('davinci-sync-extension-v') && file.endsWith('.zip') && file !== `davinci-sync-extension-v${version}.zip`;
          if (isOldSyncResolve || isOldDavinci) {
            const oldZipPath = path.join(distDir, file);
            try {
              fs.unlinkSync(oldZipPath);
              console.log(`✓ Removed old zip file: ${file}`);
            } catch (err) {
              console.warn(`⚠️  Could not remove old zip file ${file}:`, err);
            }
          }
        });
      }
    } catch (err) {
      console.warn('⚠️  Could not clean up old zip files:', err);
    }
    
    // Create final package: davinci-sync-extension-v${version}.zip with sync.resolve folder + instructions
    const zipPath = path.join(__dirname, devDist, `davinci-sync-extension-v${version}.zip`);
    
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    
    console.log(`\nCreating Resolve plugin ZIP package...`);
    
    // Create temp directory for packaging
    const tempPackageDir = path.join(__dirname, devDist, '.resolve-package-temp');
    if (fs.existsSync(tempPackageDir)) {
      try {
        // Force remove directory even if not empty
        fs.rmSync(tempPackageDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch (err: any) {
        // If removal fails, try to remove contents individually
        console.warn(`⚠️  Warning: Could not remove temp directory, trying to clean contents: ${err.message}`);
        try {
          const files = fs.readdirSync(tempPackageDir);
          for (const file of files) {
            const filePath = path.join(tempPackageDir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              fs.rmSync(filePath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(filePath);
            }
          }
          fs.rmdirSync(tempPackageDir);
        } catch (cleanupErr: any) {
          console.warn(`⚠️  Warning: Could not clean temp directory: ${cleanupErr.message}`);
          // Continue anyway - mkdirSync with recursive will handle it
        }
      }
    }
    fs.mkdirSync(tempPackageDir, { recursive: true });
    
    // Copy resolve folder as sync.resolve (DaVinci Resolve requires this name)
    const syncResolveDest = path.join(tempPackageDir, 'sync.resolve');
    fs.cpSync(resolveDest, syncResolveDest, { recursive: true });
    
    // Add installation instructions
    const instructionsPath = path.join(tempPackageDir, 'INSTALLATION_INSTRUCTIONS.txt');
    const instructions = `INSTALLATION INSTRUCTIONS FOR DAVINCI RESOLVE PLUGIN
================================================

Follow these simple steps to install the sync. plugin for DaVinci Resolve:

MACOS:
------
1. Extract this ZIP file (double-click it or right-click and choose "Extract")

2. Open Finder and press Cmd+Shift+G (or go to Go > Go to Folder...)

3. Copy and paste this path into the dialog:
   /Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/

4. Press Enter or click Go

5. Copy the "sync.resolve" folder from the extracted ZIP into this folder

6. Restart DaVinci Resolve

7. Find the plugin in: Workspace > Workflow Integration > sync.


WINDOWS:
--------
1. Extract this ZIP file (right-click and choose "Extract All...")

2. Open File Explorer and navigate to:
   C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Workflow Integration Plugins\\

   Note: If you can't see ProgramData, it's hidden by default:
   - In File Explorer, click View > Show > Hidden items
   - Or type the path directly in the address bar

3. Copy the "sync.resolve" folder from the extracted ZIP into this folder

4. Restart DaVinci Resolve

5. Find the plugin in: Workspace > Workflow Integration > sync.


TROUBLESHOOTING:
----------------
- If the plugin doesn't appear, make sure you copied the entire "sync.resolve" folder
- Ensure DaVinci Resolve is completely closed before copying files
- You may need administrator/sudo permissions to copy to these system folders
- After installation, restart DaVinci Resolve completely


For more help, visit: https://sync.so
`;
    
    fs.writeFileSync(instructionsPath, instructions, 'utf-8');
    console.log(`✓ Created installation instructions file`);
    
    try {
      // Create zip from temp package directory (contains sync.resolve folder + instructions)
      if (process.platform === 'win32') {
        execSync(
          `powershell -Command "Compress-Archive -Path 'sync.resolve','INSTALLATION_INSTRUCTIONS.txt' -DestinationPath '${path.basename(zipPath)}' -Force"`,
          { cwd: tempPackageDir, stdio: 'inherit' }
        );
        const tempZip = path.join(tempPackageDir, path.basename(zipPath));
        if (fs.existsSync(tempZip) && tempZip !== zipPath) {
          fs.renameSync(tempZip, zipPath);
        }
      } else {
        // macOS/Linux: Use zip command
        execSync(
          `cd "${tempPackageDir}" && zip -r "${zipPath}" sync.resolve INSTALLATION_INSTRUCTIONS.txt`,
          { stdio: 'inherit' }
        );
      }
      console.log(`✓ Created Resolve plugin ZIP: ${zipPath}`);
      
      // Clean up temp directory
      if (fs.existsSync(tempPackageDir)) {
        try {
          fs.rmSync(tempPackageDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch (cleanupErr: any) {
          // If removal fails, try to remove contents individually
          console.warn(`⚠️  Warning: Could not remove temp directory: ${cleanupErr.message}`);
          try {
            const files = fs.readdirSync(tempPackageDir);
            for (const file of files) {
              const filePath = path.join(tempPackageDir, file);
              const stat = fs.statSync(filePath);
              if (stat.isDirectory()) {
                fs.rmSync(filePath, { recursive: true, force: true });
              } else {
                fs.unlinkSync(filePath);
              }
            }
            fs.rmdirSync(tempPackageDir);
          } catch (finalCleanupErr: any) {
            console.warn(`⚠️  Warning: Could not fully clean temp directory (non-fatal): ${finalCleanupErr.message}`);
            // Non-fatal - temp directory will be cleaned on next build
          }
        }
      }
    } catch (err) {
      // Clean up temp directory on error
      if (fs.existsSync(tempPackageDir)) {
        try {
          fs.rmSync(tempPackageDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch (cleanupErr: any) {
          console.warn(`⚠️  Warning: Could not clean temp directory on error: ${cleanupErr.message}`);
        }
      }
      console.error('Failed to create ZIP package:', err);
      throw err;
    }
  } else {
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
    
    fs.cpSync(resolveDest, pluginDir, { recursive: true, force: true, dereference: true });
    
    console.log(`✓ Installed to: ${pluginDir}`);
    console.log(`\nRestart DaVinci Resolve to load the plugin.`);
    console.log(`Plugin will appear in: Workspace > Workflow Integration > sync.\n`);
  }
}

const fixRedirectPath = () => {
  if (!isProduction && !isPackage) {
    cepConfig.panels.forEach(panel => {
      const htmlPath = path.join(outDir, panel.name, 'index.html');
      if (fs.existsSync(htmlPath)) {
        let content = fs.readFileSync(htmlPath, 'utf-8');
        const originalContent = content;
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
    {
      name: 'ensure-output-dirs',
      enforce: 'pre',
      configResolved() {
        const mainDir = path.join(outDir, 'main');
        const assetsDir = path.join(outDir, 'assets');
        if (!fs.existsSync(mainDir)) {
          fs.mkdirSync(mainDir, { recursive: true });
          console.log('✓ Created main directory:', mainDir);
        }
        if (!fs.existsSync(assetsDir)) {
          fs.mkdirSync(assetsDir, { recursive: true });
          console.log('✓ Created assets directory:', assetsDir);
        }
      },
    },
    react(),
    cep(config),
    {
      name: 'dev-image-handler',
      enforce: 'pre',
      resolveId(id) {
        if (id.match(/\.(png|jpg|jpeg|svg|gif)$/)) {
          return null;
        }
        return null;
      },
      load(id) {
        return null;
      },
    },
    {
      name: 'fix-asset-paths',
      enforce: 'post',
      generateBundle(options, bundle) {
        Object.keys(bundle).forEach(key => {
          const file = bundle[key];
          if (file.type === 'chunk' && file.code) {
            file.code = file.code.replace(
              /(["'])\/assets\/((white_icon|avatar)[^"']*\.png)(["'])/g,
              '$1../assets/$2$4'
            );
            
            file.code = file.code.replace(
              /(["'])\/((white_icon|avatar)[^"']*\.png)(["'])/g,
              '$1../assets/$2$4'
            );
            
            file.code = file.code.replace(
              /(["'])((white_icon|avatar)[^"']*\.png)(["'])/g,
              (match, quote1, filename, name, quote2) => {
                if (!match.includes('/') && !match.includes('../assets/')) {
                  return `${quote1}../assets/${filename}${quote2}`;
                }
                return match;
              }
            );
          }
        });
      },
    },
    {
      name: 'bolt-cep-production-html',
      enforce: 'post',
      async closeBundle() {
        if (isProduction || isPackage) {
          await new Promise(resolve => setTimeout(resolve, 100));
          
          cepConfig.panels.forEach(panel => {
            const htmlPath = path.join(outDir, panel.name, 'index.html');
            const assetsDir = path.join(outDir, 'assets');
            
            if (!fs.existsSync(htmlPath)) {
              console.warn(`⚠️  Warning: HTML file not found at ${htmlPath}`);
              return;
            }
            
            if (!fs.existsSync(assetsDir)) {
              console.warn(`⚠️  Warning: Assets directory not found at ${assetsDir}`);
              return;
            }
            
            let content = fs.readFileSync(htmlPath, 'utf-8');
            const originalContent = content;
            
            content = content.replace(
              /<script[^>]*>[\s\S]*?window\.location\.href\s*=\s*['"]http:\/\/localhost:3001[^'"]*['"][\s\S]*?<\/script>/gi,
              ''
            );
            
            content = content.replace(
              /<script\s+type=["']module["'][^>]*src=["'][^"']*main\.tsx["'][^>]*><\/script>/gi,
              ''
            );
            
            content = content.replace(
              /<div\s+id=["']app["'][^>]*>[\s\S]*?<\/div>/gi,
              ''
            );
            
            if (!content.includes('id="root"')) {
              content = content.replace(
                /(<body[^>]*>)/i,
                '$1\n    <div id="root"></div>'
              );
            }
            
            const assetFiles = fs.readdirSync(assetsDir);
            const mainCjsFile = assetFiles.find(f => f.startsWith('main-') && f.endsWith('.cjs'));
            
            if (!mainCjsFile) {
              console.error(`❌ ERROR: Could not find main-*.cjs file in ${assetsDir}`);
              console.error(`   Available files: ${assetFiles.slice(0, 5).join(', ')}...`);
              return;
            }
            
            const mainScriptPath = `../assets/${mainCjsFile}`;
            
            content = content.replace(
              /<script[^>]*src=["'][^"']*main-[^"']*\.cjs["'][^>]*><\/script>/gi,
              `<script data-main="${mainScriptPath}" src="${mainScriptPath}"></script>`
            );
            
            if (!content.includes(`data-main="${mainScriptPath}"`)) {
              const scriptTag = `    <script data-main="${mainScriptPath}" src="${mainScriptPath}"></script>`;
              const bodyCloseIndex = content.lastIndexOf('</body>');
              if (bodyCloseIndex === -1) {
                console.error(`❌ ERROR: Could not find </body> tag in HTML`);
                return;
              }
              content = content.slice(0, bodyCloseIndex) + scriptTag + '\n' + content.slice(bodyCloseIndex);
              console.log(`✓ Added script tag: ${mainScriptPath}`);
            } else {
              console.log(`✓ Script tag with correct path exists: ${mainScriptPath}`);
            }
            
            content = content.replace(
              /<script[^>]*data-base_dir=["'][^"']*["'][^>]*><\/script>/gi,
              ''
            );
            
            fs.writeFileSync(htmlPath, content, 'utf-8');
            
            if (content !== originalContent) {
              console.log(`✓ Updated production HTML: ${htmlPath}`);
            }
          });
        }
      },
      async buildEnd() {
        fixRedirectPath();
        
        if (isProduction || isPackage) {
          const criticalPaths = [
            path.join(outDir, 'main', 'index.html'),
            path.join(outDir, 'bin'),
            path.join(outDir, 'jsx', 'index.jsxbin'),
            path.join(outDir, 'js', 'panels', 'ppro', 'epr') // EPR presets required for Premiere Pro in/out exports
          ];
          
          for (const criticalPath of criticalPaths) {
            if (!fs.existsSync(criticalPath)) {
              console.warn(`Warning: Critical build artifact missing: ${criticalPath}`);
            } else if (criticalPath.includes('epr')) {
              // Verify epr folder contains files
              try {
                const eprFiles = fs.readdirSync(criticalPath);
                const eprFileCount = eprFiles.filter(f => f.endsWith('.epr')).length;
                if (eprFileCount === 0) {
                  console.warn(`Warning: EPR folder exists but contains no .epr files: ${criticalPath}`);
                } else {
                  console.log(`✓ Verified EPR presets: ${eprFileCount} files found in ${criticalPath}`);
                }
              } catch (err) {
                console.warn(`Warning: Could not verify EPR files: ${err}`);
              }
            }
          }
        }
        
        if (process.env.RESOLVE_BUILD !== 'true') {
          const cepMainDir = path.join(outDir, 'main');
          const cepAssetsDir = path.join(outDir, 'assets');
          
          if (fs.existsSync(cepMainDir)) {
            try {
              const sharedMainDir = path.join(sharedOutDir, 'main');
              const sharedAssetsDir = path.join(sharedOutDir, 'assets');
              
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
              console.warn('Warning: Failed to create shared UI build (non-fatal):', err.message);
            }
          }
        }
        
        const binSource = path.join(__dirname, 'bin');
        const binDest = path.join(outDir, 'bin');
        if (!fs.existsSync(binDest) || isProduction || isPackage) {
          if (!fs.existsSync(binSource)) {
            console.error('❌ ERROR: bin folder not found at', binSource);
            throw new Error('bin folder with Node.js binaries is required but not found');
          }
          if (fs.existsSync(binDest)) {
            fs.rmSync(binDest, { recursive: true, force: true });
          }
          fs.mkdirSync(binDest, { recursive: true });
          fs.cpSync(binSource, binDest, { recursive: true });
          console.log('✓ Copied bin folder with Node.js binaries to', binDest);
        }
        
        const eprSource = path.join(__dirname, 'src', 'js', 'panels', 'ppro', 'epr');
        const eprDest = path.join(outDir, 'js', 'panels', 'ppro', 'epr');
        if (!fs.existsSync(eprDest) || isProduction || isPackage) {
          if (fs.existsSync(eprSource)) {
            if (fs.existsSync(eprDest)) {
              fs.rmSync(eprDest, { recursive: true, force: true });
            }
            fs.mkdirSync(eprDest, { recursive: true });
            fs.cpSync(eprSource, eprDest, { recursive: true });
            console.log('✓ Copied epr preset files to', eprDest);
          } else {
            console.warn('⚠️  Warning: epr preset folder not found at', eprSource);
          }
        }
        
        if (fs.existsSync(binDest)) {
          const buildScripts = ['release.sh', 'uninstall.sh', 'uninstall.bat'];
          for (const script of buildScripts) {
            const scriptPath = path.join(binDest, script);
            if (fs.existsSync(scriptPath)) {
              try {
                fs.unlinkSync(scriptPath);
              } catch (err) {
                console.warn(`Warning: Failed to remove ${script} from bin folder:`, err);
              }
            }
          }
          
          const nodeBinaries = [
            path.join(binDest, 'darwin-arm64', 'node'),
            path.join(binDest, 'darwin-x64', 'node'),
            path.join(binDest, 'win32-x64', 'node.exe'),
          ];
          
          for (const nodeBin of nodeBinaries) {
            if (fs.existsSync(nodeBin)) {
              try {
                fs.chmodSync(nodeBin, 0o755);
              } catch (err) {
                console.warn(`Warning: Failed to set executable permissions on ${nodeBin}:`, err);
              }
            }
          }
        }
        
        
        if (!isPackage && !isProduction) {
          const metaInfDir = path.join(outDir, 'META-INF');
          if (fs.existsSync(metaInfDir)) {
            try {
              fs.rmSync(metaInfDir, { recursive: true, force: true });
              console.log('Removed META-INF directory from dev build');
            } catch (err) {
              console.warn('Failed to remove META-INF directory:', err);
            }
          }
        }
        
        if (isProduction || isPackage) {
          const serverDest = path.join(outDir, 'server');
          const nodeModulesPath = path.join(serverDest, 'node_modules');
          
          if (!fs.existsSync(nodeModulesPath)) {
            console.warn('WARNING: server/node_modules not found - dependencies may not be included in ZXP');
            console.warn('This should have been installed in buildStart hook. Check build logs.');
          } else {
            console.log('✓ Server node_modules verified (installed in buildStart, included in ZXP)');
          }
        }
        
        if (isResolveBuild) {
          await buildResolvePlugin();
          
          if (!isProduction && !resolvePluginWatcher) {
            try {
              const chokidarModule = await import('chokidar');
              const chokidar = chokidarModule.default || chokidarModule;
              const resolveSrc = path.join(__dirname, 'src', 'resolve');
              
              console.log('\n🔍 Setting up file watcher for Resolve plugin...');
              resolvePluginWatcher = chokidar.watch([
                path.join(resolveSrc, '**/*.ts'),
                path.join(resolveSrc, '**/*.py'),
                path.join(resolveSrc, '**/*.json'),
                path.join(resolveSrc, '**/*.sh'),
              ], {
                ignored: /node_modules/,
                persistent: true,
                ignoreInitial: true,
              });
              
              let rebuildTimeout: NodeJS.Timeout | null = null;
              resolvePluginWatcher.on('change', (filePath: string) => {
                console.log(`\n📝 Resolve plugin file changed: ${path.relative(__dirname, filePath)}`);
                
                if (rebuildTimeout) {
                  clearTimeout(rebuildTimeout);
                }
                
                rebuildTimeout = setTimeout(async () => {
                  console.log('🔄 Rebuilding Resolve plugin...');
                  try {
                    await buildResolvePlugin();
                    console.log('✅ Resolve plugin rebuilt successfully');
                    console.log('💡 Restart DaVinci Resolve plugin window to see changes');
                  } catch (error: any) {
                    console.error('❌ Resolve plugin rebuild failed:', error.message);
                  }
                }, 500);
              });
              
              resolvePluginWatcher.on('ready', () => {
                console.log('✅ Resolve plugin file watcher ready');
              });
              
              resolvePluginWatcher.on('error', (error: Error) => {
                console.error('❌ Resolve plugin watcher error:', error.message);
              });
            } catch (error: any) {
              console.warn('⚠️  Could not set up Resolve plugin watcher (chokidar not available):', error.message);
            }
          }
        }
      },
      async buildStart() {
        // Ensure output directories exist before vite-cep-plugin tries to write files
        // This must run for ALL builds (dev and production) to prevent ENOENT errors
        const mainDir = path.join(outDir, 'main');
        const assetsDir = path.join(outDir, 'assets');
        if (!fs.existsSync(mainDir)) {
          fs.mkdirSync(mainDir, { recursive: true });
          console.log('✓ Created main directory:', mainDir);
        }
        if (!fs.existsSync(assetsDir)) {
          fs.mkdirSync(assetsDir, { recursive: true });
          console.log('✓ Created assets directory:', assetsDir);
        }
        
        // Ensure epr preset files are copied early (required for Premiere Pro in/out exports)
        // This is especially important in dev mode where vite-cep-plugin might not copy folders
        const eprSource = path.join(__dirname, 'src', 'js', 'panels', 'ppro', 'epr');
        const eprDest = path.join(outDir, 'js', 'panels', 'ppro', 'epr');
        if (fs.existsSync(eprSource)) {
          const needsCopy = !fs.existsSync(eprDest) || 
            (fs.existsSync(eprDest) && fs.statSync(eprSource).mtime > fs.statSync(eprDest).mtime);
          
          if (needsCopy) {
            if (fs.existsSync(eprDest)) {
              fs.rmSync(eprDest, { recursive: true, force: true });
            }
            fs.mkdirSync(eprDest, { recursive: true });
            fs.cpSync(eprSource, eprDest, { recursive: true });
            console.log('✓ Copied epr preset files to', eprDest);
          }
        } else {
          console.warn('⚠️  Warning: epr preset folder not found at', eprSource);
        }
        
        if (isProduction || isPackage) {
          const serverDest = path.join(outDir, 'server');
          const serverPackageJson = path.join(serverDest, 'package.json');
          const serverSrc = path.join(__dirname, 'src', 'server');
          
          // Ensure server folder exists before vite-cep-plugin copies files
          if (!fs.existsSync(serverDest) && fs.existsSync(serverSrc)) {
            console.log('Server folder not found in dist, creating it...');
            fs.mkdirSync(serverDest, { recursive: true });
          }
          
          // Copy server files manually if they don't exist (vite-cep-plugin will copy them later, but we need them now for npm install)
          if (fs.existsSync(serverSrc) && !fs.existsSync(serverPackageJson)) {
            const srcPackageJson = path.join(serverSrc, 'package.json');
            if (fs.existsSync(srcPackageJson)) {
              fs.copyFileSync(srcPackageJson, serverPackageJson);
              console.log('✓ Copied server/package.json for dependency installation');
            }
            
            // Copy other server files that npm install might need
            const serverFiles = ['server.ts', 'serverConfig.ts', 'telemetry.ts'];
            for (const file of serverFiles) {
              const srcFile = path.join(serverSrc, file);
              const destFile = path.join(serverDest, file);
              if (fs.existsSync(srcFile) && !fs.existsSync(destFile)) {
                fs.copyFileSync(srcFile, destFile);
              }
            }
          }
          
          if (fs.existsSync(serverDest) && fs.existsSync(serverPackageJson)) {
            try {
              const serverSrcPackageJson = path.join(__dirname, 'src', 'server', 'package.json');
              const serverSrcPackage = JSON.parse(fs.readFileSync(serverSrcPackageJson, 'utf-8'));
              const serverPackage = JSON.parse(fs.readFileSync(serverPackageJson, 'utf-8'));
              
              const newDependencies = serverSrcPackage.dependencies || {};
              const sortKeys = (obj: Record<string, string>) => 
                Object.keys(obj).sort().reduce((acc, key) => ({ ...acc, [key]: obj[key] }), {});
              const dependenciesChanged = 
                JSON.stringify(sortKeys(serverPackage.dependencies || {})) !== 
                JSON.stringify(sortKeys(newDependencies));
              
              serverPackage.dependencies = newDependencies;
              
              const nodeModulesPath = path.join(serverDest, 'node_modules');
              const packageLockPath = path.join(serverDest, 'package-lock.json');
              const rootPackageLockPath = path.join(__dirname, 'package-lock.json');
              let lockFileChanged = false;
              
              if (fs.existsSync(packageLockPath) && fs.existsSync(rootPackageLockPath)) {
                try {
                  const existingLock = fs.readFileSync(packageLockPath, 'utf-8');
                  const rootLock = fs.readFileSync(rootPackageLockPath, 'utf-8');
                  lockFileChanged = existingLock !== rootLock;
                } catch (err) {
                  console.warn('Could not compare package-lock.json, using dependency comparison');
                }
              }
              
              const needsInstall = !fs.existsSync(nodeModulesPath) || dependenciesChanged || lockFileChanged;
              
              if (needsInstall) {
                fs.writeFileSync(serverPackageJson, JSON.stringify(serverPackage, null, 2));
                
                console.log('Installing server dependencies BEFORE ZXP packaging...');
                let installSuccess = false;
                let retries = 2;
                
                while (!installSuccess && retries >= 0) {
                  try {
                    execSync('npm install --omit=dev --no-audit --no-fund --prefer-offline --silent --package-lock', {
                      cwd: serverDest,
                      stdio: 'inherit',
                      env: { ...process.env, npm_config_progress: 'false' },
                      timeout: 300000
                    });
                    installSuccess = true;
                    console.log('✓ Server dependencies installed (will be included in ZXP)');
                    
                    const nodeModulesPath = path.join(serverDest, 'node_modules');
                    if (!fs.existsSync(nodeModulesPath)) {
                      throw new Error('npm install completed but node_modules directory not found');
                    }
                    const fileCount = fs.readdirSync(nodeModulesPath).length;
                    if (fileCount === 0) {
                      throw new Error('npm install completed but node_modules is empty');
                    }
                    
                    const requiredPackages = ['tsx', 'express'];
                    const missingPackages = requiredPackages.filter(pkg => !fs.existsSync(path.join(nodeModulesPath, pkg)));
                    if (missingPackages.length > 0) {
                      throw new Error(`Critical packages missing from node_modules: ${missingPackages.join(', ')}`);
                    }
                    
                    console.log(`✓ Verified: node_modules contains ${fileCount} packages`);
                  } catch (err: any) {
                    if (retries > 0) {
                      console.warn(`Install failed, retrying... (${retries} attempts remaining)`);
                      retries--;
                      await new Promise(resolve => setTimeout(resolve, 2000));
                    } else {
                      console.error('CRITICAL: Failed to install server dependencies:', err);
                      throw err;
                    }
                  }
                }
              } else {
                fs.writeFileSync(serverPackageJson, JSON.stringify(serverPackage, null, 2));
                console.log('✓ Server dependencies up to date (will be included in ZXP)');
                
                const nodeModulesPath = path.join(serverDest, 'node_modules');
                if (!fs.existsSync(nodeModulesPath)) {
                  console.warn('WARNING: node_modules not found even though install was skipped');
                  console.warn('This might indicate the folder was deleted. Reinstalling...');
                  const installCmd = 'npm install --production --no-audit --no-fund --prefer-offline --silent --package-lock';
                  execSync(installCmd, {
                    cwd: serverDest,
                    stdio: 'inherit',
                    env: { ...process.env, npm_config_progress: 'false' },
                    timeout: 300000
                  });
                  console.log('✓ Reinstalled server dependencies');
                }
              }
            } catch (err) {
              console.error('CRITICAL: Failed to install server dependencies:', err);
              throw err; // Fail the build if server dependencies cannot be installed
            }
          } else {
            console.warn('WARNING: server folder or package.json not found in buildStart');
            console.warn('vite-cep-plugin should copy these files, but they are missing');
          }
        }
        
        if (!isProduction && !isPackage) {
          const pollInterval = setInterval(() => {
            fixRedirectPath();
          }, 500);
          
          process.on('exit', () => clearInterval(pollInterval));
          process.on('SIGINT', () => {
            clearInterval(pollInterval);
            process.exit();
          });
        }
        
      },
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!isProduction && !isPackage) {
            const origin = req.headers.origin;
            if (origin) {
              res.setHeader('Access-Control-Allow-Origin', origin);
              res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
              res.setHeader('Access-Control-Allow-Credentials', 'true');
            }
            if (req.method === 'OPTIONS') {
              res.writeHead(200);
              res.end();
              return;
            }
          }
          next();
        });
        
        server.middlewares.use((req, res, next) => {
          if (!req.url) {
            next();
            return;
          }
          
          if (req.url.includes('?import')) {
            next();
            return;
          }
          
          const urlWithoutQuery = req.url.split('?')[0];
          
          if (urlWithoutQuery.startsWith('/assets/icons/') && urlWithoutQuery.match(/\.(png|jpg|jpeg|svg|gif)$/)) {
            const imageName = urlWithoutQuery.replace('/assets/icons/', '');
            const imagePath = path.join(__dirname, 'src/js/assets/icons', imageName);
            
            if (fs.existsSync(imagePath)) {
              const ext = path.extname(imageName).toLowerCase();
              const contentType = 
                ext === '.png' ? 'image/png' :
                ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                ext === '.svg' ? 'image/svg+xml' :
                ext === '.gif' ? 'image/gif' : 'application/octet-stream';
              
              res.setHeader('Content-Type', contentType);
              res.end(fs.readFileSync(imagePath));
              return;
            }
          }
          
          if (urlWithoutQuery.startsWith('/assets/') && urlWithoutQuery.match(/(white_icon|avatar)[^/]*\.png$/)) {
            const filename = urlWithoutQuery.split('/').pop() || '';
            const baseName = filename.replace(/-[A-Za-z0-9]+\.png$/, '.png');
            const imagePath = path.join(__dirname, 'src/js/assets/icons', baseName);
            
            if (fs.existsSync(imagePath)) {
              res.setHeader('Content-Type', 'image/png');
              res.end(fs.readFileSync(imagePath));
              return;
            }
          }
          
          next();
        });
        
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
        api: 'modern-compiler',
        silenceDeprecations: ['legacy-js-api'],
      },
    },
  },
  root,
  base: isPackage ? "./" : "/",
  clearScreen: false,
  publicDir: false,
  server: {
    port: cepConfig.port || 3001,
    strictPort: true, // Always use port 3001 - fail if unavailable
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
      input: Object.keys(input).length > 0 ? input : undefined,
      output: {
        format: "cjs",
        entryFileNames: "assets/[name]-[hash].cjs",
        chunkFileNames: "assets/[name]-[hash].cjs",
        assetFileNames: `assets/[name]-[hash][extname]`,
      },
    },
    target: "chrome74",
    outDir,
    assetsInlineLimit: 0, // Don't inline assets - always emit as files
  },
});

const outPathExtendscript = path.join("dist", cepDist, "jsx", "index.js");
extendscriptConfig(
  `src/jsx/index.ts`,
  outPathExtendscript,
  cepConfig,
  [".js", ".ts"],
  isProduction,
  isPackage,
);

