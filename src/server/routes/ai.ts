import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { tlog, sanitizeForLogging } from '../utils/log';
import { DIRS, BASE_DIR } from '../serverConfig';
import { convertAudio } from '../services/audio';
import { validateRequiredString, validateUrl } from '../utils/validation';
import { validateApiKey, sanitizeApiKey } from '../../js/shared/utils/validation';
import { sendError, sendSuccess } from '../utils/response';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

router.post('/dubbing', asyncHandler(async (req, res) => {
  const { audioPath, audioUrl, targetLang, elevenApiKey } = req.body || {};
  
  // Validate and sanitize inputs
  const langError = validateRequiredString(targetLang, 'targetLang');
  if (langError) {
    sendError(res, 400, langError, 'dubbing');
    return;
  }
  
  const apiKeyError = validateApiKey(elevenApiKey);
  if (!apiKeyError.valid) {
    sendError(res, 400, apiKeyError.error || 'elevenApiKey required', 'dubbing');
    return;
  }
  
  const sanitizedApiKey = sanitizeApiKey(elevenApiKey);
  const sanitizedLang = targetLang.trim();
  
  // Log sanitized request (no sensitive data)
  tlog('POST /dubbing', 'targetLang=' + sanitizedLang, 'hasAudioPath=' + !!audioPath, 'hasAudioUrl=' + !!audioUrl);
  
  // Validate audioUrl if provided
  if (audioUrl) {
    const urlError = validateUrl(audioUrl);
    if (urlError) {
      sendError(res, 400, urlError, 'dubbing');
      return;
    }
  }
    
    let localAudioPath = audioPath;
    
    if (audioUrl && !audioPath) {
      try {
        const response = await fetch(audioUrl);
        if (!response.ok) {
          sendError(res, 400, 'Failed to download audio from URL', 'dubbing');
          return;
        }
        
        const tempFileName = `temp_audio_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.mp3`;
        localAudioPath = path.join(DIRS.uploads, tempFileName);
        
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(localAudioPath, Buffer.from(buffer));
        
        tlog('Downloaded audio to temp file', localAudioPath);
      } catch (error) {
        const err = error as Error;
        tlog('Audio download error', err.message);
        sendError(res, 400, 'Failed to download audio: ' + err.message, 'dubbing');
        return;
      }
    }
    
    if (!localAudioPath || typeof localAudioPath !== 'string' || !path.isAbsolute(localAudioPath)) {
      tlog('dubbing invalid path');
      sendError(res, 400, 'invalid audioPath', 'dubbing');
      return;
    }
    
    if (!fs.existsSync(localAudioPath)) {
      sendError(res, 404, 'audio file not found', 'dubbing');
      return;
    }

    const audioExt = path.extname(localAudioPath).toLowerCase();
    if (audioExt === '.wav') {
      try {
        const mp3Path = localAudioPath.replace(/\.wav$/i, '.mp3');
        await convertAudio(localAudioPath, 'mp3');
        localAudioPath = mp3Path;
        tlog('Converted WAV to MP3 for ElevenLabs:', localAudioPath);
      } catch (convertError) {
        const err = convertError as Error;
        tlog('WAV to MP3 conversion failed:', err.message);
        sendError(res, 400, 'Failed to convert WAV to MP3: ' + err.message, 'dubbing');
        return;
      }
    }

    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(localAudioPath));
      formData.append('target_lang', sanitizedLang);
      
      const dubbingResponse = await fetch('https://api.elevenlabs.io/v1/dubbing', {
        method: 'POST',
        headers: {
          'xi-api-key': sanitizedApiKey,
        },
        body: formData,
        signal: AbortSignal.timeout(300000)
      });
      
      if (!dubbingResponse.ok) {
        const errorText = await dubbingResponse.text();
        tlog('ElevenLabs dubbing error:', dubbingResponse.status, errorText);
        sendError(res, dubbingResponse.status, `ElevenLabs API error: ${errorText}`, 'dubbing');
        return;
      }
      
      const dubbingData = await dubbingResponse.json();
      const dubbingId = dubbingData.dubbing_id;
      
      if (!dubbingId) {
        sendError(res, 500, 'No dubbing ID returned from ElevenLabs', 'dubbing');
        return;
      }
      
      tlog('ElevenLabs dubbing job created:', dubbingId);
      
      const pollInterval = 5000;
      const maxAttempts = 60;
      let attempts = 0;
      
      const pollForCompletion = async () => {
        attempts++;
        
        try {
          if (res.headersSent) {
            tlog('Client disconnected, stopping dubbing poll');
            return;
          }
          
          const statusResponse = await fetch(`https://api.elevenlabs.io/v1/dubbing/${dubbingId}`, {
            headers: {
              'xi-api-key': sanitizedApiKey,
            },
            signal: AbortSignal.timeout(10000)
          });
          
          if (!statusResponse.ok) {
            throw new Error(`Status check failed: ${statusResponse.status}`);
          }
          
          const statusData = await statusResponse.json();
          const status = statusData.status;
          
          tlog('Dubbing status check:', status, 'attempt:', attempts);
          
          if (status === 'dubbed') {
            const audioResponse = await fetch(`https://api.elevenlabs.io/v1/dubbing/${dubbingId}/audio/${sanitizedLang}`, {
              headers: {
                'xi-api-key': sanitizedApiKey,
              },
              signal: AbortSignal.timeout(30000)
            });
            
            if (!audioResponse.ok) {
              throw new Error(`Failed to get dubbed audio: ${audioResponse.status}`);
            }
            
            const outputFileName = `dubbed_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.mp3`;
            const outputPath = path.join(DIRS.uploads, outputFileName);
            
            const audioBuffer = await audioResponse.arrayBuffer();
            fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
            
            try {
              const sz = fs.statSync(outputPath).size;
              tlog('dubbing completed', 'output=' + outputPath, 'bytes=' + sz);
            } catch (e) {}
            
            if (!res.headersSent) {
              sendSuccess(res, { audioPath: outputPath, dubbingId: dubbingId });
            }
            return;
          } else if (status === 'failed') {
            throw new Error('Dubbing failed');
          } else if (attempts >= maxAttempts) {
            throw new Error('Dubbing timeout');
          } else {
            setTimeout(pollForCompletion, pollInterval);
          }
        } catch (error) {
          const err = error as Error;
          tlog('Dubbing poll error:', err.message);
          if (!res.headersSent) {
            sendError(res, 500, err.message, 'dubbing');
          }
        }
      };
      
      setTimeout(pollForCompletion, pollInterval);
      
}, 'dubbing'));

