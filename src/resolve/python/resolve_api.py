#!/usr/bin/env python3
"""
DaVinci Resolve Python API Bridge
Provides functions that mirror ExtendScript functions but use Resolve Python API
"""

import sys
import json
import os
import subprocess
import platform
import time

# Try to import Resolve API
try:
    import DaVinciResolveScript as dvr_script
    resolve = dvr_script.scriptapp("Resolve")
except ImportError:
    resolve = None
except Exception as e:
    resolve = None
    print(f"Error importing Resolve API: {e}", file=sys.stderr)

def _respond(data):
    """Format response as JSON string"""
    return json.dumps(data)

def _get_project():
    """Get current Resolve project"""
    if not resolve:
        return None
    try:
        project_manager = resolve.GetProjectManager()
        if not project_manager:
            return None
        return project_manager.GetCurrentProject()
    except Exception as e:
        print(f"Error getting project: {e}", file=sys.stderr)
        return None

def _get_timeline():
    """Get current timeline"""
    project = _get_project()
    if not project:
        return None
    try:
        return project.GetCurrentTimeline()
    except:
        return None

def export_in_out_video(opts_json):
    """Export video from timeline in/out range"""
    try:
        opts = json.loads(opts_json) if isinstance(opts_json, str) else opts_json
        codec = opts.get('codec', 'h264')
        
        timeline = _get_timeline()
        if not timeline:
            return _respond({'ok': False, 'error': 'No active timeline'})
        
        # Get in/out points (use GetMarkIn/GetMarkOut if available, otherwise use timeline range)
        try:
            in_point = timeline.GetMarkIn()
            out_point = timeline.GetMarkOut()
            # If no marks set, use timeline range
            if in_point == -1 or out_point == -1:
                in_point = timeline.GetStartFrame()
                out_point = timeline.GetEndFrame()
        except:
            # Fallback to timeline range
            in_point = timeline.GetStartFrame()
            out_point = timeline.GetEndFrame()
        
        # Get project directory
        project = _get_project()
        if not project:
            return _respond({'ok': False, 'error': 'No active project'})
        
        project_dir = os.path.join(os.path.expanduser('~'), 'Documents', 'sync. outputs')
        os.makedirs(project_dir, exist_ok=True)
        
        # Generate output path with timestamp
        timestamp = int(time.time() * 1000)
        ext = 'mp4' if codec == 'h264' else 'mov'
        output_path = os.path.join(project_dir, f'sync_export_{timestamp}.{ext}')
        
        # Export using Resolve render API
        try:
            # Get current render settings (returns a dict)
            render_settings = project.GetRenderSettings()
            if not isinstance(render_settings, dict):
                render_settings = {}
            
            # Update render settings for export
            # Get timeline resolution and frame rate
            try:
                width = timeline.GetSetting('timelineResolutionWidth')
                height = timeline.GetSetting('timelineResolutionHeight')
                fps = timeline.GetSetting('timelineFrameRate')
            except:
                width = 1920
                height = 1080
                fps = 24.0
            
            # Set render settings dictionary
            render_settings.update({
                'TargetDir': project_dir,
                'CustomName': f'sync_export_{timestamp}',
                'MarkIn': in_point,
                'MarkOut': out_point,
                'ResolutionWidth': width,
                'ResolutionHeight': height,
                'FrameRate': fps,
                'ExportVideo': True,
                'ExportAudio': True,
            })
            
            # Set codec and format
            if codec == 'h264':
                render_settings['Format'] = 'mp4'
                render_settings['Codec'] = 'H264'
            else:
                render_settings['Format'] = 'mov'
                render_settings['Codec'] = 'Apple ProRes 422'
            
            # Apply all render settings at once
            project.SetRenderSettings(render_settings)
            
            # Add render job (uses current render settings)
            project.AddRenderJob()
            
            # Start rendering
            project.StartRendering()
            
            # Wait for render to complete (max 3 minutes)
            max_wait = 180
            waited = 0
            while project.IsRendering() and waited < max_wait:
                import time
                time.sleep(1)
                waited += 1
            
            if project.IsRendering():
                return _respond({'ok': False, 'error': 'Render timeout'})
            
            # Check if file exists (Resolve may add extension or prefix)
            found_file = None
            if os.path.exists(output_path):
                found_file = output_path
            else:
                # Try to find the rendered file
                for file in os.listdir(project_dir):
                    if f'sync_export_{timestamp}' in file or file.startswith('sync_export_'):
                        full_path = os.path.join(project_dir, file)
                        if os.path.isfile(full_path) and (full_path.endswith('.mp4') or full_path.endswith('.mov')):
                            found_file = full_path
                            break
            
            if not found_file:
                return _respond({'ok': False, 'error': 'Render completed but file not found'})
            
            # Check file size - reject if over 1GB (same as CEP versions)
            try:
                file_size = os.path.getsize(found_file)
                if file_size > 1024 * 1024 * 1024:  # 1GB
                    os.remove(found_file)
                    return _respond({'ok': False, 'error': 'File size exceeds 1GB limit. Please use shorter in/out points or lower quality settings.'})
            except:
                pass
            
            return _respond({'ok': True, 'path': found_file})
                
        except Exception as e:
            return _respond({'ok': False, 'error': f'Render failed: {str(e)}'})
            
    except Exception as e:
        return _respond({'ok': False, 'error': str(e)})

