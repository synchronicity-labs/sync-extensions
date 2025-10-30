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
          ttsPreviewBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            generateTTS();
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
    updateModelDisplay();
  }

  function closeAllDropdowns() {
    const ttsModelMenu = document.getElementById('ttsModelMenu');
    if (ttsModelMenu) {
      ttsModelMenu.classList.remove('show');
    }
  }

  function selectModel(modelId) {
    selectedModel = modelId;
    updateModelDisplay();
  }

  function updateModelDisplay() {
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
      updateModelDisplay();
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
    
    return `
      <div class="tts-voice-item ${isSelected ? 'selected' : ''}" data-voice-id="${voice.voice_id}" data-voice-name="${voice.name}">
        <div class="tts-voice-play">
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
      ttsVoiceCloneOverlay.style.display = 'flex';
      
      // Initialize Lucide icons
      if (window.lucide) {
        window.lucide.createIcons();
      }
      
      // Show info toast
      if (window.showToast) {
        window.showToast('voice cloning requires elevenlabs professional plan', 'info');
      }
    }
  }

  function closeVoiceCloneModal() {
    const ttsVoiceCloneOverlay = document.getElementById('ttsVoiceCloneOverlay');
    if (ttsVoiceCloneOverlay) {
      ttsVoiceCloneOverlay.style.display = 'none';
    }
  }

  function deleteVoice(voiceId) {
    if (confirm('Are you sure you want to delete this custom voice?')) {
      // Note: Voice deletion requires ElevenLabs API integration
      if (window.showToast) {
        window.showToast('voice deletion requires backend implementation', 'info');
      }
    }
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
      
      // Load the generated audio into the audio preview
      if (window.loadAudioFile) {
        await window.loadAudioFile(data.audioPath, false);
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
        ttsPreviewBtn.innerHTML = '<i data-lucide="audio-lines"></i><span class="tts-preview-text" style="display: none;">preview</span>';
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