router.post('/tts/generate', asyncHandler(async (req, res) => {
  const { text, voiceId, elevenApiKey, model = 'eleven_turbo_v2_5', voiceSettings } = req.body || {};
  
  // Validate inputs
  const textError = validateRequiredString(text, 'text');
  if (textError) {
    sendError(res, 400, textError, 'tts/generate');
    return;
  }
  
  const voiceIdError = validateRequiredString(voiceId, 'voiceId');
  if (voiceIdError) {
    sendError(res, 400, voiceIdError, 'tts/generate');
    return;
  }
  
  const apiKeyError = validateApiKey(elevenApiKey);
  if (!apiKeyError.valid) {
    sendError(res, 400, apiKeyError.error || 'elevenApiKey required', 'tts/generate');
    return;
  }
  
  const sanitizedApiKey = sanitizeApiKey(elevenApiKey);
  const sanitizedText = text.trim();
  const sanitizedVoiceId = voiceId.trim();
  const sanitizedModel = (model || 'eleven_turbo_v2_5').trim();
  
  // Validate text length (reasonable limit)
  if (sanitizedText.length > 5000) {
    sendError(res, 400, 'Text must be 5000 characters or less', 'tts/generate');
    return;
  }
    
    tlog('POST /tts/generate', 'voiceId=' + sanitizedVoiceId, 'model=' + sanitizedModel, 'textLength=' + sanitizedText.length);
    
    const settings = voiceSettings || {
      stability: 0.5,
      similarity_boost: 0.75
    };
    
    try {
      // Validate voice settings
      const validatedSettings = {
        stability: typeof settings.stability === 'number' && settings.stability >= 0 && settings.stability <= 1 
          ? settings.stability : 0.5,
        similarity_boost: typeof settings.similarity_boost === 'number' && settings.similarity_boost >= 0 && settings.similarity_boost <= 1
          ? settings.similarity_boost : 0.75
      };
      
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${sanitizedVoiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': sanitizedApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: sanitizedText,
          model_id: sanitizedModel,
          voice_settings: {
            stability: validatedSettings.stability,
            similarity_boost: validatedSettings.similarity_boost,
            style: 0.0,
            use_speaker_boost: true
          }
        }),
        signal: AbortSignal.timeout(60000)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        tlog('ElevenLabs TTS error:', response.status, errorText);
        sendError(res, response.status, `ElevenLabs API error: ${errorText}`, 'tts/generate');
        return;
      }
      
      const ttsDir = path.join(BASE_DIR, 'tts');
      try { fs.mkdirSync(ttsDir, { recursive: true }); } catch (_) {}
      const outputFileName = `tts_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.mp3`;
      const outputPath = path.join(ttsDir, outputFileName);
      
      const audioBuffer = await response.arrayBuffer();
      fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
      
      try {
        const sz = fs.statSync(outputPath).size;
        tlog('TTS completed', 'output=' + outputPath, 'bytes=' + sz);
      } catch (e) {}
      
      sendSuccess(res, { audioPath: outputPath });
}, 'tts/generate'));

