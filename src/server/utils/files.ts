import fs from 'fs';
import { Readable } from 'stream';

export async function safeStat(p: string): Promise<fs.Stats | null> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('File stat timeout')), 5000)
    );
    return await Promise.race([
      fs.promises.stat(p),
      timeoutPromise
    ]);
  } catch (_) {
    return null;
  }
}

export function safeStatSync(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch (_) {
    return null;
  }
}

export async function safeExists(p: string): Promise<boolean> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('File exists timeout')), 5000)
    );
    await Promise.race([
      fs.promises.access(p),
      timeoutPromise
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function safeText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch (_) {
    return '';
  }
}

export function pipeToFile(stream: Readable, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(dest);
    stream.pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
    stream.on('error', reject);
  });
}