def export_in_out_audio(opts_json):
    """Export audio from timeline in/out range"""
    try:
        opts = json.loads(opts_json) if isinstance(opts_json, str) else opts_json
        format_type = opts.get('format', 'wav')
        
        timeline = _get_timeline()
        if not timeline:
            return _respond({'ok': False, 'error': 'No active timeline'})
        
        # Get in/out points
        try:
            in_point = timeline.GetMarkIn()
            out_point = timeline.GetMarkOut()
            if in_point == -1 or out_point == -1:
                in_point = timeline.GetStartFrame()
                out_point = timeline.GetEndFrame()
        except:
            in_point = timeline.GetStartFrame()
            out_point = timeline.GetEndFrame()
        
        # Get project directory
        project = _get_project()
        if not project:
            return _respond({'ok': False, 'error': 'No active project'})
        
        project_dir = os.path.join(os.path.expanduser('~'), 'Documents', 'sync. outputs')
        os.makedirs(project_dir, exist_ok=True)
        
        # Generate output path
        timestamp = int(time.time() * 1000)
        ext = 'wav' if format_type == 'wav' else 'mp3'
        output_path = os.path.join(project_dir, f'sync_export_audio_{timestamp}.{ext}')
        
        # Export audio (audio-only render)
        try:
            # Get current render settings
            render_settings = project.GetRenderSettings()
            if not isinstance(render_settings, dict):
                render_settings = {}
            
            # Update for audio-only export
            render_settings.update({
                'TargetDir': project_dir,
                'CustomName': f'sync_export_audio_{timestamp}',
                'MarkIn': in_point,
                'MarkOut': out_point,
                'ExportVideo': False,
                'ExportAudio': True,
                'AudioCodec': 'PCM' if format_type == 'wav' else 'MP3',
                'AudioFormat': ext,
            })
            
            # Apply render settings
            project.SetRenderSettings(render_settings)
            
            # Add render job and start
            project.AddRenderJob()
            project.StartRendering()
            
            # Wait for render
            max_wait = 180
            waited = 0
            while project.IsRendering() and waited < max_wait:
                time.sleep(1)
                waited += 1
            
            if project.IsRendering():
                return _respond({'ok': False, 'error': 'Render timeout'})
            
            # Find rendered file
            found_file = None
            if os.path.exists(output_path):
                found_file = output_path
            else:
                for file in os.listdir(project_dir):
                    if f'sync_export_audio_{timestamp}' in file or (file.startswith('sync_export_audio_') and file.endswith(f'.{ext}')):
                        full_path = os.path.join(project_dir, file)
                        if os.path.isfile(full_path):
                            found_file = full_path
                            break
            
            if not found_file:
                return _respond({'ok': False, 'error': 'Render completed but file not found'})
            
            # Check file size - reject if over 1GB (same as CEP versions)
            try:
                file_size = os.path.getsize(found_file)
                if file_size > 1024 * 1024 * 1024:  # 1GB
                    os.remove(found_file)
                    return _respond({'ok': False, 'error': 'File size exceeds 1GB limit. Please use shorter in/out points or lower quality settings.'})
            except:
                pass
            
            return _respond({'ok': True, 'path': found_file})
                
        except Exception as e:
            return _respond({'ok': False, 'error': f'Audio render failed: {str(e)}'})
            
    except Exception as e:
        return _respond({'ok': False, 'error': str(e)})