router.get('/tts/voices', asyncHandler(async (req, res) => {
  const { elevenApiKey, page_size = 100, category, voice_type } = req.query;
  
  const apiKeyError = validateApiKey(String(elevenApiKey || ''));
  if (!apiKeyError.valid) {
    sendError(res, 400, apiKeyError.error || 'elevenApiKey required', 'tts/voices');
    return;
  }
    
    const sanitizedApiKey = sanitizeApiKey(String(elevenApiKey));
    
    // Validate and sanitize query parameters
    const sanitizedPageSize = Math.min(Math.max(parseInt(String(page_size || 100)), 1), 1000);
    const sanitizedCategory = category ? String(category).trim() : undefined;
    const sanitizedVoiceType = voice_type ? String(voice_type).trim() : undefined;
    
    tlog('GET /tts/voices', 'page_size=' + sanitizedPageSize);
    
    try {
      // Build query parameters for v2 API
      const params = new URLSearchParams();
      params.append('page_size', sanitizedPageSize.toString());
      if (sanitizedCategory) params.append('category', sanitizedCategory);
      if (sanitizedVoiceType) params.append('voice_type', sanitizedVoiceType);
      
      const url = `https://api.elevenlabs.io/v2/voices?${params.toString()}`;
      
      const response = await fetch(url, {
        headers: {
          'xi-api-key': sanitizedApiKey,
        },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        tlog('ElevenLabs voices error:', response.status, errorText);
        sendError(res, response.status, `ElevenLabs API error: ${errorText}`, 'tts/voices');
        return;
      }
      
      const data = await response.json();
      tlog('TTS voices fetched', 'count=' + data.voices?.length, 'has_more=' + data.has_more);
      
      // Return the full response including pagination info
      sendSuccess(res, {
        voices: data.voices || [],
        has_more: data.has_more || false,
        total_count: data.total_count || 0,
        next_page_token: data.next_page_token || null
      });
}, 'tts/voices'));

router.post('/tts/voices/create', asyncHandler(async (req, res) => {
  const { name, files, elevenApiKey } = req.body || {};
  
  // Validate inputs
  const nameError = validateRequiredString(name, 'name');
  if (nameError) {
    sendError(res, 400, nameError, 'tts/voices/create');
    return;
  }
  
  if (!files || !Array.isArray(files) || files.length === 0) {
    sendError(res, 400, 'At least one audio file required', 'tts/voices/create');
    return;
  }
  
  // Validate file count (reasonable limit)
  if (files.length > 25) {
    sendError(res, 400, 'Maximum 25 files allowed', 'tts/voices/create');
    return;
  }
  
  const apiKeyError = validateApiKey(elevenApiKey);
  if (!apiKeyError.valid) {
    sendError(res, 400, apiKeyError.error || 'elevenApiKey required', 'tts/voices/create');
    return;
  }
  
  const sanitizedApiKey = sanitizeApiKey(elevenApiKey);
  const sanitizedName = name.trim();
  
  // Validate name length
  if (sanitizedName.length > 100) {
    sendError(res, 400, 'Voice name must be 100 characters or less', 'tts/voices/create');
    return;
  }
    
    tlog('POST /tts/voices/create', 'name=' + sanitizedName, 'files=' + files.length);
    
    try {
      // Create FormData for ElevenLabs API
      const formData = new FormData();
      formData.append('name', sanitizedName);
      
      // Add all files to FormData
      for (const filePath of files) {
        if (!fs.existsSync(filePath)) {
          sendError(res, 400, `File not found: ${filePath}`, 'tts/voices/create');
          return;
        }
        
        // Check file size (max 10MB per file)
        const stats = fs.statSync(filePath);
        if (stats.size > 10 * 1024 * 1024) {
          sendError(res, 400, `File too large: ${path.basename(filePath)} (max 10MB)`, 'tts/voices/create');
          return;
        }
        
        formData.append('files', fs.createReadStream(filePath));
      }
      
      // Call ElevenLabs API
      const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: {
          'xi-api-key': sanitizedApiKey,
        },
        body: formData,
        signal: AbortSignal.timeout(300000) // 5 minute timeout
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        tlog('ElevenLabs voice creation error:', response.status, errorText);
        sendError(res, response.status, `ElevenLabs API error: ${errorText}`, 'tts/voices/create');
        return;
      }
      
      const data = await response.json();
      tlog('Voice clone created successfully:', data.voice_id);
      
      sendSuccess(res, {
        voice_id: data.voice_id,
        requires_verification: data.requires_verification || false
      });
}, 'tts/voices/create'));

router.post('/tts/voices/delete', asyncHandler(async (req, res) => {
  const { voiceId, elevenApiKey } = req.body || {};
  
  // Validate inputs
  const voiceIdError = validateRequiredString(voiceId, 'voiceId');
  if (voiceIdError) {
    sendError(res, 400, voiceIdError, 'tts/voices/delete');
    return;
  }
  
  const apiKeyError = validateApiKey(elevenApiKey);
  if (!apiKeyError.valid) {
    sendError(res, 400, apiKeyError.error || 'elevenApiKey is required', 'tts/voices/delete');
    return;
  }
  
  const sanitizedApiKey = sanitizeApiKey(elevenApiKey);
  const sanitizedVoiceId = voiceId.trim();
  
  // Validate voiceId format (basic check)
  if (sanitizedVoiceId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(sanitizedVoiceId)) {
    sendError(res, 400, 'Invalid voiceId format', 'tts/voices/delete');
    return;
  }
    
    tlog('POST /tts/voices/delete', 'voiceId=' + sanitizedVoiceId);
    
    // Call ElevenLabs API to delete voice
    const response = await fetch(`https://api.elevenlabs.io/v1/voices/${sanitizedVoiceId}`, {
      method: 'DELETE',
      headers: {
        'xi-api-key': sanitizedApiKey,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { detail: { message: errorText } };
      }
      
      tlog('ElevenLabs delete voice error:', response.status, errorText);
      sendError(res, response.status, 'ElevenLabs API error: ' + JSON.stringify(errorData), 'tts/voices/delete');
      return;
    }
    
    // Parse response - ElevenLabs returns { "status": "ok" } on success
    const data = await response.json().catch(() => ({}));
    tlog('Voice deleted successfully:', voiceId);
    
    sendSuccess(res, { message: 'Voice deleted successfully', status: data.status || 'ok' });
}, 'tts/voices/delete'));

export default router;

