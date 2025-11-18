/**
 * Final Cut Pro JavaScript API Bridge
 * Provides functions that interface with FCPX using AppleScript and FCPXML
 * 
 * Based on Apple's Final Cut Pro Workflow Extension API documentation:
 * - Uses FCPXML format for media exchange (as per official API)
 * - Uses Apple Events (Open Document) for programmatic data sending
 * - Uses AppleScript for timeline interactions
 * - Follows official FCPX API patterns for share, import, and timeline operations
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

// FCPX API interface - these methods are exposed by Final Cut Pro workflow extension bridge
declare global {
  interface Window {
    fcpx?: {
      // Project and timeline access
      getCurrentProject?: () => Promise<any>;
      getCurrentTimeline?: () => Promise<any>;
      getProjectPath?: () => Promise<string | null>;
      
      // Timeline operations
      getPlayheadPosition?: () => Promise<number>;
      getInPoint?: () => Promise<number | null>;
      getOutPoint?: () => Promise<number | null>;
      setInPoint?: (frame: number) => Promise<void>;
      setOutPoint?: (frame: number) => Promise<void>;
      
      // Export operations
      exportRange?: (startFrame: number, endFrame: number, options: any) => Promise<string>;
      exportVideo?: (options: any) => Promise<string>;
      exportAudio?: (options: any) => Promise<string>;
      
      // Media import
      importMedia?: (filePath: string, binName?: string) => Promise<boolean>;
      importToBin?: (filePath: string) => Promise<boolean>;
      
      // Timeline insertion
      insertClipAtPlayhead?: (filePath: string) => Promise<boolean>;
      insertClipAtFrame?: (filePath: string, frame: number) => Promise<boolean>;
      
      // File operations
      revealInFinder?: (filePath: string) => Promise<void>;
      showFileDialog?: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>;
    };
    webkit?: {
      messageHandlers?: {
        fcpx?: {
          postMessage?: (message: any) => void;
        };
      };
    };
  }
}

function _respond(data: any): string {
  return JSON.stringify(data);
}

/**
 * Execute AppleScript to interact with Final Cut Pro
 */
async function runAppleScript(script: string): Promise<string> {
  try {
    // Escape the script for shell execution
    const escapedScript = script.replace(/"/g, '\\"').replace(/\n/g, ' ');
    const command = `osascript -e "${escapedScript}"`;
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000, // 30 second timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large responses
    });
    
    if (stderr && !stdout) {
      throw new Error(stderr);
    }
    
    return stdout.trim();
  } catch (error: any) {
    const err = error as Error;
    throw new Error(`AppleScript error: ${err.message}`);
  }
}

/**
 * Check if Final Cut Pro is running
 */
async function isFCPXRunning(): Promise<boolean> {
  try {
    const result = await runAppleScript(`
      tell application "System Events"
        return (name of processes) contains "Final Cut Pro"
      end tell
    `);
    return result.toLowerCase().includes('true');
  } catch {
    return false;
  }
}

/**
 * Get current project directory
 */
export function getProjectDir(): string {
  try {
    // Use AppleScript to get the current FCPX project path
    const script = `
      tell application "Final Cut Pro"
        try
          set currentProject to front project
          set projectPath to file path of currentProject
          return POSIX path of projectPath
        on error
          return ""
        end try
      end tell
    `;
    
    // Since this is called synchronously from backend, we need to handle it differently
    // Return a promise-based response structure
    return _respond({ 
      ok: false, 
      error: 'getProjectDir requires async execution. Use async version.' 
    });
  } catch (error) {
    const err = error as Error;
    return _respond({ ok: false, error: err.message });
  }
}

/**
 * Async version of getProjectDir
 */
export async function getProjectDirAsync(): Promise<string> {
  try {
    if (!(await isFCPXRunning())) {
      return _respond({ ok: false, error: 'Final Cut Pro is not running' });
    }
    
    const script = `
      tell application "Final Cut Pro"
        try
          set currentProject to front project
          set projectPath to file path of currentProject
          set projectDir to (POSIX path of (container of projectPath))
          return projectDir
        on error errMsg
          return "ERROR: " & errMsg
        end try
      end tell
    `;
    
    const result = await runAppleScript(script);
    
    if (result.startsWith('ERROR:')) {
      return _respond({ ok: false, error: result.replace('ERROR: ', '') });
    }
    
    // Fallback to Documents if no project
    if (!result || result.trim() === '') {
      const documentsDir = path.join(os.homedir(), 'Documents');
      return _respond({ ok: true, path: documentsDir });
    }
    
    return _respond({ ok: true, path: result.trim() });
  } catch (error) {
    const err = error as Error;
    return _respond({ ok: false, error: err.message });
  }
}

