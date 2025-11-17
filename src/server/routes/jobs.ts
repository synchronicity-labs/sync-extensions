import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { track } from '../telemetry';
import { tlog, sanitizeForLogging } from '../utils/log';
import { safeStat, safeExists, safeText, pipeToFile } from '../utils/files';
import { resolveSafeLocalPath, normalizePaths, normalizeOutputDir } from '../utils/paths';
import { r2Upload } from '../services/r2';
import { createGeneration, pollSyncJob, fetchGeneration } from '../services/generation';
import { convertAudio } from '../services/audio';
import { SYNC_API_BASE, DOCS_DEFAULT_DIR, TEMP_DEFAULT_DIR, FILE_SIZE_LIMIT_20MB, FILE_SIZE_LIMIT_1GB } from './constants';
import { APP_ID } from '../serverConfig';
import { validateJobRequest, validateRequiredFields } from '../utils/validation';

const router = express.Router();

async function convertIfAiff(p: string | undefined): Promise<string | undefined> {
  try {
    if (!p || typeof p !== 'string') return p;
    const lower = p.toLowerCase();
    if (!(lower.endsWith('.aif') || lower.endsWith('.aiff'))) return p;
    const out = await convertAudio(p, 'wav');
    if (out && fs.existsSync(out)) return out;
    return p;
  } catch (e) {
    return p;
  }
}

router.get('/jobs', async (req, res) => {
  try {
    const { syncApiKey } = req.query;
    
    // If syncApiKey is provided, ONLY fetch from Sync API (no local jobs)
    if (syncApiKey && typeof syncApiKey === 'string' && syncApiKey.trim()) {
      try {
        const url = new URL(`${SYNC_API_BASE}/generations`);
        const apiResponse = await fetch(url.toString(), {
          headers: { 'x-api-key': String(syncApiKey) },
          signal: AbortSignal.timeout(10000)
        });
        
        if (apiResponse.ok) {
          const apiData = await apiResponse.json().catch(() => null);
          if (apiData && Array.isArray(apiData)) {
            // Only return API jobs - no local caching
            const apiJobs = apiData.filter(job => job && job.id);
            
            // Debug: log structure of first completed job
            const firstCompleted = apiJobs.find(j => j.status === 'completed');
            if (firstCompleted) {
              tlog(`[/jobs] Sample completed job: id=${firstCompleted.id}, hasOutputUrl=${!!firstCompleted.outputUrl}, hasOutputPath=${!!firstCompleted.outputPath}, keys=${Object.keys(firstCompleted).join(',')}`);
            }
            
            // Sort by createdAt (newest first)
            apiJobs.sort((a, b) => {
              const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return bTime - aTime;
            });
            
            tlog(`[/jobs] Fetched ${apiJobs.length} jobs from Sync API only (no local jobs)`);
            return res.json(apiJobs);
          }
        } else {
          tlog(`[/jobs] Sync API request failed: ${apiResponse.status}`);
        }
      } catch (e) {
        tlog(`[/jobs] Error fetching from Sync API: ${e?.message || String(e)}`);
      }
      
      // If API fetch failed, return empty array (no local jobs)
      return res.json([]);
    }
    
    // No API key - return empty array (no local jobs)
    res.json([]);
  } catch (e) {
    tlog(`[/jobs] Error: ${e?.message || String(e)}`);
    if (!res.headersSent) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  }
});