def insert_file_at_playhead(path_json):
    """Insert media file at playhead position"""
    try:
        payload = json.loads(path_json) if isinstance(path_json, str) else path_json
        file_path = payload.get('path', path_json) if isinstance(payload, dict) else path_json
        
        if not os.path.exists(file_path):
            return _respond({'ok': False, 'error': 'File not found'})
        
        timeline = _get_timeline()
        if not timeline:
            return _respond({'ok': False, 'error': 'No active timeline'})
        
        # Get playhead position (returns timecode string like "01:00:00:00")
        try:
            playhead_tc = timeline.GetCurrentTimecode()
            # Convert timecode to frame number for insertion
            # Timecode format: HH:MM:SS:FF
            try:
                parts = playhead_tc.split(':')
                if len(parts) == 4:
                    hours, minutes, seconds, frames = map(int, parts)
                    fps = timeline.GetSetting('timelineFrameRate') or 24.0
                    playhead_frame = int((hours * 3600 + minutes * 60 + seconds) * fps + frames)
                else:
                    playhead_frame = timeline.GetStartFrame()
            except:
                playhead_frame = timeline.GetStartFrame()
        except:
            playhead_frame = timeline.GetStartFrame()
        
        # Import media to media pool
        project = _get_project()
        if not project:
            return _respond({'ok': False, 'error': 'No active project'})
        
        media_pool = project.GetMediaPool()
        if not media_pool:
            return _respond({'ok': False, 'error': 'Media pool not available'})
        
        # Import file to root folder
        root_bin = media_pool.GetRootFolder()
        import_result = media_pool.ImportMedia([file_path], root_bin)
        
        # Get the imported clip - ImportMedia returns a list of clips
        imported_clip = None
        if import_result:
            if isinstance(import_result, list) and len(import_result) > 0:
                imported_clip = import_result[0]
            else:
                # Try to find by scanning root folder
                clips = root_bin.GetClipList()
                file_name = os.path.basename(file_path)
                for clip in clips:
                    try:
                        clip_name = clip.GetName()
                        if clip_name == file_name or file_path in str(clip.GetMediaId()):
                            imported_clip = clip
                            break
                    except:
                        continue
        
        if not imported_clip:
            return _respond({'ok': False, 'error': 'Failed to import or find clip'})
        
        # Insert at playhead - use AppendToTimeline (most reliable method)
        try:
            # Append clip to timeline (adds to end)
            timeline.AppendToTimeline([imported_clip])
            
            # Get the track count and find the clip we just added
            video_track_count = timeline.GetTrackCount("video")
            if video_track_count > 0:
                # Get clips in first video track
                track_items = timeline.GetItemListInTrack("video", 1)
                if track_items:
                    # The last item should be the one we just added
                    last_item = track_items[-1]
                    # Move it to playhead position
                    try:
                        timeline.SetItemProperty("Start", playhead_frame, last_item)
                    except:
                        # Alternative: use timecode string
                        try:
                            timeline.SetItemProperty("Start", playhead_tc, last_item)
                        except:
                            pass  # If we can't move it, at least it's on the timeline
            
            return _respond({'ok': True, 'message': 'Inserted at playhead'})
        except Exception as e:
            return _respond({'ok': False, 'error': f'Failed to insert clip: {str(e)}'})
            
    except Exception as e:
        return _respond({'ok': False, 'error': str(e)})

def import_file_to_bin(payload_json):
    """Import file to media pool bin"""
    try:
        payload = json.loads(payload_json) if isinstance(payload_json, str) else payload_json
        file_path = payload.get('path', '')
        bin_name = payload.get('binName', '')
        
        if not file_path or not os.path.exists(file_path):
            return _respond({'ok': False, 'error': 'File not found'})
        
        project = _get_project()
        if not project:
            return _respond({'ok': False, 'error': 'No active project'})
        
        media_pool = project.GetMediaPool()
        if not media_pool:
            return _respond({'ok': False, 'error': 'Media pool not available'})
        
        # Get or create bin
        root_bin = media_pool.GetRootFolder()
        target_bin = root_bin
        
        if bin_name:
            # Find or create bin
            bins = root_bin.GetSubFolderList()
            for bin in bins:
                if bin.GetName() == bin_name:
                    target_bin = bin
                    break
            else:
                # Create new bin
                target_bin = media_pool.AddSubFolder(root_bin, bin_name)
        
        # Import file to target bin
        import_result = media_pool.ImportMedia([file_path], target_bin)
        
        # Verify import succeeded
        if import_result:
            return _respond({'ok': True})
        else:
            # Check if file already exists in bin
            clips = target_bin.GetClipList()
            file_name = os.path.basename(file_path)
            for clip in clips:
                try:
                    if clip.GetName() == file_name:
                        return _respond({'ok': True, 'reused': True})
                except:
                    continue
            return _respond({'ok': False, 'error': 'Import failed'})
        
    except Exception as e:
        return _respond({'ok': False, 'error': str(e)})

