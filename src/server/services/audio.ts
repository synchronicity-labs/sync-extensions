import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { tlog } from '../utils/log';

// Helper functions for reading binary data
function readUInt32BE(buf, off) { return buf.readUInt32BE(off); }
function readUInt16BE(buf, off) { return buf.readUInt16BE(off); }

function readFloat80BE(buf, off) {
  // Reads 80-bit extended float (big-endian) → JS Number (approximate)
  const b0 = buf[off];
  const b1 = buf[off+1];
  const sign = (b0 & 0x80) ? -1 : 1;
  const exp = ((b0 & 0x7F) << 8) | b1;
  const hi = buf.readUInt32BE(off+2);
  const lo = buf.readUInt32BE(off+6);
  if (exp === 0 && hi === 0 && lo === 0) return 0;
  if (exp === 0x7FFF) return sign * Infinity;
  // Mantissa is 1.integer(63 bits)
  const mantissa = (hi * Math.pow(2, 32)) + lo;
  const frac = mantissa / Math.pow(2, 63);
  return sign * frac * Math.pow(2, exp - 16383);
}

function parseAiffHeader(fd) {
  // Returns metadata and SSND data position
  const head = Buffer.alloc(12);
  fs.readSync(fd, head, 0, 12, 0);
  if (head.toString('ascii', 0, 4) !== 'FORM') throw new Error('Not an AIFF file');
  const formType = Buffer.alloc(4);
  fs.readSync(fd, formType, 0, 4, 8);
  const isAIFC = formType.toString('ascii') === 'AIFC';
  if (!(isAIFC || formType.toString('ascii') === 'AIFF')) throw new Error('Unsupported AIFF FORM');

  let pos = 12;
  let numChannels = 0, numFrames = 0, sampleSize = 0, sampleRate = 0;
  let compressionType = 'NONE';
  let ssndOffset = -1, ssndDataStart = -1, ssndDataSize = 0;

  const stat = fs.fstatSync(fd);
  const fileSize = stat.size;
  while (pos + 8 <= fileSize) {
    const hdr = Buffer.alloc(8);
    fs.readSync(fd, hdr, 0, 8, pos);
    const ckId = hdr.toString('ascii', 0, 4);
    const ckSize = readUInt32BE(hdr, 4);
    const ckStart = pos + 8;

    if (ckId === 'COMM') {
      const comm = Buffer.alloc(Math.min(ckSize, 64));
      fs.readSync(fd, comm, 0, comm.length, ckStart);
      numChannels = readUInt16BE(comm, 0);
      numFrames = readUInt32BE(comm, 2);
      sampleSize = readUInt16BE(comm, 6);
      sampleRate = readFloat80BE(comm, 8);
      if (isAIFC && ckSize >= 22) {
        const cTypeBuf = Buffer.alloc(4);
        fs.readSync(fd, cTypeBuf, 0, 4, ckStart + 18);
        compressionType = cTypeBuf.toString('ascii');
      }
    } else if (ckId === 'SSND') {
      const ssndHdr = Buffer.alloc(8);
      fs.readSync(fd, ssndHdr, 0, 8, ckStart);
      const offset = readUInt32BE(ssndHdr, 0);
      ssndOffset = offset;
      ssndDataStart = ckStart + 8 + offset;
      ssndDataSize = ckSize - 8 - offset;
    }

    pos = ckStart + ckSize + (ckSize % 2);
    if (numChannels && numFrames && sampleSize && ssndDataStart !== -1) break;
  }

  if (numChannels <= 0 || numFrames <= 0 || sampleSize <= 0 || ssndDataStart < 0)
    throw new Error('AIFF missing required chunks');

  if (!isFinite(sampleRate) || sampleRate < 800 || sampleRate > 768000) {
    sampleRate = 48000;
  }

  const bytesPerSample = Math.ceil(sampleSize / 8);
  const pcmBytes = numFrames * numChannels * bytesPerSample;
  let dataBytes = ssndDataSize > 0 ? ssndDataSize : pcmBytes;
  if (!isFinite(dataBytes) || dataBytes <= 0) dataBytes = pcmBytes;
  dataBytes = Math.min(dataBytes, Math.max(0, (fileSize - ssndDataStart)));
  const meta = { isAIFC, compressionType, numChannels, numFrames, sampleSize, sampleRate, bytesPerSample, dataBytes, ssndDataStart };
  tlog('[audio] parseAiffHeader', JSON.stringify(meta));
  return meta;
}