router.get('/jobs/:id', (req, res) => {
  const job = req.jobs.find(j => String(j.id) === String(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

router.post('/jobs', async (req, res) => {
  try {
    tlog('[jobs:create] Request received:', JSON.stringify(sanitizeForLogging(req.body), null, 2));
    
    const validation = validateJobRequest(req.body);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.errors.join(', ') });
    }
    
    let { videoPath, audioPath, videoUrl, audioUrl, isTempVideo, isTempAudio, model, temperature, activeSpeakerOnly, detectObstructions, options = {}, syncApiKey, outputDir } = req.body || {};
    ({ videoPath, audioPath } = await normalizePaths({ videoPath, audioPath }));
    try {
      if (audioPath) {
        audioPath = await convertIfAiff(audioPath);
      }
    } catch (_) {}
    const vStat = await safeStat(videoPath);
    const aStat = await safeStat(audioPath);
    const overLimit = (!videoUrl || !audioUrl) && ((vStat && vStat.size > FILE_SIZE_LIMIT_20MB) || (aStat && aStat.size > FILE_SIZE_LIMIT_20MB));
    
    track('sync_job_started', {
      model: model || 'lipsync-2-pro',
      temperature: temperature || 0.7,
      activeSpeakerOnly: !!activeSpeakerOnly,
      detectObstructions: !!detectObstructions,
      hasVideoUrl: !!videoUrl,
      hasAudioUrl: !!audioUrl,
      videoSize: vStat?.size || 0,
      audioSize: aStat?.size || 0,
      overLimit: overLimit,
      hostApp: APP_ID
    });
    
    if (!syncApiKey) {
      tlog('[jobs:create] Missing syncApiKey, rejecting request');
      return res.status(400).json({ error: 'syncApiKey required' });
    }
    
    // Normalize URLs - treat empty strings as missing
    videoUrl = (videoUrl && typeof videoUrl === 'string' && videoUrl.trim() !== '') ? videoUrl.trim() : null;
    audioUrl = (audioUrl && typeof audioUrl === 'string' && audioUrl.trim() !== '') ? audioUrl.trim() : null;
    
    if (!videoUrl || !audioUrl) {
      if (!videoPath || !audioPath) return res.status(400).json({ error: 'Video and audio required' });
      const videoExists = await safeExists(videoPath);
      const audioExists = await safeExists(audioPath);
      if (!videoExists || !audioExists) return res.status(400).json({ error: 'Video or audio file not found' });

      tlog('[jobs:create] Uploading sources to R2 for lipsync job');
      videoUrl = await r2Upload(await resolveSafeLocalPath(videoPath));
      audioUrl = await r2Upload(await resolveSafeLocalPath(audioPath));
    } else {
      tlog('[jobs:create] Using provided R2 URLs for video and audio');
    }

    if ((!videoUrl || !audioUrl) && ((vStat && vStat.size > FILE_SIZE_LIMIT_1GB) || (aStat && aStat.size > FILE_SIZE_LIMIT_1GB))) {
      return res.status(400).json({ error: 'Files over 1GB are not allowed. Please use smaller files.' });
    }

    // Create Sync API generation first to get the ID
    let syncJobId = null;
    try {
      const tempJob = {
        videoPath,
        audioPath,
        videoUrl: videoUrl || '',
        audioUrl: audioUrl || '',
        model: model || 'lipsync-2-pro',
        options: (options && typeof options === 'object') ? options : {},
        syncApiKey,
      };
      await createGeneration(tempJob);
      syncJobId = tempJob.syncJobId;
      if (!syncJobId) {
        throw new Error('Failed to get Sync API generation ID');
      }
    } catch (e) {
      return res.status(500).json({ error: `Failed to create generation: ${String(e?.message || e)}` });
    }

    const job = {
      id: syncJobId, // Use Sync API ID as the job ID
      videoPath,
      audioPath,
      videoUrl: videoUrl || '',
      audioUrl: audioUrl || '',
      isTempVideo: !!isTempVideo,
      isTempAudio: !!isTempAudio,
      model: model || 'lipsync-2-pro',
      temperature: temperature || 0.7,
      activeSpeakerOnly: !!activeSpeakerOnly,
      detectObstructions: !!detectObstructions,
      options: (options && typeof options === 'object') ? options : {},
      status: 'processing',
      createdAt: new Date().toISOString(),
      outputPath: null,
      outputDir: normalizeOutputDir(outputDir || '') || null,
      syncApiKey,
    };
    req.jobs.push(job);
    if (req.jobs.length > 500) {
      req.jobs = req.jobs.slice(-500);
    }
    req.saveJobs();

    res.json(job);
    
    setImmediate(async () => {
      try {
        try {
          if (job.isTempVideo && job.videoPath && await safeExists(job.videoPath)) {
            await fs.promises.unlink(job.videoPath);
            job.videoPath = '';
          }
        } catch (e) {}
        try {
          if (job.isTempAudio && job.audioPath && await safeExists(job.audioPath)) {
            await fs.promises.unlink(job.audioPath);
            job.audioPath = '';
          }
        } catch (e) {}
        req.saveJobs();
        pollSyncJob(job);
      } catch (e) {
        job.status = 'failed';
        job.error = String(e?.message || e);
        req.saveJobs();
        
        track('sync_job_failed', {
          jobId: job.id,
          model: job.model,
          error: String(e?.message || e),
          hostApp: APP_ID
        });
      }
    });
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) });
  }
});