def get_project_dir():
    """Get current project directory"""
    try:
        # Check if Resolve is initialized
        if not resolve:
            return _respond({'ok': False, 'error': 'Resolve API not initialized. Make sure DaVinci Resolve is running.'})
        
        project = _get_project()
        if not project:
            return _respond({'ok': False, 'error': 'No active project. Please open or create a project in DaVinci Resolve.'})
        
        try:
            project_name = project.GetName()
        except:
            project_name = 'Untitled Project'
        
        # Try to get actual project directory from Resolve
        # Resolve stores projects in a database, but we can use project name
        # For output, use Documents/sync. outputs (consistent with CEP versions)
        project_dir = os.path.join(os.path.expanduser('~'), 'Documents')
        
        # Try to get project path if available (Resolve 18+)
        try:
            # Some Resolve versions expose project path
            project_path = project.GetProjectPath()
            if project_path and os.path.exists(project_path):
                project_dir = os.path.dirname(project_path)
        except:
            pass  # Fall back to Documents
        
        output_dir = os.path.join(project_dir, 'sync. outputs')
        try:
            os.makedirs(output_dir, exist_ok=True)
        except Exception as e:
            return _respond({'ok': False, 'error': f'Failed to create output directory: {str(e)}'})
        
        return _respond({
            'ok': True,
            'projectDir': project_dir,
            'outputDir': output_dir,
            'projectName': project_name
        })
        
    except Exception as e:
        # Ensure we always return valid JSON, even on unexpected errors
        try:
            return _respond({'ok': False, 'error': str(e)})
        except:
            # Last resort: return minimal valid JSON
            return json.dumps({'ok': False, 'error': 'Unknown error occurred'})

def reveal_file(path_json):
    """Reveal file in Finder/Explorer"""
    try:
        payload = json.loads(path_json) if isinstance(path_json, str) else path_json
        file_path = payload.get('path', path_json) if isinstance(payload, dict) else path_json
        
        if not os.path.exists(file_path):
            return _respond({'ok': False, 'error': 'File not found'})
        
        if platform.system() == 'Darwin':  # macOS
            subprocess.run(['open', '-R', file_path])
        elif platform.system() == 'Windows':
            subprocess.run(['explorer', '/select,', file_path])
        else:  # Linux
            subprocess.run(['xdg-open', os.path.dirname(file_path)])
        
        return _respond({'ok': True})
        
    except Exception as e:
        return _respond({'ok': False, 'error': str(e)})

def diag_in_out():
    """Get diagnostic info about timeline"""
    try:
        # Check if Resolve is initialized
        if not resolve:
            return _respond({'ok': False, 'error': 'Resolve API not initialized. Make sure DaVinci Resolve is running.'})
        
        timeline = _get_timeline()
        project = _get_project()
        
        info = {
            'ok': True,
            'hasTimeline': timeline is not None,
            'hasProject': project is not None,
        }
        
        if timeline:
            try:
            info['timelineName'] = timeline.GetName()
            except:
                info['timelineName'] = None
            try:
            info['startFrame'] = timeline.GetStartFrame()
            except:
                info['startFrame'] = None
            try:
            info['endFrame'] = timeline.GetEndFrame()
            except:
                info['endFrame'] = None
            try:
                info['currentTimecode'] = timeline.GetCurrentTimecode()
            except:
                info['currentTimecode'] = None
            try:
                mark_in = timeline.GetMarkIn()
                mark_out = timeline.GetMarkOut()
                info['markIn'] = mark_in if mark_in != -1 else None
                info['markOut'] = mark_out if mark_out != -1 else None
            except:
                info['markIn'] = None
                info['markOut'] = None
        
        if project:
            try:
            info['projectName'] = project.GetName()
            except:
                info['projectName'] = None
        
        return _respond(info)
        
    except Exception as e:
        return _respond({'ok': False, 'error': str(e)})

# Main entry point for command-line usage
if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(_respond({'ok': False, 'error': 'No function specified'}))
        sys.exit(1)
    
    func_name = sys.argv[1]
    payload = sys.argv[2] if len(sys.argv) > 2 else '{}'
    
    functions = {
        'exportInOutVideo': export_in_out_video,
        'exportInOutAudio': export_in_out_audio,
        'insertFileAtPlayhead': insert_file_at_playhead,
        'importFileToBin': import_file_to_bin,
        'getProjectDir': get_project_dir,
        'revealFile': reveal_file,
        'diagInOut': diag_in_out,
    }
    
    if func_name in functions:
        result = functions[func_name](payload)
        print(result)
    else:
        print(_respond({'ok': False, 'error': f'Unknown function: {func_name}'}))
        sys.exit(1)

