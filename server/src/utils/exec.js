import { exec as _exec, spawn } from 'child_process';
import { promisify } from 'util';
import { tlog } from './log.js';
import fs from 'fs';

export const exec = promisify(_exec);

export function execPowerShell(command, options = {}) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command];
      console.log('Spawning PowerShell with args:', args);
      console.log('Working directory:', options.cwd || process.cwd());
      
      const child = spawn('powershell.exe', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log('PowerShell stdout:', output.trim());
      });
      
      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.log('PowerShell stderr:', output.trim());
      });
      
      child.on('close', (code) => {
        console.log(`PowerShell process exited with code: ${code}`);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`PowerShell exited with code ${code}: ${stderr}`));
        }
      });
      
      child.on('error', (error) => {
        console.error('PowerShell spawn error:', error);
        reject(error);
      });
    } else {
      exec(command, options).then(resolve).catch (reject);
    }
  });
}

export async function runRobocopy(src, dest, filePattern){
  if (process.platform !== 'win32') { throw new Error('runRobocopy is Windows-only'); }
  try { if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true }); } catch (e){ try { tlog("silent catch:", e.message); } catch (_){} }
  const args = [`"${src}"`, `"${dest}"`];
  if (filePattern) args.push(`"${filePattern}"`);
  const baseCmd = `robocopy ${args.join(' ')} /E /NFL /NDL /NJH /NJS`;
  const psCmd = `$ErrorActionPreference='Stop'; ${baseCmd}; if ($LASTEXITCODE -lt 8) { exit 0 } else { exit $LASTEXITCODE }`;
  try { tlog('robocopy start', baseCmd); } catch (e){ try { tlog("silent catch:", e.message); } catch (_){} }
  await execPowerShell(psCmd);
  try { tlog('robocopy ok', baseCmd); } catch (e){ try { tlog("silent catch:", e.message); } catch (_){} }
}