router.get('/jobs/:id/download', async (req, res) => {
  const job = req.jobs.find(j => String(j.id) === String(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.outputPath || !(await safeExists(job.outputPath))) return res.status(404).json({ error: 'Output not ready' });
  try {
    const allowed = [DOCS_DEFAULT_DIR, TEMP_DEFAULT_DIR];
    if (job.outputDir && typeof job.outputDir === 'string') allowed.push(job.outputDir);
    const realOut = fs.realpathSync(job.outputPath);
    const ok = allowed.some(root => {
      try {
        return realOut.startsWith(fs.realpathSync(root) + path.sep);
      } catch (_) {
        return false;
      }
    });
    if (!ok) return res.status(403).json({ error: 'forbidden path' });
  } catch (_) {
    return res.status(500).json({ error: 'download error' });
  }
  res.download(job.outputPath);
});

router.post('/jobs/:id/save', async (req, res) => {
  tlog(`[/jobs/:id/save] POST request received for job ${req.params.id}, location=${req.body?.location || 'project'}, hasKeyOverride=${!!req.body?.syncApiKey}`);
  try {
    const { location = 'project', targetDir = '', syncApiKey: keyOverride } = req.body || {};
    let job = req.jobs.find(j => String(j.id) === String(req.params.id));
    tlog(`[/jobs/:id/save] Job found in local jobs: ${!!job}, job status: ${job?.status}, has outputPath: ${!!job?.outputPath}, has syncApiKey: ${!!job?.syncApiKey}`);
    if (!job) {
      if (!keyOverride) return res.status(404).json({ error: 'Job not found and syncApiKey missing' });
      job = { id: String(req.params.id), status: 'completed', outputDir: '', syncApiKey: keyOverride };
    }

    // Ensure syncApiKey is set (use override if provided, otherwise use job's key)
    if (!job.syncApiKey && keyOverride) {
      job.syncApiKey = keyOverride;
    }

    // Use location parameter directly (frontend should pass 'project' or 'documents')
    // If location is 'project' but targetDir is empty, we still want to try to get project directory
    let outDir = (location === 'documents') ? DOCS_DEFAULT_DIR : (targetDir || job.outputDir || TEMP_DEFAULT_DIR);
    
    // If location is 'project' but targetDir is empty, try to construct project directory path
    // This is a fallback when getProjectDir fails on the frontend
    if (location === 'project' && !targetDir && !job.outputDir) {
      // Try to infer project directory from job's original paths if available
      // Otherwise, we'll use TEMP_DEFAULT_DIR but still try to copy to project folder later
      tlog(`[/jobs/:id/save] Location is 'project' but targetDir is empty - will use temp dir but try to copy to project`);
    }
    
    tlog(`[/jobs/:id/save] Target directory: ${outDir}, location: ${location}, targetDir: ${targetDir}, job.outputDir: ${job.outputDir}`);
    try {
      await fs.promises.access(outDir);
    } catch {
      await fs.promises.mkdir(outDir, { recursive: true });
      tlog(`[/jobs/:id/save] Created directory: ${outDir}`);
    }

    // Normalize paths for comparison
    const normalizePathForComparison = (p: string) => path.resolve(p).replace(/\\/g, '/').toLowerCase();
    
    if (job.outputPath) {
      const outputPathExists = await safeExists(job.outputPath);
      tlog(`[/jobs/:id/save] Checking existing outputPath: ${job.outputPath}, exists: ${outputPathExists}`);
      
      if (outputPathExists) {
        const outputDir = path.dirname(job.outputPath);
        const normalizedOutputDir = normalizePathForComparison(outputDir);
        const normalizedOutDir = normalizePathForComparison(outDir);
        tlog(`[/jobs/:id/save] Comparing directories: "${normalizedOutputDir}" === "${normalizedOutDir}"`);
        
        // If location is 'project' but file is in temp directory, we should still copy it to project folder
        // Don't return early if we're trying to save to project but file is in temp
        const isInTempDir = normalizedOutputDir.includes('uploads') || normalizedOutputDir.includes('temp');
        const isTargetTempDir = normalizedOutDir.includes('uploads') || normalizedOutDir.includes('temp');
        
        if (normalizedOutputDir === normalizedOutDir) {
          tlog(`[/jobs/:id/save] File already in target directory, returning existing path`);
      return res.json({ ok: true, outputPath: job.outputPath });
    }

        // File exists but in different directory - copy it
        tlog(`[/jobs/:id/save] File exists in different directory, copying to: ${outDir}`);
      const newPath = path.join(outDir, `${job.id}_output.mp4`);
      try {
        await fs.promises.copyFile(job.outputPath, newPath);
          tlog(`[/jobs/:id/save] Successfully copied file to: ${newPath}`);
          // Don't delete the original file - keep it as backup
      job.outputPath = newPath;
      req.saveJobs();
      return res.json({ ok: true, outputPath: job.outputPath });
        } catch (copyErr) {
          tlog(`[/jobs/:id/save] Failed to copy file: ${copyErr?.message || String(copyErr)}`);
          // Continue to try fetching from API
        }
      } else {
        tlog(`[/jobs/:id/save] OutputPath set but file does not exist on disk: ${job.outputPath}`);
      }
    }

    // Try to fetch from Sync API
    if (job.syncApiKey) {
      tlog(`[/jobs/:id/save] Attempting to fetch from Sync API for job ${job.id}`);
      try {
        const meta = await fetchGeneration(job);
        tlog(`[/jobs/:id/save] Fetched meta from Sync API: hasMeta=${!!meta}, hasOutputUrl=${!!meta?.outputUrl}, status=${meta?.status}`);
        if (meta && meta.outputUrl) {
          tlog(`[/jobs/:id/save] Downloading from outputUrl: ${meta.outputUrl.substring(0, 100)}...`);
          const response = await fetch(meta.outputUrl);
          if (response.ok && response.body) {
            const dest = path.join(outDir, `${job.id}_output.mp4`);
            tlog(`[/jobs/:id/save] Saving to: ${dest}`);
            await pipeToFile(response.body, dest);
            job.outputPath = dest;
            if (!req.jobs.find(j => String(j.id) === String(job.id))) { req.jobs.unshift(job); req.saveJobs(); }
            tlog(`[/jobs/:id/save] Successfully saved job ${job.id} to ${dest}`);
            return res.json({ ok: true, outputPath: job.outputPath });
          } else {
            tlog(`[/jobs/:id/save] Failed to download from outputUrl: ${response.status} ${response.statusText}`);
          }
        } else {
          tlog(`[/jobs/:id/save] No outputUrl in meta. Meta keys: ${meta ? Object.keys(meta).join(',') : 'null'}`);
        }
      } catch (e) {
        tlog(`[/jobs/:id/save] Error fetching generation: ${e?.message || String(e)}`);
        tlog(`[/jobs/:id/save] Error stack: ${e?.stack || 'no stack'}`);
      }
    } else {
      tlog(`[/jobs/:id/save] No syncApiKey available for job ${job.id}`);
    }
    
    tlog(`[/jobs/:id/save] Returning error: Output not available yet`);
    res.status(400).json({ error: 'Output not available yet' });
  } catch (e) {
    tlog(`[/jobs/:id/save] Error: ${e?.message || String(e)}`);
    if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) });
  }
});

