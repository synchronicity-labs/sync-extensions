# Using In/Out Points

The sync. extension can export video and audio directly from your timeline using in/out points. This allows you to process specific ranges without manually exporting files first.

## What Are In/Out Points?

In/out points mark the start and end of a range on your timeline. The extension exports only the content between these points, making it easy to process specific clips or dialogue segments.

## Setting In/Out Points

### Premiere Pro

**Keyboard Shortcuts:**
- **I**: Set in point at playhead position
- **O**: Set out point at playhead position
- **Option/Alt + I**: Clear in point
- **Option/Alt + O**: Clear out point
- **X**: Set in/out points around selected clip

**Manual Method:**
1. Position playhead where you want the range to start
2. Press **I** or right-click timeline > **Set In Point**
3. Position playhead where you want the range to end
4. Press **O** or right-click timeline > **Set Out Point**

### After Effects

**Keyboard Shortcuts:**
- **B**: Set work area start (in point)
- **N**: Set work area end (out point)
- **Double-click work area bar**: Set work area to composition duration

**Manual Method:**
1. Drag the work area bar handles in the timeline
2. Or position playhead and press **B** (start) or **N** (end)
3. The work area defines the export range

### DaVinci Resolve

**Keyboard Shortcuts:**
- **I**: Set in point at playhead position
- **O**: Set out point at playhead position
- **Option/Alt + I**: Clear in point
- **Option/Alt + O**: Clear out point

**Manual Method:**
1. Position playhead where you want the range to start
2. Press **I** or right-click timeline > **Mark In**
3. Position playhead where you want the range to end
4. Press **O** or right-click timeline > **Mark Out**

## Exporting from Timeline

### Export In/Out Video

1. **Set your in/out points** on the timeline (see above)
2. Go to **Sources** tab in the extension
3. Click **Export In/Out Video**
4. Wait for export to complete (progress shown in toast notification)
5. The exported video is automatically selected for processing

**Export Options:**
- **Codec**: H.264 (MP4) or ProRes (MOV)
- **Quality**: Matches timeline settings
- **Range**: Uses your in/out points (or entire timeline if not set)

### Export In/Out Audio

1. **Set your in/out points** on the timeline
2. Go to **Sources** tab in the extension
3. Click **Export In/Out Audio**
4. Wait for export to complete
5. The exported audio is automatically selected for processing

**Export Options:**
- **Format**: WAV (uncompressed) or MP3 (compressed)
- **Quality**: High-quality settings
- **Range**: Uses your in/out points (or entire timeline if not set)

## Use Cases

### Replacing Dialogue

1. Set in/out points around the dialogue you want to replace
2. Export video from timeline
3. Record or upload new audio
4. Generate lipsync
5. Insert result back into timeline at original position

### Processing Specific Clips

1. Set in/out points around the clip you want to process
2. Export video and/or audio
3. Process with lipsync
4. Save or insert result

### Batch Processing Multiple Ranges

1. Process first range (set in/out, export, process, save)
2. Move to next range
3. Repeat for each segment
4. All jobs saved in History tab

## Requirements

### For Export to Work

- ✅ Active sequence/timeline/composition
- ✅ In/out points set (or entire timeline will be exported)
- ✅ Content in timeline (video/audio tracks)
- ✅ Write permissions for temporary export location

### File Size Limits

- **Maximum export size**: 1GB
- If export exceeds limit, you'll see an error message
- **Solution**: Use shorter in/out points or lower quality settings

## Troubleshooting

### "No active sequence/timeline/composition"

**Premiere Pro / Resolve:**
- Ensure a sequence/timeline is open and active
- Create a new sequence if needed
- Select the sequence tab to make it active

**After Effects:**
- Ensure a composition is open and active
- Create a new composition if needed
- Select the composition tab

### "Export timeout"

- Export may be taking longer than expected
- Check that in/out points are reasonable (not entire timeline if very long)
- Try shorter range or lower quality settings
- Ensure sufficient disk space

### "File size exceeds 1GB limit"

- Your export is too large
- **Solutions:**
  - Use shorter in/out points
  - Export at lower quality/resolution
  - Split into multiple smaller exports

### "Preset not found" (Premiere Pro)

- Extension preset files may be missing
- Reinstall the extension
- Check that `.epr` files are present in extension directory

### Export Takes Too Long

- Large ranges take longer to export
- High-quality settings increase export time
- **Tips:**
  - Use shorter in/out points when possible
  - Lower resolution for faster exports
  - Export only what you need

## Best Practices

### Setting Accurate Ranges

1. **Use keyboard shortcuts** for precise positioning
2. **Zoom in** on timeline for accurate point placement
3. **Preview range** before exporting (play between in/out points)
4. **Include handles** - add a few frames before/after if needed

### Workflow Optimization

1. **Set in/out points first** before opening Sources tab
2. **Export video and audio separately** if you only need one
3. **Use shorter ranges** for faster processing
4. **Save exports** if you might need them again

### Quality Considerations

- **Video**: Higher resolution = better lipsync quality but larger files
- **Audio**: WAV is better quality, MP3 is smaller
- **Range length**: Shorter ranges process faster and cost less

## Export Locations

Exported files are temporarily stored in:
- macOS: `~/Library/Application Support/sync. extensions/uploads/`
- Windows: `%APPDATA%\sync. extensions\uploads\`

These files are automatically cleaned after 24 hours, but are available immediately for processing.

## Keyboard Reference

### Premiere Pro / Resolve
- **I**: Set in point
- **O**: Set out point
- **Option/Alt + I**: Clear in point
- **Option/Alt + O**: Clear out point
- **X**: Set in/out around selected clip
- **Space**: Play/pause (to position playhead)

### After Effects
- **B**: Set work area start (in point)
- **N**: Set work area end (out point)
- **Double-click work area**: Set to composition duration
- **Space**: Play/pause

## Advanced: Diagnostics

If exports aren't working, you can check diagnostics:
- The extension logs export attempts
- Check debug logs (see [Debug Guide](./debug.md))
- Verify in/out points are set correctly
- Ensure timeline has content in the range

## Tips

1. **Set points before exporting** - it's faster than setting them in the extension
2. **Use shorter ranges** - they process faster and cost less
3. **Export only what you need** - video-only or audio-only when possible
4. **Check file size** - very long ranges may exceed limits
5. **Preview first** - play the range to ensure it's correct before exporting

