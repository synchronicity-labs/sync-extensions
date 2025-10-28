import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { APP_ID } from '../config.js';
import { tlog } from '../utils/log.js';
import { safeStat, safeExists, safeText, pipeToFile } from '../utils/files.js';
import { resolveSafeLocalPath, normalizeOutputDir } from '../utils/paths.js';
import { r2Upload } from './r2.js';
import { track } from '../telemetry.js';
import { SYNC_API_BASE, TEMP_DEFAULT_DIR, FILE_SIZE_LIMIT_20MB } from '../routes/constants.js';

let saveJobsCallback = null;
export function setSaveJobsCallback(callback) {
  saveJobsCallback = callback;
}

function saveJobs() {
  if (saveJobsCallback) saveJobsCallback();
}

export async function createGeneration(job) {
  const vStat = await safeStat(job.videoPath);
  const aStat = await safeStat(job.audioPath);
  const overLimit = ((vStat && vStat.size > FILE_SIZE_LIMIT_20MB) || (aStat && aStat.size > FILE_SIZE_LIMIT_20MB));
  
  const timeoutMs = 60000;
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Generation timeout')), timeoutMs)
  );
  
  try {
    return await Promise.race([
      createGenerationInternal(job, vStat, aStat, overLimit),
      timeoutPromise
    ]);
  } catch (e) {
    try { tlog('createGeneration:error', e && e.message ? e.message : String(e)); } catch (_) {}
    throw e;
  }
}