router.get('/costs', (_req, res) => {
  res.json({ ok: true, note: 'POST this endpoint to estimate costs', ts: Date.now() });
});

// Frontend-compatible cost estimation endpoint
router.post('/cost/estimate', async (req, res) => {
  try {
    const { videoUrl, audioUrl, model = 'lipsync-2-pro', syncApiKey } = req.body || {};
    
    tlog('[cost/estimate] Request received', JSON.stringify({
      hasVideoUrl: !!videoUrl,
      hasAudioUrl: !!audioUrl,
      videoUrlType: typeof videoUrl,
      audioUrlType: typeof audioUrl,
      videoUrlPreview: videoUrl ? (typeof videoUrl === 'string' ? videoUrl.substring(0, 100) : String(videoUrl).substring(0, 100)) : 'null',
      audioUrlPreview: audioUrl ? (typeof audioUrl === 'string' ? audioUrl.substring(0, 100) : String(audioUrl).substring(0, 100)) : 'null',
      model,
      hasSyncApiKey: !!syncApiKey,
      syncApiKeyPreview: syncApiKey ? syncApiKey.substring(0, 20) + '...' : 'null'
    }));
    
    if (!videoUrl || !audioUrl) {
      tlog('[cost/estimate] Missing URLs', JSON.stringify({ videoUrl: !!videoUrl, audioUrl: !!audioUrl }));
      return res.status(400).json({ error: 'Video and audio URLs required' });
    }
    
    // Validate URLs are actual URLs, not file paths
    const isValidUrl = (url: any) => {
      if (typeof url !== 'string') return false;
      return url.startsWith('http://') || url.startsWith('https://');
    };
    
    if (!isValidUrl(videoUrl) || !isValidUrl(audioUrl)) {
      tlog('[cost/estimate] Invalid URLs (file paths instead of URLs)', JSON.stringify({
        videoUrl: String(videoUrl).substring(0, 100),
        audioUrl: String(audioUrl).substring(0, 100)
      }));
      return res.status(400).json({ error: 'Video and audio must be HTTP/HTTPS URLs, not file paths' });
    }
    
    // Get syncApiKey from body or try to get from settings header
    let apiKey = syncApiKey;
    if (!apiKey && req.headers['x-settings']) {
      try {
        const settings = JSON.parse(req.headers['x-settings'] as string);
        apiKey = settings.syncApiKey;
      } catch (_) {}
    }
    
    if (!apiKey) {
      tlog('[cost/estimate] Missing syncApiKey');
      return res.status(400).json({ error: 'syncApiKey required' });
    }
    
    const body = {
      model: String(model || 'lipsync-2-pro'),
      input: [{ type: 'video', url: videoUrl }, { type: 'audio', url: audioUrl }],
      options: { sync_mode: 'loop' }
    };
    
    tlog('[cost/estimate] Calling Sync API', JSON.stringify({
      model: body.model,
      videoUrl: videoUrl.substring(0, 100) + '...',
      audioUrl: audioUrl.substring(0, 100) + '...',
      apiKeyPreview: apiKey.substring(0, 20) + '...'
    }));
    
    const resp = await fetch(`${SYNC_API_BASE}/analyze/cost`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });
    
    const text = await safeText(resp);
    tlog('[cost/estimate] Sync API response', JSON.stringify({
      status: resp.status,
      statusText: resp.statusText,
      textPreview: text ? text.substring(0, 500) : 'empty',
      textLength: text ? text.length : 0,
      fullText: text || 'empty'
    }));
    
    if (!resp.ok) {
      tlog('[cost/estimate] Sync API error', JSON.stringify({ status: resp.status, text }));
      return res.status(resp.status).json({ error: text || 'cost failed' });
    }
    
    // Parse the response - Sync API returns: {"estimatedFrameCount":90,"estimatedGenerationCost":0.3}
    let cost = 0;
    try {
      const responseData = JSON.parse(text || '{}');
      tlog('[cost/estimate] Parsed response', JSON.stringify({
        responseData,
        hasEstimatedGenerationCost: typeof responseData === 'object' && responseData !== null && 'estimatedGenerationCost' in responseData,
        estimatedGenerationCost: responseData?.estimatedGenerationCost
      }));
      
      // Extract cost directly from the response
      if (typeof responseData === 'object' && responseData !== null) {
        if (typeof responseData.estimatedGenerationCost === 'number') {
          cost = responseData.estimatedGenerationCost;
        } else if (typeof responseData.cost === 'number') {
          cost = responseData.cost;
        }
      }
    } catch (e) {
      tlog('[cost/estimate] JSON parse error', JSON.stringify({ error: String(e), textPreview: text?.substring(0, 200) }));
      cost = 0;
    }
    
    tlog('[cost/estimate] Final cost', JSON.stringify({ cost, costType: typeof cost }));
    
    res.json({ ok: true, cost });
  } catch (e) {
    tlog('[cost/estimate] Exception', { error: String(e?.message || e), stack: e?.stack });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

router.post('/costs', async (req, res) => {
  try {
    // Validate required fields
    const requiredError = validateRequiredFields(req.body, ['syncApiKey']);
    if (requiredError) {
      return res.status(400).json({ error: requiredError });
    }
    
    let { videoPath, audioPath, videoUrl, audioUrl, model = 'lipsync-2-pro', syncApiKey, options = {} } = req.body || {};
    ({ videoPath, audioPath } = await normalizePaths({ videoPath, audioPath }));
    
    if (!videoUrl || !audioUrl) {
      if (!videoPath || !audioPath) return res.status(400).json({ error: 'Video and audio required' });
      const videoExists = await safeExists(videoPath);
      const audioExists = await safeExists(audioPath);
      if (!videoExists || !audioExists) return res.status(400).json({ error: 'Video or audio file not found' });

      videoUrl = await r2Upload(await resolveSafeLocalPath(videoPath));
      audioUrl = await r2Upload(await resolveSafeLocalPath(audioPath));
    }

    const opts = (options && typeof options === 'object') ? options : {};
    if (!opts.sync_mode) opts.sync_mode = 'loop';
    const body = {
      model: String(model || 'lipsync-2-pro'),
      input: [{ type: 'video', url: videoUrl }, { type: 'audio', url: audioUrl }],
      options: opts
    };
    const resp = await fetch(`${SYNC_API_BASE}/analyze/cost`, { method: 'POST', headers: { 'x-api-key': syncApiKey, 'content-type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const text = await safeText(resp);
    if (!resp.ok) { return res.status(resp.status).json({ error: text || 'cost failed' }); }
    let raw = null;
    let estimate = [];
    try { raw = JSON.parse(text || '[]'); } catch (_) { raw = null; }
    if (Array.isArray(raw)) estimate = raw;
    else if (raw && typeof raw === 'object') estimate = [raw];
    else estimate = [];
    res.json({ ok: true, estimate });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

export default router;

