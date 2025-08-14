/**
 * Ghost Key Universal Extension - Background Service Worker
 * Handles authentication and training messages from content scripts
 * Manages storage and autoencoder processing
 */

// Import libraries (ES6 modules in service worker)
importScripts(
  'libs/storage.js',
  'libs/autoencoder.js',
  'libs/voice.js'
);

// Message types
const MESSAGE_TYPES = {
  AUTH_CHECK: 'AUTH_CHECK',
  VOICE_CHECK: 'VOICE_CHECK',
  TRAIN_MODEL: 'TRAIN_MODEL',
  TRAIN_VOICE: 'TRAIN_VOICE',
  GET_SETTINGS: 'GET_SETTINGS',
  SET_SETTINGS: 'SET_SETTINGS',
  CLEAR_DATA: 'CLEAR_DATA',
  GET_STATS: 'GET_STATS',
  HEALTH_CHECK: 'HEALTH_CHECK'
};

// Response helper
function sendResponse(sendResponse, success, data = {}, message = '') {
  sendResponse({
    success,
    message,
    timestamp: new Date().toISOString(),
    ...data
  });
}

// Error handler
function handleError(error, operation) {
  console.error(`Ghost Key Extension Error in ${operation}:`, error);
  return {
    success: false,
    message: error.message || 'Unknown error occurred',
    error: error.toString(),
    timestamp: new Date().toISOString()
  };
}

/**
 * Handle keystroke authentication check
 */
async function handleAuthCheck(data, sender, sendResponse) {
  try {
    const { origin, username, features } = data;
    
    if (!origin || !username || !features) {
      return sendResponse(false, {}, 'Missing required authentication data');
    }

    console.log(`Keystroke auth check for ${username} on ${origin}`);

    // Get stored model
    const modelData = await storage.getKeystrokeModel(origin, username);
    
    if (!modelData) {
      return sendResponse(false, {
        authenticated: false,
        reason: 'No biometric profile found. Please enroll first.'
      });
    }

    // Authenticate using the autoencoder
    const result = authenticateWithModel(features, modelData);
    
    // Log authentication attempt
    console.log(`Auth result for ${username}:`, {
      authenticated: result.authenticated,
      error: result.reconstructionError?.toFixed(6),
      threshold: result.threshold?.toFixed(6)
    });

    return sendResponse(true, {
      authenticated: result.authenticated,
      reconstructionError: result.reconstructionError,
      threshold: result.threshold,
      confidence: result.confidence,
      deviations: result.deviations,
      reason: result.authenticated ? 'Authentication successful' : 'Biometric pattern mismatch'
    });

  } catch (error) {
    console.error('Authentication error:', error);
    return sendResponse(false, {
      authenticated: false,
      reason: `Authentication failed: ${error.message}`
    });
  }
}

/**
 * Handle voice authentication check
 */
async function handleVoiceCheck(data, sender, sendResponse) {
  try {
    const { origin, username, voiceFeatures } = data;
    
    if (!origin || !username || !voiceFeatures) {
      return sendResponse(false, {}, 'Missing required voice authentication data');
    }

    console.log(`Voice auth check for ${username} on ${origin}`);

    // Get stored voice model
    const voiceModel = await storage.getVoiceModel(origin, username);
    
    if (!voiceModel) {
      return sendResponse(false, {
        authenticated: false,
        reason: 'No voice profile found. Please enroll voice biometrics first.'
      });
    }

    // Get voice threshold from settings
    const globalSettings = await storage.getGlobalSettings();
    const threshold = globalSettings.voiceThreshold;

    // Verify voice using similarity calculation
    const result = verifyVoiceProfile(voiceFeatures, voiceModel, threshold);
    
    console.log(`Voice auth result for ${username}:`, {
      authenticated: result.success,
      similarity: result.similarity?.toFixed(3),
      threshold: result.threshold?.toFixed(3)
    });

    return sendResponse(true, {
      authenticated: result.success,
      similarity: result.similarity,
      threshold: result.threshold,
      confidence: result.confidence,
      detailedMetrics: result.detailedMetrics,
      reason: result.success ? 'Voice authentication successful' : 'Voice pattern mismatch'
    });

  } catch (error) {
    console.error('Voice authentication error:', error);
    return sendResponse(false, {
      authenticated: false,
      reason: `Voice authentication failed: ${error.message}`
    });
  }
}

/**
 * Handle keystroke model training
 */
