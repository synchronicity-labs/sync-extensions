import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { guessMime } from '../utils/paths.js';
import { safeExists } from '../utils/files.js';
import { tlog } from '../utils/log.js';

const R2_ENDPOINT_URL = process.env.R2_ENDPOINT_URL || 'https://a0282f2dad0cdecf5de20e2219e77809.r2.cloudflarestorage.com';
const R2_ACCESS_KEY  = process.env.R2_ACCESS_KEY || '';
const R2_SECRET_KEY  = process.env.R2_SECRET_KEY || '';
const R2_BUCKET      = process.env.R2_BUCKET || 'service-based-business';
const R2_PREFIX      = process.env.R2_PREFIX || 'sync-extension/';

console.log('R2 configuration check:');
console.log('R2_ENDPOINT_URL:', R2_ENDPOINT_URL ? 'SET' : 'NOT SET');
console.log('R2_ACCESS_KEY:', R2_ACCESS_KEY ? 'SET' : 'NOT SET');
console.log('R2_SECRET_KEY:', R2_SECRET_KEY ? 'SET' : 'NOT SET');
console.log('R2_BUCKET:', R2_BUCKET);
console.log('R2_PREFIX:', R2_PREFIX);

if (!R2_ACCESS_KEY || !R2_SECRET_KEY) {
  console.error('R2 credentials not configured. R2 uploads will be disabled.');
  console.error('Set R2_ACCESS_KEY and R2_SECRET_KEY environment variables.');
}

export const r2Client = (R2_ACCESS_KEY && R2_SECRET_KEY) ? new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT_URL,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  forcePathStyle: true
}) : null;

function slog(msg){
  console.log('[r2]', msg);
}

async function r2UploadInternal(localPath){
  const base = path.basename(localPath);
  const key  = `${R2_PREFIX}uploads/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${base}`;
  slog(`put start ${localPath} → ${R2_BUCKET}/${key}`);
  
  try {
    const body = fs.createReadStream(localPath);
    const contentType = guessMime(localPath);
    
    body.on('error', (err) => {
      slog(`stream error ${err.message}`);
    });
    
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType
    }));
    
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key
    });
    
    const signedUrl = await getSignedUrl(r2Client, command, { 
      expiresIn: 3600,
      signableHeaders: new Set(['host']),
      unsignableHeaders: new Set(['host'])
    }).catch((signError) => {
      slog(`sign error ${signError.message}`);
      return `${R2_ENDPOINT_URL}/${R2_BUCKET}/${key}`;
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
  if (!r2Client) {
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
  } catch(e) {
    try { tlog('r2Upload:error', e && e.message ? e.message : String(e)); } catch(_){}
    if (e.message && e.message.includes('EPIPE')) {
      throw new Error('Upload connection lost. Please try again.');
    }
    throw e;
  }
}

