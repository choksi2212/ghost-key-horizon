/**
 * Ghost Key Universal Extension - Popup Interface
 * Manages extension settings and provides user interface
 */

// DOM elements
const elements = {
  statusIndicator: document.getElementById('status-indicator'),
  statusDot: document.querySelector('.status-dot'),
  statusText: document.querySelector('.status-text'),
  currentSite: document.getElementById('current-site'),
  siteEnabled: document.getElementById('site-enabled'),
  userCount: document.getElementById('user-count'),
  keystrokeEnabled: document.getElementById('keystroke-enabled'),
  voiceEnabled: document.getElementById('voice-enabled'),
  keystrokeStatus: document.getElementById('keystroke-status'),
  voiceStatus: document.getElementById('voice-status'),
  enrollBtn: document.getElementById('enroll-btn'),
  clearSiteBtn: document.getElementById('clear-site-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  statsBtn: document.getElementById('stats-btn'),
  usersSection: document.getElementById('users-section'),
  usersList: document.getElementById('users-list'),
  loadingOverlay: document.getElementById('loading-overlay'),
  modalOverlay: document.getElementById('modal-overlay'),
  modalTitle: document.getElementById('modal-title'),
  modalMessage: document.getElementById('modal-message'),
  modalClose: document.getElementById('modal-close'),
  modalCancel: document.getElementById('modal-cancel'),
  modalConfirm: document.getElementById('modal-confirm')
};

// State
let currentTab = null;
let currentOrigin = null;
let globalSettings = null;
let siteSettings = null;

/**
 * Initialize popup
 */
async function init() {
  try {
    showLoading(true);
    
    // Get current tab
    await getCurrentTab();
    
    // Load settings and data
    await loadData();
    
    // Setup event listeners
    setupEventListeners();
    
    // Update UI
    updateUI();
    
    showLoading(false);
  } catch (error) {
    console.error('Popup initialization failed:', error);
    showError('Failed to initialize extension popup');
    showLoading(false);
  }
}

/**
 * Get current active tab
 */
async function getCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        currentTab = tabs[0];
        currentOrigin = new URL(currentTab.url).origin;
        elements.currentSite.textContent = currentOrigin;
      } else {
        elements.currentSite.textContent = 'Unknown site';
      }
      resolve();
    });
  });
}

/**
 * Load settings and data
 */
