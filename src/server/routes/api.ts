import express from 'express';
import { SYNC_API_BASE } from './constants';

const router = express.Router();

router.get('/models', async (req, res) => {
  try {
    const { syncApiKey } = req.query;
    if (!syncApiKey) return res.status(400).json({ error: 'syncApiKey required' });
    const r = await fetch(`${SYNC_API_BASE}/models`, { headers: { 'x-api-key': String(syncApiKey) }, signal: AbortSignal.timeout(10000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json(j);
    res.json(j);
  } catch (e) {
    const error = e as Error;
    if (!res.headersSent) res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/generations', async (req, res) => {
  try {
    const { syncApiKey, status } = req.query;
    if (!syncApiKey) return res.status(400).json({ error: 'syncApiKey required' });
    const url = new URL(`${SYNC_API_BASE}/generations`);
    if (status) url.searchParams.set('status', String(status));
    const r = await fetch(url.toString(), { headers: { 'x-api-key': String(syncApiKey) }, signal: AbortSignal.timeout(10000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json(j);
    res.json(j);
  } catch (e) {
    const error = e as Error;
    if (!res.headersSent) res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;

