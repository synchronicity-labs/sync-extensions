import express from 'express';
import { SYNC_API_BASE } from './constants';
import { validateApiKey, sanitizeApiKey } from '../../js/shared/utils/validation';
import { tlog } from '../utils/log';

const router = express.Router();

/**
 * GET /api/models
 * Fetches available models from Sync API
 */
router.get('/models', async (req, res) => {
  try {
    const { syncApiKey } = req.query;
    
    // Validate API key
    const apiKeyError = validateApiKey(String(syncApiKey || ''));
    if (!apiKeyError.valid) {
      return res.status(400).json({ error: apiKeyError.error || 'syncApiKey required' });
    }
    
    const sanitizedApiKey = sanitizeApiKey(String(syncApiKey));
    
    try {
      const r = await fetch(`${SYNC_API_BASE}/models`, { 
        headers: { 'x-api-key': sanitizedApiKey }, 
        signal: AbortSignal.timeout(10000) 
      });
      
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        tlog('[api/models] Sync API error:', r.status, JSON.stringify(j));
        return res.status(r.status).json(j);
      }
      res.json(j);
    } catch (fetchError) {
      const err = fetchError as Error;
      tlog('[api/models] Fetch error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to fetch models: ' + err.message });
      }
    }
  } catch (e) {
    const error = e as Error;
    tlog('[api/models] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: String(error?.message || error) });
    }
  }
});

/**
 * GET /api/generations
 * Fetches generations from Sync API
 */
router.get('/generations', async (req, res) => {
  try {
    const { syncApiKey, status } = req.query;
    
    // Validate API key
    const apiKeyError = validateApiKey(String(syncApiKey || ''));
    if (!apiKeyError.valid) {
      return res.status(400).json({ error: apiKeyError.error || 'syncApiKey required' });
    }
    
    const sanitizedApiKey = sanitizeApiKey(String(syncApiKey));
    
    // Validate and sanitize status if provided
    const sanitizedStatus = status ? String(status).trim() : undefined;
    if (sanitizedStatus && sanitizedStatus.length > 50) {
      return res.status(400).json({ error: 'Invalid status parameter' });
    }
    
    try {
      const url = new URL(`${SYNC_API_BASE}/generations`);
      if (sanitizedStatus) {
        url.searchParams.set('status', sanitizedStatus);
      }
      
      const r = await fetch(url.toString(), { 
        headers: { 'x-api-key': sanitizedApiKey }, 
        signal: AbortSignal.timeout(10000) 
      });
      
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        tlog('[api/generations] Sync API error:', r.status, JSON.stringify(j));
        return res.status(r.status).json(j);
      }
      res.json(j);
    } catch (fetchError) {
      const err = fetchError as Error;
      tlog('[api/generations] Fetch error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to fetch generations: ' + err.message });
      }
    }
  } catch (e) {
    const error = e as Error;
    tlog('[api/generations] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: String(error?.message || error) });
    }
  }
});

export default router;