async function handleTrainModel(data, sender, sendResponse) {
  try {
    const { origin, username, features, sampleIndex, privacyMode } = data;
    
    if (!origin || !username || !features) {
      return sendResponse(false, {}, 'Missing required training data');
    }

    console.log(`Training keystroke model for ${username} on ${origin}, sample ${sampleIndex}`);

    // Store the training sample
    await storage.storeTrainingSample(origin, username, sampleIndex, {
      features,
      timestamp: new Date().toISOString(),
      privacyMode
    });

    // Get all samples for this user
    const samples = await storage.getTrainingSamples(origin, username);
    const globalSettings = await storage.getGlobalSettings();
    const requiredSamples = globalSettings.requiredSamples;

    console.log(`Stored sample ${sampleIndex + 1}. Total samples: ${samples.length}/${requiredSamples}`);

    // If we have enough samples, train the model
    if (samples.length >= requiredSamples) {
      console.log(`Training autoencoder with ${samples.length} samples...`);
      
      // Extract just the feature vectors for training
      const featureVectors = samples.map(sample => sample.features);
      
      // Train the autoencoder model
      const modelData = await trainKeystrokeModel(featureVectors);
      
      // Store the trained model
      await storage.storeKeystrokeModel(origin, username, modelData);
      
      console.log(`Model training complete for ${username}. Threshold: ${modelData.threshold?.toFixed(6)}`);
      
      return sendResponse(true, {
        modelTrained: true,
        sampleCount: samples.length,
        threshold: modelData.threshold,
        trainingStats: modelData.trainingStats
      }, `Biometric model trained successfully with ${samples.length} samples`);
    } else {
      return sendResponse(true, {
        modelTrained: false,
        sampleCount: samples.length,
        requiredSamples
      }, `Sample ${samples.length}/${requiredSamples} captured. Continue enrollment.`);
    }

  } catch (error) {
    console.error('Model training error:', error);
    return sendResponse(false, {}, `Training failed: ${error.message}`);
  }
}

/**
 * Handle voice model training
 */
async function handleTrainVoice(data, sender, sendResponse) {
  try {
    const { origin, username, voiceFeatures, sampleIndex } = data;
    
    if (!origin || !username || !voiceFeatures) {
      return sendResponse(false, {}, 'Missing required voice training data');
    }

    console.log(`Training voice model for ${username} on ${origin}, sample ${sampleIndex}`);

    // Store voice features (we don't store raw audio for privacy)
    await storage.storeTrainingSample(origin, username, `voice_${sampleIndex}`, {
      voiceFeatures,
      timestamp: new Date().toISOString(),
      type: 'voice'
    });

    // Get all voice samples for this user
    const samples = await storage.getTrainingSamples(origin, username);
    const voiceSamples = samples.filter(sample => sample.type === 'voice');
    
    // We typically need 3-5 voice samples
    const requiredVoiceSamples = 3;

    console.log(`Voice sample ${sampleIndex + 1} stored. Total voice samples: ${voiceSamples.length}/${requiredVoiceSamples}`);

    // If we have enough samples, create voice profile
    if (voiceSamples.length >= requiredVoiceSamples) {
      console.log(`Creating voice profile with ${voiceSamples.length} samples...`);
      
      // Extract voice features for profile creation
      const featuresList = voiceSamples.map(sample => sample.voiceFeatures);
      
      // Create voice profile
      const voiceProfile = createVoiceProfile(username, featuresList);
      
      // Store the voice profile
      await storage.storeVoiceModel(origin, username, voiceProfile);
      
      console.log(`Voice profile created for ${username}`);
      
      return sendResponse(true, {
        voiceProfileCreated: true,
        sampleCount: voiceSamples.length
      }, `Voice profile created successfully with ${voiceSamples.length} samples`);
    } else {
      return sendResponse(true, {
        voiceProfileCreated: false,
        sampleCount: voiceSamples.length,
        requiredSamples: requiredVoiceSamples
      }, `Voice sample ${voiceSamples.length}/${requiredVoiceSamples} captured. Continue enrollment.`);
    }

  } catch (error) {
    console.error('Voice training error:', error);
    return sendResponse(false, {}, `Voice training failed: ${error.message}`);
  }
}

/**
 * Handle settings requests
 */
async function handleGetSettings(data, sender, sendResponse) {
  try {
    const { origin, type } = data;
    
    if (type === 'global') {
      const settings = await storage.getGlobalSettings();
      return sendResponse(true, { settings });
    } else if (type === 'site' && origin) {
      const settings = await storage.getSiteSettings(origin);
      return sendResponse(true, { settings });
    } else {
      return sendResponse(false, {}, 'Invalid settings request');
    }
  } catch (error) {
    return sendResponse(false, {}, `Failed to get settings: ${error.message}`);
  }
}

