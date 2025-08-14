/**
 * Keystroke Dynamics Analysis for Ghost Key Universal Extension
 * Ported from Ghost Key project hooks/use-keystroke-analyzer.ts
 * Captures and analyzes keystroke timing patterns for biometric authentication
 */

// Configuration constants
const AUTH_CONFIG = {
  PASSWORD_LENGTH: 11, // Default password length for feature extraction
  SAMPLES_REQUIRED: 5,
  AUTOENCODER_THRESHOLD: 0.03
};

/**
 * Keystroke event structure
 */
class KeystrokeEvent {
  constructor(key, type, timestamp) {
    this.key = key;
    this.type = type; // 'keydown' or 'keyup'
    this.timestamp = timestamp;
  }
}

/**
 * Extracted keystroke features structure
 */
class ExtractedFeatures {
  constructor() {
    this.holdTimes = [];
    this.ddTimes = [];
    this.udTimes = [];
    this.typingSpeed = 0;
    this.flightTime = 0;
    this.errorRate = 0;
    this.pressPressure = 0;
    this.features = [];
  }
}

/**
 * Main keystroke analyzer class
 * Handles capture, feature extraction, and analysis
 */
class KeystrokeAnalyzer {
  constructor() {
    this.keystrokeData = [];
    this.isCapturing = false;
    this.lastCaptureTime = 0;
    this.sessionId = this.generateSessionId();
  }

  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Capture keystroke event
   * Ported from Ghost Key useKeystrokeAnalyzer hook
   */
  captureKeystroke(event, type) {
    // Ignore special keys that shouldn't be part of biometric analysis
    const ignoredKeys = [
      'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete',
      'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
    ];

    if (ignoredKeys.includes(event.key)) {
      return;
    }

    const keystroke = new KeystrokeEvent(
      event.key,
      type,
      performance.now()
    );

    this.keystrokeData.push(keystroke);
    this.lastCaptureTime = performance.now();
    this.isCapturing = true;

    // Auto-stop capturing after inactivity
    setTimeout(() => {
      if (performance.now() - this.lastCaptureTime > 5000) { // 5 second timeout
        this.isCapturing = false;
      }
    }, 5100);
  }