async function loadData() {
  try {
    // Load global settings
    const globalResponse = await sendMessage('GET_SETTINGS', { type: 'global' });
    if (globalResponse.success) {
      globalSettings = globalResponse.settings;
    }

    // Load site settings
    if (currentOrigin) {
      const siteResponse = await sendMessage('GET_SETTINGS', { 
        type: 'site', 
        origin: currentOrigin 
      });
      if (siteResponse.success) {
        siteSettings = siteResponse.settings;
      }
    }

    // Load storage stats
    const statsResponse = await sendMessage('GET_STATS', {});
    if (statsResponse.success) {
      updateStorageStats(statsResponse.stats);
    }

  } catch (error) {
    console.error('Failed to load data:', error);
    // Use defaults
    globalSettings = {
      extensionEnabled: true,
      keystrokeThreshold: 0.03,
      voiceThreshold: 0.75,
      requiredSamples: 5,
      voiceMFAEnabled: true
    };
    siteSettings = {
      enabled: true,
      keystrokeEnabled: true,
      voiceEnabled: true
    };
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Site toggle
  elements.siteEnabled.addEventListener('change', handleSiteToggle);
  
  // Feature toggles
  elements.keystrokeEnabled.addEventListener('change', handleKeystrokeToggle);
  elements.voiceEnabled.addEventListener('change', handleVoiceToggle);
  
  // Action buttons
  elements.enrollBtn.addEventListener('click', handleEnrollUser);
  elements.clearSiteBtn.addEventListener('click', handleClearSite);
  elements.settingsBtn.addEventListener('click', handleOpenSettings);
  elements.statsBtn.addEventListener('click', handleShowStats);
  
  // Modal handlers
  elements.modalClose.addEventListener('click', hideModal);
  elements.modalCancel.addEventListener('click', hideModal);
  elements.modalOverlay.addEventListener('click', (e) => {
    if (e.target === elements.modalOverlay) {
      hideModal();
    }
  });
}

/**
 * Update UI with current data
 */
function updateUI() {
  // Update status indicator
  if (globalSettings.extensionEnabled && siteSettings.enabled) {
    updateStatus('active', 'Active');
  } else {
    updateStatus('disabled', 'Disabled');
  }
  
  // Update toggles
  elements.siteEnabled.checked = siteSettings.enabled;
  elements.keystrokeEnabled.checked = siteSettings.keystrokeEnabled;
  elements.voiceEnabled.checked = siteSettings.voiceEnabled;
  
  // Update feature status
  elements.keystrokeStatus.textContent = siteSettings.keystrokeEnabled ? 'Active' : 'Disabled';
  elements.voiceStatus.textContent = siteSettings.voiceEnabled ? 'Active' : 'Disabled';
  
  // Update button states
  elements.enrollBtn.disabled = !siteSettings.enabled;
  elements.clearSiteBtn.disabled = !siteSettings.enabled;
}

/**
 * Update status indicator
 */
function updateStatus(status, text) {
  elements.statusDot.className = `status-dot status-${status}`;
  elements.statusText.textContent = text;
}

/**
 * Update storage statistics
 */
function updateStorageStats(stats) {
  elements.userCount.textContent = stats.keystrokeModels || 0;
  
  // Show users section if there are enrolled users
  if (stats.keystrokeModels > 0) {
    elements.usersSection.style.display = 'block';
    loadUsersList();
  } else {
    elements.usersSection.style.display = 'none';
  }
}

/**
 * Load and display users list
 */
async function loadUsersList() {
  try {
    // For now, show a simple count
    // In a full implementation, you'd load actual user list
    elements.usersList.innerHTML = `
      <div class="user-item">
        <span class="user-icon">👤</span>
        <span class="user-info">${elements.userCount.textContent} enrolled users</span>
      </div>
    `;
  } catch (error) {
    console.error('Failed to load users list:', error);
  }
}

/**
 * Handle site toggle
 */
async function handleSiteToggle() {
  const enabled = elements.siteEnabled.checked;
  
  try {
    showLoading(true);
    
    const newSettings = { ...siteSettings, enabled };
    
    const response = await sendMessage('SET_SETTINGS', {
      type: 'site',
      origin: currentOrigin,
      settings: newSettings
    });
    
    if (response.success) {
      siteSettings = newSettings;
      updateUI();
      showSuccess('Site settings updated');
    } else {
      throw new Error(response.message);
    }
    
  } catch (error) {
    console.error('Failed to update site settings:', error);
    elements.siteEnabled.checked = !enabled; // Revert
    showError('Failed to update site settings');
  } finally {
    showLoading(false);
  }
}

/**
 * Handle keystroke toggle
 */
async function handleKeystrokeToggle() {
  const enabled = elements.keystrokeEnabled.checked;
  
  try {
    const newSettings = { ...siteSettings, keystrokeEnabled: enabled };
    
    const response = await sendMessage('SET_SETTINGS', {
      type: 'site',
      origin: currentOrigin,
      settings: newSettings
    });
    
    if (response.success) {
      siteSettings = newSettings;
      updateUI();
    } else {
      throw new Error(response.message);
    }
    
  } catch (error) {
    console.error('Failed to update keystroke settings:', error);
    elements.keystrokeEnabled.checked = !enabled; // Revert
    showError('Failed to update keystroke settings');
  }
}

/**
 * Handle voice toggle
 */
async function handleVoiceToggle() {
  const enabled = elements.voiceEnabled.checked;
  
  try {
    const newSettings = { ...siteSettings, voiceEnabled: enabled };
    
    const response = await sendMessage('SET_SETTINGS', {
      type: 'site',
      origin: currentOrigin,
      settings: newSettings
    });
    
    if (response.success) {
      siteSettings = newSettings;
      updateUI();
    } else {
      throw new Error(response.message);
    }
    
  } catch (error) {
    console.error('Failed to update voice settings:', error);
    elements.voiceEnabled.checked = !enabled; // Revert
    showError('Failed to update voice settings');
  }
}

/**
 * Handle enroll user
 */
function handleEnrollUser() {
  showInfo('To enroll a new user, simply fill out a login form on this site. Ghost Key will automatically prompt for enrollment when a new user is detected.');
}

/**
 * Handle clear site data
 */
function handleClearSite() {
  showModal(
    'Clear Site Data',
    `Are you sure you want to clear all biometric data for ${currentOrigin}? This action cannot be undone.`,
    'danger',
    async () => {
      try {
        showLoading(true);
        
        const response = await sendMessage('CLEAR_DATA', {
          type: 'site',
          origin: currentOrigin
        });
        
        if (response.success) {
          showSuccess('Site data cleared successfully');
          await loadData();
          updateUI();
        } else {
          throw new Error(response.message);
        }
        
      } catch (error) {
        console.error('Failed to clear site data:', error);
        showError('Failed to clear site data');
      } finally {
        showLoading(false);
      }
    }
  );
}

/**
 * Handle open settings
 */
function handleOpenSettings() {
  chrome.runtime.openOptionsPage();
}

/**
 * Handle show statistics
 */
async function handleShowStats() {
  try {
    const response = await sendMessage('GET_STATS', {});
    
    if (response.success) {
      const stats = response.stats;
      showModal(
        'Storage Statistics',
        `
          <div style="text-align: left;">
            <p><strong>Keystroke Models:</strong> ${stats.keystrokeModels}</p>
            <p><strong>Voice Models:</strong> ${stats.voiceModels}</p>
            <p><strong>Training Samples:</strong> ${stats.trainingSamples}</p>
            <p><strong>Total Records:</strong> ${stats.totalRecords}</p>
          </div>
        `,
        'info'
      );
    } else {
      throw new Error(response.message);
    }
    
  } catch (error) {
    console.error('Failed to get statistics:', error);
    showError('Failed to load statistics');
  }
}

/**
 * Show modal dialog
 */
function showModal(title, message, type = 'info', onConfirm = null) {
  elements.modalTitle.textContent = title;
  elements.modalMessage.innerHTML = message;
  
  // Update confirm button style
  const confirmBtn = elements.modalConfirm;
  confirmBtn.className = `btn btn-${type === 'danger' ? 'danger' : 'primary'}`;
  confirmBtn.textContent = type === 'danger' ? 'Delete' : 'OK';
  
  // Show/hide confirm button based on whether onConfirm is provided
  if (onConfirm) {
    confirmBtn.style.display = 'block';
    confirmBtn.onclick = () => {
      hideModal();
      onConfirm();
    };
  } else {
    confirmBtn.style.display = 'none';
  }
  
  elements.modalOverlay.style.display = 'flex';
}

/**
 * Hide modal dialog
 */
function hideModal() {
  elements.modalOverlay.style.display = 'none';
  elements.modalConfirm.onclick = null;
}

/**
 * Show loading overlay
 */
function showLoading(show) {
  elements.loadingOverlay.style.display = show ? 'flex' : 'none';
}

/**
 * Show success message
 */
function showSuccess(message) {
  showNotification(message, 'success');
}

/**
 * Show error message
 */
function showError(message) {
  showNotification(message, 'error');
}

/**
 * Show info message
 */
function showInfo(message) {
  showNotification(message, 'info');
}

/**
 * Show notification
 */
function showNotification(message, type) {
  showModal(
    type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Information',
    message,
    type
  );
}

/**
 * Send message to background script
 */
async function sendMessage(type, data) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, data }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response || {});
      }
    });
  });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init); 