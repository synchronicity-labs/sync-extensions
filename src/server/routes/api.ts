import express from 'express';
import { SYNC_API_BASE } from './constants';
import { validateApiKey, sanitizeApiKey } from '../../js/shared/utils/validation';
import { tlog } from '../utils/log';
import { sendError, sendSuccess, handleRouteError } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

/**
 * GET /api/models
 * Fetches available models from Sync API
 */
router.get('/models', asyncHandler(async (req, res) => {
  const { syncApiKey } = req.query;
  
  // Validate API key
  const apiKeyError = validateApiKey(String(syncApiKey || ''));
  if (!apiKeyError.valid) {
    sendError(res, 400, apiKeyError.error || 'syncApiKey required', 'api/models');
    return;
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
      sendError(res, r.status, JSON.stringify(j), 'api/models');
      return;
    }
    sendSuccess(res, j);
  } catch (fetchError) {
    const err = fetchError as Error;
    tlog('[api/models] Fetch error:', err.message);
    sendError(res, 500, 'Failed to fetch models: ' + err.message, 'api/models');
  }
}, 'api/models'));

/**
 * GET /api/generations
 * Fetches generations from Sync API
 */
router.get('/generations', asyncHandler(async (req, res) => {
  const { syncApiKey, status } = req.query;
  
  // Validate API key
  const apiKeyError = validateApiKey(String(syncApiKey || ''));
  if (!apiKeyError.valid) {
    sendError(res, 400, apiKeyError.error || 'syncApiKey required', 'api/generations');
    return;
  }
  
  const sanitizedApiKey = sanitizeApiKey(String(syncApiKey));
  
  // Validate and sanitize status if provided
  const sanitizedStatus = status ? String(status).trim() : undefined;
  if (sanitizedStatus && sanitizedStatus.length > 50) {
    sendError(res, 400, 'Invalid status parameter', 'api/generations');
    return;
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
      sendError(res, r.status, JSON.stringify(j), 'api/generations');
      return;
    }
    sendSuccess(res, j);
  } catch (fetchError) {
    const err = fetchError as Error;
    tlog('[api/generations] Fetch error:', err.message);
    sendError(res, 500, 'Failed to fetch generations: ' + err.message, 'api/generations');
  }
}, 'api/generations'));

export default router;