async function createGenerationInternal(job, vStat, aStat, overLimit) {
  try {
    if (job.videoUrl && job.audioUrl) {
      const body = {
        model: job.model,
        input: [{ type: 'video', url: job.videoUrl }, { type: 'audio', url: job.audioUrl }],
        options: (job.options && typeof job.options === 'object') ? job.options : {}
      };
      const resp = await fetch(`${SYNC_API_BASE}/generate`, {
        method: 'POST',
        headers: { 'x-api-key': job.syncApiKey, 'accept': 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000)
      });
      if (!resp.ok) {
        const t = await safeText(resp);
        throw new Error(`create(url) failed ${resp.status} ${t}`);
      }
      const data = await resp.json();
      job.syncJobId = data.id;
      return;
    }
    if (overLimit) {
      const videoUrl = await r2Upload(await resolveSafeLocalPath(job.videoPath));
      const audioUrl = await r2Upload(await resolveSafeLocalPath(job.audioPath));
      try { if (job.isTempVideo && job.videoPath && await safeExists(job.videoPath)) { await fs.promises.unlink(job.videoPath); job.videoPath = ''; } } catch (e) { await tlog("silent catch:", e.message); }
      try { if (job.isTempAudio && job.audioPath && await safeExists(job.audioPath)) { await fs.promises.unlink(job.audioPath); job.audioPath = ''; } } catch (_) {}
      const body = {
        model: job.model,
        input: [{ type: 'video', url: videoUrl }, { type: 'audio', url: audioUrl }],
        options: (job.options && typeof job.options === 'object') ? job.options : {}
      };
      const resp = await fetch(`${SYNC_API_BASE}/generate`, {
        method: 'POST',
        headers: { 'x-api-key': job.syncApiKey, 'accept': 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000)
      });
      if (!resp.ok) {
        const t = await safeText(resp);
        throw new Error(`create(url) failed ${resp.status} ${t}`);
      }
      const data = await resp.json();
      job.syncJobId = data.id;
      return;
    }
  } catch (e) { console.error('URL mode failed:', e); }
  
  const videoUrl = await r2Upload(await resolveSafeLocalPath(job.videoPath));
  const audioUrl = await r2Upload(await resolveSafeLocalPath(job.audioPath));
  try { if (job.isTempVideo && job.videoPath && await safeExists(job.videoPath)) { await fs.promises.unlink(job.videoPath); job.videoPath = ''; } } catch (e) { await tlog("silent catch:", e.message); }
  try { if (job.isTempAudio && job.audioPath && await safeExists(job.audioPath)) { await fs.promises.unlink(job.audioPath); job.audioPath = ''; } } catch (_) {}
  const body = {
    model: job.model,
    input: [{ type: 'video', url: videoUrl }, { type: 'audio', url: audioUrl }],
    options: (job.options && typeof job.options === 'object') ? job.options : {}
  };
  const resp = await fetch(`${SYNC_API_BASE}/generate`, {
    method: 'POST',
    headers: { 'x-api-key': job.syncApiKey, 'accept': 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  });
  if (!resp.ok) {
    const t = await safeText(resp);
    throw new Error(`create(url) failed ${resp.status} ${t}`);
  }
  const data = await resp.json();
  job.syncJobId = data.id;
}

export async function fetchGeneration(job) {
  let resp = await fetch(`${SYNC_API_BASE}/generate/${job.syncJobId}`, { headers: { 'x-api-key': job.syncApiKey }, signal: AbortSignal.timeout(10000) });
  if (!resp.ok && resp.status === 404) {
    resp = await fetch(`${SYNC_API_BASE}/generations/${job.syncJobId}`, { headers: { 'x-api-key': job.syncApiKey }, signal: AbortSignal.timeout(10000) });
  }
  if (!resp.ok) return null;
  return await resp.json();
}

export async function downloadIfReady(job) {
  const meta = await fetchGeneration(job);
  if (!meta || !meta.outputUrl) return false;
  const response = await fetch(meta.outputUrl);
  if (!response.ok || !response.body) return false;
  const outDir = (job.outputDir && typeof job.outputDir === 'string' ? normalizeOutputDir(job.outputDir) : '') || TEMP_DEFAULT_DIR;
  try {
    await fs.promises.access(outDir);
  } catch {
    await fs.promises.mkdir(outDir, { recursive: true });
  }
  const outputPath = path.join(outDir, `${job.id}_output.mp4`);
  await pipeToFile(response.body, outputPath);
  job.outputPath = outputPath;
  return true;
}

export function pollSyncJob(job) {
  const pollInterval = 5000;
  const maxAttempts = 120;
  let attempts = 0;
  let pollTimeout = null;
  
  const tick = async () => {
    attempts++;
    try {
      if (await downloadIfReady(job)) {
        job.status = 'completed';
        saveJobs();
        
        const duration = Date.now() - new Date(job.createdAt).getTime();
        track('sync_job_succeeded', {
          jobId: job.id,
          model: job.model,
          duration: duration,
          attempts: attempts,
          hostApp: APP_ID
        });
        
        if (pollTimeout) clearTimeout(pollTimeout);
        return;
      }
      if (attempts < maxAttempts) {
        pollTimeout = setTimeout(tick, pollInterval);
      } else {
        job.status = 'failed';
        job.error = 'Timeout';
        saveJobs();
        
        track('sync_job_failed', {
          jobId: job.id,
          model: job.model,
          error: 'Timeout',
          attempts: attempts,
          hostApp: APP_ID
        });
        
        if (pollTimeout) clearTimeout(pollTimeout);
      }
    } catch (e) {
      job.status = 'failed';
      job.error = String(e?.message || e);
      saveJobs();
      
      track('sync_job_failed', {
        jobId: job.id,
        model: job.model,
        error: String(e?.message || e),
        attempts: attempts,
        hostApp: APP_ID
      });
      
      if (pollTimeout) clearTimeout(pollTimeout);
    }
  };
  
  pollTimeout = setTimeout(tick, pollInterval);
  
  setTimeout(() => {
    if (pollTimeout) {
      clearTimeout(pollTimeout);
      pollTimeout = null;
      if (job.status === 'processing') {
        job.status = 'failed';
        job.error = 'Polling timeout';
        saveJobs();
      }
    }
  }, maxAttempts * pollInterval + 30000);
}