function writeWavHeader(fd, meta) {
  const { numChannels, sampleRate, sampleSize, dataBytes } = meta;
  const blockAlign = Math.ceil(sampleSize/8) * numChannels;
  const byteRate = sampleRate * blockAlign;
  const riffSize = 36 + dataBytes;
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0, 4, 'ascii');
  buf.writeUInt32LE(riffSize, 4);
  buf.write('WAVE', 8, 4, 'ascii');
  buf.write('fmt ', 12, 4, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(Math.round(sampleRate), 24);
  buf.writeUInt32LE(Math.round(byteRate), 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(sampleSize, 34);
  buf.write('data', 36, 4, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  fs.writeSync(fd, buf, 0, 44);
}

function swapEndianInPlace(buf, bytesPerSample) {
  if (bytesPerSample === 1) return buf;
  const out = Buffer.allocUnsafe(buf.length);
  if (bytesPerSample === 2) {
    for (let i=0; i<buf.length; i+=2) { out[i] = buf[i+1]; out[i+1] = buf[i]; }
  } else if (bytesPerSample === 3) {
    for (let i=0; i<buf.length; i+=3) { out[i] = buf[i+2]; out[i+1] = buf[i+1]; out[i+2] = buf[i]; }
  } else if (bytesPerSample === 4) {
    for (let i=0; i<buf.length; i+=4) { out[i] = buf[i+3]; out[i+1] = buf[i+2]; out[i+2] = buf[i+1]; out[i+3] = buf[i]; }
  } else {
    buf.copy(out);
  }
  return out;
}

function pcmToInt16Array(buf, bytesPerSample) {
  if (bytesPerSample === 1) {
    const out = new Int16Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
      out[i] = (buf[i] - 128) * 256;
    }
    return out;
  } else if (bytesPerSample === 2) {
    return new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
  } else {
    throw new Error('Unsupported sample size: ' + bytesPerSample);
  }
}

export async function convertAiffToWav(srcPath, destPath) {
  tlog('[audio] convertAiffToWav start', srcPath, '->', destPath||'(auto)');
  const fd = fs.openSync(srcPath, 'r');
  try {
    const meta = parseAiffHeader(fd);
    if (!(meta.compressionType === 'NONE' || meta.compressionType === 'sowt')) {
      throw new Error('Unsupported AIFF compression: ' + meta.compressionType);
    }
    // Generate simple filename to avoid path length issues
    const out = destPath || (() => {
      const dir = path.dirname(srcPath);
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000);
      return path.join(dir, `convert_${timestamp}_${random}.wav`);
    })();
    const ofd = fs.openSync(out, 'w');
    try {
      writeWavHeader(ofd, meta);
      const chunkSize = 64 * 1024;
      const bytesPerSample = meta.bytesPerSample;
      let remaining = meta.dataBytes;
      let pos = meta.ssndDataStart;
      let leftover = Buffer.alloc(0);
      let totalWritten = 0;
      while (remaining > 0) {
        const toRead = Math.min(remaining, chunkSize);
        const buf = Buffer.alloc(toRead);
        const n = fs.readSync(fd, buf, 0, toRead, pos);
        if (!n) break;
        pos += n; remaining -= n;
        let work = buf.slice(0, n);
        if (leftover.length) {
          work = Buffer.concat([leftover, work]);
          leftover = Buffer.alloc(0);
        }
        const aligned = Math.floor(work.length / bytesPerSample) * bytesPerSample;
        const body = work.slice(0, aligned);
        leftover = work.slice(aligned);
        const payload = (meta.compressionType === 'NONE') ? swapEndianInPlace(body, bytesPerSample) : body;
        if (payload.length) { fs.writeSync(ofd, payload); totalWritten += payload.length; }
      }
      try { const sz = fs.statSync(out).size; tlog('[audio] convertAiffToWav done bytesWritten=', totalWritten, 'fileSize=', sz); } catch (_) {}
    } finally { fs.closeSync(ofd); }
    return out;
  } finally { fs.closeSync(fd); }
}