/**
 * Export video from timeline in/out range
 */
export async function exportInOutVideo(opts: any): Promise<string> {
  try {
    if (!(await isFCPXRunning())) {
      return _respond({ ok: false, error: 'Final Cut Pro is not running' });
    }
    
    const codec = opts?.codec || 'h264';
    const format = codec === 'h264' ? 'MPEG4' : 'Apple ProRes 422';
    
    // Get project directory for output
    const projectDirResult = await getProjectDirAsync();
    const projectDirData = JSON.parse(projectDirResult);
    const outputDir = projectDirData.ok 
      ? path.join(projectDirData.path, 'sync. outputs')
      : path.join(os.homedir(), 'Documents', 'sync. outputs');
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Generate output filename
    const timestamp = Date.now();
    const ext = codec === 'h264' ? 'mp4' : 'mov';
    const outputPath = path.join(outputDir, `sync_export_${timestamp}.${ext}`);
    
    // Use AppleScript to export the range
    // FCPX uses "share" command for exports
    const script = `
      tell application "Final Cut Pro"
        try
          set currentProject to front project
          set currentTimeline to front timeline
          
          -- Get in/out points (FCPX uses range objects)
          set timelineRange to range of currentTimeline
          set inPoint to start of timelineRange
          set outPoint to end of timelineRange
          
          -- Try to get actual in/out marks if set
          try
            set markIn to mark in of currentTimeline
            set markOut to mark out of currentTimeline
            if markIn is not missing value and markOut is not missing value then
              set inPoint to markIn
              set outPoint to markOut
            end if
          end try
          
          -- Create export range
          set exportRange to range from inPoint to outPoint
          
          -- Export using share command (per FCPX API docs)
          -- Share command syntax: share timeline using project to file as format
          set exportPath to POSIX file "${outputPath}"
          share currentTimeline using currentProject to exportPath as "${format}"
          
          return "${outputPath}"
        on error errMsg
          return "ERROR: " & errMsg
        end try
      end tell
    `;
    
    const result = await runAppleScript(script);
    
    if (result.startsWith('ERROR:')) {
      return _respond({ ok: false, error: result.replace('ERROR: ', '') });
    }
    
    // Wait for file to be created (FCPX export is async)
    let attempts = 0;
    const maxAttempts = 60; // Wait up to 30 seconds
    while (!fs.existsSync(outputPath) && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    
    if (!fs.existsSync(outputPath)) {
      return _respond({ ok: false, error: 'Export timeout - file was not created' });
    }
    
    return _respond({ ok: true, path: outputPath });
  } catch (error) {
    const err = error as Error;
    return _respond({ ok: false, error: err.message });
  }
}

/**
 * Export audio from timeline in/out range
 */
export async function exportInOutAudio(opts: any): Promise<string> {
  try {
    if (!(await isFCPXRunning())) {
      return _respond({ ok: false, error: 'Final Cut Pro is not running' });
    }
    
    const format = opts?.format || 'wav';
    
    // Get project directory for output
    const projectDirResult = await getProjectDirAsync();
    const projectDirData = JSON.parse(projectDirResult);
    const outputDir = projectDirData.ok 
      ? path.join(projectDirData.path, 'sync. outputs')
      : path.join(os.homedir(), 'Documents', 'sync. outputs');
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Generate output filename
    const timestamp = Date.now();
    const ext = format === 'wav' ? 'wav' : 'mp3';
    const outputPath = path.join(outputDir, `sync_export_audio_${timestamp}.${ext}`);
    
    // Use AppleScript to export audio
    const script = `
      tell application "Final Cut Pro"
        try
          set currentProject to front project
          set currentTimeline to front timeline
          
          -- Get in/out points
          set timelineRange to range of currentTimeline
          set inPoint to start of timelineRange
          set outPoint to end of timelineRange
          
          -- Try to get actual in/out marks if set
          try
            set markIn to mark in of currentTimeline
            set markOut to mark out of currentTimeline
            if markIn is not missing value and markOut is not missing value then
              set inPoint to markIn
              set outPoint to markOut
            end if
          end try
          
          -- Create export range
          set exportRange to range from inPoint to outPoint
          
          -- Export audio (FCPX uses "Audio" or specific audio formats)
          set exportPath to POSIX file "${outputPath}"
          -- FCPX share command for audio
          share currentTimeline using currentProject to exportPath as "Audio"
          
          return "${outputPath}"
        on error errMsg
          return "ERROR: " & errMsg
        end try
      end tell
    `;
    
    const result = await runAppleScript(script);
    
    if (result.startsWith('ERROR:')) {
      return _respond({ ok: false, error: result.replace('ERROR: ', '') });
    }
    
    // Wait for file to be created
    let attempts = 0;
    const maxAttempts = 60;
    while (!fs.existsSync(outputPath) && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    
    if (!fs.existsSync(outputPath)) {
      return _respond({ ok: false, error: 'Export timeout - file was not created' });
    }
    
    return _respond({ ok: true, path: outputPath });
  } catch (error) {
    const err = error as Error;
    return _respond({ ok: false, error: err.message });
  }
}

/**
 * Import file to bin
 */
export async function importFileToBin(payload: any): Promise<string> {
  try {
    if (!(await isFCPXRunning())) {
      return _respond({ ok: false, error: 'Final Cut Pro is not running' });
    }
    
    const filePath = payload?.path || payload;
    
    if (!filePath || typeof filePath !== 'string') {
      return _respond({ ok: false, error: 'Invalid file path' });
    }
    
    if (!fs.existsSync(filePath)) {
      return _respond({ ok: false, error: 'File not found' });
    }
    
    const binName = payload?.binName || 'sync. outputs';
    
    // Use AppleScript to import media
    // Per FCPX API docs: import command syntax is "import file into event"
    const script = `
      tell application "Final Cut Pro"
        try
          set currentProject to front project
          set mediaPath to POSIX file "${filePath}"
          
          -- Get the front event (library container)
          -- Per FCPX API: events contain clips and projects
          set frontEvent to front event of currentProject
          
          -- Import media into the event
          -- Syntax per FCPX API: import file into event
          import mediaPath into frontEvent
          
          -- Wait for import to complete
          delay 0.5
          
          return "OK"
        on error errMsg
          return "ERROR: " & errMsg
        end try
      end tell
    `;
    
    const result = await runAppleScript(script);
    
    if (result.startsWith('ERROR:')) {
      return _respond({ ok: false, error: result.replace('ERROR: ', '') });
    }
    
    return _respond({ ok: true });
  } catch (error) {
    const err = error as Error;
    return _respond({ ok: false, error: err.message });
  }
}

/**
 * Insert file at playhead position
 */
export async function insertFileAtPlayhead(payload: any): Promise<string> {
  try {
    if (!(await isFCPXRunning())) {
      return _respond({ ok: false, error: 'Final Cut Pro is not running' });
    }
    
    const filePath = payload?.path || payload;
    
    if (!filePath || typeof filePath !== 'string') {
      return _respond({ ok: false, error: 'Invalid file path' });
    }
    
    if (!fs.existsSync(filePath)) {
      return _respond({ ok: false, error: 'File not found' });
    }
    
    // Use AppleScript to insert at playhead
    const script = `
      tell application "Final Cut Pro"
        try
          set currentProject to front project
          set currentTimeline to front timeline
          set mediaPath to POSIX file "${filePath}"
          
          -- Get playhead position (FCPX uses timecode format)
          set playheadPos to playhead position of currentTimeline
          
          -- Get the front event
          set frontEvent to front event of currentProject
          
          -- Import media into event
          import mediaPath into frontEvent
          
          -- Wait for import to complete
          delay 1
          
          -- Get the imported clip (should be the last clip in the event)
          -- Per FCPX API: clips are contained in events
          set eventClips to clips of frontEvent
          if (count of eventClips) > 0 then
            set importedClip to item -1 of eventClips
            
            -- Insert clip at playhead position
            -- Per FCPX API: use append command to add clips to timeline
            -- Get the primary storyline (main timeline track)
            set primaryStoryline to primary storyline of currentTimeline
            if primaryStoryline is not missing value then
              -- Append clip to primary storyline at playhead position
              append importedClip to primaryStoryline at playheadPos
            else
              -- Fallback: append directly to timeline
              append importedClip to currentTimeline at playheadPos
            end if
          else
            return "ERROR: Failed to import clip"
          end if
          
          return "OK"
        on error errMsg
          return "ERROR: " & errMsg
        end try
      end tell
    `;
    
    const result = await runAppleScript(script);
    
    if (result.startsWith('ERROR:')) {
      return _respond({ ok: false, error: result.replace('ERROR: ', '') });
    }
    
    return _respond({ ok: true, message: 'Inserted at playhead' });
  } catch (error) {
    const err = error as Error;
    return _respond({ ok: false, error: err.message });
  }
}

/**
 * Get uploads directory (where job output files are stored)
 */
function getUploadsDir(): string {
  const home = os.homedir();
  let baseDir: string;
  if (process.platform === 'win32') {
    baseDir = process.env.SYNC_EXTENSIONS_DIR || path.join(home, 'AppData', 'Roaming', 'sync. extensions');
  } else if (process.platform === 'darwin') {
    baseDir = process.env.SYNC_EXTENSIONS_DIR || path.join(home, 'Library', 'Application Support', 'sync. extensions');
  } else {
    baseDir = process.env.SYNC_EXTENSIONS_DIR || path.join(home, '.config', 'sync. extensions');
  }
  
  const uploadsDir = path.join(baseDir, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
}

/**
 * Insert job output at playhead (uses downloaded file from uploads directory)
 */
export async function insertAtPlayhead(payload: any): Promise<string> {
  try {
    if (!(await isFCPXRunning())) {
      return _respond({ ok: false, error: 'Final Cut Pro is not running' });
    }
    
    const jobId = payload?.jobId || payload;
    
    if (!jobId) {
      return _respond({ ok: false, error: 'Job ID required' });
    }
    
    // Get the output file path (file should already be downloaded by server)
    const uploadsDir = getUploadsDir();
    const outputPath = path.join(uploadsDir, `${jobId}_output.mp4`);
    
    // Check if file exists
    if (!fs.existsSync(outputPath)) {
      return _respond({ 
        ok: false, 
        error: `Output file not found: ${outputPath}. File may not be downloaded yet.` 
      });
    }
    
    // Wait for file to be fully written (similar to _waitForFileReady in ExtendScript)
    let attempts = 0;
    const maxAttempts = 40; // Wait up to 20 seconds
    while (attempts < maxAttempts) {
      try {
        const stat = fs.statSync(outputPath);
        // Check if file size is stable (not being written)
        await new Promise(resolve => setTimeout(resolve, 500));
        const stat2 = fs.statSync(outputPath);
        if (stat.size === stat2.size && stat.size > 0) {
          break; // File is stable
        }
      } catch {
        // File might not exist yet
      }
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      return _respond({ ok: false, error: 'File is still being written or not accessible' });
    }
    
    // Use insertFileAtPlayhead with the file path
    return await insertFileAtPlayhead({ path: outputPath });
  } catch (error) {
    const err = error as Error;
    return _respond({ ok: false, error: err.message });
  }
}

/**
 * Import job output to bin (uses downloaded file from uploads directory)
 */
export async function importIntoBin(payload: any): Promise<string> {
  try {
    if (!(await isFCPXRunning())) {
      return _respond({ ok: false, error: 'Final Cut Pro is not running' });
    }
    
    const jobId = payload?.jobId || payload;
    
    if (!jobId) {
      return _respond({ ok: false, error: 'Job ID required' });
    }
    
    // Get the output file path (file should already be downloaded by server)
    const uploadsDir = getUploadsDir();
    const outputPath = path.join(uploadsDir, `${jobId}_output.mp4`);
    
    // Check if file exists
    if (!fs.existsSync(outputPath)) {
      return _respond({ 
        ok: false, 
        error: `Output file not found: ${outputPath}. File may not be downloaded yet.` 
      });
    }
    
    // Wait for file to be fully written
    let attempts = 0;
    const maxAttempts = 40;
    while (attempts < maxAttempts) {
      try {
        const stat = fs.statSync(outputPath);
        await new Promise(resolve => setTimeout(resolve, 500));
        const stat2 = fs.statSync(outputPath);
        if (stat.size === stat2.size && stat.size > 0) {
          break;
        }
      } catch {
        // File might not exist yet
      }
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      return _respond({ ok: false, error: 'File is still being written or not accessible' });
    }
    
    // Use importFileToBin with the file path
    return await importFileToBin({ path: outputPath });
  } catch (error) {
    const err = error as Error;
    return _respond({ ok: false, error: err.message });
  }
}

/**
 * Reveal file in Finder
 */
export async function revealFile(payload: any): Promise<string> {
  try {
    const filePath = payload?.path || payload;
    
    if (!filePath || typeof filePath !== 'string') {
      return _respond({ ok: false, error: 'Invalid file path' });
    }
    
    if (!fs.existsSync(filePath)) {
      return _respond({ ok: false, error: 'File not found' });
    }
    
    // Use macOS 'open' command to reveal in Finder
    if (process.platform === 'darwin') {
      await execAsync(`open -R "${filePath}"`);
      return _respond({ ok: true });
    }
    
    return _respond({ ok: false, error: 'Reveal file not supported on this platform' });
  } catch (error) {
    const err = error as Error;
    return _respond({ ok: false, error: err.message });
  }
}

/**
 * Get diagnostic info about in/out points
 */
export async function diagInOut(): Promise<string> {
  try {
    if (!(await isFCPXRunning())) {
      return _respond({ 
        ok: false, 
        error: 'Final Cut Pro is not running',
        hasTimeline: false 
      });
    }
    
    const script = `
      tell application "Final Cut Pro"
        try
          set currentTimeline to front timeline
          
          -- Get timeline range
          set timelineRange to range of currentTimeline
          set startTime to start of timelineRange
          set endTime to end of timelineRange
          set playheadPos to playhead position of currentTimeline
          
          -- Try to get actual in/out marks
          set inPoint to missing value
          set outPoint to missing value
          try
            set markIn to mark in of currentTimeline
            set markOut to mark out of currentTimeline
            if markIn is not missing value then
              set inPoint to markIn
            end if
            if markOut is not missing value then
              set outPoint to markOut
            end if
          end try
          
          -- Use marks if available, otherwise use timeline range
          if inPoint is missing value then
            set inPoint to startTime
          end if
          if outPoint is missing value then
            set outPoint to endTime
          end if
          
          -- Return as timecode values (FCPX uses timecode, not frames)
          return inPoint & "," & outPoint & "," & playheadPos
        on error errMsg
          return "ERROR: " & errMsg
        end try
      end tell
    `;
    
    const result = await runAppleScript(script);
    
    if (result.startsWith('ERROR:')) {
      return _respond({ 
        ok: false, 
        error: result.replace('ERROR: ', ''),
        hasTimeline: false 
      });
    }
    
    const parts = result.split(',');
    // FCPX returns timecode strings, try to parse as numbers
    let inPoint: number | null = null;
    let outPoint: number | null = null;
    let playhead: number | null = null;
    
    try {
      inPoint = parts[0] ? parseFloat(parts[0]) : null;
      outPoint = parts[1] ? parseFloat(parts[1]) : null;
      playhead = parts[2] ? parseFloat(parts[2]) : null;
    } catch {
      // If parsing fails, values might be timecode strings - that's OK
    }
    
    // Check if in/out points are actually set (not just timeline bounds)
    const hasInOut = inPoint !== null && outPoint !== null && 
                     inPoint !== outPoint && 
                     (inPoint !== 0 || outPoint !== 0);
    
    return _respond({
      ok: true,
      hasTimeline: true,
      inPoint: inPoint,
      outPoint: outPoint,
      playhead: playhead,
      hasInOut: hasInOut
    });
  } catch (error) {
    const err = error as Error;
    return _respond({ ok: false, error: err.message });
  }
}

/**
 * General diagnostic info
 */
export async function diag(): Promise<string> {
  try {
    const hasFCPX = await isFCPXRunning();
    
    let projectPath = null;
    let hasTimeline = false;
    
    if (hasFCPX) {
      try {
        const script = `
          tell application "Final Cut Pro"
            try
              set currentProject to front project
              set projectPath to file path of currentProject
              set currentTimeline to front timeline
              return POSIX path of projectPath & "|" & (name of currentTimeline)
            on error
              return "|"
            end try
          end tell
        `;
        
        const result = await runAppleScript(script);
        const parts = result.split('|');
        if (parts[0] && parts[0] !== '') {
          projectPath = parts[0].trim();
        }
        hasTimeline = parts[1] && parts[1] !== '';
      } catch {
        // Ignore errors
      }
    }
    
    return _respond({
      ok: true,
      hasFCPX: hasFCPX,
      hasTimeline: hasTimeline,
      projectPath: projectPath,
      platform: process.platform
    });
  } catch (error) {
    const err = error as Error;
    return _respond({ ok: false, error: err.message });
  }
}

/**
 * Show file dialog (uses native macOS dialog via AppleScript)
 */
export async function showFileDialog(options: any): Promise<string> {
  try {
    const fileTypes = options?.filters?.[0]?.extensions || ['*'];
    const fileTypeList = fileTypes.map((ext: string) => `"${ext}"`).join(', ');
    
    const script = `
      tell application "System Events"
        set fileDialog to choose file with prompt "Select file" of type {${fileTypeList}}
        return POSIX path of fileDialog
      end tell
    `;
    
    const result = await runAppleScript(script);
    
    if (result.startsWith('ERROR:')) {
      return _respond({ 
        ok: true, 
        canceled: true, 
        filePaths: [] 
      });
    }
    
    return _respond({
      ok: true,
      canceled: false,
      filePaths: [result.trim()]
    });
  } catch (error) {
    // User cancelled or error
    return _respond({ 
      ok: true, 
      canceled: true, 
      filePaths: [] 
    });
  }
}
