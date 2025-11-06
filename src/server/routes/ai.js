import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { tlog } from '../utils/log.js';
import { DIRS, BASE_DIR } from '../config.js';
import { convertAudio } from '../services/audio.js';

const router = express.Router();

router.post('/dubbing', async (req, res) => {
  try {
    const { audioPath, audioUrl, targetLang, elevenApiKey } = req.body || {};
    tlog('POST /dubbing', 'targetLang=' + targetLang, 'audioPath=' + audioPath, 'audioUrl=' + audioUrl);
    
    if (!targetLang) {
      return res.status(400).json({ error: 'Target language required' });
    }
    
    if (!elevenApiKey) {
      return res.status(400).json({ error: 'elevenApiKey required' });
    }
    
    let localAudioPath = audioPath;
    
    if (audioUrl && !audioPath) {
      try {
        const response = await fetch(audioUrl);
        if (!response.ok) {
          return res.status(400).json({ error: 'Failed to download audio from URL' });
        }
        
        const tempFileName = `temp_audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
        localAudioPath = path.join(DIRS.uploads, tempFileName);
        
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(localAudioPath, Buffer.from(buffer));
        
        tlog('Downloaded audio to temp file', localAudioPath);
      } catch (error) {
        tlog('Audio download error', error.message);
        return res.status(400).json({ error: 'Failed to download audio: ' + error.message });
      }
    }
    
    if (!localAudioPath || typeof localAudioPath !== 'string' || !path.isAbsolute(localAudioPath)) {
      tlog('dubbing invalid path');
      return res.status(400).json({ error: 'invalid audioPath' });
    }
    
    if (!fs.existsSync(localAudioPath)) {
      return res.status(404).json({ error: 'audio file not found' });
    }

    const audioExt = path.extname(localAudioPath).toLowerCase();
    if (audioExt === '.wav') {
      try {
        const mp3Path = localAudioPath.replace(/\.wav$/i, '.mp3');
        await convertAudio(localAudioPath, 'mp3');
        localAudioPath = mp3Path;
        tlog('Converted WAV to MP3 for ElevenLabs:', localAudioPath);
      } catch (convertError) {
        tlog('WAV to MP3 conversion failed:', convertError.message);
        return res.status(400).json({ error: 'Failed to convert WAV to MP3: ' + convertError.message });
      }
    }

    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(localAudioPath));
      formData.append('target_lang', targetLang);
      
      const dubbingResponse = await fetch('https://api.elevenlabs.io/v1/dubbing', {
        method: 'POST',
        headers: {
          'xi-api-key': elevenApiKey,
        },
        body: formData,
        signal: AbortSignal.timeout(300000)
      });
      
      if (!dubbingResponse.ok) {
        const errorText = await dubbingResponse.text();
        tlog('ElevenLabs dubbing error:', dubbingResponse.status, errorText);
        return res.status(dubbingResponse.status).json({ error: `ElevenLabs API error: ${errorText}` });
      }
      
      const dubbingData = await dubbingResponse.json();
      const dubbingId = dubbingData.dubbing_id;
      
      if (!dubbingId) {
        return res.status(500).json({ error: 'No dubbing ID returned from ElevenLabs' });
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
              'xi-api-key': elevenApiKey,
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
            const audioResponse = await fetch(`https://api.elevenlabs.io/v1/dubbing/${dubbingId}/audio/${targetLang}`, {
              headers: {
                'xi-api-key': elevenApiKey,
              },
              signal: AbortSignal.timeout(30000)
            });
            
            if (!audioResponse.ok) {
              throw new Error(`Failed to get dubbed audio: ${audioResponse.status}`);
            }
            
            const outputFileName = `dubbed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
            const outputPath = path.join(DIRS.uploads, outputFileName);
            
            const audioBuffer = await audioResponse.arrayBuffer();
            fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
            
            try {
              const sz = fs.statSync(outputPath).size;
              tlog('dubbing completed', 'output=' + outputPath, 'bytes=' + sz);
            } catch (e) {}
            
            if (!res.headersSent) {
              res.json({ ok: true, audioPath: outputPath, dubbingId: dubbingId });
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
          tlog('Dubbing poll error:', error.message);
          if (!res.headersSent) {
            res.status(500).json({ error: String(error?.message || error) });
          }
        }
      };
      
      setTimeout(pollForCompletion, pollInterval);
      
    } catch (e) {
      tlog('dubbing error:', e.message);
      return res.status(500).json({ error: String(e?.message || e) });
    }
  } catch (e) { 
    if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) }); 
  }
});

router.post('/tts/generate', async (req, res) => {
  try {
    const { text, voiceId, elevenApiKey, model = 'eleven_turbo_v2_5', voiceSettings } = req.body || {};
    tlog('POST /tts/generate', 'voiceId=' + voiceId, 'model=' + model, 'text=' + text?.substring(0, 50));
    
    if (!text) {
      return res.status(400).json({ error: 'Text required' });
    }
    
    if (!voiceId) {
      return res.status(400).json({ error: 'Voice ID required' });
    }
    
    if (!elevenApiKey) {
      return res.status(400).json({ error: 'elevenApiKey required' });
    }
    
    const settings = voiceSettings || {
      stability: 0.5,
      similarity_boost: 0.75
    };
    
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': elevenApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          model_id: model,
          voice_settings: {
            stability: settings.stability,
            similarity_boost: settings.similarity_boost,
            style: 0.0,
            use_speaker_boost: true
          }
        }),
        signal: AbortSignal.timeout(60000)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        tlog('ElevenLabs TTS error:', response.status, errorText);
        return res.status(response.status).json({ error: `ElevenLabs API error: ${errorText}` });
      }
      
      const ttsDir = path.join(BASE_DIR, 'tts');
      try { fs.mkdirSync(ttsDir, { recursive: true }); } catch (_) {}
      const outputFileName = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
      const outputPath = path.join(ttsDir, outputFileName);
      
      const audioBuffer = await response.arrayBuffer();
      fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
      
      try {
        const sz = fs.statSync(outputPath).size;
        tlog('TTS completed', 'output=' + outputPath, 'bytes=' + sz);
      } catch (e) {}
      
      res.json({ ok: true, audioPath: outputPath });
    } catch (e) {
      tlog('TTS error:', e.message);
      return res.status(500).json({ error: String(e?.message || e) });
    }
  } catch (e) { 
    if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) }); 
  }
});

router.get('/tts/voices', async (req, res) => {
  try {
    const { elevenApiKey, page_size = 100, category, voice_type } = req.query;
    tlog('GET /tts/voices');
    
    if (!elevenApiKey) {
      return res.status(400).json({ error: 'elevenApiKey required' });
    }
    
    try {
      // Build query parameters for v2 API
      const params = new URLSearchParams();
      if (page_size) params.append('page_size', page_size.toString());
      if (category) params.append('category', category);
      if (voice_type) params.append('voice_type', voice_type);
      
      const url = `https://api.elevenlabs.io/v2/voices${params.toString() ? '?' + params.toString() : ''}`;
      
      const response = await fetch(url, {
        headers: {
          'xi-api-key': elevenApiKey,
        },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        tlog('ElevenLabs voices error:', response.status, errorText);
        return res.status(response.status).json({ error: `ElevenLabs API error: ${errorText}` });
      }
      
      const data = await response.json();
      tlog('TTS voices fetched', 'count=' + data.voices?.length, 'has_more=' + data.has_more);
      
      // Return the full response including pagination info
      res.json({
        voices: data.voices || [],
        has_more: data.has_more || false,
        total_count: data.total_count || 0,
        next_page_token: data.next_page_token || null
      });
    } catch (e) {
      tlog('TTS voices error:', e.message);
      return res.status(500).json({ error: String(e?.message || e) });
    }
  } catch (e) { 
    if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) }); 
  }
});