export async function convertAiffToMp3(srcPath, destPath) {
  tlog('[audio] convertAiffToMp3 start', srcPath, '->', destPath||'(auto)');
  // Generate simple filename to avoid path length issues
  const finalPath = destPath || (() => {
    const dir = path.dirname(srcPath);
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return path.join(dir, `convert_${timestamp}_${random}.mp3`);
  })();
  
  return new Promise((resolve, reject) => {
    ffmpeg(srcPath)
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .audioFrequency(44100)
      .output(finalPath)
      .on('start', (cmdline) => {
        tlog('[audio] FFmpeg command:', cmdline);
      })
      .on('end', () => {
        tlog('[audio] FFmpeg AIFF to MP3 conversion successful');
        resolve(finalPath);
      })
      .on('error', (err) => {
        tlog('[audio] FFmpeg error:', err.message);
        reject(err);
      })
      .run();
  });
}

export async function convertWavToMp3(srcPath, destPath) {
  tlog('[audio] convertWavToMp3 start', srcPath, '->', destPath||'(auto)');
  const finalPath = destPath || srcPath.replace(/\.[^.]+$/, '.mp3');
  
  return new Promise((resolve, reject) => {
    ffmpeg(srcPath)
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .audioFrequency(44100)
      .output(finalPath)
      .on('start', (cmdline) => {
        tlog('[audio] FFmpeg command:', cmdline);
      })
      .on('end', () => {
        tlog('[audio] FFmpeg WAV to MP3 conversion successful');
        resolve(finalPath);
      })
      .on('error', (err) => {
        tlog('[audio] FFmpeg error:', err.message);
        reject(err);
      })
      .run();
  });
}

// Convert WebM audio to MP3
export async function convertWebmToMp3(srcPath, destPath) {
  tlog('[audio] convertWebmToMp3 start', srcPath, '->', destPath || '(auto)');
  const finalPath = destPath || srcPath.replace(/\.webm$/i, '.mp3');
  
  return new Promise((resolve, reject) => {
    ffmpeg(srcPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .audioFrequency(44100)
      .output(finalPath)
      .on('start', (cmdline) => {
        tlog('[audio] FFmpeg command:', cmdline);
      })
      .on('end', () => {
        tlog('[audio] FFmpeg WebM to MP3 conversion successful');
        resolve(finalPath);
      })
      .on('error', (err) => {
        tlog('[audio] FFmpeg error:', err.message);
        reject(err);
      })
      .run();
  });
}

// Convert WebM audio to WAV
export async function convertWebmToWav(srcPath, destPath) {
  tlog('[audio] convertWebmToWav start', srcPath, '->', destPath || '(auto)');
  const finalPath = destPath || srcPath.replace(/\.webm$/i, '.wav');
  
  return new Promise((resolve, reject) => {
    ffmpeg(srcPath)
      .noVideo()
      .audioCodec('pcm_s16le')
      .audioFrequency(44100)
      .audioChannels(1)
      .output(finalPath)
      .on('start', (cmdline) => {
        tlog('[audio] FFmpeg command:', cmdline);
      })
      .on('end', () => {
        tlog('[audio] FFmpeg WebM to WAV conversion successful');
        resolve(finalPath);
      })
      .on('error', (err) => {
        tlog('[audio] FFmpeg error:', err.message);
        reject(err);
      })
      .run();
  });
}

export async function convertAudio(srcPath, format) {
  const ext = String(format||'').toLowerCase();
  const srcExt = path.extname(srcPath).toLowerCase();
  
  if (ext === 'wav') {
    if (srcExt === '.aiff' || srcExt === '.aif') {
      return await convertAiffToWav(srcPath);
    } else if (srcExt === '.wav') {
      return srcPath;
    } else if (srcExt === '.webm') {
      return await convertWebmToWav(srcPath, null);
    } else {
      throw new Error('Cannot convert ' + srcExt + ' to WAV');
    }
  }
  
  if (ext === 'mp3') {
    if (srcExt === '.aiff' || srcExt === '.aif') {
      return await convertAiffToMp3(srcPath, null);
    } else if (srcExt === '.wav') {
      return await convertWavToMp3(srcPath, null);
    } else if (srcExt === '.webm') {
      return await convertWebmToMp3(srcPath, null);
    } else {
      throw new Error('Cannot convert ' + srcExt + ' to MP3');
    }
  }
  
  throw new Error('Unsupported target format: ' + format);
}

