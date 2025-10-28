import fs from 'fs';

export async function safeStat(p){ 
  try{ 
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('File stat timeout')), 5000)
    );
    return await Promise.race([
      fs.promises.stat(p),
      timeoutPromise
    ]);
  }catch(_){ 
    return null; 
  } 
}

export function safeStatSync(p){ try{ return fs.statSync(p); }catch(_){ return null; } }

export async function safeExists(p){
  try{
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('File exists timeout')), 5000)
    );
    await Promise.race([
      fs.promises.access(p),
      timeoutPromise
    ]);
    return true;
  }catch{
    return false;
  }
}

export async function safeText(resp){ try{ return await resp.text(); }catch(_){ return ''; } }

export function pipeToFile(stream, dest){
  return new Promise((resolve, reject)=>{
    const ws = fs.createWriteStream(dest);
    stream.pipe(ws);
    stream.on('error', reject);
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
}
