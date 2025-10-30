// TTS Interface Manager
(function() {
  'use strict';

  // TTS State
  let selectedVoiceId = 'rachel';
  let selectedVoiceName = 'rachel';
  let voices = [];
  let selectedModel = 'eleven_v3';
  let voiceSettings = {
    stability: 0.5,
    similarityBoost: 0.8
  };
  let isTogglingSettings = false;

  // Model display names mapping
  const modelDisplayNames = {
    'eleven_v3': 'eleven v3',
    'eleven_turbo_v2_5': 'eleven turbo 2.5',
    'eleven_flash_v2_5': 'eleven flash 2.5',
    'eleven_multilingual_v2': 'eleven multilingual v2'
  };

  // Initialize TTS
  function initTTS() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initTTS);
      return;
    }
    
    // Add a small delay to ensure all elements are rendered
    setTimeout(() => {
      setupTTSEventListeners();
    }, 100);
  }
  
  function setupTTSEventListeners() {
    // Get elements
    const fromTextBtn = document.querySelector('[data-action="audio-tts"]');
    const ttsInterface = document.getElementById('ttsInterface');
    const ttsCloseX = document.getElementById('ttsCloseX');
    const ttsVoiceSelectBtn = document.getElementById('ttsVoiceSelectBtn');
    const ttsSettingsBtn = document.getElementById('ttsSettingsBtn');
    const ttsPreviewBtn = document.getElementById('ttsPreviewBtn');
    const ttsVoiceSelectorOverlay = document.getElementById('ttsVoiceSelectorOverlay');
    const ttsVoiceSelectorClose = document.getElementById('ttsVoiceSelectorClose');
    const ttsSettingsPopup = document.getElementById('ttsSettingsPopup');
    const ttsUploadBtn = document.getElementById('ttsUploadBtn');
    const ttsStabilitySlider = document.getElementById('ttsStabilitySlider');
    const ttsSimilaritySlider = document.getElementById('ttsSimilaritySlider');
    const ttsVoiceSearch = document.getElementById('ttsVoiceSearch');
    const ttsModelBtn = document.getElementById('ttsModelBtn');
    const ttsModelMenu = document.getElementById('ttsModelMenu');

        // From Text button
        if (fromTextBtn) {
          fromTextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showTTSInterface();
          });
        }

    // Close X button
    if (ttsCloseX) {
      ttsCloseX.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideTTSInterface();
      });
    }

        // Voice select button
        if (ttsVoiceSelectBtn) {
          ttsVoiceSelectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            openVoiceSelector();
            return false;
          });
        }

    // Settings button
    if (ttsSettingsBtn) {
      ttsSettingsBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        isTogglingSettings = true;
        toggleSettingsPopup();
        // Reset flag after a short delay
        setTimeout(() => {
          isTogglingSettings = false;
        }, 100);
        return false;
      });
    }

        // Preview button
        if (ttsPreviewBtn) {
          let isGenerating = false;
          ttsPreviewBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isGenerating) {
              isGenerating = true;
              generateTTS().finally(() => {
                isGenerating = false;
              });
            }
          });
        }

    // Voice selector close
    if (ttsVoiceSelectorClose) {
      ttsVoiceSelectorClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeVoiceSelector();
      });
    }

    // Close voice selector on overlay click
    if (ttsVoiceSelectorOverlay) {
      ttsVoiceSelectorOverlay.addEventListener('click', (e) => {
        // Only close if clicking the overlay background itself, not the panel
        if (e.target === ttsVoiceSelectorOverlay) {
          closeVoiceSelector();
        }
      });
    }

    // Close settings popup when clicking outside (with delay to avoid immediate closure)
    document.addEventListener('click', (e) => {
      // Skip if clicking on voice selector button or overlay
      const isClickOnVoiceBtn = ttsVoiceSelectBtn && (ttsVoiceSelectBtn.contains(e.target) || ttsVoiceSelectBtn === e.target);
      const isClickInVoiceOverlay = ttsVoiceSelectorOverlay && ttsVoiceSelectorOverlay.contains(e.target);
      
      if (isClickOnVoiceBtn || isClickInVoiceOverlay) {
        return; // Don't close anything
      }
      
      // Skip if we're in the middle of toggling
      if (isTogglingSettings) {
        return;
      }
      
      // Use setTimeout to allow the button click to complete first
      setTimeout(() => {
        if (ttsSettingsPopup && !isTogglingSettings) {
          const isVisible = ttsSettingsPopup.style.display === 'block' || 
                           (ttsSettingsPopup.style.display === '' && window.getComputedStyle(ttsSettingsPopup).display !== 'none');
          
          if (isVisible) {
            const isClickOnButton = ttsSettingsBtn && (ttsSettingsBtn.contains(e.target) || ttsSettingsBtn === e.target);
            const isClickInPopup = ttsSettingsPopup.contains(e.target);
            
            // Only close if clicking outside both button and popup
            if (!isClickInPopup && !isClickOnButton) {
          closeSettingsPopup();
        }
      }
        }
      }, 50);
    });

    // Voice clone modal close button
    const ttsVoiceCloneClose = document.getElementById('ttsVoiceCloneClose');
    if (ttsVoiceCloneClose) {
      ttsVoiceCloneClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeVoiceCloneModal();
      });
    }

    // Close clone modal on overlay click
    const ttsVoiceCloneOverlay = document.getElementById('ttsVoiceCloneOverlay');
    if (ttsVoiceCloneOverlay) {
      ttsVoiceCloneOverlay.addEventListener('click', (e) => {
        if (e.target === ttsVoiceCloneOverlay) {
          closeVoiceCloneModal();
        }
      });
    }

    // Clone modal cancel button
    const ttsCloneCancelBtn = document.getElementById('ttsCloneCancelBtn');
    if (ttsCloneCancelBtn) {
      ttsCloneCancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeVoiceCloneModal();
      });
    }

    // Clone Modal Browse Button - use global flag to prevent duplicate file pickers
    if (!window.ttsCloneBrowseBtnInitialized) {
      window.ttsCloneBrowseBtnInitialized = true;
      window.ttsCloneFilePickerOpen = false;
      
      const ttsCloneBrowseBtn = document.getElementById('ttsCloneBrowseBtn');
      if (ttsCloneBrowseBtn) {
        ttsCloneBrowseBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Prevent multiple file picker windows
          if (window.ttsCloneFilePickerOpen) {
            return;
          }
          
          window.ttsCloneFilePickerOpen = true;
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'audio/*';
          input.multiple = true;
          input.style.display = 'none';
          document.body.appendChild(input);
          
          const cleanup = () => {
            window.ttsCloneFilePickerOpen = false;
            setTimeout(() => {
              if (input.parentNode) {
                input.parentNode.removeChild(input);
              }
            }, 100);
          };
          
          input.onchange = async (event) => {
            cleanup();
            const files = Array.from(event.target.files);
            for (const file of files) {
              await handleCloneVoiceFileUpload(file);
            }
          };
          
          input.oncancel = () => {
            cleanup();
          };
          
          input.click();
        });
      }
    }

    // Clone Modal Record Button
    const ttsCloneRecordBtn = document.getElementById('ttsCloneRecordBtn');
    if (ttsCloneRecordBtn) {
      ttsCloneRecordBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await startCloneVoiceRecording();
      });
    }

    // Clone voice recording state
    window.ttsCloneRecordingState = {
      mediaRecorder: null,
      audioRecorder: null,
      audioStream: null,
      audioChunks: [],
      isRecording: false
    };

    // Clone Modal From Video Button
    const ttsCloneFromVideoBtn = document.getElementById('ttsCloneFromVideoBtn');
    if (ttsCloneFromVideoBtn) {
      ttsCloneFromVideoBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await handleCloneVoiceFromVideo();
      });
    }

    // Clone Modal Save Button
    const ttsCloneSaveBtn = document.getElementById('ttsCloneSaveBtn');
    if (ttsCloneSaveBtn) {
      ttsCloneSaveBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await handleCloneVoiceSave();
      });
    }

    // Initialize clone voice samples array
    if (!window.ttsCloneVoiceSamples) {
      window.ttsCloneVoiceSamples = [];
    }

    // Upload button (go back to audio upload)
    if (ttsUploadBtn) {
      ttsUploadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideTTSInterface();
      });
    }

    // Stability slider
    if (ttsStabilitySlider) {
      // Sync slider value with state
      ttsStabilitySlider.value = voiceSettings.stability.toString();
      
      // Initialize display value to match slider value
      const stabilityValue = document.getElementById('ttsStabilityValue');
      if (stabilityValue) {
        stabilityValue.textContent = voiceSettings.stability.toFixed(1);
      }
      
      ttsStabilitySlider.addEventListener('input', (e) => {
        voiceSettings.stability = parseFloat(e.target.value);
        const stabilityValue = document.getElementById('ttsStabilityValue');
        if (stabilityValue) {
          stabilityValue.textContent = voiceSettings.stability.toFixed(1);
        }
      });
    }

    // Similarity boost slider
    if (ttsSimilaritySlider) {
      // Sync slider value with state
      ttsSimilaritySlider.value = voiceSettings.similarityBoost.toString();
      
      // Initialize display value to match slider value
      const similarityValue = document.getElementById('ttsSimilarityValue');
      if (similarityValue) {
        similarityValue.textContent = voiceSettings.similarityBoost.toFixed(1);
      }
      
      ttsSimilaritySlider.addEventListener('input', (e) => {
        voiceSettings.similarityBoost = parseFloat(e.target.value);
        const similarityValue = document.getElementById('ttsSimilarityValue');
        if (similarityValue) {
          similarityValue.textContent = voiceSettings.similarityBoost.toFixed(1);
        }
      });
    }

    // Voice search input
    if (ttsVoiceSearch) {
      ttsVoiceSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        filterVoices(searchTerm);
      });
    }

    // Text input listener to show/hide preview text
    const ttsTextInput = document.getElementById('ttsTextInput');
    if (ttsTextInput) {
      ttsTextInput.addEventListener('input', updatePreviewButtonState);
      ttsTextInput.addEventListener('paste', () => {
        setTimeout(updatePreviewButtonState, 10);
      });
    }

    // Model dropdown
    if (ttsModelBtn && ttsModelMenu) {
      // Toggle dropdown
      ttsModelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const isOpen = ttsModelMenu.classList.contains('show');
        closeAllDropdowns();
        if (!isOpen) {
          ttsModelMenu.classList.add('show');
          if (window.lucide) {
            window.lucide.createIcons();
          }
        }
        return false;
      });

      // Select model option
      ttsModelMenu.querySelectorAll('.tts-model-dropdown-option').forEach(option => {
        option.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const modelId = option.dataset.value;
          selectModel(modelId);
          closeAllDropdowns();
          return false;
        });
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (ttsModelBtn && ttsModelMenu && !ttsModelBtn.contains(e.target) && !ttsModelMenu.contains(e.target)) {
          ttsModelMenu.classList.remove('show');
        }
      });
    }

    // Initialize model display
    updateTTSModelDisplay();
  }

  function closeAllDropdowns() {
    const ttsModelMenu = document.getElementById('ttsModelMenu');
    if (ttsModelMenu) {
      ttsModelMenu.classList.remove('show');
    }
  }

  function selectModel(modelId) {
    selectedModel = modelId;
    updateTTSModelDisplay();
  }

  function updateTTSModelDisplay() {
    const ttsModelValue = document.getElementById('ttsModelValue');
    const ttsModelMenu = document.getElementById('ttsModelMenu');
    
    if (ttsModelValue) {
      ttsModelValue.textContent = modelDisplayNames[selectedModel] || selectedModel;
    }
    
    // Update active state in dropdown
    if (ttsModelMenu) {
      ttsModelMenu.querySelectorAll('.tts-model-dropdown-option').forEach(option => {
        if (option.dataset.value === selectedModel) {
          option.classList.add('active');
        } else {
          option.classList.remove('active');
        }
      });
    }
  }

  function updatePreviewButtonState() {
    const ttsTextInput = document.getElementById('ttsTextInput');
    const ttsPreviewBtn = document.getElementById('ttsPreviewBtn');
    const previewText = ttsPreviewBtn?.querySelector('.tts-preview-text');
    
    if (ttsTextInput && ttsPreviewBtn && previewText) {
      const hasText = ttsTextInput.value.trim().length > 0;
      
      if (hasText) {
        previewText.style.display = 'block';
        ttsPreviewBtn.style.minWidth = 'auto';
        ttsPreviewBtn.style.padding = '8px 12px';
        ttsPreviewBtn.style.width = 'auto';
      } else {
        previewText.style.display = 'none';
        ttsPreviewBtn.style.minWidth = '32px';
        ttsPreviewBtn.style.padding = '8px';
        ttsPreviewBtn.style.width = '32px';
      }
    }
  }

  function showTTSInterface() {
    const audioDropzone = document.getElementById('audioDropzone');
    const audioPreview = document.getElementById('audioPreview');
    const ttsInterface = document.getElementById('ttsInterface');
    const audioSection = document.getElementById('audioSection');
    
    if (audioDropzone) audioDropzone.style.display = 'none';
    if (audioPreview) audioPreview.style.display = 'none';
    if (ttsInterface) ttsInterface.style.display = 'flex';
    
    // Fix height of audio-upload container to match TTS interface
    if (audioSection) {
      audioSection.style.height = '99px';
      audioSection.style.minHeight = '99px';
      audioSection.style.maxHeight = '99px';
    }
    
    // Initialize Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
    
    // Update preview button state
    updatePreviewButtonState();
    
    // Preload voices from ElevenLabs API so button can be updated
    if (voices.length === 0) {
      loadVoices().then(() => {
        // Update button text if we have voices and current selection is default
        if (selectedVoiceId === 'rachel' && voices.length > 0) {
          // Try to find rachel voice or use first available
          const rachelVoice = voices.find(v => v.name.toLowerCase() === 'rachel' || v.voice_id === 'rachel');
          if (rachelVoice) {
            selectVoice(rachelVoice.voice_id, rachelVoice.name);
          } else if (voices.length > 0) {
            // Use first available voice
            const firstVoice = voices[0];
            selectVoice(firstVoice.voice_id, firstVoice.name);
          }
        }
        
        // Re-initialize icons after loading voices
        if (window.lucide) {
          window.lucide.createIcons();
        }
      }).catch(err => {
        // Silent fail - voices will load when selector opens
      });
    } else {
      // Update button with current selection
      updateVoiceButton();
    }
    
    // Just ensure icons are initialized
    setTimeout(() => {
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }, 50);
  }

  function hideTTSInterface() {
    const ttsInterface = document.getElementById('ttsInterface');
    const audioDropzone = document.getElementById('audioDropzone');
    const audioSection = document.getElementById('audioSection');
    
    if (ttsInterface) ttsInterface.style.display = 'none';
    if (audioDropzone) audioDropzone.style.display = 'flex';
    
    // Reset audio-upload container height
    if (audioSection) {
      audioSection.style.height = '';
      audioSection.style.minHeight = '';
      audioSection.style.maxHeight = '';
    }
    
    // Clear TTS state
    const ttsTextInput = document.getElementById('ttsTextInput');
    if (ttsTextInput) ttsTextInput.value = '';
    closeSettingsPopup();
  }

  function toggleSettingsPopup() {
    const ttsSettingsPopup = document.getElementById('ttsSettingsPopup');
    const ttsSettingsBtn = document.getElementById('ttsSettingsBtn');
    if (!ttsSettingsPopup || !ttsSettingsBtn) {
      return;
    }
    
    // Check if popup is currently visible using class and computed style
    const hasShowClass = ttsSettingsPopup.classList.contains('show');
    const currentDisplay = ttsSettingsPopup.style.display;
    const computedDisplay = window.getComputedStyle(ttsSettingsPopup).display;
    const isVisible = hasShowClass || currentDisplay === 'block' || (currentDisplay === '' && computedDisplay !== 'none');
    
    if (isVisible) {
      // Hide popup
      ttsSettingsPopup.classList.remove('show');
      ttsSettingsPopup.style.display = 'none';
      ttsSettingsPopup.style.visibility = 'hidden';
    } else {
      // Show popup - calculate position relative to button
      closeAllDropdowns();
      
      // Get button position
      const btnRect = ttsSettingsBtn.getBoundingClientRect();
      const gap = 8;
      
      // First, show the popup temporarily to get its actual height
      ttsSettingsPopup.style.display = 'block';
      ttsSettingsPopup.style.setProperty('position', 'fixed', 'important');
      ttsSettingsPopup.style.setProperty('visibility', 'hidden', 'important');
      ttsSettingsPopup.style.setProperty('opacity', '0', 'important');
      const popupRect = ttsSettingsPopup.getBoundingClientRect();
      const popupHeight = popupRect.height;
      
      // Position popup above the button, aligned to the right
      const top = btnRect.top - popupHeight - gap;
      const right = window.innerWidth - btnRect.right;
      
      // Now set all the styles properly
      ttsSettingsPopup.style.setProperty('display', 'block', 'important');
      ttsSettingsPopup.style.setProperty('visibility', 'visible', 'important');
      ttsSettingsPopup.style.setProperty('opacity', '1', 'important');
      ttsSettingsPopup.style.setProperty('z-index', '10003', 'important');
      ttsSettingsPopup.style.setProperty('position', 'fixed', 'important');
      ttsSettingsPopup.style.setProperty('top', `${top}px`, 'important');
      ttsSettingsPopup.style.setProperty('right', `${right}px`, 'important');
      ttsSettingsPopup.style.setProperty('bottom', 'auto', 'important');
      ttsSettingsPopup.style.setProperty('left', 'auto', 'important');
      
      // Force a reflow to ensure styles are applied
      void ttsSettingsPopup.offsetHeight;
      
      // Add show class
      ttsSettingsPopup.classList.add('show');
      
      // Initialize Lucide icons and update model display
      if (window.lucide) {
        window.lucide.createIcons();
      }
      updateTTSModelDisplay();
    }
    
    // Close any open dropdowns
    closeAllDropdowns();
  }

  function closeSettingsPopup() {
    const ttsSettingsPopup = document.getElementById('ttsSettingsPopup');
    if (ttsSettingsPopup) {
      ttsSettingsPopup.classList.remove('show');
      ttsSettingsPopup.style.display = 'none';
      ttsSettingsPopup.style.visibility = 'hidden';
    }
  }

  async function openVoiceSelector() {
    const ttsVoiceSelectorOverlay = document.getElementById('ttsVoiceSelectorOverlay');
    if (!ttsVoiceSelectorOverlay) {
      return;
    }
    
    // Show overlay by adding show class (same as model selector)
    // The overlay already has display: flex in CSS, just needs show class
    ttsVoiceSelectorOverlay.classList.add('show');
    
    // Load voices if not already loaded
    if (voices.length === 0) {
      await loadVoices();
    } else {
      // Clear search input and render voices
      const ttsVoiceSearch = document.getElementById('ttsVoiceSearch');
      if (ttsVoiceSearch) {
        ttsVoiceSearch.value = '';
      }
      renderVoices(voices);
    }
    
    // Initialize Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function closeVoiceSelector() {
    const ttsVoiceSelectorOverlay = document.getElementById('ttsVoiceSelectorOverlay');
    if (ttsVoiceSelectorOverlay) {
      ttsVoiceSelectorOverlay.classList.remove('show');
    }
  }

  async function loadVoices() {
    const ttsVoiceList = document.getElementById('ttsVoiceList');
    if (!ttsVoiceList) return;
    
    try {
      // Show loading state
      ttsVoiceList.innerHTML = '<div class="tts-voice-loading"><div class="tts-progress-spinner"></div><span>loading voices...</span></div>';
      
      // Get ElevenLabs API key from localStorage
      const settings = JSON.parse(localStorage.getItem('syncSettings') || '{}');
      const apiKey = settings.elevenlabsApiKey;
      
      if (!apiKey) {
        ttsVoiceList.innerHTML = '<div class="tts-voice-loading" style="color: #dc2626;">elevenlabs api key not configured. please add your api key in settings.</div>';
        return;
      }

      // Fetch voices from backend
      const response = await fetch(`http://127.0.0.1:3000/tts/voices?elevenApiKey=${encodeURIComponent(apiKey)}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch voices');
      }

      const data = await response.json();
      voices = data.voices || [];
      
      // Update button if we have voices and current selection needs updating
      if (voices.length > 0) {
        // If we're still using default 'rachel', try to find it or use first voice
        if (selectedVoiceId === 'rachel') {
          const rachelVoice = voices.find(v => 
            v.name.toLowerCase() === 'rachel' || 
            v.voice_id === 'rachel' ||
            v.voice_id === '21m00Tcm4TlvDq8ikWAM' // Rachel's default voice ID
          );
          if (rachelVoice) {
            selectedVoiceId = rachelVoice.voice_id;
            selectedVoiceName = rachelVoice.name;
          } else {
            // Use first available voice
            const firstVoice = voices[0];
            selectedVoiceId = firstVoice.voice_id;
            selectedVoiceName = firstVoice.name;
          }
          updateVoiceButton();
        } else {
          // Verify current selection still exists
          const currentVoice = voices.find(v => v.voice_id === selectedVoiceId);
          if (!currentVoice) {
            // Current voice not found, use first available
            const firstVoice = voices[0];
            selectedVoiceId = firstVoice.voice_id;
            selectedVoiceName = firstVoice.name;
            updateVoiceButton();
          } else {
            // Update name in case it changed
            selectedVoiceName = currentVoice.name;
            updateVoiceButton();
          }
        }
      }
      
      // Clear search input and render voices
      const ttsVoiceSearch = document.getElementById('ttsVoiceSearch');
      if (ttsVoiceSearch) {
        ttsVoiceSearch.value = '';
      }
      renderVoices(voices);
      
    } catch (error) {
      if (ttsVoiceList) {
        ttsVoiceList.innerHTML = '<div class="tts-voice-loading" style="color: #dc2626;">failed to load voices. please check your api key.</div>';
      }
    }
  }

  function renderVoices(voiceList, searchTerm = '') {
    const ttsVoiceList = document.getElementById('ttsVoiceList');
    if (!ttsVoiceList) return;
    
    // Filter voices by search term if provided
    let filteredVoices = voiceList;
    if (searchTerm) {
      filteredVoices = voiceList.filter(v => 
        v.name.toLowerCase().includes(searchTerm) ||
        (v.labels && Object.values(v.labels).some(label => 
          String(label).toLowerCase().includes(searchTerm)
        ))
      );
    }
    
    // Group voices by category
    const builtInVoices = filteredVoices.filter(v => v.category === 'premade' || !v.category);
    const clonedVoices = filteredVoices.filter(v => v.category === 'cloned');
    
    let html = '';
    
    // Clone Voice Button at top (only show if not searching or search matches)
    if (!searchTerm || 'clone voice'.includes(searchTerm.toLowerCase())) {
    html += `
      <div class="tts-voice-item clone-btn" data-action="clone-voice">
        <div class="tts-voice-play">
          <i data-lucide="plus"></i>
        </div>
        <div class="tts-voice-info">
          <div class="tts-voice-item-name" style="color: #ffffff;">clone voice</div>
        </div>
        <i data-lucide="arrow-up-right" class="tts-voice-clone-icon"></i>
      </div>
    `;
    }
    
    // Cloned voices section
    if (clonedVoices.length > 0) {
      html += '<div class="tts-voice-category">';
      html += `<div class="tts-voice-category-title">cloned voices (${clonedVoices.length})</div>`;
      clonedVoices.forEach(voice => {
        html += renderVoiceItem(voice, true);
      });
      html += '</div>';
    }
    
    // Built-in voices section
    if (builtInVoices.length > 0) {
      html += '<div class="tts-voice-category">';
      html += `<div class="tts-voice-category-title">eleven labs (${builtInVoices.length})</div>`;
      builtInVoices.forEach(voice => {
        html += renderVoiceItem(voice, false);
      });
      html += '</div>';
    }
    
    // Show "no results" message if filtering and no matches
    if (searchTerm && filteredVoices.length === 0) {
      html = '<div class="tts-voice-loading" style="color: var(--text-muted);">no voices found matching "' + searchTerm + '"</div>';
    }
    
    ttsVoiceList.innerHTML = html;
    
    // Add click handlers
    document.querySelectorAll('.tts-voice-item[data-action="clone-voice"]').forEach(item => {
      item.addEventListener('click', () => {
        openVoiceCloneModal();
      });
    });
    
    document.querySelectorAll('.tts-voice-item[data-voice-id]').forEach(item => {
      item.addEventListener('click', () => {
        const voiceId = item.dataset.voiceId;
        const voiceName = item.dataset.voiceName;
        selectVoice(voiceId, voiceName);
      });
    });
    
    // Initialize Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function filterVoices(searchTerm) {
    const ttsVoiceList = document.getElementById('ttsVoiceList');
    if (!ttsVoiceList) return;
    
    // Get the current voices array and filter them
    let filteredVoices = voices;
    if (searchTerm) {
      filteredVoices = voices.filter(v => 
        v.name.toLowerCase().includes(searchTerm) ||
        (v.labels && Object.values(v.labels).some(label => 
          String(label).toLowerCase().includes(searchTerm)
        ))
      );
    }
    
    // Re-render with filtered voices
    renderVoices(filteredVoices, searchTerm);
    
    // Re-initialize Lucide icons after rendering
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function renderVoiceItem(voice, isCloned) {
    const isSelected = voice.voice_id === selectedVoiceId;
    const previewUrl = voice.preview_url || null;
    
    // Escape previewUrl for use in HTML attributes
    const escapedPreviewUrl = previewUrl ? previewUrl.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
    
    return `
      <div class="tts-voice-item ${isSelected ? 'selected' : ''}" data-voice-id="${voice.voice_id}" data-voice-name="${voice.name}" data-preview-url="${escapedPreviewUrl}">
        <div class="tts-voice-play" data-action="play-preview" onclick="event.stopPropagation(); playVoicePreview('${voice.voice_id}', ${previewUrl ? "'" + previewUrl.replace(/'/g, "\\'") + "'" : 'null'})">
          <i data-lucide="play"></i>
        </div>
        <div class="tts-voice-info">
          <div class="tts-voice-item-name">
            ${voice.name.toLowerCase()}${isSelected ? ' <span class="current-label">(current)</span>' : ''}
          </div>
        </div>
        ${isCloned ? `
          <div class="tts-voice-delete" data-voice-id="${voice.voice_id}" onclick="event.stopPropagation(); deleteVoice('${voice.voice_id}')">
            <i data-lucide="trash-2"></i>
          </div>
        ` : ''}
      </div>
    `;
  }

  // Global play voice preview function
  window.playVoicePreview = function(voiceId, previewUrl) {
    if (!previewUrl) {
      if (window.showToast) {
        window.showToast('no preview available for this voice', 'info');
      }
      return;
    }
    
    // Check if already playing
    if (window.ttsVoicePreviewAudio) {
      // If same voice, pause it
      if (window.ttsVoicePreviewAudio.dataset.voiceId === voiceId) {
        window.ttsVoicePreviewAudio.pause();
        window.ttsVoicePreviewAudio = null;
        // Update icon back to play
        const playBtn = document.querySelector(`.tts-voice-item[data-voice-id="${voiceId}"] .tts-voice-play`);
        if (playBtn) {
          playBtn.innerHTML = '<i data-lucide="play"></i>';
          if (window.lucide) window.lucide.createIcons(playBtn);
        }
        return;
      } else {
        // Stop other voice
        const oldVoiceId = window.ttsVoicePreviewAudio.dataset.voiceId;
        window.ttsVoicePreviewAudio.pause();
        window.ttsVoicePreviewAudio = null;
        // Update old icon
        const oldPlayBtn = document.querySelector(`.tts-voice-item[data-voice-id="${oldVoiceId}"] .tts-voice-play`);
        if (oldPlayBtn) {
          oldPlayBtn.innerHTML = '<i data-lucide="play"></i>';
          if (window.lucide) window.lucide.createIcons(oldPlayBtn);
        }
      }
    }
    
    // Create audio element
    const audio = new Audio(previewUrl);
    audio.dataset.voiceId = voiceId;
    
    // Update icon to pause
    const playBtn = document.querySelector(`.tts-voice-item[data-voice-id="${voiceId}"] .tts-voice-play`);
    if (playBtn) {
      playBtn.innerHTML = '<i data-lucide="pause"></i>';
      if (window.lucide) window.lucide.createIcons(playBtn);
    }
    
    // Play audio
    audio.play().catch(err => {
      if (window.showToast) {
        window.showToast('failed to play preview: ' + err.message, 'error');
      }
      // Reset icon
      if (playBtn) {
        playBtn.innerHTML = '<i data-lucide="play"></i>';
        if (window.lucide) window.lucide.createIcons(playBtn);
      }
    });
    
    // Update icon back to play when done
    audio.addEventListener('ended', () => {
      if (playBtn) {
        playBtn.innerHTML = '<i data-lucide="play"></i>';
        if (window.lucide) window.lucide.createIcons(playBtn);
      }
      window.ttsVoicePreviewAudio = null;
    });
    
    audio.addEventListener('pause', () => {
      if (playBtn) {
        playBtn.innerHTML = '<i data-lucide="play"></i>';
        if (window.lucide) window.lucide.createIcons(playBtn);
      }
    });
    
    window.ttsVoicePreviewAudio = audio;
  };

  function selectVoice(voiceId, voiceName) {
    selectedVoiceId = voiceId;
    selectedVoiceName = voiceName;
    
    updateVoiceButton();
    
    closeVoiceSelector();
  }
  
  function updateVoiceButton() {
    const ttsSelectedVoice = document.getElementById('ttsSelectedVoice');
    if (ttsSelectedVoice) {
      ttsSelectedVoice.textContent = selectedVoiceName.toLowerCase();
    }
    
    // Re-initialize icons to ensure speech icon is rendered
    if (window.lucide) {
      const btn = document.getElementById('ttsVoiceSelectBtn');
      if (btn) {
        window.lucide.createIcons(btn);
      }
    }
  }

  function openVoiceCloneModal() {
    const ttsVoiceCloneOverlay = document.getElementById('ttsVoiceCloneOverlay');
    if (ttsVoiceCloneOverlay) {
      closeVoiceSelector(); // Close voice selector first
      
      // Use requestAnimationFrame to ensure the close animation completes before opening
      requestAnimationFrame(() => {
        ttsVoiceCloneOverlay.classList.add('show');
        
        // Reset form
        const voiceNameInput = document.getElementById('ttsCloneVoiceName');
        if (voiceNameInput) {
          voiceNameInput.value = '';
        }
        
        // Clear samples list
        const samplesList = document.getElementById('ttsCloneSamplesList');
        if (samplesList) {
          samplesList.innerHTML = '';
        }
        
        // Reset clone voice state
        window.ttsCloneVoiceSamples = [];
        
        // Setup drag and drop for upload area
        const uploadArea = document.querySelector('.tts-clone-upload-area');
        if (uploadArea && !uploadArea.dataset.dndSetup) {
          uploadArea.dataset.dndSetup = 'true';
          
          uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadArea.classList.add('drag-over');
          });
          
          uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadArea.classList.remove('drag-over');
          });
          
          uploadArea.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadArea.classList.remove('drag-over');
            
            const files = Array.from(e.dataTransfer.files).filter(file => 
              file.type.startsWith('audio/')
            );
            
            if (files.length === 0) {
      if (window.showToast) {
                window.showToast('please drop audio files only', 'error');
              }
              return;
            }
            
            for (const file of files) {
              await handleCloneVoiceFileUpload(file);
            }
          });
        }
      
      // Initialize Lucide icons
      if (window.lucide) {
        window.lucide.createIcons();
      }
      });
    }
  }

  function closeVoiceCloneModal() {
    const ttsVoiceCloneOverlay = document.getElementById('ttsVoiceCloneOverlay');
    if (ttsVoiceCloneOverlay) {
      ttsVoiceCloneOverlay.classList.remove('show');
    }
    
    // Stop any ongoing recording
    const state = window.ttsCloneRecordingState;
    if (state && state.isRecording) {
      stopCloneVoiceRecording();
    }
  }

  // Clone voice recording functions (adapted from recording.js)
  async function startCloneVoiceRecording() {
    const state = window.ttsCloneRecordingState;
    
    // If already recording, stop it
    if (state.isRecording) {
      stopCloneVoiceRecording();
      return;
    }

    try {
      // Get MediaRecorder options (same as recording.js)
      const getMediaRecorderOptions = (type) => {
        const options = {};
        if (type === 'audio') {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            options.mimeType = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            options.mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            options.mimeType = 'audio/mp4';
          }
        }
        return options;
      };

      // Request microphone access
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: { ideal: 44100 },
        channelCount: { ideal: 1 }
      };

      state.audioStream = await navigator.mediaDevices.getUserMedia({ 
        audio: audioConstraints
      });

      // Setup media recorder
      state.audioChunks = [];
      const audioOptions = getMediaRecorderOptions('audio');
      state.audioRecorder = new MediaRecorder(state.audioStream, audioOptions);
      state.isRecording = true;

      // Update button UI - don't change layout, just icon and text
      const recordBtn = document.getElementById('ttsCloneRecordBtn');
      if (recordBtn) {
        const icon = recordBtn.querySelector('i');
        const text = recordBtn.querySelector('span');
        if (icon) {
          icon.setAttribute('data-lucide', 'square');
        }
        if (text) {
          text.textContent = 'stop';
        }
        if (window.lucide) {
          window.lucide.createIcons(recordBtn);
        }
      }

      state.audioRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          state.audioChunks.push(event.data);
        }
      };

      state.audioRecorder.onstop = async () => {
        await handleCloneVoiceRecordingComplete();
      };

      state.audioRecorder.onerror = (event) => {
        console.error('Clone voice recording error:', event.error);
        if (window.showToast) {
          window.showToast('recording error: ' + event.error.message, 'error');
        }
        stopCloneVoiceRecording();
      };

      // Start recording
      state.audioRecorder.start();

      if (window.showToast) {
        window.showToast('recording started', 'info');
      }

    } catch (error) {
      console.error('Failed to start clone voice recording:', error);
      if (window.showToast) {
        window.showToast('failed to start recording: ' + error.message, 'error');
      }
      state.isRecording = false;
      if (state.audioStream) {
        state.audioStream.getTracks().forEach(track => track.stop());
        state.audioStream = null;
      }
    }
  }

  function stopCloneVoiceRecording() {
    const state = window.ttsCloneRecordingState;
    if (!state.isRecording) return;

    // Stop media recorder
    if (state.audioRecorder && state.audioRecorder.state !== 'inactive') {
      state.audioRecorder.requestData();
      setTimeout(() => {
        state.audioRecorder.stop();
      }, 100);
    }

    // Stop all tracks
    if (state.audioStream) {
      state.audioStream.getTracks().forEach(track => track.stop());
      state.audioStream = null;
    }

    // Update button UI back to record state
    const recordBtn = document.getElementById('ttsCloneRecordBtn');
    if (recordBtn) {
      const icon = recordBtn.querySelector('i');
      const text = recordBtn.querySelector('span');
      if (icon) {
        icon.setAttribute('data-lucide', 'mic');
      }
      if (text) {
        text.textContent = 'record';
      }
      if (window.lucide) {
        window.lucide.createIcons(recordBtn);
      }
    }

    state.isRecording = false;
  }

  async function handleCloneVoiceRecordingComplete() {
    const state = window.ttsCloneRecordingState;

    try {
      if (state.audioChunks.length === 0) {
        throw new Error('No audio data captured');
      }

      // Determine file extension based on MIME type
      const mimeType = state.audioRecorder?.mimeType || 'audio/webm';
      const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';

      const blob = new Blob(state.audioChunks, { type: mimeType });

      if (blob.size === 0) {
        throw new Error('Audio blob is empty');
      }

      // Save webm file first
      const fileName = `tts_clone_recording_${Date.now()}.${extension}`;
      const formData = new FormData();
      formData.append('file', blob, fileName);
      formData.append('targetDir', 'uploads');
      formData.append('type', 'audio');

      const port = typeof getServerPort === 'function' ? getServerPort() : 3000;
      const response = await fetch(`http://127.0.0.1:${port}/recording/save`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save recording: ${errorText}`);
      }

      const result = await response.json();

      if (result.ok && result.path) {
        let finalPath = result.path;
        
        // Convert webm to mp3 if needed
        if (extension === 'webm') {
          try {
            await window.ensureAuthToken();
            const convertResponse = await fetch(`http://127.0.0.1:${port}/extract-audio`, {
              method: 'POST',
              headers: window.authHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({
                videoPath: result.path,
                format: 'mp3'
              })
            });
            
            if (convertResponse.ok) {
              const convertData = await convertResponse.json();
              if (convertData.ok && convertData.audioPath) {
                finalPath = convertData.audioPath;
              }
            }
          } catch (convertError) {
            console.warn('Failed to convert webm to mp3, using webm:', convertError);
            // Continue with webm file if conversion fails
          }
        }

        // Add to samples array
        if (!window.ttsCloneVoiceSamples) {
          window.ttsCloneVoiceSamples = [];
        }

        const sample = {
          fileName: finalPath.split('/').pop() || fileName.replace(/\.webm$/, '.mp3'),
          filePath: finalPath,
          fileSize: blob.size
        };

        window.ttsCloneVoiceSamples.push(sample);

        // Update UI
        renderCloneVoiceSamples();

        // Re-initialize Lucide icons
        if (window.lucide) {
          window.lucide.createIcons();
        }

        if (window.showToast) {
          window.showToast('recording saved', 'success');
        }
      } else {
        throw new Error(result.error || 'Failed to save recording');
      }

    } catch (error) {
      console.error('Clone voice recording completion error:', error);
      if (window.showToast) {
        window.showToast('failed to save recording: ' + error.message, 'error');
      }
    } finally {
      // Reset state
      state.audioChunks = [];
      state.audioRecorder = null;
      state.isRecording = false;
      state.audioContext = null;
      state.audioAnalyser = null;
      state.audioAnimationFrame = null;
      
      // Reset button UI back to record state
      const recordBtn = document.getElementById('ttsCloneRecordBtn');
      if (recordBtn) {
        const icon = recordBtn.querySelector('i');
        const text = recordBtn.querySelector('span');
        if (icon) {
          icon.setAttribute('data-lucide', 'mic');
        }
        if (text) {
          text.textContent = 'record';
        }
        if (window.lucide) {
          window.lucide.createIcons(recordBtn);
        }
      }
      
      // Hide waveform
      const waveformWrapper = document.getElementById('ttsCloneWaveformWrapper');
      if (waveformWrapper) {
        waveformWrapper.style.display = 'none';
      }
    }
  }

  async function handleCloneVoiceFileUpload(file) {
    if (!file) return;
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      if (window.showToast) {
        window.showToast('file size must be less than 10MB', 'error');
      }
      return;
    }
    
    // Validate file type
    if (!file.type.startsWith('audio/')) {
      if (window.showToast) {
        window.showToast('please select an audio file', 'error');
      }
      return;
    }
    
    try {
      // Save file to server first
      const formData = new FormData();
      formData.append('file', file);
      formData.append('targetDir', 'uploads');
      
      const response = await fetch('http://127.0.0.1:3000/recording/save', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Failed to save file');
      }
      
      const data = await response.json();
      
      // Add to samples array
      if (!window.ttsCloneVoiceSamples) {
        window.ttsCloneVoiceSamples = [];
      }
      
      const sample = {
        fileName: file.name,
        filePath: data.path,
        fileSize: file.size
      };
      
      window.ttsCloneVoiceSamples.push(sample);
      
      // Update UI
      renderCloneVoiceSamples();
      
      // Re-initialize Lucide icons
      if (window.lucide) {
        window.lucide.createIcons();
      }
      
    } catch (error) {
      if (window.showToast) {
        window.showToast('failed to upload file: ' + error.message, 'error');
      }
    }
  }

  async function handleCloneVoiceFromVideo() {
    // Check if video is already selected, otherwise open file picker
    if (!window.selectedVideo && !window.selectedVideoUrl) {
      // Open video file picker
      try {
        if (typeof window.openFileDialog === 'function') {
          const videoPath = await window.openFileDialog('video');
          if (videoPath) {
            window.selectedVideo = videoPath;
          } else {
            if (window.showToast) {
              window.showToast('no video selected', 'info');
            }
            return;
          }
        } else if (typeof window.selectVideo === 'function') {
          await window.selectVideo();
          if (!window.selectedVideo && !window.selectedVideoUrl) {
            return;
          }
        } else {
          if (window.showToast) {
            window.showToast('video picker not available', 'error');
          }
          return;
        }
      } catch (error) {
        if (window.showToast) {
          window.showToast('failed to open video picker: ' + error.message, 'error');
        }
        return;
      }
    }
    
    // Now extract audio from selected video
    try {
      if (window.showToast) {
        window.showToast('extracting audio from video...', 'info');
      }
      
      // Get video path
      const videoPath = window.selectedVideo;
      const videoUrl = window.selectedVideoUrl;
      
      // Call backend to extract audio
      const port = typeof getServerPort === 'function' ? getServerPort() : 3000;
      const response = await fetch(`http://127.0.0.1:${port}/extract-audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoPath: videoPath,
          videoUrl: videoUrl,
          format: 'mp3'
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to extract audio');
      }
      
      const data = await response.json();
      
      if (!data.audioPath) {
        throw new Error('No audio path returned');
      }
      
      // Extract filename from path
      const fileName = data.audioPath.split(/[/\\]/).pop() || 'extracted-audio.mp3';
      
      // Add to samples array
      if (!window.ttsCloneVoiceSamples) {
        window.ttsCloneVoiceSamples = [];
      }
      
      const sample = {
        fileName: fileName,
        filePath: data.audioPath,
        fileSize: 0 // Size unknown without server call
      };
      
      window.ttsCloneVoiceSamples.push(sample);
      
      // Update UI
      renderCloneVoiceSamples();
      
      // Re-initialize Lucide icons
      if (window.lucide) {
        window.lucide.createIcons();
      }
      
      if (window.showToast) {
        window.showToast('audio extracted successfully', 'success');
      }
      
    } catch (error) {
      if (window.showToast) {
        window.showToast('failed to extract audio: ' + error.message, 'error');
      }
    }
  }

  function renderCloneVoiceSamples() {
    const samplesList = document.getElementById('ttsCloneSamplesList');
    if (!samplesList) return;
    
    if (!window.ttsCloneVoiceSamples || window.ttsCloneVoiceSamples.length === 0) {
      samplesList.innerHTML = '';
      return;
    }
    
    samplesList.innerHTML = window.ttsCloneVoiceSamples.map((sample, index) => {
      // Check if this sample is currently playing (check both paused state and dataset)
      const isPlaying = window.ttsCloneSampleAudio && 
                       window.ttsCloneSampleAudio.dataset.sampleIndex === String(index) &&
                       !window.ttsCloneSampleAudio.paused;
      return `
        <div class="tts-clone-sample-item">
          <button class="tts-clone-sample-btn" onclick="event.stopPropagation(); playCloneSample('${sample.filePath}', ${index})">
            <i data-lucide="${isPlaying ? 'pause' : 'play'}"></i>
            <span>${sample.fileName}</span>
          </button>
          <button class="tts-clone-sample-delete" onclick="event.stopPropagation(); removeCloneSample(${index})">
            <i data-lucide="x"></i>
          </button>
        </div>
      `;
    }).join('');
    
    // Re-initialize Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function removeCloneSample(index) {
    if (window.ttsCloneVoiceSamples && window.ttsCloneVoiceSamples[index]) {
      window.ttsCloneVoiceSamples.splice(index, 1);
      renderCloneVoiceSamples();
      
      // Re-initialize Lucide icons
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }
  }

  function playCloneSample(filePath, sampleIndex) {
    // Check if there's already an audio element playing
    if (window.ttsCloneSampleAudio) {
      // If same sample, pause it
      if (window.ttsCloneSampleAudio.dataset.sampleIndex === String(sampleIndex)) {
        window.ttsCloneSampleAudio.pause();
        window.ttsCloneSampleAudio = null;
        renderCloneVoiceSamples(); // Update UI
        return;
      } else {
        // Stop current playback
        window.ttsCloneSampleAudio.pause();
        window.ttsCloneSampleAudio = null;
      }
    }
    
    // Get server port
    const port = typeof getServerPort === 'function' ? getServerPort() : 3000;
    
    // Create audio element - use server endpoint for file access
    const audio = new Audio();
    audio.dataset.sampleIndex = String(sampleIndex);
    
    // Try to load via server endpoint
    audio.src = `http://127.0.0.1:${port}/recording/file?path=${encodeURIComponent(filePath)}`;
    
    // Update UI to show pause icon immediately
    renderCloneVoiceSamples();
    
    // Play audio
    audio.play().then(() => {
      // Audio started playing, update UI
      renderCloneVoiceSamples();
    }).catch(err => {
      if (window.showToast) {
        window.showToast('failed to play sample: ' + err.message, 'error');
      }
      renderCloneVoiceSamples(); // Reset UI
    });
    
    window.ttsCloneSampleAudio = audio;
    
    // Update UI back to play icon when done
    audio.addEventListener('ended', () => {
      window.ttsCloneSampleAudio = null;
      renderCloneVoiceSamples();
    });
    
    audio.addEventListener('pause', () => {
      renderCloneVoiceSamples();
    });
    
    // Also update on play event
    audio.addEventListener('play', () => {
      renderCloneVoiceSamples();
    });
  }

  async function handleCloneVoiceSave() {
    const voiceNameInput = document.getElementById('ttsCloneVoiceName');
    if (!voiceNameInput) return;
    
    const voiceName = voiceNameInput.value.trim();
    if (!voiceName) {
      if (window.showToast) {
        window.showToast('please enter a voice name', 'error');
      }
      return;
    }
    
    if (!window.ttsCloneVoiceSamples || window.ttsCloneVoiceSamples.length === 0) {
      if (window.showToast) {
        window.showToast('please add at least one audio sample', 'error');
      }
      return;
    }
    
    // Get ElevenLabs API key
    const settings = JSON.parse(localStorage.getItem('syncSettings') || '{}');
    const apiKey = settings.elevenlabsApiKey;
    
    if (!apiKey) {
      if (window.showToast) {
        window.showToast('elevenlabs api key not configured', 'error');
      }
      return;
    }
    
    try {
      // Disable save button
      const saveBtn = document.getElementById('ttsCloneSaveBtn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'saving...';
      }
      
      // Call backend to create voice clone
      const port = typeof getServerPort === 'function' ? getServerPort() : 3000;
      const response = await fetch(`http://127.0.0.1:${port}/tts/voices/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: voiceName,
          files: window.ttsCloneVoiceSamples.map(s => s.filePath),
          elevenApiKey: apiKey
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create voice clone');
      }
      
      const data = await response.json();
      
      // Reload voices list
      await loadVoices();
      
      // Select the newly created voice
      if (data.voice_id) {
        selectVoice(data.voice_id, voiceName);
      }
      
      // Close modal
      closeVoiceCloneModal();
      
      if (window.showToast) {
        window.showToast('voice clone created successfully!', 'success');
      }
      
    } catch (error) {
      if (window.showToast) {
        window.showToast('failed to create voice clone: ' + error.message, 'error');
      }
    } finally {
      // Re-enable save button
      const saveBtn = document.getElementById('ttsCloneSaveBtn');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'save';
      }
    }
  }

  // Expose functions globally
  window.removeCloneSample = removeCloneSample;
  window.playCloneSample = playCloneSample;

  function deleteVoice(voiceId) {
    // Show in-app confirmation modal instead of macOS popup
    const voice = voices.find(v => v.voice_id === voiceId);
    const voiceName = voice ? voice.name : 'this voice';
    
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'tts-delete-modal-overlay';
    modal.innerHTML = `
      <div class="tts-delete-modal">
        <h3 class="tts-delete-modal-title">delete voice</h3>
        <p class="tts-delete-modal-text">are you sure you want to delete "${voiceName.toLowerCase()}"? this action cannot be undone.</p>
        <div class="tts-delete-modal-actions">
          <button class="tts-delete-modal-cancel" id="ttsDeleteCancel">cancel</button>
          <button class="tts-delete-modal-confirm" id="ttsDeleteConfirm">delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Add show class for animation
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });
    
    // Cancel button
    const cancelBtn = document.getElementById('ttsDeleteCancel');
    cancelBtn.addEventListener('click', () => {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
    });
    
    // Confirm button
    const confirmBtn = document.getElementById('ttsDeleteConfirm');
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'deleting...';
      
      try {
        // Get ElevenLabs API key
        const settings = JSON.parse(localStorage.getItem('syncSettings') || '{}');
        const apiKey = settings.elevenlabsApiKey;
        
        if (!apiKey) {
          throw new Error('elevenlabs api key not configured');
        }
        
        // Call backend to delete voice
        const port = typeof getServerPort === 'function' ? getServerPort() : 3000;
        const response = await fetch(`http://127.0.0.1:${port}/tts/voices/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            voiceId: voiceId,
            elevenApiKey: apiKey
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
          throw new Error(errorData.error || `failed to delete voice (${response.status})`);
        }
        
        const responseData = await response.json();
        if (!responseData.ok) {
          throw new Error(responseData.error || 'failed to delete voice');
        }
        
        // Remove from local voices array
        voices = voices.filter(v => v.voice_id !== voiceId);
        
        // If deleted voice was selected, select first available
        if (selectedVoiceId === voiceId) {
          if (voices.length > 0) {
            selectVoice(voices[0].voice_id, voices[0].name);
          } else {
            selectedVoiceId = null;
            selectedVoiceName = null;
            updateVoiceButton();
          }
        }
        
        // Reload voices list if selector is open
        const ttsVoiceSelectorOverlay = document.getElementById('ttsVoiceSelectorOverlay');
        if (ttsVoiceSelectorOverlay && ttsVoiceSelectorOverlay.classList.contains('show')) {
          renderVoices(voices);
        }
        
      if (window.showToast) {
          window.showToast('voice deleted successfully', 'success');
        }
        
        // Close modal
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 200);
        
      } catch (error) {
        if (window.showToast) {
          window.showToast('failed to delete voice: ' + error.message, 'error');
        }
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'delete';
      }
    });
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 200);
      }
    });
  }

  // Expose delete function globally for onclick handler
  window.deleteVoice = deleteVoice;

  async function generateTTS() {
    const ttsTextInput = document.getElementById('ttsTextInput');
    if (!ttsTextInput) return;
    
    const text = ttsTextInput.value.trim();
    if (!text) {
      if (window.showToast) {
        window.showToast('please enter some text first', 'error');
      }
      return;
    }

    if (!selectedVoiceId) {
      if (window.showToast) {
        window.showToast('please select a voice', 'error');
      }
      return;
    }
    
    try {
      // Get ElevenLabs API key from localStorage
      const settings = JSON.parse(localStorage.getItem('syncSettings') || '{}');
      const apiKey = settings.elevenlabsApiKey;
      
      if (!apiKey) {
        if (window.showToast) {
          window.showToast('elevenlabs api key not configured', 'error');
        }
        return;
      }
      
      // Show loading state
      const ttsPreviewBtn = document.getElementById('ttsPreviewBtn');
      if (ttsPreviewBtn) {
        ttsPreviewBtn.disabled = true;
        const previewText = ttsPreviewBtn.querySelector('.tts-preview-text');
        if (previewText) {
          previewText.style.display = 'none';
        }
        ttsPreviewBtn.innerHTML = '<div class="tts-progress-spinner"></div>';
      }
      
      // Call backend API
      const response = await fetch('http://127.0.0.1:3000/tts/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          voiceId: selectedVoiceId,
          model: selectedModel,
          elevenApiKey: apiKey,
          voiceSettings: {
            stability: voiceSettings.stability,
            similarity_boost: voiceSettings.similarityBoost
          }
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate speech');
      }
      
      const data = await response.json();
      
      // Hide TTS interface and show audio preview
      hideTTSInterface();
      
      // Load the generated audio into the audio preview (without triggering cost estimation)
      if (window.loadAudioFile) {
        await window.loadAudioFile(data.audioPath, false);
      } else if (typeof window.renderInputPreview === 'function') {
        // Fallback if loadAudioFile doesn't exist
        window.selectedAudio = data.audioPath;
        window.selectedAudioIsTemp = false;
        window.selectedAudioIsUrl = false;
        window.renderInputPreview('tts');
        if (typeof window.updateLipsyncButton === 'function') {
          window.updateLipsyncButton();
        }
      }
      
      // Now trigger cost estimation after audio is loaded
      if (typeof scheduleEstimate === 'function') {
        scheduleEstimate();
      }
      
      if (window.showToast) {
        window.showToast('tts audio generated successfully!', 'success');
      }
      
    } catch (error) {
      if (window.showToast) {
        window.showToast('failed to generate speech: ' + error.message, 'error');
      }
    } finally {
      // Reset button state
      const ttsPreviewBtn = document.getElementById('ttsPreviewBtn');
      if (ttsPreviewBtn) {
        ttsPreviewBtn.disabled = false;
        ttsPreviewBtn.innerHTML = '<i data-lucide="audio-lines"></i><span class="tts-preview-text" style="display: none;">generate</span>';
        if (window.lucide) {
          window.lucide.createIcons();
        }
        // Update preview button state based on text input
        updatePreviewButtonState();
      }
    }
  }

  // Initialize on page load
  initTTS();

  // Fallback initialization for dynamically loaded content
  window.addEventListener('load', () => {
    setTimeout(() => {
      setupTTSEventListeners();
    }, 500);
  });

  // Export functions for external use
  window.TTSInterface = {
    show: showTTSInterface,
    hide: hideTTSInterface
  };

})();