router.post('/tts/voices/create', async (req, res) => {
  try {
    const { name, files, elevenApiKey } = req.body || {};
    tlog('POST /tts/voices/create', 'name=' + name, 'files=' + files?.length);
    
    if (!name) {
      return res.status(400).json({ error: 'Voice name required' });
    }
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'At least one audio file required' });
    }
    
    if (!elevenApiKey) {
      return res.status(400).json({ error: 'elevenApiKey required' });
    }
    
    try {
      // Create FormData for ElevenLabs API
      const formData = new FormData();
      formData.append('name', name);
      
      // Add all files to FormData
      for (const filePath of files) {
        if (!fs.existsSync(filePath)) {
          return res.status(400).json({ error: `File not found: ${filePath}` });
        }
        
        // Check file size (max 10MB per file)
        const stats = fs.statSync(filePath);
        if (stats.size > 10 * 1024 * 1024) {
          return res.status(400).json({ error: `File too large: ${path.basename(filePath)} (max 10MB)` });
        }
        
        formData.append('files', fs.createReadStream(filePath));
      }
      
      // Call ElevenLabs API
      const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: {
          'xi-api-key': elevenApiKey,
        },
        body: formData,
        signal: AbortSignal.timeout(300000) // 5 minute timeout
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        tlog('ElevenLabs voice creation error:', response.status, errorText);
        return res.status(response.status).json({ error: `ElevenLabs API error: ${errorText}` });
      }
      
      const data = await response.json();
      tlog('Voice clone created successfully:', data.voice_id);
      
      res.json({
        voice_id: data.voice_id,
        requires_verification: data.requires_verification || false
      });
    } catch (e) {
      tlog('Voice creation error:', e.message);
      return res.status(500).json({ error: String(e?.message || e) });
    }
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) });
  }
});

router.post('/tts/voices/delete', async (req, res) => {
  try {
    const { voiceId, elevenApiKey } = req.body || {};
    tlog('POST /tts/voices/delete', 'voiceId=' + voiceId);
    
    if (!voiceId) {
      return res.status(400).json({ error: 'voiceId is required' });
    }
    
    if (!elevenApiKey) {
      return res.status(400).json({ error: 'elevenApiKey is required' });
    }
    
    // Call ElevenLabs API to delete voice
    const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      method: 'DELETE',
      headers: {
        'xi-api-key': elevenApiKey,
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
      return res.status(response.status).json({
        error: 'ElevenLabs API error: ' + JSON.stringify(errorData)
      });
    }
    
    // Parse response - ElevenLabs returns { "status": "ok" } on success
    const data = await response.json().catch(() => ({}));
    tlog('Voice deleted successfully:', voiceId);
    
    res.json({ ok: true, message: 'Voice deleted successfully', status: data.status || 'ok' });
  } catch (e) {
    tlog('Delete voice error:', e.message);
    if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) });
  }
});

export default router;

