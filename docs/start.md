# Getting Started Guide

Welcome to sync. extensions! This guide will help you get started with lipsync generation in Adobe Premiere Pro, After Effects, and DaVinci Resolve.

## Installation

### Adobe Applications (Premiere Pro & After Effects)

1. Download the latest release from [GitHub Releases](https://github.com/your-org/sync-extensions/releases)
2. Install the ZXP file using [ZXP Installer](https://aescripts.com/learn/zxp-installer/)
3. Restart Premiere Pro or After Effects
4. Find the extension in **Window > Extensions > sync.**

### DaVinci Resolve

1. Download the latest release from [GitHub Releases](https://github.com/your-org/sync-extensions/releases)
2. Extract the `sync-resolve-plugin-*.zip` file
3. Copy the `sync.resolve` folder to:
   - **macOS**: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/`
   - **Windows**: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\`
4. Restart DaVinci Resolve
5. Find the plugin in **Workspace > Workflow Integration > sync.**

## First-Time Setup

### 1. Get Your API Key

1. Sign up at [sync.](https://sync.media) (or your API provider)
2. Navigate to your account settings
3. Copy your API key
4. Keep it secure - you'll need it for processing

### 2. Configure Settings

1. Open the sync. extension
2. Go to the **Settings** tab
3. Paste your API key in the "sync. api key" field
4. Choose your preferred settings:
   - **Model**: Select lipsync model (default: Lipsync 2 Pro)
   - **Temperature**: Control generation creativity (0.0-1.0)
   - **Sync Mode**: Choose synchronization method
   - **Render Format**: Select video/audio output formats
   - **Save Location**: Choose where to save completed jobs

### 3. Verify Connection

1. After entering your API key, you should see a checkmark
2. The extension will verify your key automatically
3. If you see an error, check:
   - API key is correct
   - Internet connection is active
   - API service is available

## Basic Workflow

### Step 1: Select Your Media

**Option A: Upload Files**
1. Go to **Sources** tab
2. Click **Upload Video** or **Upload Audio**
3. Select files from your computer
4. Wait for upload to complete

**Option B: Use Timeline Export**
1. Set in/out points on your timeline
2. Click **Export In/Out Video** or **Export In/Out Audio**
3. Extension exports range automatically
4. File is ready for processing

**Option C: Enter URL**
1. Click **Enter URL** button
2. Paste direct link to video/audio file
3. Extension loads file from URL
4. Ready for processing

### Step 2: Configure Generation

1. Select your **Model** from the dropdown
2. Adjust **Temperature** if needed (optional)
3. Choose **Sync Mode** (optional)
4. Review your video and audio selections

### Step 3: Generate Lipsync

1. Click the **Lipsync** button at the bottom
2. Extension uploads files and starts processing
3. Monitor progress in the **History** tab
4. Wait for generation to complete

### Step 4: Use Your Result

**Save to Project:**
1. Click **Save** on completed job
2. File downloads to your project folder
3. Use in your timeline as needed

**Insert into Timeline:**
1. Position playhead where you want clip
2. Click **Insert** on completed job
3. Clip is inserted automatically
4. Ready to use immediately

## Understanding the Interface

### Sources Tab
- Upload or select video and audio files
- Export from timeline using in/out points
- Enter URLs for remote files
- View selected media previews

### History Tab
- View all your generations
- See job status and progress
- Access completed jobs
- Save, insert, or copy links

### Settings Tab
- Configure API keys
- Adjust generation settings
- Choose render formats
- Set save locations

## Common Tasks

### Processing Existing Footage

1. Upload your video file
2. Upload or record new audio
3. Click Lipsync
4. Wait for completion
5. Save or insert result

### Replacing Dialogue

1. Set in/out points around dialogue
2. Export video from timeline
3. Record or upload new audio
4. Generate lipsync
5. Insert result back into timeline

### Batch Processing

1. Process first clip
2. Save completed job
3. Move to next clip
4. Repeat process
5. All jobs saved in History tab

## Tips for Best Results

1. **Clear Audio**: Use clean, high-quality audio for best results
2. **Good Video Quality**: Higher resolution video produces better output
3. **Proper Lighting**: Well-lit faces improve detection accuracy
4. **Face Visibility**: Ensure faces are clearly visible in frame
5. **Stable Footage**: Less camera movement improves tracking
6. **Appropriate Model**: Choose model based on your needs
   - **Lipsync 2 Pro**: Best quality, slower processing
   - **Lipsync 2**: Good balance of speed and quality
   - **Lipsync 1.9**: Faster processing, good for quick tests

## Troubleshooting

### Extension Won't Load
- Restart your host application
- Check installation was successful
- Verify extension permissions

### API Key Not Working
- Check key is correct (no extra spaces)
- Verify internet connection
- Check API service status
- Try regenerating key

### Generation Fails
- Check file formats are supported
- Verify file sizes aren't too large
- Ensure stable internet connection
- Check error message for details

### Files Won't Upload
- Check file size limits
- Verify file formats (MP4, MOV for video; MP3, WAV for audio)
- Ensure stable internet connection
- Try smaller files first

### Insert/Save Not Working
- Ensure timeline/sequence is open
- Check project is saved (for project folder saves)
- Verify write permissions
- Check job is completed (not processing)

## Getting Help

### Debug Logs
Enable debug logging to troubleshoot issues:
- See [Debug Guide](./debug.md) for instructions
- Logs help identify problems
- Share logs with support if needed

### Support Resources
- Check documentation in `/docs` folder
- Review error messages carefully
- Enable debug logs for detailed information
- Contact support with job IDs for specific issues

## Next Steps

- Learn about [Saving and Inserting Jobs](./save-insert.md)
- Understand [Using In/Out Points](./use-in-out.md)
- Read [Debug Guide](./debug.md) for troubleshooting
- Explore advanced settings and features

## Quick Reference

**Keyboard Shortcuts:**
- **I**: Set in point (Premiere/Resolve)
- **O**: Set out point (Premiere/Resolve)
- **B**: Set work area start (After Effects)
- **N**: Set work area end (After Effects)

**Supported Formats:**
- **Video**: MP4, MOV
- **Audio**: MP3, WAV

**File Size Limits:**
- Video: Up to 1GB
- Audio: Up to 1GB

**Save Locations:**
- Project folder (requires saved project)
- Documents folder (`~/Documents/sync. outputs/`)

