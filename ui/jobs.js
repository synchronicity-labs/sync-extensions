      function saveJobsLocal() {
        try { 
          // Filter out local placeholder jobs before saving
          const jobsToSave = jobs.filter(j => !j.id || !j.id.startsWith('local-'));
          localStorage.setItem('syncJobs', JSON.stringify(jobsToSave)); 
        } catch(_) {}
      }

      function setLipsyncButtonState({ disabled, text }) {
        try {
          const btn = document.getElementById('lipsyncBtn');
          if (!btn) return;
          if (typeof disabled === 'boolean') {
            btn.disabled = disabled;
          }
          if (typeof text === 'string') {
            const label = btn.querySelector('span');
            if (label) {
              label.textContent = text;
              const icon = btn.querySelector('img');
              if (icon) {
                if (text === 'submitted') {
                  icon.style.display = 'none';
                } else {
                  icon.style.display = '';
                }
              }
            }
          }
        } catch(_){ }
      }
      window.setLipsyncButtonState = setLipsyncButtonState;
      window.loadJobsLocal = function loadJobsLocal() {
        try {
          const raw = localStorage.getItem('syncJobs');
          if (raw) { 
            jobs = (JSON.parse(raw) || []).filter(j => !j.id || !j.id.startsWith('local-'));
            window.jobs = jobs; // Update global reference
          }
        } catch(_) {}
      }

      async function startLipsync() {
        if (!window.__lipsyncRunning) {
          window.__lipsyncRunning = true;
        }
        
        try {
          const resetLipsyncButton = () => {
            window.__lipsyncRunning = false;
            setLipsyncButtonState({ disabled: false, text: 'lipsync' });
          };
        
          // Restore URLs from localStorage immediately
        if (!window.uploadedVideoUrl) {
            const stored = localStorage.getItem('uploadedVideoUrl');
            if (stored && stored.startsWith('http')) window.uploadedVideoUrl = stored;
        }
        if (!window.uploadedAudioUrl) {
            const stored = localStorage.getItem('uploadedAudioUrl');
            if (stored && stored.startsWith('http')) window.uploadedAudioUrl = stored;
          }
        
        // Check if we have files for both video and audio (like cost estimation)
        const hasVideo = window.selectedVideo || window.selectedVideoUrl || window.uploadedVideoUrl;
        const hasAudio = window.selectedAudio || window.selectedAudioUrl || window.uploadedAudioUrl;
        
        if (!hasVideo || !hasAudio) {
          resetLipsyncButton();
          return;
        }
        
        // Check for API key before proceeding
        const apiKeyElement = document.getElementById('syncApiKey');
        const apiKey = apiKeyElement ? apiKeyElement.value : '';
        if (!apiKey || apiKey.trim() === '') {
          if (typeof window.showToast === 'function') {
            window.showToast('api key required - add it in settings', 'error');
          }
          resetLipsyncButton();
          return;
        }
        
        const myToken = ++runToken;
        
        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn) clearBtn.style.display = 'inline-block';
        if (typeof window.showToast === 'function') {
          window.showToast('starting backend...', 'info');
        }
        
        // Backend is already started on panel load; skip starting again to avoid AE instability
        if (!cs) cs = new CSInterface();
        
        // If URLs are available, we can skip health check and auth token for faster submission
        const hasUrls = (window.uploadedVideoUrl || window.selectedVideoUrl) && (window.uploadedAudioUrl || window.selectedAudioUrl);
        
        (async function(){
          try {
          if (myToken !== runToken) {
            console.log('[startLipsync] Token mismatch - cancelling duplicate call');
            window.__lipsyncRunning = false;
            return;
          }
          
          if (typeof window.showToast === 'function') {
              window.showToast(hasUrls ? 'submitting job...' : 'waiting for backend health...', 'info');
          }
          
          await ensureAuthToken();
            if (myToken !== runToken) {
              console.log('[startLipsync] Token mismatch after auth - cancelling');
              window.__lipsyncRunning = false;
              return;
            }
            
          const healthy = await waitForHealth(20, 250, myToken);
          if (!healthy) {
            if (myToken !== runToken) return;
            if (typeof window.showToast === 'function') {
              window.showToast('backend failed to start (health check failed)', 'error');
            }
            resetLipsyncButton();
            const clearBtn = document.getElementById('clearBtn');
            if (clearBtn) clearBtn.style.display = 'inline-block';
            return;
          }
          if (myToken !== runToken) return;
            
          if (typeof window.showToast === 'function') {
            window.showToast('backend ready. creating job...', 'info');
          }
          
          // Resolve output directory from host project
          let outputDir = null;
          try {
            if (window.nle && typeof window.nle.getProjectDir === 'function') {
              const r = await window.nle.getProjectDir();
              if (r && r.ok && r.outputDir) outputDir = r.outputDir;
              // AE fallback: if no project folder, prefer ~/Documents mode
              if ((!outputDir || !r.ok) && window.HOST_CONFIG && window.HOST_CONFIG.isAE) {
                try { const r2 = await window.nle.getProjectDir(); if (r2 && r2.ok && r2.outputDir) outputDir = r2.outputDir; } catch(_){ }
              }
            } else {
              await new Promise((resolve) => {
                cs.evalScript('PPRO_getProjectDir()', function(resp){
                  try { const r = JSON.parse(resp || '{}'); if (r && r.ok && r.outputDir) outputDir = r.outputDir; } catch(_) {}
                  resolve();
                });
              });
            }
          } catch(_){ }

          if (!window.uploadedVideoUrl || window.uploadedVideoUrl === '' || !window.uploadedVideoUrl.startsWith('http')) {
            const stored = localStorage.getItem('uploadedVideoUrl');
            if (stored && stored !== '' && stored.startsWith('http')) {
              window.uploadedVideoUrl = stored;
            }
          }
          if (!window.uploadedAudioUrl || window.uploadedAudioUrl === '' || !window.uploadedAudioUrl.startsWith('http')) {
            const stored = localStorage.getItem('uploadedAudioUrl');
            if (stored && stored !== '' && stored.startsWith('http')) {
              window.uploadedAudioUrl = stored;
            }
          }
          if (!window.selectedVideoUrl || window.selectedVideoUrl === '' || !window.selectedVideoUrl.startsWith('http')) {
            const stored = localStorage.getItem('selectedVideoUrl');
            if (stored && stored !== '' && stored.startsWith('http')) {
              window.selectedVideoUrl = stored;
            }
          }
          if (!window.selectedAudioUrl || window.selectedAudioUrl === '' || !window.selectedAudioUrl.startsWith('http')) {
            const stored = localStorage.getItem('selectedAudioUrl');
            if (stored && stored !== '' && stored.startsWith('http')) {
              window.selectedAudioUrl = stored;
            }
          }

          const storedVideoUrl = localStorage.getItem('uploadedVideoUrl');
          const storedAudioUrl = localStorage.getItem('uploadedAudioUrl');
          if (storedVideoUrl && storedVideoUrl.startsWith('http')) window.uploadedVideoUrl = storedVideoUrl;
          if (storedAudioUrl && storedAudioUrl.startsWith('http')) window.uploadedAudioUrl = storedAudioUrl;
          
          const modelEl = document.querySelector('input[name="model"]:checked');
          const temperatureEl = document.getElementById('temperature');
          const activeSpeakerEl = document.getElementById('activeSpeakerOnly');
          const detectObstructionsEl = document.getElementById('detectObstructions');
          const syncModeEl = document.getElementById('syncMode');
          
          // Get model from checked radio button, or fallback to localStorage settings
          let model = 'lipsync-2-pro';
          if (modelEl && modelEl.value) {
            model = modelEl.value;
          } else {
            // Fallback: check localStorage settings and sync radio button
            try {
              const settings = JSON.parse(localStorage.getItem('syncSettings') || '{}');
              if (settings.model) {
                model = settings.model;
                // Normalize legacy model names
                if (model === 'lipsync 1.9') {
                  model = 'lipsync-1.9.0-beta';
                } else if (model === 'lipsync 2 pro') {
                  model = 'lipsync-2-pro';
                }
                // Ensure the radio button is checked
                const savedModelRadio = document.querySelector(`input[name="model"][value="${model}"]`);
                if (savedModelRadio) {
                  savedModelRadio.checked = true;
                  console.log('[startLipsync] Synced radio button to saved model:', model);
                }
              }
            } catch(_) {}
          }
          
          console.log('[startLipsync] Using model:', model, 'from', modelEl ? 'radio button' : 'localStorage');
          const temperatureValue = (temperatureEl && temperatureEl.value) ? parseFloat(temperatureEl.value) : 0.7;
          const temperature = isNaN(temperatureValue) ? 0.7 : Math.max(0, Math.min(1, temperatureValue));
          const activeSpeakerOnly = activeSpeakerEl ? activeSpeakerEl.checked : false;
          const detectObstructions = detectObstructionsEl ? detectObstructionsEl.checked : false;
          const syncMode = (syncModeEl && syncModeEl.value) ? syncModeEl.value : 'loop';
          
          const jobData = {
            videoPath: window.selectedVideo || '',
            audioPath: window.selectedAudio || '',
            videoUrl: window.uploadedVideoUrl || window.selectedVideoUrl || '',
            audioUrl: window.uploadedAudioUrl || window.selectedAudioUrl || '',
            isTempVideo: !!(window.selectedVideoIsTemp || (!window.selectedVideoUrl && window.selectedVideo && window.selectedVideo.indexOf('/Library/Application Support/sync. extensions/uploads/') === 0)),
            isTempAudio: !!(window.selectedAudioIsTemp || (!window.selectedAudioUrl && window.selectedAudio && window.selectedAudio.indexOf('/Library/Application Support/sync. extensions/uploads/') === 0)),
            isVideoUrl: !!(window.uploadedVideoUrl || window.selectedVideoUrl),
            isAudioUrl: !!(window.uploadedAudioUrl || window.selectedAudioUrl),
            model: model,
            temperature: temperature,
            activeSpeakerOnly: activeSpeakerOnly,
            detectObstructions: detectObstructions,
            syncApiKey: apiKey,
            outputDir: outputDir,
            options: {
              sync_mode: syncMode,
              temperature: temperature,
              active_speaker_detection: { auto_detect: activeSpeakerOnly },
              occlusion_detection_enabled: detectObstructions
            }
          };
          
          try {
            try { 
              if (currentFetchController) {
                currentFetchController.abort();
              }
            } catch(_){ }
            currentFetchController = new AbortController();
            
            if (myToken !== runToken) {
              window.__lipsyncRunning = false;
              return;
            }
            
            let resp;
            try {
              resp = await fetchWithTimeout(`http://127.0.0.1:${getServerPort()}/jobs`, { 
                method: 'POST', 
                headers: authHeaders({ 'Content-Type': 'application/json' }), 
                body: JSON.stringify(jobData),
                signal: currentFetchController.signal
              }, 30000);
              
            const text = await resp.text();
            let data = {};
            try { data = JSON.parse(text || '{}'); } catch(_) { data = { error: text }; }
            
            if (!resp.ok) { throw new Error(data && data.error ? data.error : (text || 'job creation failed')); }
              if (myToken !== runToken) {
                window.__lipsyncRunning = false;
                return;
              }
            
            const submitTime = Date.now();
            
            async function waitForJobInHistory() {
              const maxAttempts = 20;
              const delayMs = 500;
              
              for (let attempt = 0; attempt < maxAttempts; attempt++) {
                if (myToken !== runToken) return;
                
                try {
                  await window.loadJobsFromServer();
                  
                  const recentlyCreatedJob = window.jobs && window.jobs.find(j => {
                    if (j.id && j.id.startsWith('local-')) return false;
                    const createdAt = j.createdAt ? new Date(j.createdAt).getTime() : 0;
                    return createdAt >= submitTime - 2000;
                  });
                  
                  if (recentlyCreatedJob) {
                    try { showTab('history'); } catch(_) {}
                    // Show success toast and update button state after switching to history tab
                    if (typeof window.showToast === 'function') {
                      window.showToast('job successfully submitted', 'success');
                    }
                    setLipsyncButtonState({ disabled: true, text: 'submitted' });
                    window.__lipsyncRunning = false;
                    return;
                  }
                } catch (e) {
                  console.warn('[startLipsync] Error loading jobs:', e);
                }
                
                await new Promise(r => setTimeout(r, delayMs));
              }
              
              // Fallback: if job not found after max attempts, still switch to history tab
              // showTab('history') will call updateHistory() automatically
              try { showTab('history'); } catch(_) {}
              // Show success toast and update button state after switching to history tab
              if (typeof window.showToast === 'function') {
                window.showToast('job successfully submitted', 'success');
              }
              setLipsyncButtonState({ disabled: true, text: 'submitted' });
              window.__lipsyncRunning = false;
            }
            
            waitForJobInHistory();
            
            const clearBtn = document.getElementById('clearBtn');
            if (clearBtn) clearBtn.style.display = 'inline-block';
            pollJobStatus(data.id);
            } catch (fetchError) {
              throw fetchError;
            }
          } catch (error) {
            if (myToken !== runToken) return;
            if (typeof window.showToast === 'function') {
              window.showToast('job error: ' + error.message, 'error');
            }
            resetLipsyncButton();
            const clearBtn = document.getElementById('clearBtn');
            if (clearBtn) clearBtn.style.display = 'inline-block';
          }
        } catch (asyncError) {
          resetLipsyncButton();
          const clearBtn = document.getElementById('clearBtn');
          if (clearBtn) clearBtn.style.display = 'inline-block';
          if (typeof window.showToast === 'function') {
            window.showToast('error: ' + (asyncError?.message || 'unknown error'), 'error');
          }
          }
        })();
        } catch (outerError) {
          const resetLipsyncButton = () => setLipsyncButtonState({ disabled: false, text: 'lipsync' });
          resetLipsyncButton();
          if (typeof window.showToast === 'function') {
            window.showToast('error: ' + (outerError?.message || 'unknown error'), 'error');
          }
        }
      }

      // Track active polling intervals for cleanup
      const activePollingIntervals = new Set();
      
      function pollJobStatus(jobId) {
        const interval = setInterval(() => {
          fetchWithTimeout(`http://127.0.0.1:${getServerPort()}/jobs/${jobId}`, { headers: authHeaders() }, 10000)
          .then(response => response.json())
          .then(data => {
            if (data.status === 'completed') {
              clearInterval(interval);
              activePollingIntervals.delete(interval);
              jobs = jobs.map(j => j.id === jobId ? data : j);
              saveJobsLocal();
              
              // Reload jobs from server to get the latest data including outputPath/outputUrl
              window.loadJobsFromServer().then(() => {
                const allJobs = window.jobs || [];
                const updatedJob = allJobs.find(j => String(j.id) === String(jobId));
                
                if (!updatedJob) {
                  console.warn('[pollJobStatus] Job not found after reload:', jobId);
                  updateHistory();
                  return;
                }
                
                // Check if output is ready (outputPath or outputUrl)
                const hasOutput = !!(updatedJob.outputPath || updatedJob.outputUrl);
                
                if (hasOutput) {
                  // Output is ready - use the same function that clicking a job in history uses
                  // This ensures consistent behavior
                  if (typeof window.loadJobIntoSources === 'function') {
                    console.log('[pollJobStatus] ✅ Job completed with output, loading into sources tab:', jobId);
                    window.loadJobIntoSources(jobId);
                  } else {
                    console.error('[pollJobStatus] loadJobIntoSources function not available!');
                    updateHistory();
                  }
                } else {
                  // Output not ready yet - might be a timing issue
                  // Retry once after a short delay, then update history
                  console.log('[pollJobStatus] Job completed but output not ready yet, retrying...');
                  setTimeout(() => {
                    window.loadJobsFromServer().then(() => {
                      const retryJob = (window.jobs || []).find(j => String(j.id) === String(jobId));
                      if (retryJob && (retryJob.outputPath || retryJob.outputUrl)) {
                        if (typeof window.loadJobIntoSources === 'function') {
                          console.log('[pollJobStatus] ✅ Output ready on retry, loading into sources tab:', jobId);
                          window.loadJobIntoSources(jobId);
                        } else {
                          updateHistory();
                        }
                      } else {
                        // Still not ready - just update history silently
                        console.log('[pollJobStatus] Output still not ready, updating history');
                        updateHistory();
                      }
                    }).catch(() => updateHistory());
                  }, 2000); // Wait 2 seconds before retry
                  
                  // Update history immediately so user sees completion status
                  updateHistory();
                }
              }).catch(err => {
                console.warn('[pollJobStatus] Error loading updated job:', err);
                updateHistory();
              });
            } else if (data.status === 'failed') {
              clearInterval(interval);
              activePollingIntervals.delete(interval);
              jobs = jobs.map(j => j.id === jobId ? data : j);
              saveJobsLocal();
              updateHistory();
              const btn = document.getElementById('lipsyncBtn');
              btn.disabled = false;
              const span = btn.querySelector('span');
              if (span) span.textContent = 'lipsync';
              document.getElementById('postActions').style.display = 'none';
            }
          })
          .catch(error => {
            console.error('Error polling job:', error);
            clearInterval(interval);
            activePollingIntervals.delete(interval);
          });
        }, 2000);
        
        activePollingIntervals.add(interval);
        
        // Auto-cleanup after 10 minutes to prevent memory leaks
        setTimeout(() => {
          if (activePollingIntervals.has(interval)) {
            clearInterval(interval);
            activePollingIntervals.delete(interval);
          }
        }, 600000); // 10 minutes
      }

      function clearSelection() {
        try { if (currentFetchController) currentFetchController.abort(); } catch(_) {}
        currentFetchController = null;
        runToken++;
        window.selectedVideo = null;
        window.selectedAudio = null;
        window.selectedVideoIsTemp = false;
        window.selectedAudioIsTemp = false;
        updateInputStatus();
        const btn = document.getElementById('lipsyncBtn');
        if (btn) {
        btn.disabled = true;
        const span = btn.querySelector('span');
        if (span) span.textContent = 'lipsync';
        }
        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn) clearBtn.style.display = 'none';
        const postActions = document.getElementById('postActions');
        if (postActions) postActions.style.display = 'none';
        const preview = document.getElementById('preview');
        const badge = document.getElementById('costIndicator');
        preview.innerHTML = '';
        if (badge) { preview.appendChild(badge); badge.textContent = 'cost: $0.00'; }
        try { updateInputStatus(); } catch(_){ }
      }

      function markSaved(buttonId) {
        const btn = document.getElementById(buttonId);
        if (!btn) return;
        
        // Show toast notification
        if (typeof window.showToast === 'function') {
          window.showToast('successfully saved', 'success');
        }
        
        // Restore button to original structure
        // For save button: cloud-download icon + "save" text
        btn.innerHTML = '<i data-lucide="cloud-download"></i><span>save</span>';
        btn.disabled = false;
        
        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
          lucide.createIcons();
        }
      }
      function markWorking(buttonId, label){
        const btn = document.getElementById(buttonId);
        if (!btn) return ()=>{};
        
        // Store original button structure (including icons)
        const originalHTML = btn.innerHTML;
        const originalText = btn.textContent;
        
        // Show working state - preserve button structure but update text
        // Find the span element if it exists, otherwise replace content
        const span = btn.querySelector('span');
        if (span) {
          span.textContent = label || 'working…';
          // Hide icon temporarily when showing loading state
          const icon = btn.querySelector('i');
          if (icon) icon.style.display = 'none';
        } else {
          btn.textContent = label || 'working…';
        }
        btn.disabled = true;
        
        return function reset(){ 
          // Restore original structure and re-initialize icons
          btn.innerHTML = originalHTML;
          btn.disabled = false;
          
          // Re-initialize Lucide icons
          if (typeof lucide !== 'undefined' && lucide.createIcons) {
            setTimeout(() => {
              lucide.createIcons();
            }, 50);
          }
        };
      }
      function markError(buttonId, message){
        const btn = document.getElementById(buttonId);
        if (!btn) return;
        
        // Show toast notification
        if (typeof window.showToast === 'function') {
          window.showToast(message || 'save failed', 'error');
        }
        
        // Restore button to original structure based on button type
        if (buttonId.startsWith('save-')) {
          // Check if it's a post-action-btn (in sources tab) or history-btn
          if (btn.classList.contains('post-action-btn')) {
            btn.innerHTML = '<i data-lucide="cloud-download"></i><span>save</span>';
          } else {
            btn.innerHTML = '<i data-lucide="cloud-download"></i><span>save</span>';
          }
        } else if (buttonId.startsWith('insert-')) {
          // Check if it's a post-action-btn (in sources tab) or history-btn
          if (btn.classList.contains('post-action-btn')) {
            btn.innerHTML = '<i data-lucide="copy-plus"></i><span>insert</span>';
          } else {
            btn.innerHTML = '<i data-lucide="copy-plus"></i><span>insert</span>';
          }
        }
        btn.disabled = false;
        
        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
          setTimeout(() => {
            lucide.createIcons();
          }, 50);
        }
      }

      async function saveJob(jobId) {
        const job = jobs.find(j => String(j.id) === String(jobId)) || { id: jobId, status: 'completed' };
        const saveLocation = (document.querySelector('input[name="saveLocation"]:checked')||{}).value || 'project';
        let location = saveLocation === 'documents' ? 'documents' : 'project';
        let targetDir = '';
        if (location === 'project') {
          try {
            if (window.nle && typeof window.nle.getProjectDir === 'function') {
              const r = await window.nle.getProjectDir();
              if (r && r.ok && r.outputDir) targetDir = r.outputDir;
            } else {
              await new Promise((resolve) => {
                cs.evalScript('PPRO_getProjectDir()', function(resp){
                  try { const r = JSON.parse(resp||'{}'); if (r && r.ok && r.outputDir) targetDir = r.outputDir; } catch(_){ }
                  resolve();
                });
              });
            }
          } catch(_){ }
          // If project selected but host didn’t resolve, fallback to Documents in AE
          try {
            if (!targetDir && window.HOST_CONFIG && window.HOST_CONFIG.isAE) {
              location = 'documents';
            }
          } catch(_){ }
        }
        const apiKey = (JSON.parse(localStorage.getItem('syncSettings')||'{}').syncApiKey)||'';
        let savedPath = '';
        const reset = markWorking('save-'+jobId, 'saving…');
        try {
          const resp = await fetch(`http://127.0.0.1:${getServerPort()}/jobs/${jobId}/save`, { method:'POST', headers: authHeaders({'Content-Type':'application/json'}), body: JSON.stringify({ location, targetDir, syncApiKey: apiKey }) });
          const data = await resp.json().catch(()=>null);
          if (resp.ok && data && data.outputPath) { savedPath = data.outputPath; }
          else if (!resp.ok) { reset(); markError('save-'+jobId, 'error'); return; }
        } catch(_){ reset(); markError('save-'+jobId, 'error'); return; }
        if (!savedPath) {
          try { const res = await fetch(`http://127.0.0.1:${getServerPort()}/jobs/${jobId}`, { headers: authHeaders() }); const j = await res.json(); if (j && j.outputPath) { savedPath = j.outputPath; } } catch(_){ }
        }
        // Wait briefly for file to exist on disk if path looks local
        try {
          if (savedPath && savedPath.indexOf('://') === -1) {
            if (!cs) cs = new CSInterface();
            const safe = String(savedPath).replace(/\\/g,'\\\\').replace(/\"/g,'\\\"');
            let tries = 0; let exists = false;
            while (tries < 20 && !exists) {
              await new Promise(resolve=>{
                const es = `(function(){try{var f=new File("${safe}");return (f&&f.exists)?'1':'0';}catch(e){return '0';}})()`;
                cs.evalScript(es, function(r){ exists = String(r||'0')==='1'; resolve(); });
              });
              if (!exists) await new Promise(r=>setTimeout(r, 250));
              tries++;
            }
          }
        } catch(_){ }
        reset();
        if (savedPath) {
          const fp = savedPath.replace(/\"/g,'\\\"');
          try {
            if (!cs) cs = new CSInterface();
            const isAE = window.HOST_CONFIG ? window.HOST_CONFIG.isAE : false;
            
            // Double-check host detection - if HOST_CONFIG says Premiere, ensure isAE is false
            const hostId = window.HOST_CONFIG ? window.HOST_CONFIG.hostId : null;
            const isAEConfirmed = isAE && hostId !== 'PPRO';
            
            // File logging for debugging
            function logToFile(msg) {
              try {
                var logPath = (function(){
                  try {
                    var dir = '';
                    if (window.CSInterface) {
                      var cs2 = new CSInterface();
                      cs2.evalScript('(typeof SYNC_getLogDir===\'function\'?SYNC_getLogDir():\'\')', function(r){ dir = r||''; });
                    }
                    if (dir) return dir + ((navigator.platform && navigator.platform.indexOf('Win') !== -1) ? '\\' : '/') + 'sync_save_debug.log';
                  } catch(_){ }
                  if (navigator.platform && navigator.platform.indexOf('Win') !== -1) return 'C:\\temp\\sync_save_debug.log';
                  try{ if (typeof require !== 'undefined'){ return require('os').tmpdir() + '/sync_save_debug.log'; } }catch(_){ }
                  return '/tmp/sync_save_debug.log';
                })();
                // Only write when debug flag file exists
                try{ if (typeof require !== 'undefined'){ var fs2=require('fs'); var path2=require('path'); var base=logPath.replace(/(\\|\/)sync_save_debug\.log$/,''); if(!fs2.existsSync(path2.join(base,'debug.enabled'))){ return; } } }catch(_){ }
                var logFile = new File(logPath);
                logFile.open('a');
                logFile.write('[' + new Date().toISOString() + '] ' + msg + '\n');
                logFile.close();
              } catch(e) {}
            }
            
            logToFile('[AE Save] Host detection result: ' + isAE + ' (hostId: ' + hostId + ', confirmed: ' + isAEConfirmed + ')');
            
            if (isAEConfirmed) {
              try {
                const extPath = cs.getSystemPath(CSInterface.SystemPath.EXTENSION).replace(/\\/g,'\\\\').replace(/\"/g,'\\\"');
                logToFile('[AE Save] Extension path: ' + extPath);
                logToFile('[AE Save] File path: ' + fp);
                
                // Use HOST_CONFIG for reliable host detection
                const hostFile = isAEConfirmed ? 'ae.jsx' : 'ppro.jsx';
                const payload = JSON.stringify({ path: savedPath, binName: 'sync. outputs' }).replace(/\\/g,'\\\\').replace(/\"/g,'\\\"');
                const importFunc = isAEConfirmed ? 'AEFT_importFileToBin' : 'PPRO_importFileToBin';
                cs.evalScript(`$.evalFile(\"${extPath}/host/${hostFile}\"); ${importFunc}(\"${payload}\")`, function(r){
                  logToFile('[AE Save] Raw response: ' + String(r));
                  let ok = false; let out = null;
                  try { 
                    // Handle different response types
                    if (typeof r === 'string') {
                      // Try to parse as JSON first
                      try {
                        out = JSON.parse(r||'{}');
                      } catch(parseErr) {
                        // If not JSON, check if it's "[object Object]" which means success
                        if (r === '[object Object]' || r.indexOf('ok') !== -1) {
                          out = { ok: true };
                        } else {
                          out = { ok: false, error: r };
                        }
                      }
                    } else if (typeof r === 'object' && r !== null) {
                      out = r;
                    } else {
                      out = { ok: false, error: String(r) };
                    }
                    
                    ok = !!(out && out.ok); 
                    logToFile('[AE Save] Parsed result: ' + JSON.stringify(out) + ' ok: ' + ok);
                  } catch(e){ 
                    logToFile('[AE Save] Parse error: ' + String(e) + ' raw: ' + String(r)); 
                    ok = false; 
                  }
                  
                  if (ok) { 
                    logToFile('[AE Save] SUCCESS - marking saved');
                    markSaved('save-'+jobId); 
                  } else { 
                    logToFile('[AE Save] FAILED - marking error');
                    markError('save-'+jobId, 'error'); 
                  }
                });
              } catch(e) {
                logToFile('[AE Save] Error: ' + String(e));
                markError('save-'+jobId, 'error');
              }
            } else {
            // PPro fallback - need to load ppro.jsx first
            try {
              const extPath = cs.getSystemPath(CSInterface.SystemPath.EXTENSION).replace(/\\/g,'\\\\').replace(/\"/g,'\\\"');
              const hostFile = 'ppro.jsx';
              const payload = JSON.stringify({ path: savedPath, binName: 'sync. outputs' }).replace(/\\/g,'\\\\').replace(/\"/g,'\\\"');
              cs.evalScript(`$.evalFile(\"${extPath}/host/${hostFile}\"); PPRO_importFileToBin(\"${payload}\")`, function(r){ try{ var j=(typeof r==='string')?JSON.parse(r):r; if(j&&j.ok){ markSaved('save-'+jobId); } else { markError('save-'+jobId,'error'); } }catch(_){ markError('save-'+jobId,'error'); } });
            } catch(e) {
              markError('save-'+jobId, 'error');
            }
            }
          } catch(_){ markError('save-'+jobId, 'error'); }
        } else {
          markError('save-'+jobId, 'not ready');
        }
      }

      async function insertJob(jobId) {
        if (insertingGuard) return; insertingGuard = true;
        const job = jobs.find(j => String(j.id) === String(jobId)) || { id: jobId, status: 'completed' };
        const saveLocation = (document.querySelector('input[name="saveLocation"]:checked')||{}).value || 'project';
        let location = saveLocation === 'documents' ? 'documents' : 'project';
        let targetDir = '';
        if (location === 'project') {
          try {
            if (window.nle && typeof window.nle.getProjectDir === 'function') {
              const r = await window.nle.getProjectDir();
              if (r && r.ok && r.outputDir) targetDir = r.outputDir;
            } else {
              await new Promise((resolve) => {
                cs.evalScript('PPRO_getProjectDir()', function(resp){
                  try { const r = JSON.parse(resp||'{}'); if (r && r.ok && r.outputDir) targetDir = r.outputDir; } catch(_){ }
                  resolve();
                });
              });
            }
          } catch(_){ }
          // If project selected but host didn’t resolve, fallback to Documents in AE
          try {
            if (!targetDir && window.HOST_CONFIG && window.HOST_CONFIG.isAE) {
              location = 'documents';
            }
          } catch(_){ }
        }
        const apiKey = (JSON.parse(localStorage.getItem('syncSettings')||'{}').syncApiKey)||'';
        let savedPath = '';
        const reset = markWorking('insert-'+jobId, 'inserting…');
        const mainInsertBtn = document.getElementById('insertBtn');
        const mainInsertWasDisabled = mainInsertBtn ? mainInsertBtn.disabled : false;
        if (mainInsertBtn) { mainInsertBtn.disabled = true; mainInsertBtn.textContent = 'inserting…'; }
        try {
          const resp = await fetch(`http://127.0.0.1:${getServerPort()}/jobs/${jobId}/save`, { method:'POST', headers: authHeaders({'Content-Type':'application/json'}), body: JSON.stringify({ location, targetDir, syncApiKey: apiKey }) });
          const data = await resp.json().catch(()=>null);
          if (resp.ok && data && data.outputPath) { savedPath = data.outputPath; }
          else if (!resp.ok) { reset(); markError('insert-'+jobId, 'error'); if (mainInsertBtn){ mainInsertBtn.textContent='insert'; mainInsertBtn.disabled = mainInsertWasDisabled; } insertingGuard = false; return; }
        } catch(_){ reset(); markError('insert-'+jobId, 'error'); if (mainInsertBtn){ mainInsertBtn.textContent='insert'; mainInsertBtn.disabled = mainInsertWasDisabled; } insertingGuard = false; return; }
        if (!savedPath) {
          try { const res = await fetch(`http://127.0.0.1:${getServerPort()}/jobs/${jobId}`, { headers: authHeaders() }); const j = await res.json(); if (j && j.outputPath) { savedPath = j.outputPath; } } catch(_){ }
        }
        reset();
        if (!savedPath) { markError('insert-'+jobId, 'not ready'); if (mainInsertBtn){ mainInsertBtn.textContent='insert'; mainInsertBtn.disabled = mainInsertWasDisabled; } insertingGuard = false; return; }
        const fp = savedPath.replace(/\"/g,'\\\"');
        try {
          if (!cs) cs = new CSInterface();
          const isAE = window.HOST_CONFIG ? window.HOST_CONFIG.isAE : false;
          
          // Double-check host detection - if HOST_CONFIG says Premiere, ensure isAE is false
          const hostId = window.HOST_CONFIG ? window.HOST_CONFIG.hostId : null;
          const isAEConfirmed = isAE && hostId !== 'PPRO';
          
          // File logging for debugging
            function logToFile(msg) {
            try {
              var logPath = (function(){
                try {
                  var dir = '';
                  if (window.CSInterface) {
                    var cs3 = new CSInterface();
                    cs3.evalScript('(typeof SYNC_getLogDir===\'function\'?SYNC_getLogDir():\'\')', function(r){ dir = r||''; });
                  }
                  if (dir) return dir + ((navigator.platform && navigator.platform.indexOf('Win') !== -1) ? '\\' : '/') + 'sync_insert_debug.log';
                } catch(_){ }
                if (navigator.platform && navigator.platform.indexOf('Win') !== -1) return 'C:\\temp\\sync_insert_debug.log';
                try{ if (typeof require !== 'undefined'){ return require('os').tmpdir() + '/sync_insert_debug.log'; } }catch(_){ }
                return '/tmp/sync_insert_debug.log';
              })();
              // Only write when debug flag file exists
              try{ if (typeof require !== 'undefined'){ var fs3=require('fs'); var path3=require('path'); var base=logPath.replace(/(\\|\/)sync_insert_debug\.log$/,''); if(!fs3.existsSync(path3.join(base,'debug.enabled'))){ return; } } }catch(_){ }
              var logFile = new File(logPath);
              logFile.open('a');
              logFile.write('[' + new Date().toISOString() + '] ' + msg + '\n');
              logFile.close();
            } catch(e) {}
          }
          
          logToFile('[AE Insert] Host detection result: ' + isAE + ' (hostId: ' + hostId + ', confirmed: ' + isAEConfirmed + ')');
          
          if (isAEConfirmed) {
            try {
              const extPath = cs.getSystemPath(CSInterface.SystemPath.EXTENSION).replace(/\\/g,'\\\\').replace(/\"/g,'\\\"');
              logToFile('[AE Insert] Extension path: ' + extPath);
              logToFile('[AE Insert] File path: ' + fp);
              
              // Use HOST_CONFIG for reliable host detection
              const hostFile = isAEConfirmed ? 'ae.jsx' : 'ppro.jsx';
              const insertFunc = isAEConfirmed ? 'AEFT_insertFileAtPlayhead' : 'PPRO_insertFileAtPlayhead';
              cs.evalScript(`$.evalFile(\"${extPath}/host/${hostFile}\"); ${insertFunc}(\"${fp.replace(/\\/g,'\\\\')}\")`, function(r){
                logToFile('[AE Insert] Raw response: ' + String(r));
                let out = null;
                try { 
                  // Handle different response types
                  if (typeof r === 'string') {
                    // Try to parse as JSON first
                    try {
                      out = JSON.parse(r||'{}');
                    } catch(parseErr) {
                      // If not JSON, check if it's "[object Object]" which means success
                      if (r === '[object Object]' || r.indexOf('ok') !== -1) {
                        out = { ok: true };
                      } else {
                        out = { ok: false, error: r };
                      }
                    }
                  } else if (typeof r === 'object' && r !== null) {
                    out = r;
                  } else {
                    out = { ok: false, error: String(r) };
                  }
                  
                  logToFile('[AE Insert] Parsed result: ' + JSON.stringify(out));
                } catch(e){ 
                  logToFile('[AE Insert] Parse error: ' + String(e) + ' raw: ' + String(r)); 
                  out = { ok: false, error: 'Parse error' };
                }
                
                try {
                  if (out && out.ok === true) { 
                    logToFile('[AE Insert] SUCCESS - marking inserted');
                    if (typeof window.showToast === 'function') {
                      window.showToast('inserted' + (out.diag? ' ['+out.diag+']':''), 'success');
                    }
                  } else { 
                    logToFile('[AE Insert] FAILED - marking error: ' + (out && out.error ? out.error : 'unknown'));
                    if (typeof window.showToast === 'function') {
                      window.showToast('insert failed' + (out && out.error ? ' ('+out.error+')' : ''), 'error');
                    }
                  }
                } catch(_){ }
                if (mainInsertBtn){ mainInsertBtn.textContent='insert'; mainInsertBtn.disabled = mainInsertWasDisabled; }
                insertingGuard = false;
              });
            } catch(e) {
              logToFile('[AE Insert] Error: ' + String(e));
              if (typeof window.showToast === 'function') {
                window.showToast('insert failed (error)', 'error');
              }
              if (mainInsertBtn){ mainInsertBtn.textContent='insert'; mainInsertBtn.disabled = mainInsertWasDisabled; }
              insertingGuard = false;
            }
          } else {
            // PPro fallback - need to load ppro.jsx first
            try {
              const extPath = cs.getSystemPath(CSInterface.SystemPath.EXTENSION).replace(/\\/g,'\\\\').replace(/\"/g,'\\\"');
              const hostFile = 'ppro.jsx';
              const payload = JSON.stringify({ path: savedPath }).replace(/\\/g,'\\\\').replace(/\"/g,'\\\"');
              cs.evalScript(`$.evalFile(\"${extPath}/host/${hostFile}\"); PPRO_insertFileAtPlayhead(\"${payload}\")`, function(r){
                try {
                  const out = (typeof r === 'string') ? JSON.parse(r) : r;
                  if (out && out.ok === true) { 
                    if (typeof window.showToast === 'function') {
                      window.showToast('inserted' + (out.diag? ' ['+out.diag+']':''), 'success');
                    }
                  } else { 
                    if (typeof window.showToast === 'function') {
                      window.showToast('insert failed' + (out && out.error ? ' ('+out.error+')' : ''), 'error');
                    }
                  }
                } catch(_){ }
                if (mainInsertBtn){ mainInsertBtn.textContent='insert'; mainInsertBtn.disabled = mainInsertWasDisabled; }
                insertingGuard = false;
              });
            } catch(e) {
              markError('insert-'+jobId, 'error');
              if (mainInsertBtn){ mainInsertBtn.textContent='insert'; mainInsertBtn.disabled = mainInsertWasDisabled; }
              insertingGuard = false;
            }
          }
        } catch(_){
          markError('insert-'+jobId, 'error');
          if (mainInsertBtn){ mainInsertBtn.textContent='insert'; mainInsertBtn.disabled = mainInsertWasDisabled; }
          insertingGuard = false;
        }
      }

      // Timeout wrapper for fetch requests to prevent hanging
      async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
        const existingSignal = options.signal;
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
        
        let combinedSignal = timeoutController.signal;
        if (existingSignal) {
          const combinedController = new AbortController();
          existingSignal.addEventListener('abort', () => combinedController.abort());
          timeoutController.signal.addEventListener('abort', () => combinedController.abort());
          combinedSignal = combinedController.signal;
        }
        
        try {
          const response = await fetch(url, {
            ...options,
            signal: combinedSignal
          });
          clearTimeout(timeoutId);
          return response;
        } catch (error) {
          clearTimeout(timeoutId);
          if (error.name === 'AbortError') {
            if (existingSignal && existingSignal.aborted) {
              throw new Error('Request cancelled');
            }
            throw new Error('Request timeout');
          }
          throw error;
        }
      }

      window.loadJobsFromServer = async function loadJobsFromServer() {
        try {
          const settings = JSON.parse(localStorage.getItem('syncSettings')||'{}');
          const apiKey = settings.syncApiKey || '';
          
          if (!apiKey) {
            return;
          }
          
          // Check server health first
          let healthy = false;
          try { 
            const r = await fetchWithTimeout('http://127.0.0.1:3000/health', { cache:'no-store' }, 5000); 
            healthy = !!(r && r.ok); 
          } catch(_){ 
            healthy = false; 
          }
          
          if (!healthy) {
            return;
          }
          
          await ensureAuthToken();
          const gen = await fetchWithTimeout(`http://127.0.0.1:${getServerPort()}/generations?`+new URLSearchParams({ syncApiKey: apiKey }), { headers: authHeaders() }, 15000)
            .then(function(r){ return r.json(); })
            .catch(function(){ return null; });
          
          if (Array.isArray(gen)) {
            const serverJobs = gen.map(function(g){
              var arr = (g && g.input && g.input.slice) ? g.input.slice() : [];
              var vid = null, aud = null;
              for (var i=0;i<arr.length;i++){ var it = arr[i]; if (it && it.type==='video' && !vid) vid = it; if (it && it.type==='audio' && !aud) aud = it; }
              
              return {
                id: g && g.id,
                status: String(g && g.status || 'processing').toLowerCase(),
                model: g && g.model,
                createdAt: g && g.createdAt,
                completedAt: g && g.completedAt,
                videoPath: (vid && vid.url) || '',
                audioPath: (aud && aud.url) || '',
                syncJobId: g && g.id,
                outputPath: (g && g.outputUrl) || '',
                outputUrl: (g && g.outputUrl) || '', // Also set outputUrl explicitly
                options: g && g.options || {}
              };
            });
            
            jobs = serverJobs;
            
            // Store jobs globally for history.js to use
            window.jobs = jobs;
            saveJobsLocal();
            return jobs;
          }
        } catch (e) {
          console.warn('[Jobs] Failed to load from server:', e);
        }
      }

      async function saveCompletedJob(jobId) { await saveJob(jobId); }
      async function insertCompletedJob(jobId) { await insertJob(jobId); }

      function clearCompletedJob() {
        // Clear all video-related variables
        window.selectedVideo = null;
        window.selectedVideoIsTemp = false;
        window.selectedVideoUrl = '';
        window.selectedVideoIsUrl = false;
        window.uploadedVideoUrl = '';
        localStorage.removeItem('uploadedVideoUrl');
        
        // Clear all audio-related variables
        window.selectedAudio = null;
        window.selectedAudioIsTemp = false;
        window.selectedAudioUrl = '';
        window.selectedAudioIsUrl = false;
        window.uploadedAudioUrl = '';
        localStorage.removeItem('uploadedAudioUrl');
        
        // Clear main video element (input video)
        const mainVideo = document.getElementById('mainVideo');
        if (mainVideo) {
          try {
            mainVideo.pause();
            mainVideo.currentTime = 0;
            mainVideo.removeAttribute('src');
            mainVideo.load();
          } catch(_) {}
        }
        
        // Clear audio player element
        const audioPlayer = document.getElementById('audioPlayer');
        if (audioPlayer) {
          try {
            if (typeof audioPlayer.__waveformCleanup === 'function') {
              audioPlayer.__waveformCleanup();
            }
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
            audioPlayer.removeAttribute('src');
            audioPlayer.load();
          } catch(_) {}
        }
        
        // Clear output video element
        const outputVideo = document.getElementById('outputVideo');
        if (outputVideo) {
          try {
            outputVideo.pause();
            outputVideo.removeAttribute('src');
            outputVideo.load();
          } catch(_) {}
        }
        
        // Reset lipsync button to default state (disabled)
        if (typeof window.setLipsyncButtonState === 'function') {
          window.setLipsyncButtonState({ disabled: true, text: 'lipsync' });
        } else {
          const btn = document.getElementById('lipsyncBtn');
          if (btn) {
            btn.style.display = 'flex';
            btn.disabled = true;
            const span = btn.querySelector('span');
            if (span) span.textContent = 'lipsync';
          }
        }
        
        // Show audio section again
        const audioSection = document.getElementById('audioSection');
        if (audioSection) audioSection.style.display = 'block';
        
        // Remove post-lipsync actions
        const actions = document.getElementById('postLipsyncActions');
        if (actions) actions.remove();
        
        // Clear output video preview and show dropzone again
        const videoPreview = document.getElementById('videoPreview');
        const videoDropzone = document.getElementById('videoDropzone');
        if (videoPreview) {
          videoPreview.style.display = 'none';
          videoPreview.innerHTML = '';
        }
        if (videoDropzone) {
          videoDropzone.style.display = 'flex';
        }
        
        // Clear audio preview and show dropzone again
        const audioPreview = document.getElementById('audioPreview');
        const audioDropzone = document.getElementById('audioDropzone');
        if (audioPreview) {
          audioPreview.style.display = 'none';
          audioPreview.innerHTML = '';
        }
        if (audioDropzone) {
          audioDropzone.style.display = 'flex';
        }
        
        // Remove classes that were added when rendering output video
        const videoSection = document.getElementById('videoSection');
        const sourcesContainer = document.querySelector('.sources-container');
        if (videoSection) {
          videoSection.classList.remove('has-media');
        }
        if (sourcesContainer) {
          sourcesContainer.classList.remove('has-video', 'has-both', 'has-audio');
        }
        
        // Re-render the preview (which will show empty dropzones)
        if (typeof renderInputPreview === 'function') {
          renderInputPreview('clearCompletedJob');
        }
        if (typeof updateInputStatus === 'function') {
          updateInputStatus();
        }
        if (typeof updateFromVideoButton === 'function') {
          updateFromVideoButton();
        }
        
        // Reset cost estimation
        if (typeof scheduleEstimate === 'function') {
          scheduleEstimate();
        }
      }

      // Expose functions globally for onclick handlers
      window.saveCompletedJob = saveCompletedJob;
      window.insertCompletedJob = insertCompletedJob;
      window.clearCompletedJob = clearCompletedJob;

      async function saveOutput() {
        const latest = jobs.slice().sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0))[0];
        if (!latest || latest.status !== 'completed' || !latest.outputPath) return;
        try {
          if (window.nle && typeof window.nle.importFileToBin === 'function') {
            await window.nle.importFileToBin(latest.outputPath, 'sync. outputs');
          } else {
            if (!cs) cs = new CSInterface();
            cs.evalScript(`PPRO_importFileToBin("${latest.outputPath.replace(/\"/g,'\\\"')}", "sync. outputs")`, function(r){});
          }
        } catch(_){ }
      }

      async function insertOutput() {
        const latest = jobs.slice().sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0))[0];
        if (!latest || latest.status !== 'completed' || !latest.outputPath) return;
        try {
          if (window.nle && typeof window.nle.insertFileAtPlayhead === 'function') {
            await window.nle.insertFileAtPlayhead(latest.outputPath);
          } else {
            if (!cs) cs = new CSInterface();
            cs.evalScript(`PPRO_insertFileAtPlayhead("${latest.outputPath.replace(/\"/g,'\\\"')}")`, function(r){});
          }
        } catch(_){ }
      }

      async function saveLatest(){
        const latest = jobs.slice().sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0))[0];
        if (!latest || latest.status !== 'completed') return;
        return saveJob(String(latest.id));
      }
      async function insertLatest(){
        const latest = jobs.slice().sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0))[0];
        if (!latest || latest.status !== 'completed') return;
        return insertJob(String(latest.id));
      }