async function handleSetSettings(data, sender, sendResponse) {
  try {
    const { origin, type, settings } = data;
    
    if (type === 'global') {
      await storage.setGlobalSettings(settings);
      return sendResponse(true, {}, 'Global settings updated');
    } else if (type === 'site' && origin) {
      await storage.setSiteSettings(origin, settings);
      return sendResponse(true, {}, 'Site settings updated');
    } else {
      return sendResponse(false, {}, 'Invalid settings update request');
    }
  } catch (error) {
    return sendResponse(false, {}, `Failed to update settings: ${error.message}`);
  }
}

/**
 * Handle data clearing requests
 */
async function handleClearData(data, sender, sendResponse) {
  try {
    const { origin, username, type } = data;
    
    if (type === 'all') {
      await storage.clearAllData();
      return sendResponse(true, {}, 'All biometric data cleared');
    } else if (type === 'site' && origin) {
      await storage.clearSiteData(origin);
      return sendResponse(true, {}, `All data for ${origin} cleared`);
    } else if (type === 'user' && origin && username) {
      await storage.clearUserData(origin, username);
      return sendResponse(true, {}, `Data for ${username} on ${origin} cleared`);
    } else {
      return sendResponse(false, {}, 'Invalid clear data request');
    }
  } catch (error) {
    return sendResponse(false, {}, `Failed to clear data: ${error.message}`);
  }
}

/**
 * Handle storage statistics request
 */
async function handleGetStats(data, sender, sendResponse) {
  try {
    const stats = await storage.getStorageStats();
    return sendResponse(true, { stats });
  } catch (error) {
    return sendResponse(false, {}, `Failed to get stats: ${error.message}`);
  }
}

/**
 * Main message handler
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ensure async responses
  (async () => {
    try {
      const { type, data } = message;
      
      console.log(`Background received message: ${type}`, data);
      
      switch (type) {
        case MESSAGE_TYPES.AUTH_CHECK:
          await handleAuthCheck(data, sender, sendResponse);
          break;
          
        case MESSAGE_TYPES.VOICE_CHECK:
          await handleVoiceCheck(data, sender, sendResponse);
          break;
          
        case MESSAGE_TYPES.TRAIN_MODEL:
          await handleTrainModel(data, sender, sendResponse);
          break;
          
        case MESSAGE_TYPES.TRAIN_VOICE:
          await handleTrainVoice(data, sender, sendResponse);
          break;
          
        case MESSAGE_TYPES.GET_SETTINGS:
          await handleGetSettings(data, sender, sendResponse);
          break;
          
        case MESSAGE_TYPES.SET_SETTINGS:
          await handleSetSettings(data, sender, sendResponse);
          break;
          
        case MESSAGE_TYPES.CLEAR_DATA:
          await handleClearData(data, sender, sendResponse);
          break;
          
        case MESSAGE_TYPES.GET_STATS:
          await handleGetStats(data, sender, sendResponse);
          break;
          
        case MESSAGE_TYPES.HEALTH_CHECK:
          sendResponse(true, { status: 'healthy' }, 'Background script is running');
          break;
          
        default:
          console.warn(`Unknown message type: ${type}`);
          sendResponse(false, {}, `Unknown message type: ${type}`);
      }
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse(false, {}, `Message handling failed: ${error.message}`);
    }
  })();
  
  // Return true to indicate async response
  return true;
});

/**
 * Extension installation handler
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Ghost Key Universal Extension installed/updated');
  
  if (details.reason === 'install') {
    // First time installation
    console.log('Setting up default configuration...');
    
    try {
      // Initialize default global settings
      await storage.setGlobalSettings({
        extensionEnabled: true,
        autoDetectForms: true,
        keystrokeThreshold: 0.03,
        voiceThreshold: 0.75,
        requiredSamples: 5,
        voiceMFAEnabled: true,
        debugMode: false
      });
      
      console.log('Default settings initialized');
    } catch (error) {
      console.error('Failed to initialize default settings:', error);
    }
  }
});

/**
 * Handle extension startup
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('Ghost Key Universal Extension started');
});

/**
 * Handle tab updates to inject content script if needed
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    try {
      // Check if extension is enabled
      const globalSettings = await storage.getGlobalSettings();
      if (!globalSettings.extensionEnabled) {
        return;
      }
      
      // Get site settings
      const origin = new URL(tab.url).origin;
      const siteSettings = await storage.getSiteSettings(origin);
      
      if (siteSettings.enabled) {
        // The content script is already injected via manifest, just log
        console.log(`Ghost Key active on ${origin}`);
      }
    } catch (error) {
      console.error('Tab update handler error:', error);
    }
  }
});

console.log('Ghost Key Universal Extension background script loaded'); 