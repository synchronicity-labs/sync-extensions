# Saving and Inserting Jobs

After your lipsync generation completes, you have two options for using the result: **Save** and **Insert**. This guide explains the difference and when to use each.

## Save vs Insert

### Save
- **Downloads** the completed file to your computer
- **Imports** the file into your project's media bin (if supported)
- Does **not** automatically place it in your timeline
- Best for: Archiving, batch processing, or when you want manual control

### Insert
- **Downloads** the completed file to your computer
- **Automatically inserts** the clip at the playhead position in your timeline
- **Overwrites** existing clips at that position (in Premiere Pro)
- Best for: Quick workflow when you want immediate placement

## Save Functionality

### How It Works

1. Click **Save** on a completed job in the History tab
2. The extension downloads the file to your chosen save location:
   - **Project folder**: Saves to your project's directory (requires saved project)
   - **Documents folder**: Saves to `~/Documents/sync. outputs/` (universal location)
3. The file is automatically imported into your project's media bin (if supported)
4. You can then manually drag the clip into your timeline

### Save Locations

**Project Folder** (default):
- Requires your project to be saved
- File is saved alongside your project files
- Automatically imports to a "sync. outputs" bin in your project
- Best for keeping outputs organized with your project

**Documents Folder**:
- Always available, doesn't require saved project
- Saves to `~/Documents/sync. outputs/` (macOS) or `%USERPROFILE%\Documents\sync. outputs\` (Windows)
- Still imports to project bin if possible
- Best for universal access or when project isn't saved

### Requirements for Save

- ✅ Completed job (status: "completed")
- ✅ Active project/timeline (for project folder saves)
- ✅ Write permissions to save location
- ⚠️ Project must be saved (for project folder option)

### Troubleshooting Save

**"Could not resolve project folder"**
- Ensure your project is saved
- Try switching to Documents folder in Settings
- Check that you have write permissions

**"Failed to save"**
- Check internet connection
- Verify job is completed (not processing)
- Check available disk space
- Review error message for details

## Insert Functionality

### How It Works

1. Position your playhead where you want the clip inserted
2. Click **Insert** on a completed job in the History tab
3. The extension downloads the file (if not already local)
4. The clip is automatically inserted at the playhead position
5. In Premiere Pro, the clip overwrites existing content at that position

### Insert Behavior by Application

**Premiere Pro**:
- Inserts/overwrites at playhead position
- Uses targeted video track (if available)
- Creates/uses "sync. outputs" bin automatically
- Overwrites existing clips rather than ripple inserting

**After Effects**:
- Inserts at playhead position
- Adds to active composition
- Respects composition settings

**DaVinci Resolve**:
- Inserts at playhead position
- Adds to active timeline
- Respects timeline settings

### Requirements for Insert

- ✅ Completed job (status: "completed")
- ✅ Active sequence/timeline/composition
- ✅ Playhead positioned where you want the clip
- ✅ Write permissions for temporary download location

### Troubleshooting Insert

**"Insert failed"**
- Ensure you have an active sequence/timeline/composition
- Check that playhead is positioned correctly
- Verify job is completed (not processing)
- Check available disk space

**"No active sequence"**
- Open or create a sequence/timeline/composition
- Ensure the sequence is active (selected)
- Try again after opening sequence

**"File not found"**
- Job may still be processing - wait for completion
- Check internet connection
- Try saving the job first, then inserting

## Best Practices

### When to Use Save
- **Batch processing**: Process multiple clips and save them all
- **Archiving**: Keep outputs organized with your project
- **Manual placement**: You want full control over timeline placement
- **Project organization**: Keep files in project-specific locations

### When to Use Insert
- **Quick workflow**: You want immediate placement in timeline
- **Replacing dialogue**: You've processed a specific range and want it back in place
- **Single clip processing**: You're working on one clip at a time
- **Iterative workflow**: Process, insert, adjust, repeat

### Workflow Tips

1. **Set your save location** in Settings before starting
2. **Use Insert for quick iterations** - process, insert, review, adjust
3. **Use Save for batch work** - process multiple clips, save all, then place manually
4. **Check job status** - both Save and Insert require completed jobs
5. **Position playhead first** - for Insert, set playhead before clicking

## Keyboard Shortcuts

While not direct shortcuts for Save/Insert, these help with positioning:

**Premiere Pro / Resolve**:
- **I**: Set in point
- **O**: Set out point
- **Space**: Play/pause (to position playhead)

**After Effects**:
- **B**: Set work area start
- **N**: Set work area end
- **Space**: Play/pause

## File Management

### Where Files Are Stored

**Temporary downloads** (during Save/Insert):
- macOS: `~/Library/Application Support/sync. extensions/uploads/`
- Windows: `%APPDATA%\sync. extensions\uploads\`

**Final save locations**:
- Project folder: Your project's directory
- Documents folder: `~/Documents/sync. outputs/` (macOS) or `%USERPROFILE%\Documents\sync. outputs\` (Windows)

### Cleaning Up

- Temporary files in `uploads/` are cleaned automatically every 24 hours
- Saved files persist until manually deleted
- Project bin imports create references to saved files (don't delete originals)

## Advanced: Copy Output Link

You can also copy the output file URL/link:
- Click the copy icon next to a completed job
- Use the link to access the file directly
- Useful for sharing or external access

