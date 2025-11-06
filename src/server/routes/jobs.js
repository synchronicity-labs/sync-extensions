import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { track } from '../telemetry.js';
import { tlog } from '../utils/log.js';
import { safeStat, safeExists, safeText, pipeToFile } from '../utils/files.js';
import { resolveSafeLocalPath, normalizePaths, normalizeOutputDir } from '../utils/paths.js';
import { r2Upload } from '../services/r2.js';
import { createGeneration, pollSyncJob, fetchGeneration } from '../services/generation.js';
import { convertAudio } from '../services/audio.js';
import { SYNC_API_BASE, DOCS_DEFAULT_DIR, TEMP_DEFAULT_DIR, FILE_SIZE_LIMIT_20MB, FILE_SIZE_LIMIT_1GB } from './constants.js';
import { APP_ID } from '../config.js';
import { validateJobRequest, validateRequiredFields } from '../utils/validation.js';

const router = express.Router();

async function convertIfAiff(p) {
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
    
    // Start with local jobs
    let allJobs = [...req.jobs];
    
    // If syncApiKey is provided, fetch from Sync API and merge
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
            // Merge API jobs with local jobs, deduplicate by ID
            const apiJobs = apiData.filter(job => job && job.id);
            const localJobIds = new Set(allJobs.map(j => String(j.id)));
            
            // Add API jobs that aren't already in local jobs
            for (const apiJob of apiJobs) {
              if (!localJobIds.has(String(apiJob.id))) {
                allJobs.push(apiJob);
              }
            }
            
            tlog(`[/jobs] Fetched ${apiJobs.length} jobs from Sync API, total: ${allJobs.length}`);
          }
        } else {
          tlog(`[/jobs] Sync API request failed: ${apiResponse.status}`);
        }
      } catch (e) {
        tlog(`[/jobs] Error fetching from Sync API: ${e?.message || String(e)}`);
        // Continue with local jobs even if API fetch fails
      }
    }
    
    // Sort by createdAt (newest first)
    allJobs.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
    
    tlog(`[/jobs] Returning ${allJobs.length} jobs (${req.jobs.length} local, ${allJobs.length - req.jobs.length} from API)`);
    res.json(allJobs);
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
    tlog('[jobs:create] Request received:', JSON.stringify(req.body, null, 2));
    
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
  try {
    const { location = 'project', targetDir = '', syncApiKey: keyOverride } = req.body || {};
    let job = req.jobs.find(j => String(j.id) === String(req.params.id));
    if (!job) {
      if (!keyOverride) return res.status(404).json({ error: 'Job not found and syncApiKey missing' });
      job = { id: String(req.params.id), status: 'completed', outputDir: '', syncApiKey: keyOverride };
    }

    // Use location parameter directly (frontend should pass 'project' or 'documents')
    const outDir = (location === 'documents') ? DOCS_DEFAULT_DIR : (targetDir || job.outputDir || TEMP_DEFAULT_DIR);
    try {
      await fs.promises.access(outDir);
    } catch {
      await fs.promises.mkdir(outDir, { recursive: true });
    }

    if (job.outputPath && await safeExists(job.outputPath) && path.dirname(job.outputPath) === outDir) {
      return res.json({ ok: true, outputPath: job.outputPath });
    }

    if (job.outputPath && await safeExists(job.outputPath)) {
      const newPath = path.join(outDir, `${job.id}_output.mp4`);
      try {
        await fs.promises.copyFile(job.outputPath, newPath);
      } catch (_) {}
      try {
        if (path.dirname(job.outputPath) !== outDir) await fs.promises.unlink(job.outputPath);
      } catch (e) {}
      job.outputPath = newPath;
      req.saveJobs();
      return res.json({ ok: true, outputPath: job.outputPath });
    }

    const meta = await fetchGeneration(job);
    if (meta && meta.outputUrl) {
      const response = await fetch(meta.outputUrl);
      if (response.ok && response.body) {
        const dest = path.join(outDir, `${job.id}_output.mp4`);
        await pipeToFile(response.body, dest);
        job.outputPath = dest;
        if (!req.jobs.find(j => String(j.id) === String(job.id))) { req.jobs.unshift(job); req.saveJobs(); }
        return res.json({ ok: true, outputPath: job.outputPath });
      }
    }
    res.status(400).json({ error: 'Output not available yet' });
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) });
  }
});

router.get('/costs', (_req, res) => {
  res.json({ ok: true, note: 'POST this endpoint to estimate costs', ts: Date.now() });
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

