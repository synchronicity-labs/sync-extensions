import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { guessMime } from '../utils/paths.js';
import { safeExists } from '../utils/files.js';
import { tlog } from '../utils/log.js';

// Lazy-load R2 config to ensure .env is loaded first
function getR2Config() {
  return {
    R2_ENDPOINT_URL: process.env.R2_ENDPOINT_URL || 'https://a0282f2dad0cdecf5de20e2219e77809.r2.cloudflarestorage.com',
    R2_ACCESS_KEY: process.env.R2_ACCESS_KEY || '',
    R2_SECRET_KEY: process.env.R2_SECRET_KEY || '',
    R2_BUCKET: process.env.R2_BUCKET || 'service-based-business',
    R2_PREFIX: process.env.R2_PREFIX || 'sync-extension/'
  };
}

// Lazy-initialize r2Client - don't initialize at module load time
let _r2Client = null;

function getR2Client() {
  // Always re-check env vars - they may not be loaded yet at module load time
  const config = getR2Config();
  
  // Debug logging
  console.log('[R2] getR2Client() called');
  console.log('[R2] R2_ACCESS_KEY from process.env:', process.env.R2_ACCESS_KEY ? 'SET (' + process.env.R2_ACCESS_KEY.substring(0, 8) + '...)' : 'NOT SET');
  console.log('[R2] R2_SECRET_KEY from process.env:', process.env.R2_SECRET_KEY ? 'SET (' + process.env.R2_SECRET_KEY.substring(0, 8) + '...)' : 'NOT SET');
  
  // If we previously checked and found missing config, re-check in case env vars are now loaded
  if (_r2Client === false && config.R2_ACCESS_KEY && config.R2_SECRET_KEY) {
    console.log('[R2] Re-initializing client - env vars now available');
    // Env vars are now available, initialize client
    _r2Client = null; // Reset to allow initialization
  }
  
  // Only initialize once if we have valid config
  if (_r2Client === null) {
    console.log('R2 configuration check:');
    console.log('R2_ENDPOINT_URL:', config.R2_ENDPOINT_URL ? 'SET' : 'NOT SET');
    console.log('R2_ACCESS_KEY:', config.R2_ACCESS_KEY ? 'SET' : 'NOT SET');
    console.log('R2_SECRET_KEY:', config.R2_SECRET_KEY ? 'SET' : 'NOT SET');
    console.log('R2_BUCKET:', config.R2_BUCKET);
    console.log('R2_PREFIX:', config.R2_PREFIX);

    if (!config.R2_ACCESS_KEY || !config.R2_SECRET_KEY) {
      console.error('R2 credentials not configured. R2 uploads will be disabled.');
      console.error('Set R2_ACCESS_KEY and R2_SECRET_KEY environment variables.');
      _r2Client = false; // Use false to indicate not configured
      return null;
    } else {
      console.log('[R2] Initializing S3Client with credentials');
      _r2Client = new S3Client({
        region: 'auto',
        endpoint: config.R2_ENDPOINT_URL,
        credentials: { accessKeyId: config.R2_ACCESS_KEY, secretAccessKey: config.R2_SECRET_KEY },
        forcePathStyle: true
      });
      console.log('[R2] S3Client initialized successfully');
    }
  }
  return _r2Client === false ? null : _r2Client;
}

// Export r2Client as null initially - it will be initialized lazily when functions are called
// This prevents evaluation at module load time (before dotenv.config() runs)
export const r2Client = null;

function slog(msg){
  console.log('[r2]', msg);
}

async function r2UploadInternal(localPath){
  const config = getR2Config();
  const base = path.basename(localPath);
  const key  = `${config.R2_PREFIX}uploads/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${base}`;
  slog(`put start ${localPath} → ${config.R2_BUCKET}/${key}`);
  
  const client = getR2Client();
  if (!client) {
    throw new Error('R2 client not configured. Missing R2_ACCESS_KEY or R2_SECRET_KEY environment variables.');
  }
  
  try {
    const body = fs.createReadStream(localPath);
    const contentType = guessMime(localPath);
    
    body.on('error', (err) => {
      slog(`stream error ${err.message}`);
    });
    
    await client.send(new PutObjectCommand({
      Bucket: config.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType
    }));
    
    const command = new GetObjectCommand({
      Bucket: config.R2_BUCKET,
      Key: key
    });
    
    const signedUrl = await getSignedUrl(client, command, { 
      expiresIn: 3600,
      signableHeaders: new Set(['host']),
      unsignableHeaders: new Set(['host'])
    }).catch ((signError) => {
      slog(`sign error ${signError.message}`);
      return `${config.R2_ENDPOINT_URL}/${config.R2_BUCKET}/${key}`;
    });
    
    slog(`put ok ${signedUrl}`);
    return signedUrl;
  } catch (error) {
    slog(`put error ${error.message}`);
    if (error.message && error.message.includes('EPIPE')) {
      throw new Error('Upload connection lost. Please try again.');
    }
    if (error.message && error.message.includes('Expected closing tag')) {
      slog(`HTML parsing error - likely invalid response format: ${error.message}`);
      throw new Error('R2 service error. Please check your R2 configuration and try again.');
    }
    throw error;
  }
}

export async function r2Upload(localPath){
  // Always call getR2Client() to ensure env vars are checked
  const client = getR2Client();
  if (!client) {
    throw new Error('R2 client not configured. Missing R2_ACCESS_KEY or R2_SECRET_KEY environment variables.');
  }
  if (!(await safeExists(localPath))) throw new Error('file not found: ' + localPath);
  
  const timeoutMs = 300000;
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('R2 upload timeout')), timeoutMs)
  );
  
  try {
    return await Promise.race([
      r2UploadInternal(localPath),
      timeoutPromise
    ]);
  } catch (e) {
    try { tlog('r2Upload:error', e && e.message ? e.message : String(e)); } catch (_){}
    if (e.message && e.message.includes('EPIPE')) {
      throw new Error('Upload connection lost. Please try again.');
    }
    throw e;
  }
}