  /**
   * Extract features from captured keystroke data
   * Ported exactly from Ghost Key useKeystrokeAnalyzer hook
   */
  extractFeatures(data = null) {
    const keystrokeData = data || this.keystrokeData;
    
    if (keystrokeData.length === 0) {
      console.warn('No keystroke data to extract features from');
      return new ExtractedFeatures();
    }

    // Separate keydown and keyup events
    const keydowns = keystrokeData.filter((k) => k.type === "keydown");
    const keyups = keystrokeData.filter((k) => k.type === "keyup");

    // Create matched keys array (key, timestamp) for keydown events
    const matchedKeys = keydowns.map((k) => [k.key, k.timestamp]);

    const holdTimes = [];
    const ddTimes = [];
    const udTimes = [];

    // Calculate hold times (key press to key release)
    // This measures how long each key is held down
    matchedKeys.forEach(([key, downTs]) => {
      const upEvent = keyups.find((u) => u.key === key && u.timestamp > downTs);
      if (upEvent) {
        holdTimes.push(upEvent.timestamp - downTs);
      }
    });

    // Calculate dwell times (down-down times between consecutive key presses)
    // This measures the time between consecutive key presses
    for (let i = 0; i < matchedKeys.length - 1; i++) {
      const press1 = matchedKeys[i][1];
      const press2 = matchedKeys[i + 1][1];
      ddTimes.push(press2 - press1);
    }

    // Calculate flight times (up-down times)
    // This measures the time between releasing one key and pressing the next
    for (let i = 0; i < matchedKeys.length - 1; i++) {
      const currentKey = matchedKeys[i][0];
      const currentDown = matchedKeys[i][1];
      const nextDown = matchedKeys[i + 1][1];

      const currentUp = keyups.find((u) => u.key === currentKey && u.timestamp > currentDown);
      if (currentUp) {
        udTimes.push(nextDown - currentUp.timestamp);
      } else {
        // Fallback if no up event found
        udTimes.push(nextDown - currentDown);
      }
    }

    // Calculate additional biometric features
    const totalTime = Math.max(
      holdTimes.reduce((sum, t) => sum + t, 0),
      ddTimes.reduce((sum, t) => sum + t, 0),
      udTimes.reduce((sum, t) => sum + t, 0),
    ) || 0.001;

    const typingSpeed = matchedKeys.length / (totalTime / 1000);
    const flightTime = udTimes.length > 0 ? udTimes.reduce((a, b) => a + b, 0) / udTimes.length : 0;
    const errorRate = keystrokeData.filter((k) => k.key === "Backspace").length;

    // Calculate press pressure (variance of hold times)
    // This indicates consistency in key press duration
    const meanHoldTime = holdTimes.length > 0 ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length : 0;
    const pressPressure = holdTimes.length > 0
      ? Math.sqrt(holdTimes.reduce((sum, t) => sum + Math.pow(t - meanHoldTime, 2), 0) / holdTimes.length)
      : 0;

    // Create feature vector (matching original Ghost Key implementation)
    const PASSWORD_LENGTH = AUTH_CONFIG.PASSWORD_LENGTH;
    const featureVector = [
      ...holdTimes.slice(0, PASSWORD_LENGTH),
      ...ddTimes.slice(0, PASSWORD_LENGTH - 1),
      ...udTimes.slice(0, PASSWORD_LENGTH - 1),
      typingSpeed,
      flightTime,
      errorRate,
      pressPressure,
    ];

    // Pad with zeros if needed to ensure consistent feature vector length
    while (featureVector.length < PASSWORD_LENGTH * 3 + 1) {
      featureVector.push(0);
    }

    const features = new ExtractedFeatures();
    features.holdTimes = holdTimes;
    features.ddTimes = ddTimes;
    features.udTimes = udTimes;
    features.typingSpeed = typingSpeed;
    features.flightTime = flightTime;
    features.errorRate = errorRate;
    features.pressPressure = pressPressure;
    features.features = featureVector;

    return features;
  }

  /**
   * Reset captured data
   */
  resetCapture() {
    this.keystrokeData = [];
    this.isCapturing = false;
    this.sessionId = this.generateSessionId();
  }

  /**
   * Get current keystroke data
   */
  getKeystrokeData() {
    return [...this.keystrokeData];
  }

  /**
   * Get capture status
   */
  isCurrentlyCapturing() {
    return this.isCapturing;
  }

  /**
   * Get session information
   */
  getSessionInfo() {
    return {
      sessionId: this.sessionId,
      captureStartTime: this.keystrokeData.length > 0 ? this.keystrokeData[0].timestamp : null,
      lastActivity: this.lastCaptureTime,
      eventCount: this.keystrokeData.length,
      isCapturing: this.isCapturing
    };
  }

  /**
   * Validate extracted features
   */
  validateFeatures(features) {
    if (!features || !features.features) {
      return { valid: false, reason: 'No features extracted' };
    }

    if (features.features.length === 0) {
      return { valid: false, reason: 'Empty feature vector' };
    }

    const hasNaN = features.features.some(f => isNaN(f));
    if (hasNaN) {
      return { valid: false, reason: 'Feature vector contains NaN values' };
    }

    const hasInfinite = features.features.some(f => !isFinite(f));
    if (hasInfinite) {
      return { valid: false, reason: 'Feature vector contains infinite values' };
    }

    if (features.holdTimes.length === 0 && features.ddTimes.length === 0) {
      return { valid: false, reason: 'Insufficient keystroke timing data' };
    }

    return { valid: true };
  }

  /**
   * Generate feature summary for debugging
   */
  getFeatureSummary(features) {
    if (!features) return null;

    return {
      holdTimesCount: features.holdTimes.length,
      ddTimesCount: features.ddTimes.length,
      udTimesCount: features.udTimes.length,
      typingSpeed: features.typingSpeed?.toFixed(2),
      flightTime: features.flightTime?.toFixed(2),
      errorRate: features.errorRate,
      pressPressure: features.pressPressure?.toFixed(2),
      featureVectorLength: features.features.length,
      avgHoldTime: features.holdTimes.length > 0 
        ? (features.holdTimes.reduce((a, b) => a + b, 0) / features.holdTimes.length).toFixed(2)
        : 0,
      avgDwellTime: features.ddTimes.length > 0
        ? (features.ddTimes.reduce((a, b) => a + b, 0) / features.ddTimes.length).toFixed(2)
        : 0
    };
  }
}

