import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { APP_ID } from '../serverConfig';
import { tlog } from '../utils/log';
import { safeStat, safeExists, safeText, pipeToFile } from '../utils/files';
import { resolveSafeLocalPath, normalizeOutputDir } from '../utils/paths';
import { r2Upload } from './r2';
import { track } from '../telemetry';
import { SYNC_API_BASE, TEMP_DEFAULT_DIR, FILE_SIZE_LIMIT_20MB } from '../routes/constants';

/**
 * Job interface for generation service
 */
interface GenerationJob {
  id?: string;
  syncJobId?: string;
  videoPath?: string;
  audioPath?: string;
  videoUrl?: string;
  audioUrl?: string;
  model?: string;
  options?: Record<string, unknown>;
  syncApiKey: string;
  isTempVideo?: boolean;
  isTempAudio?: boolean;
  status?: string;
  createdAt?: string;
  outputPath?: string;
  outputDir?: string;
  error?: string;
}

type SaveJobsCallback = () => void;

let saveJobsCallback: SaveJobsCallback | null = null;

/**
 * Sets the callback function to save jobs
 */
export function setSaveJobsCallback(callback: SaveJobsCallback): void {
  saveJobsCallback = callback;
}

function saveJobs(): void {
  if (saveJobsCallback) {
    saveJobsCallback();
  }
}

/**
 * Creates a generation job via Sync API
 * @param job - Job configuration
 * @returns Sync API job ID
 */
export async function createGeneration(job: GenerationJob): Promise<string> {
  // Only stat files if URLs are not provided
  const vStat = job.videoUrl ? null : await safeStat(job.videoPath);
  const aStat = job.audioUrl ? null : await safeStat(job.audioPath);
  const overLimit = (!job.videoUrl || !job.audioUrl) && ((vStat && vStat.size > FILE_SIZE_LIMIT_20MB) || (aStat && aStat.size > FILE_SIZE_LIMIT_20MB));
  
  const timeoutMs = 60000;
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Generation timeout')), timeoutMs)
  );
  
  try {
    const syncJobId = await Promise.race([
      createGenerationInternal(job, vStat, aStat, overLimit),
      timeoutPromise
    ]);
    job.syncJobId = syncJobId; // Keep for backward compatibility during transition
    return syncJobId;
  } catch (e) {
    try { tlog('createGeneration:error', e && e.message ? e.message : String(e)); } catch (_) {}
    throw e;
  }
}

/**
 * Internal function to create generation with file stats
 */
async function createGenerationInternal(
  job: GenerationJob,
  vStat: { size: number } | null,
  aStat: { size: number } | null,
  overLimit: boolean
): Promise<string> {
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
      return data.id;
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
      return data.id;
    }
  } catch (e) { try { tlog('URL mode failed:', e); } catch (_) {} }
  
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
  return data.id;
}

/**
 * Fetches generation metadata from Sync API
 * @param job - Job with ID and API key
 * @returns Generation metadata or null if not found
 */
export async function fetchGeneration(job: GenerationJob): Promise<Record<string, unknown> | null> {
  const jobId = job.id || job.syncJobId; // Support both formats during transition
  let resp = await fetch(`${SYNC_API_BASE}/generate/${jobId}`, { headers: { 'x-api-key': job.syncApiKey }, signal: AbortSignal.timeout(10000) });
  if (!resp.ok && resp.status === 404) {
    resp = await fetch(`${SYNC_API_BASE}/generations/${jobId}`, { headers: { 'x-api-key': job.syncApiKey }, signal: AbortSignal.timeout(10000) });
  }
  if (!resp.ok) return null;
  return await resp.json();
}

/**
 * Downloads generation output if ready
 * @param job - Job with ID, API key, and output directory
 * @returns True if download succeeded, false otherwise
 */
export async function downloadIfReady(job: GenerationJob): Promise<boolean> {
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

/**
 * Polls Sync API for job completion and downloads when ready
 * @param job - Job to poll
 */
export function pollSyncJob(job: GenerationJob): void {
  const pollInterval = 5000;
  const maxAttempts = 120;
  let attempts = 0;
  let pollTimeout: NodeJS.Timeout | null = null;
  
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

