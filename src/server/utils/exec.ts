import { exec as _exec, spawn } from 'child_process';
import { promisify } from 'util';
import { tlog } from './log';
import fs from 'fs';

export const exec = promisify(_exec);

export function execPowerShell(command: string, options: { cwd?: string } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command];
      try { tlog('Spawning PowerShell with args:', args); } catch (_) {}
      try { tlog('Working directory:', options.cwd || process.cwd()); } catch (_) {}

      const child = spawn('powershell.exe', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        try { tlog('PowerShell stdout:', output.trim()); } catch (_) {}
      });

      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        try { tlog('PowerShell stderr:', output.trim()); } catch (_) {}
      });

      child.on('close', (code) => {
        try { tlog(`PowerShell process exited with code: ${code}`); } catch (_) {}
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`PowerShell exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        try { tlog('PowerShell spawn error:', error); } catch (_) {}
        reject(error);
      });
    } else {
      exec(command, options).then(resolve).catch(reject);
    }
  });
}

export async function runRobocopy(src: string, dest: string, filePattern?: string): Promise<void> {
  if (process.platform !== 'win32') { throw new Error('runRobocopy is Windows-only'); }
  try { if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true }); } catch (_) {}
  const args = [`"${src}"`, `"${dest}"`];
  if (filePattern) args.push(`"${filePattern}"`);
  const baseCmd = `robocopy ${args.join(' ')} /E /NFL /NDL /NJH /NJS`;
  const psCmd = `$ErrorActionPreference='Stop'; ${baseCmd}; if ($LASTEXITCODE -lt 8) { exit 0 } else { exit $LASTEXITCODE }`;
  try { tlog('robocopy start', baseCmd); } catch (_) {}
  await execPowerShell(psCmd);
  try { tlog('robocopy ok', baseCmd); } catch (_) {}
}

