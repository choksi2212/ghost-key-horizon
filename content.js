/**
 * Ghost Key Universal Extension - Content Script
 * Detects login forms and handles keystroke capture and authentication
 */

(function() {
  'use strict';

  console.log('Ghost Key Universal: Content script loaded on', window.location.origin);

  // Extension state
  const currentSite = window.location.origin;
  let isEnabled = true;
  const activeFields = new Map();

  /**
   * Initialize extension
   */
  async function init() {
    try {
      // Check if extension is enabled for this site
      const response = await sendMessage('GET_SETTINGS', { 
        type: 'site', 
        origin: currentSite 
      });
      
      if (response.success && !response.settings.enabled) {
        console.log('Ghost Key: Disabled for this site');
        return;
      }

      // Find and setup password fields
      setupPasswordFields();
      
      // Watch for dynamically added fields
      observeFormChanges();
      
    } catch (error) {
      console.error('Ghost Key: Initialization failed:', error);
    }
  }

  /**
   * Find and setup password fields
   */
  function setupPasswordFields() {
    const passwordFields = document.querySelectorAll('input[type="password"]');
    
    passwordFields.forEach(field => {
      if (!activeFields.has(field)) {
        setupPasswordField(field);
      }
    });
    
    console.log(`Ghost Key: Found ${passwordFields.length} password fields`);
  }

  /**
   * Setup individual password field
   */
  function setupPasswordField(passwordField) {
    const form = passwordField.closest('form');
    const usernameField = findUsernameField(passwordField);
    
    const fieldData = {
      passwordField,
      usernameField,
      form,
      keystrokes: [],
      isCapturing: false
    };
    
    activeFields.set(passwordField, fieldData);
    
    // Add event listeners
    passwordField.addEventListener('keydown', (e) => handleKeystroke(e, 'keydown', fieldData));
    passwordField.addEventListener('keyup', (e) => handleKeystroke(e, 'keyup', fieldData));
    passwordField.addEventListener('focus', () => resetCapture(fieldData));
    
    // Handle form submission
    if (form) {
      form.addEventListener('submit', (e) => handleSubmit(e, fieldData));
    }
    
    // Add visual indicator
    addIndicator(passwordField);
  }

  /**
   * Find username field
   */
  function findUsernameField(passwordField) {
    const form = passwordField.closest('form') || document;
    
    const selectors = [
      'input[type="email"]',
      'input[name*="user"]',
      'input[name*="email"]',
      'input[id*="user"]',
      'input[id*="email"]'
    ];
    
    for (const selector of selectors) {
      const field = form.querySelector(selector);
      if (field) return field;
    }
    
    return null;
  }

  /**
   * Handle keystroke events
   */
  function handleKeystroke(event, type, fieldData) {
    const keystroke = {
      key: event.key,
      type: type,
      timestamp: performance.now()
    };
    
    fieldData.keystrokes.push(keystroke);
    fieldData.isCapturing = true;
  }

  /**
   * Reset keystroke capture
   */
  function resetCapture(fieldData) {
    fieldData.keystrokes = [];
    fieldData.isCapturing = false;
  }

  /**
   * Handle form submission
   */
  async function handleSubmit(event, fieldData) {
    const { passwordField, usernameField, keystrokes } = fieldData;
    
    if (!passwordField.value || keystrokes.length === 0) {
      return; // No password or no keystrokes captured
    }

    const username = usernameField ? usernameField.value : 'default_user';
    
    try {
      // Extract features
      const features = extractFeatures(keystrokes);
      
      if (!features || features.length === 0) {
        console.warn('Ghost Key: No valid features extracted');
        return;
      }

      // Check authentication
      const authResponse = await sendMessage('AUTH_CHECK', {
        origin: currentSite,
        username,
        features
      });

      if (authResponse.success && authResponse.authenticated) {
        console.log('Ghost Key: Authentication successful');
        showNotification('🔐 Biometric authentication successful', 'success');
      } else if (authResponse.reason && authResponse.reason.includes('No biometric profile found')) {
        // Show enrollment option
        const shouldEnroll = await showEnrollmentDialog(username);
        if (shouldEnroll) {
          event.preventDefault();
          await startEnrollment(username, features, fieldData);
        }
      } else {
        // Authentication failed
        console.log('Ghost Key: Authentication failed');
        showNotification('❌ Biometric authentication failed', 'error');
        
        // Optionally block submission
        event.preventDefault();
        passwordField.value = '';
        passwordField.focus();
      }
      
    } catch (error) {
      console.error('Ghost Key: Authentication error:', error);
    }
  }

  /**
   * Extract keystroke features
   */
  function extractFeatures(keystrokes) {
    if (keystrokes.length === 0) return [];
    
    const keydowns = keystrokes.filter(k => k.type === 'keydown');
    const keyups = keystrokes.filter(k => k.type === 'keyup');
    
    const holdTimes = [];
    const ddTimes = [];
    
    // Calculate hold times
    keydowns.forEach(down => {
      const up = keyups.find(u => u.key === down.key && u.timestamp > down.timestamp);
      if (up) {
        holdTimes.push(up.timestamp - down.timestamp);
      }
    });
    
    // Calculate dwell times (down-down)
    for (let i = 0; i < keydowns.length - 1; i++) {
      ddTimes.push(keydowns[i + 1].timestamp - keydowns[i].timestamp);
    }
    
    // Create feature vector
    const features = [
      ...holdTimes.slice(0, 11),
      ...ddTimes.slice(0, 10)
    ];
    
    // Pad with zeros if needed
    while (features.length < 34) {
      features.push(0);
    }
    
    return features;
  }

  /**
   * Start enrollment process
   */
  async function startEnrollment(username, features, fieldData) {
    try {
      const response = await sendMessage('TRAIN_MODEL', {
        origin: currentSite,
        username,
        features,
        sampleIndex: 0,
        privacyMode: false
      });

      if (response.success) {
        if (response.modelTrained) {
          showNotification('✅ Biometric profile created successfully!', 'success');
          // Submit form
          fieldData.form.submit();
        } else {
          showNotification(`📊 Sample ${response.sampleCount}/${response.requiredSamples} captured. Please type password again.`, 'info');
          fieldData.passwordField.value = '';
          fieldData.passwordField.focus();
        }
      } else {
        showNotification('❌ Enrollment failed: ' + response.message, 'error');
      }
      
    } catch (error) {
      console.error('Ghost Key: Enrollment error:', error);
      showNotification('❌ Enrollment error: ' + error.message, 'error');
    }
  }

  /**
   * Show enrollment dialog
   */
  async function showEnrollmentDialog(username) {
    return new Promise(resolve => {
      const modal = createModal(`
        <h3>🔐 Enable Biometric Authentication?</h3>
        <p>Create a biometric profile for <strong>${username}</strong> on this site?</p>
        <p><small>This requires typing your password 5 times to learn your typing pattern.</small></p>
        <div style="margin-top: 20px;">
          <button id="enroll-yes" style="margin-right: 10px; padding: 8px 16px; background: #007cba; color: white; border: none; border-radius: 4px;">Enable</button>
          <button id="enroll-no" style="padding: 8px 16px; background: #666; color: white; border: none; border-radius: 4px;">Skip</button>
        </div>
      `);
      
      modal.querySelector('#enroll-yes').onclick = () => {
        modal.remove();
        resolve(true);
      };
      
      modal.querySelector('#enroll-no').onclick = () => {
        modal.remove();
        resolve(false);
      };
    });
  }

  /**
   * Create modal dialog
   */
  function createModal(content) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      padding: 30px;
      border-radius: 8px;
      max-width: 400px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    
    modalContent.innerHTML = content;
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    return modal;
  }

  /**
   * Show notification
   */
  function showNotification(message, type) {
    const notification = document.createElement('div');
    const bgColor = type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3';
    
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${bgColor};
      color: white;
      padding: 15px 20px;
      border-radius: 4px;
      z-index: 10000;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      max-width: 300px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  /**
   * Add visual indicator
   */
  function addIndicator(passwordField) {
    const indicator = document.createElement('span');
    indicator.textContent = '👻';
    indicator.title = 'Ghost Key biometric authentication enabled';
    indicator.style.cssText = `
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 16px;
      pointer-events: none;
      z-index: 1000;
    `;
    
    const container = passwordField.parentElement;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    
    container.appendChild(indicator);
  }

  /**
   * Observe form changes
   */
  function observeFormChanges() {
    const observer = new MutationObserver(() => {
      setupPasswordFields();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
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

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(); 