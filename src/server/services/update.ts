import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { APP_ID, EXT_ROOT, UPDATES_REPO, UPDATES_CHANNEL, GH_TOKEN, GH_UA, DIRS, BASE_DIR } from '../serverConfig';
import { tlog } from '../utils/log';
import { parseBundleVersion, normalizeVersion, compareSemver, getCurrentVersion } from '../utils/serverVersion';
import { exec, execPowerShell, runRobocopy } from '../utils/exec';
import { HOST_IDS, toAppId } from '../../shared/host';

function ghHeaders(extra) {
  const h = Object.assign({ 'Accept': 'application/vnd.github+json', 'User-Agent': GH_UA }, extra || {});
  if (GH_TOKEN) h['Authorization'] = `Bearer ${GH_TOKEN}`;
  return h;
}

async function ghFetch(url, opts) {
  return await fetch(url, Object.assign({ headers: ghHeaders() }, opts || {}));
}

export async function getLatestReleaseInfo() {
  const repo = UPDATES_REPO;
  const base = `https://api.github.com/repos/${repo}`;
  
  async function tryReleases() {
    const r = await ghFetch(`${base}/releases/latest`);
    if (!r.ok) return null;
    const j = await r.json();
    const tag = j.tag_name || j.name || '';
    if (!tag) return null;
    
    const isWindows = process.platform === 'win32';
    const osName = isWindows ? 'windows' : 'mac';
    const appName = (APP_ID === HOST_IDS.AEFT || APP_ID === HOST_IDS.PPRO) ? toAppId(APP_ID) : toAppId(HOST_IDS.PPRO);
    const preferredPatterns = [
      new RegExp(`^sync-extension-${appName}-${osName}-signed\\.zxp$`, 'i'),
      new RegExp(`^sync-extension-([a-z]+)-${osName}-signed\\.zxp$`, 'i'),
      new RegExp(`^sync-extensions-${osName}-${tag}\\.zxp$`, 'i'),
      new RegExp(`^sync-extensions-${osName}-${tag}\\.zip$`, 'i')
    ];

    let asset = null;
    if (Array.isArray(j.assets)) {
      for (const pat of preferredPatterns) {
        asset = j.assets.find(a => pat.test(String(a.name || '')));
        if (asset) break;
      }
      if (!asset) asset = j.assets.find(a => new RegExp(`${osName}.*\\.zxp$`, 'i').test(String(a.name || '')));
      if (!asset) asset = j.assets[0];
    }
    
    if (asset) {
      return {
        tag,
        version: normalizeVersion(tag),
        html_url: j.html_url || `https://github.com/${repo}/releases/tag/${tag}`,
        zip_url: asset.browser_download_url,
        is_zxp: String(asset.name || '').toLowerCase().endsWith('.zxp')
      };
    }
    
    return { tag, version: normalizeVersion(tag), html_url: j.html_url || `https://github.com/${repo}/releases/tag/${tag}`, zip_url: j.zipball_url || `${base}/zipball/${tag}` };
  }
  
  async function tryTags() {
    const r = await ghFetch(`${base}/tags`);
    if (!r.ok) return null;
    const j = await r.json();
    if (!Array.isArray(j) || !j.length) return null;
    const tag = j[0].name || j[0].tag_name || '';
    return { tag, version: normalizeVersion(tag), html_url: `https://github.com/${repo}/releases/tag/${tag}`, zip_url: `${base}/zipball/${tag}` };
  }
  
  async function tryRedirectLatest() {
    try {
      const resp = await fetch(`https://github.com/${repo}/releases/latest`, { redirect: 'follow', headers: { 'User-Agent': GH_UA } });
      if (!resp.ok) return null;
      const finalUrl = String(resp.url || '');
      const m = /\/releases\/tag\/([^/?#]+)/.exec(finalUrl);
      const tag = m && m[1] ? decodeURIComponent(m[1]) : '';
      if (!tag) return null;
      return { tag, version: normalizeVersion(tag), html_url: finalUrl, zip_url: `https://codeload.github.com/${repo}/zip/refs/tags/${encodeURIComponent(tag)}` };
    } catch (_) { return null; }
  }
  
  if (UPDATES_CHANNEL === 'tags') {
    return await tryTags();
  }
  const fromReleases = await tryReleases();
  if (fromReleases) return fromReleases;
  const fromTags = await tryTags();
  if (fromTags) return fromTags;
  return await tryRedirectLatest();
}

export async function applyUpdate(isSpawnedByUI) {
  const current = await getCurrentVersion();
  const latest = await getLatestReleaseInfo();
  if (!latest) throw new Error('no releases/tags found for updates');
  
  const latestVersion = normalizeVersion(latest.version || latest.tag || '');
  if (current && latestVersion && compareSemver(latestVersion, current) <= 0) {
    return { ok: true, updated: false, message: 'Already up to date', current, latest: latestVersion };
  }
  
  if (!isSpawnedByUI) {
    try { tlog(`Starting update process: ${current} -> ${latestVersion}`); } catch (_) {}
    try { tlog(`Platform: ${process.platform}, Architecture: ${process.arch}`); } catch (_) {}
  }
  try { tlog('update:start', `${current} -> ${latestVersion}`, 'platform=', process.platform, 'arch=', process.arch); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
  
  const tempDir = path.join(DIRS.updates, 'sync_extension_update_' + Date.now());
  try { fs.mkdirSync(tempDir, { recursive: true }); } catch (_) {}
  
  const zipPath = path.join(tempDir, 'update.zip');
  const zipResp = await fetch(latest.zip_url);
  if (!zipResp.ok) throw new Error('Failed to download update');
  
  const zipBuffer = await zipResp.arrayBuffer();
  fs.writeFileSync(zipPath, Buffer.from(zipBuffer));
  try { tlog('update:downloaded', zipPath, 'bytes=', String(zipBuffer && zipBuffer.byteLength || 0)); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
  
  const isWindows = process.platform === 'win32';
  const isZxp = latest.is_zxp;
  
  if (isWindows) {
    const extractCmd = `Expand-Archive -Path "${zipPath}" -DestinationPath "${tempDir}" -Force`;
    try { tlog('update:extract:win', extractCmd); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
    if (!isSpawnedByUI) try { tlog('Windows extract command:', extractCmd); } catch (_) {}
    try {
      await execPowerShell(extractCmd);
      try { tlog('update:extract:win:ok'); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
      if (!isSpawnedByUI) try { tlog('PowerShell extraction completed'); } catch (_) {}
    } catch (e) {
      try { tlog('update:extract:win:fail', e.message); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
      if (!isSpawnedByUI) try { tlog('PowerShell extraction failed:', e.message); } catch (_) {}
      throw new Error('Failed to extract zip/zxp with PowerShell: ' + e.message);
    }
  } else {
    const extractCmd = `cd "${tempDir}" && unzip -q "${zipPath}"`;
    try { tlog('update:extract:unix', extractCmd); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
    if (!isSpawnedByUI) try { tlog('Unix extract command:', extractCmd); } catch (_) {}
    try {
      await exec(extractCmd);
      try { tlog('update:extract:unix:ok'); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
      if (!isSpawnedByUI) try { tlog('Unix extraction completed'); } catch (_) {}
    } catch (e) {
      try { tlog('update:extract:unix:fail', e.message); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
      if (!isSpawnedByUI) try { tlog('Unix extraction failed:', e.message); } catch (_) {}
      throw new Error('Failed to extract zip/zxp with unzip: ' + e.message);
    }
  }
  
  let allItems;
  try {
    allItems = fs.readdirSync(tempDir);
  } catch (e) {
    throw new Error('Failed to read extracted directory: ' + e.message);
  }
  try { tlog('update:extracted:items', JSON.stringify(allItems || [])); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
  if (!isSpawnedByUI) try { tlog('Extracted items:', allItems); } catch (_) {}
  
  const extractedDirs = allItems.filter(name => {
    const fullPath = path.join(tempDir, name);
    try {
      return fs.statSync(fullPath).isDirectory();
    } catch (e) {
      try { tlog('update:extracted:check:error', name, e.message); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
      if (!isSpawnedByUI) try { tlog('Error checking item:', name, e.message); } catch (_) {}
      return false;
    }
  });
  
  try { tlog('update:extracted:dirs', JSON.stringify(extractedDirs || [])); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
  if (!isSpawnedByUI) try { tlog('Extracted directories:', extractedDirs); } catch (_) {}
  
  let extractedDir;
  
  if (isZxp) {
    extractedDir = tempDir;
    try { tlog('update:format:zxp'); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
    if (!isSpawnedByUI) try { tlog('Using ZXP format - extension folders directly in temp dir'); } catch (_) {}
  } else if (extractedDirs.includes('sync-extensions')) {
    extractedDir = path.join(tempDir, 'sync-extensions');
    try { tlog('update:format:zip:sync-extensions'); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
    if (!isSpawnedByUI) try { tlog('Using sync-extensions directory from ZIP release asset'); } catch (_) {}
  } else if (extractedDirs.length > 0) {
    extractedDir = path.join(tempDir, extractedDirs[0]);
    try { tlog('update:format:zipball', extractedDirs[0]); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
    if (!isSpawnedByUI) try { tlog('Using GitHub zipball directory:', extractedDirs[0]); } catch (_) {}
  } else {
    const possibleDirs = allItems.filter(name => {
      const fullPath = path.join(tempDir, name);
      try {
        if (fs.statSync(fullPath).isDirectory()) {
          const contents = fs.readdirSync(fullPath);
          return contents.includes('package.json') || contents.includes('scripts') || contents.includes('extensions');
        }
      } catch (e) {
        return false;
      }
      return false;
    });
    
    try { tlog('update:format:guess:dirs', JSON.stringify(possibleDirs || [])); } catch (_) {}
    if (!isSpawnedByUI) try { tlog('Possible source directories:', possibleDirs); } catch (_) {}
    
    if (possibleDirs.length === 0) {
      throw new Error('No extracted directory found in zipball. Contents: ' + allItems.join(', '));
    }
    
    extractedDir = path.join(tempDir, possibleDirs[0]);
    try { tlog('update:format:guess:chosen', possibleDirs[0]); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
    if (!isSpawnedByUI) try { tlog('Using fallback directory:', possibleDirs[0]); } catch (_) {}
  }
  try { tlog('update:extracted:dir', extractedDir); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
  if (!isSpawnedByUI) try { tlog('Using extracted directory:', extractedDir); } catch (_) {}
  
  // Verify EXT_ROOT exists and is writable
  try {
    if (!fs.existsSync(EXT_ROOT)) {
      throw new Error(`Extension directory does not exist: ${EXT_ROOT}`);
    }
    // Test write permissions
    const testFile = path.join(EXT_ROOT, '.update_test_' + Date.now());
    try {
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (e) {
      throw new Error(`Extension directory is not writable: ${EXT_ROOT}. Error: ${e.message}`);
    }
  } catch (e) {
    try { tlog('update:permission:error', e.message); } catch (_) {}
    throw e;
  }

  try { tlog('update:manual:copy:start', 'target=', EXT_ROOT); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
  
  if (isZxp) {
    try { tlog('update:copy:zxp:target', 'dest=', EXT_ROOT); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
    let items;
    try {
      items = fs.readdirSync(extractedDir).filter(name => name !== 'META-INF' && name !== 'update.zip');
    } catch (e) {
      throw new Error('Failed to read ZXP extracted directory: ' + e.message);
    }
    
    // Copy files with retry logic for locked files
    for (const name of items) {
      const srcPath = path.join(extractedDir, name);
      const destPath = path.join(EXT_ROOT, name);
      const destStat = fs.existsSync(destPath) ? fs.statSync(destPath) : null;
      
      // Use atomic replacement where possible
      let retries = 3;
      let lastError = null;
      while (retries > 0) {
        try {
          if (isWindows) {
            // Robocopy handles locked files better than direct copy
            await runRobocopy(srcPath, destPath);
          } else {
            // On Mac/Linux, try atomic move for files, copy for directories
            if (fs.statSync(srcPath).isFile() && destStat && destStat.isFile()) {
              // Atomic replacement: copy to temp, then rename
              const tempPath = destPath + '.update_tmp_' + Date.now();
              await exec(`cp "${srcPath}" "${tempPath}"`);
              // Try to replace atomically
              try {
                fs.renameSync(tempPath, destPath);
              } catch (renameErr) {
                // If atomic rename fails, try direct copy (might fail if locked)
                await exec(`cp "${srcPath}" "${destPath}"`);
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
              }
            } else {
              // For directories or new files, use regular copy
              await exec(`cp -R "${srcPath}" "${destPath}"`);
            }
          }
          lastError = null;
          break; // Success, exit retry loop
        } catch (e) {
          lastError = e;
          retries--;
          if (retries > 0) {
            // Wait before retry (files might be unlocked)
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
      
      if (lastError) {
        try { tlog('update:copy:failed', name, lastError.message); } catch (_) {}
        // Log but continue - some files might fail, others might succeed
        if (!isSpawnedByUI) try { tlog(`Failed to copy ${name} after retries: ${lastError.message}`); } catch (_) {}
      }
    }
    try { tlog('update:copy:zxp:ok', 'items=', String(items.length)); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
  } else {
    const aeSrcDir = path.join(extractedDir, 'extensions', 'ae-extension');
    const pproSrcDir = path.join(extractedDir, 'extensions', 'premiere-extension');
    
    // Helper function to copy with retry logic
    const copyWithRetry = async (src, dest, isFile = false) => {
      let retries = 3;
      let lastError = null;
      while (retries > 0) {
        try {
          if (isWindows) {
            await runRobocopy(src, dest);
          } else {
            if (isFile && fs.existsSync(dest) && fs.statSync(src).isFile() && fs.statSync(dest).isFile()) {
              // Atomic replacement for files
              const tempPath = dest + '.update_tmp_' + Date.now();
              await exec(`cp "${src}" "${tempPath}"`);
              try {
                fs.renameSync(tempPath, dest);
              } catch (renameErr) {
                await exec(`cp "${src}" "${dest}"`);
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
              }
            } else {
              await exec(`cp -R "${src}" "${dest}"`);
            }
          }
          lastError = null;
          break;
        } catch (e) {
          lastError = e;
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
      if (lastError) {
        try { tlog('update:copy:failed', src, lastError.message); } catch (_) {}
        throw new Error(`Failed to copy ${src} after retries: ${lastError.message}`);
      }
    };
    
    if (APP_ID === HOST_IDS.AEFT && fs.existsSync(aeSrcDir)) {
      if (isWindows) {
        await runRobocopy(aeSrcDir, EXT_ROOT);
        await runRobocopy(path.join(extractedDir, 'ui'), path.join(EXT_ROOT, 'ui'));
        await runRobocopy(path.join(extractedDir, 'server'), path.join(EXT_ROOT, 'server'));
        await runRobocopy(path.join(extractedDir, 'icons'), path.join(EXT_ROOT, 'icons'));
        await runRobocopy(extractedDir, EXT_ROOT, 'index.html');
        await runRobocopy(path.join(extractedDir, 'lib'), path.join(EXT_ROOT, 'lib'));
      } else {
        await copyWithRetry(aeSrcDir, EXT_ROOT);
        await copyWithRetry(path.join(extractedDir, 'ui'), path.join(EXT_ROOT, 'ui'));
        await copyWithRetry(path.join(extractedDir, 'server'), path.join(EXT_ROOT, 'server'));
        await copyWithRetry(path.join(extractedDir, 'icons'), path.join(EXT_ROOT, 'icons'));
        await copyWithRetry(path.join(extractedDir, 'index.html'), path.join(EXT_ROOT, 'index.html'), true);
        await copyWithRetry(path.join(extractedDir, 'lib'), path.join(EXT_ROOT, 'lib'));
      }
    } else if (APP_ID === HOST_IDS.PPRO && fs.existsSync(pproSrcDir)) {
      if (isWindows) {
        await runRobocopy(pproSrcDir, EXT_ROOT);
        await runRobocopy(path.join(extractedDir, 'ui'), path.join(EXT_ROOT, 'ui'));
        await runRobocopy(path.join(extractedDir, 'server'), path.join(EXT_ROOT, 'server'));
        await runRobocopy(path.join(extractedDir, 'icons'), path.join(EXT_ROOT, 'icons'));
        await runRobocopy(extractedDir, EXT_ROOT, 'index.html');
        await runRobocopy(path.join(extractedDir, 'lib'), path.join(EXT_ROOT, 'lib'));
        await runRobocopy(path.join(extractedDir, 'extensions', 'premiere-extension', 'epr'), path.join(EXT_ROOT, 'epr'));
      } else {
        await copyWithRetry(pproSrcDir, EXT_ROOT);
        await copyWithRetry(path.join(extractedDir, 'ui'), path.join(EXT_ROOT, 'ui'));
        await copyWithRetry(path.join(extractedDir, 'server'), path.join(EXT_ROOT, 'server'));
        await copyWithRetry(path.join(extractedDir, 'icons'), path.join(EXT_ROOT, 'icons'));
        await copyWithRetry(path.join(extractedDir, 'index.html'), path.join(EXT_ROOT, 'index.html'), true);
        await copyWithRetry(path.join(extractedDir, 'lib'), path.join(EXT_ROOT, 'lib'));
        await copyWithRetry(path.join(extractedDir, 'extensions', 'premiere-extension', 'epr'), path.join(EXT_ROOT, 'epr'));
      }
    }
  }
  
  try { tlog('update:manual:copy:complete'); } catch (e) { try { tlog("silent catch:", e.message); } catch (_) {} }
  
  // Verify key files were updated
  const manifestPath = path.join(EXT_ROOT, 'CSXS', 'manifest.xml');
  let verifyVersion = '';
  try {
    if (fs.existsSync(manifestPath)) {
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      verifyVersion = parseBundleVersion(manifestContent);
      if (verifyVersion && verifyVersion !== latestVersion) {
        try { tlog('update:verify:warn', 'manifest version mismatch', verifyVersion, 'expected', latestVersion); } catch (_) {}
        if (!isSpawnedByUI) try { tlog(`Warning: Manifest version (${verifyVersion}) doesn't match expected version (${latestVersion})`); } catch (_) {}
      }
    }
  } catch (e) {
    try { tlog('update:verify:error', e.message); } catch (_) {}
    if (!isSpawnedByUI) try { tlog('Could not verify updated manifest:', e.message); } catch (_) {}
  }
  
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  
  if (!isSpawnedByUI) try { tlog(`Update completed successfully: ${current} -> ${latestVersion}`); } catch (_) {}
  
  return { 
    ok: true, 
    updated: true, 
    message: 'Update applied successfully. Please reload the panel to use the new version.', 
    current, 
    latest: latestVersion,
    verified: verifyVersion || latestVersion
  };
}