/**
 * Password field detector utility
 * Finds password fields on the current page
 */
class PasswordFieldDetector {
  constructor() {
    this.passwordSelectors = [
      'input[type="password"]',
      'input[name*="pass"]',
      'input[name*="pwd"]',
      'input[id*="pass"]',
      'input[id*="pwd"]',
      'input[placeholder*="password" i]',
      'input[placeholder*="pass" i]',
      'input[autocomplete="current-password"]',
      'input[autocomplete="new-password"]'
    ];
  }

  /**
   * Find all password fields on the page
   */
  findPasswordFields() {
    const fields = [];
    
    // Standard password fields
    this.passwordSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (this.isValidPasswordField(el)) {
            fields.push(el);
          }
        });
      } catch (e) {
        console.warn(`Failed to query selector ${selector}:`, e);
      }
    });

    // Shadow DOM search (best effort)
    this.searchShadowDOM(document.body, fields);

    return [...new Set(fields)]; // Remove duplicates
  }

  /**
   * Search for password fields in Shadow DOM
   */
  searchShadowDOM(element, fields) {
    if (!element || !element.shadowRoot) return;

    try {
      this.passwordSelectors.forEach(selector => {
        const shadowElements = element.shadowRoot.querySelectorAll(selector);
        shadowElements.forEach(el => {
          if (this.isValidPasswordField(el)) {
            fields.push(el);
          }
        });
      });

      // Recursively search child shadow roots
      const allElements = element.shadowRoot.querySelectorAll('*');
      allElements.forEach(child => {
        this.searchShadowDOM(child, fields);
      });
    } catch (e) {
      // Shadow DOM access might be restricted
      console.debug('Shadow DOM access restricted:', e);
    }
  }

  /**
   * Validate if element is a proper password field
   */
  isValidPasswordField(element) {
    if (!element || element.tagName !== 'INPUT') return false;
    if (element.disabled || element.readonly) return false;
    if (element.style.display === 'none' || element.style.visibility === 'hidden') return false;
    
    // Check if field is visible
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    return true;
  }

  /**
   * Find the closest form to a password field
   */
  findParentForm(passwordField) {
    let current = passwordField;
    while (current && current !== document.body) {
      if (current.tagName === 'FORM') {
        return current;
      }
      current = current.parentElement;
    }
    
    // If no form found, look for common form containers
    const containers = passwordField.closest('[role="form"], .form, .login-form, .signup-form, .register-form');
    return containers;
  }

  /**
   * Find username field associated with password field
   */
  findUsernameField(passwordField) {
    const form = this.findParentForm(passwordField);
    const searchContext = form || document;

    const usernameSelectors = [
      'input[type="email"]',
      'input[type="text"][name*="user"]',
      'input[type="text"][name*="email"]',
      'input[type="text"][id*="user"]',
      'input[type="text"][id*="email"]',
      'input[autocomplete="username"]',
      'input[autocomplete="email"]',
      'input[placeholder*="username" i]',
      'input[placeholder*="email" i]'
    ];

    for (const selector of usernameSelectors) {
      try {
        const field = searchContext.querySelector(selector);
        if (field && this.isValidInputField(field)) {
          return field;
        }
      } catch (e) {
        console.warn(`Failed to query username selector ${selector}:`, e);
      }
    }

    return null;
  }

  /**
   * Validate if element is a proper input field
   */
  isValidInputField(element) {
    if (!element || element.tagName !== 'INPUT') return false;
    if (element.disabled || element.readonly) return false;
    if (element.style.display === 'none' || element.style.visibility === 'hidden') return false;
    
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    return true;
  }
}

// Export classes and utilities
export {
  KeystrokeAnalyzer,
  PasswordFieldDetector,
  KeystrokeEvent,
  ExtractedFeatures,
  AUTH_CONFIG
}; 