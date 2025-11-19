#!/usr/bin/env node

/**
 * Development server launcher
 * Properly handles process cleanup and ensures ports are available
 */

import { spawn, ChildProcess, execSync } from 'child_process';

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

let childProcess: ChildProcess | null = null;
const currentPid = process.pid;

/**
 * Cleanup function for graceful shutdown
 */
function cleanup(): void {
  if (childProcess && !childProcess.killed) {
    childProcess.kill('SIGTERM');
    setTimeout(() => {
      if (childProcess && !childProcess.killed) {
        childProcess.kill('SIGKILL');
      }
      process.exit(0);
    }, 2000);
  } else {
    process.exit(0);
  }
}

interface KilledProcess {
  port: number;
  pid: number;
}

/**
 * Kill processes on specific ports (but not our own process)
 * Uses SIGKILL immediately and verifies cleanup
 */
async function killProcessesOnPorts(ports: number[]): Promise<KilledProcess[]> {
  const killed: KilledProcess[] = [];
  
  // First, kill all vite/concurrently processes globally
  try {
    execSync('pkill -9 -f "vite|concurrently.*dev" 2>/dev/null || true', { stdio: 'pipe' });
    await sleep(500);
  } catch (e) {
    // Ignore errors
  }
  
  // Then kill processes on specific ports
  for (const port of ports) {
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const pids = execSync(`lsof -ti:${port}`, { 
          encoding: 'utf8', 
          stdio: 'pipe',
          timeout: 1000 
        }).trim();
        
        if (!pids) {
          // Port is free, break
          break;
        }
        
        const pidList = pids.split('\n').filter(pid => {
          const pidNum = parseInt(pid);
          return pid && pidNum && pidNum !== currentPid;
        });
        
        if (pidList.length === 0) {
          // Only our process or no processes, break
          break;
        }
        
        for (const pid of pidList) {
          try {
            const pidNum = parseInt(pid);
            // Kill immediately with SIGKILL
            process.kill(pidNum, 'SIGKILL');
            killed.push({ port, pid: pidNum });
          } catch (e) {
            // Process might already be dead, ignore
          }
        }
        
        // Wait and verify
        await sleep(500);
        attempts++;
      } catch (e) {
        // No process on this port or lsof failed, break
        break;
      }
    }
  }
  
  // Final verification - if port still in use, try one more aggressive kill
  for (const port of ports) {
    try {
      const stillInUse = execSync(`lsof -ti:${port}`, { encoding: 'utf8', stdio: 'pipe' }).trim();
      if (stillInUse) {
        const pids = stillInUse.split('\n').filter(pid => {
          const pidNum = parseInt(pid);
          return pid && pidNum && pidNum !== currentPid;
        });
        for (const pid of pids) {
          try {
            execSync(`kill -9 ${pid} 2>/dev/null || true`, { stdio: 'pipe' });
          } catch (e) {
            // Ignore
          }
        }
        await sleep(300);
      }
    } catch (e) {
      // Port is free, good
    }
  }
  
  return killed;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  // Set up signal handlers
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  // Clean up existing processes on dev ports
  console.log('Checking for existing dev server processes...');
  const killed = await killProcessesOnPorts([3000, 3001]);
  
  if (killed.length > 0) {
    console.log(`✓ Cleaned up ${killed.length} existing process(es)`);
  }
  
  // Verify port 3001 - check if it's actually usable
  try {
    const port3001 = execSync(`lsof -ti:3001`, { encoding: 'utf8', stdio: 'pipe' }).trim();
    if (port3001) {
      const pids = port3001.split('\n').filter(pid => parseInt(pid) !== currentPid);
      if (pids.length > 0) {
        // Check if the process is a zombie (can't be killed)
        let isZombie = false;
        for (const pid of pids) {
          try {
            const state = execSync(`ps -p ${pid} -o state=`, { encoding: 'utf8', stdio: 'pipe' }).trim();
            if (state === 'Z' || state === 'U') {
              isZombie = true;
              console.log(`⚠️  Process ${pid} is a zombie (state: ${state}) - port may still be usable`);
            }
          } catch (e) {
            // Process might be gone, ignore
          }
        }
        
        // Check if port is actually responding
        let portResponding = false;
        try {
          const result = execSync(`nc -zv -w 1 localhost 3001 2>&1`, { encoding: 'utf8', stdio: 'pipe', timeout: 3000 });
          if (result.includes('succeeded') || result.includes('Connection to')) {
            portResponding = true;
          }
        } catch (e) {
          // Port not responding or nc failed - that's okay, means port might be reusable
          portResponding = false;
        }
        
        if (portResponding) {
          // Port is actively responding - cannot bind
          console.error('');
          console.error('❌ ERROR: Port 3001 is actively in use by process(es):', pids.join(', '));
          console.error('');
          for (const pid of pids) {
            try {
              const state = execSync(`ps -p ${pid} -o state=`, { encoding: 'utf8', stdio: 'pipe' }).trim();
              const etime = execSync(`ps -p ${pid} -o etime=`, { encoding: 'utf8', stdio: 'pipe' }).trim();
              console.error(`   Process ${pid}: state=${state}, running for ${etime}`);
            } catch (e) {
              // Ignore
            }
          }
          console.error('');
          console.error('These processes cannot be killed (zombie/uninterruptible state).');
          console.error('');
          console.error('SOLUTION: Restart your Mac to clear zombie processes.');
          console.error('   There is no workaround - the process is stuck in kernel state.');
          console.error('');
          console.error('The dev server will NOT start on a different port.');
          console.error('');
          process.exit(1);
        } else if (isZombie) {
          // Port not responding but process exists - might be a dead socket
          console.log(`⚠️  Port 3001 appears blocked by zombie process, but port is not responding.`);
          console.log(`   Attempting to start anyway (OS may allow socket reuse)...`);
          // Continue - let Vite try to bind
        } else {
          console.error('');
          console.error('❌ ERROR: Port 3001 is in use by process(es):', pids.join(', '));
          console.error('');
          process.exit(1);
        }
      }
    } else {
      console.log('✓ Port 3001 is available');
    }
  } catch (e) {
    // Port is free (lsof returned nothing), good
    console.log('✓ Port 3001 is available');
  }
  
  // Build the command string
  const command = 'npx concurrently -n vite,server,resolve -c blue,green,yellow --kill-others-on-fail --raw "vite" "npm run dev:server" "npm run dev:resolve-build"';
  
  // Spawn the dev server
  childProcess = spawn(command, [], {
    stdio: 'inherit',
    shell: true,
    detached: false
  });
  
  childProcess.on('exit', (code: number | null) => {
    process.exit(code || 0);
  });
  
  childProcess.on('error', (err: Error) => {
    console.error('Error starting dev server:', err);
    process.exit(1);
  });
  
  // Keep the process alive
  process.stdin.resume();
}

// Run main function
main().catch((err: Error) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

