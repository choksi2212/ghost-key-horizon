/**
 * Storage wrapper for Ghost Key Universal Extension
 * Handles both chrome.storage.local (for small data) and IndexedDB (for large model data)
 * Ported from Ghost Key project file storage system
 */

// Configuration constants
const AUTH_CONFIG = {
  PASSWORD_LENGTH: 8,
  SAMPLES_REQUIRED: 5,
  NOISE_LEVEL: 0.1,
  AUGMENTATION_FACTOR: 3,
  AUTOENCODER_THRESHOLD: 0.03,
  VOICE_SIMILARITY_THRESHOLD: 0.75,
  VOICE_SAMPLE_DURATION: 3000,
  VOICE_FEATURES_COUNT: 13,
  PERCENTILE_THRESHOLD: 95
};

class GhostKeyStorage {
  constructor() {
    this.dbName = 'GhostKeyDB';
    this.dbVersion = 1;
    this.db = null;
    this.initPromise = this.initDB();
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Store for keystroke models (large data)
        if (!db.objectStoreNames.contains('keystrokeModels')) {
          const keystrokeStore = db.createObjectStore('keystrokeModels', { keyPath: 'id' });
          keystrokeStore.createIndex('origin_username', ['origin', 'username'], { unique: true });
        }
        
        // Store for voice models (large data)
        if (!db.objectStoreNames.contains('voiceModels')) {
          const voiceStore = db.createObjectStore('voiceModels', { keyPath: 'id' });
          voiceStore.createIndex('origin_username', ['origin', 'username'], { unique: true });
        }
        
        // Store for training samples (large data)
        if (!db.objectStoreNames.contains('trainingSamples')) {
          const samplesStore = db.createObjectStore('trainingSamples', { keyPath: 'id' });
          samplesStore.createIndex('origin_username_index', ['origin', 'username', 'sampleIndex'], { unique: true });
        }
      };
    });
  }

  // HMAC signing for tamper detection
  async generateHMAC(data, key = 'ghost-key-extension') {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const messageData = encoder.encode(JSON.stringify(data));
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    return Array.from(new Uint8Array(signature));
  }

  async verifyHMAC(data, signature, key = 'ghost-key-extension') {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const messageData = encoder.encode(JSON.stringify(data));
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    return await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      new Uint8Array(signature),
      messageData
    );
  }

  // Chrome storage methods (for small data like settings, user preferences)
  async setChromeSetting(key, value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  async getChromeSetting(key, defaultValue = null) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[key] || defaultValue);
        }
      });
    });
  }

  async removeChromeSetting(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove([key], () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  // IndexedDB methods (for large data like models and samples)
  async storeKeystrokeModel(origin, username, modelData) {
    await this.initPromise;
    
    const signature = await this.generateHMAC(modelData);
    const record = {
      id: `${origin}_${username}_keystroke`,
      origin,
      username,
      modelData,
      signature,
      type: 'keystroke',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['keystrokeModels'], 'readwrite');
      const store = transaction.objectStore('keystrokeModels');
      const request = store.put(record);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getKeystrokeModel(origin, username) {
    await this.initPromise;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['keystrokeModels'], 'readonly');
      const store = transaction.objectStore('keystrokeModels');
      const request = store.get(`${origin}_${username}_keystroke`);
      
      request.onsuccess = async () => {
        const result = request.result;
        if (result) {
          // Verify HMAC
          const isValid = await this.verifyHMAC(result.modelData, result.signature);
          if (isValid) {
            resolve(result.modelData);
          } else {
            console.warn('Model data integrity check failed for', origin, username);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async storeVoiceModel(origin, username, voiceProfile) {
    await this.initPromise;
    
    const signature = await this.generateHMAC(voiceProfile);
    const record = {
      id: `${origin}_${username}_voice`,
      origin,
      username,
      voiceProfile,
      signature,
      type: 'voice',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['voiceModels'], 'readwrite');
      const store = transaction.objectStore('voiceModels');
      const request = store.put(record);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getVoiceModel(origin, username) {
    await this.initPromise;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['voiceModels'], 'readonly');
      const store = transaction.objectStore('voiceModels');
      const request = store.get(`${origin}_${username}_voice`);
      
      request.onsuccess = async () => {
        const result = request.result;
        if (result) {
          // Verify HMAC
          const isValid = await this.verifyHMAC(result.voiceProfile, result.signature);
          if (isValid) {
            resolve(result.voiceProfile);
          } else {
            console.warn('Voice model data integrity check failed for', origin, username);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async storeTrainingSample(origin, username, sampleIndex, sampleData) {
    await this.initPromise;
    
    const signature = await this.generateHMAC(sampleData);
    const record = {
      id: `${origin}_${username}_sample_${sampleIndex}`,
      origin,
      username,
      sampleIndex,
      sampleData,
      signature,
      createdAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['trainingSamples'], 'readwrite');
      const store = transaction.objectStore('trainingSamples');
      const request = store.put(record);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getTrainingSamples(origin, username) {
    await this.initPromise;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['trainingSamples'], 'readonly');
      const store = transaction.objectStore('trainingSamples');
      const index = store.index('origin_username_index');
      const request = index.getAll([origin, username]);
      
      request.onsuccess = async () => {
        const results = request.result;
        const validSamples = [];
        
        for (const result of results) {
          const isValid = await this.verifyHMAC(result.sampleData, result.signature);
          if (isValid) {
            validSamples.push(result.sampleData);
          }
        }
        
        resolve(validSamples);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Site management methods
  async getSiteSettings(origin) {
    const key = `site_${origin.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return await this.getChromeSetting(key, {
      enabled: true,
      keystrokeEnabled: true,
      voiceEnabled: true,
      autoEnroll: false,
      blockedUntilVoice: false
    });
  }

  async setSiteSettings(origin, settings) {
    const key = `site_${origin.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return await this.setChromeSetting(key, settings);
  }

  async getGlobalSettings() {
    return await this.getChromeSetting('globalSettings', {
      extensionEnabled: true,
      autoDetectForms: true,
      keystrokeThreshold: AUTH_CONFIG.AUTOENCODER_THRESHOLD,
      voiceThreshold: AUTH_CONFIG.VOICE_SIMILARITY_THRESHOLD,
      requiredSamples: AUTH_CONFIG.SAMPLES_REQUIRED,
      voiceMFAEnabled: true,
      debugMode: false
    });
  }

  async setGlobalSettings(settings) {
    return await this.setChromeSetting('globalSettings', settings);
  }

  // User management
  async getUserList(origin) {
    await this.initPromise;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['keystrokeModels'], 'readonly');
      const store = transaction.objectStore('keystrokeModels');
      const index = store.index('origin_username');
      const request = index.getAllKeys();
      
      request.onsuccess = () => {
        const keys = request.result;
        const users = keys
          .filter(key => key[0] === origin)
          .map(key => key[1]);
        resolve([...new Set(users)]);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Clear data methods
  async clearUserData(origin, username) {
    await this.initPromise;
    
    const keystrokeId = `${origin}_${username}_keystroke`;
    const voiceId = `${origin}_${username}_voice`;
    
    const transaction = this.db.transaction(['keystrokeModels', 'voiceModels', 'trainingSamples'], 'readwrite');
    
    // Clear keystroke model
    const keystrokeStore = transaction.objectStore('keystrokeModels');
    keystrokeStore.delete(keystrokeId);
    
    // Clear voice model
    const voiceStore = transaction.objectStore('voiceModels');
    voiceStore.delete(voiceId);
    
    // Clear training samples
    const samplesStore = transaction.objectStore('trainingSamples');
    const samplesIndex = samplesStore.index('origin_username_index');
    const request = samplesIndex.getAllKeys([origin, username]);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const keys = request.result;
        keys.forEach(key => {
          samplesStore.delete(key[2]); // sampleIndex is the third element
        });
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearSiteData(origin) {
    await this.initPromise;
    
    const transaction = this.db.transaction(['keystrokeModels', 'voiceModels', 'trainingSamples'], 'readwrite');
    
    // Clear keystroke models for site
    const keystrokeStore = transaction.objectStore('keystrokeModels');
    const keystrokeIndex = keystrokeStore.index('origin_username');
    let request = keystrokeIndex.getAllKeys([origin]);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const keys = request.result;
        keys.forEach(key => {
          keystrokeStore.delete(`${key[0]}_${key[1]}_keystroke`);
        });
        
        // Clear voice models for site
        const voiceStore = transaction.objectStore('voiceModels');
        const voiceIndex = voiceStore.index('origin_username');
        const voiceRequest = voiceIndex.getAllKeys([origin]);
        
        voiceRequest.onsuccess = () => {
          const voiceKeys = voiceRequest.result;
          voiceKeys.forEach(key => {
            voiceStore.delete(`${key[0]}_${key[1]}_voice`);
          });
          
          // Clear training samples for site
          const samplesStore = transaction.objectStore('trainingSamples');
          const samplesIndex = samplesStore.index('origin_username_index');
          const samplesRequest = samplesIndex.getAllKeys();
          
          samplesRequest.onsuccess = () => {
            const allKeys = samplesRequest.result;
            allKeys.forEach(key => {
              if (key[0] === origin) {
                samplesStore.delete(key[2]);
              }
            });
            resolve();
          };
          samplesRequest.onerror = () => reject(samplesRequest.error);
        };
        voiceRequest.onerror = () => reject(voiceRequest.error);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllData() {
    await this.initPromise;
    
    const transaction = this.db.transaction(['keystrokeModels', 'voiceModels', 'trainingSamples'], 'readwrite');
    
    const promises = [
      new Promise((resolve, reject) => {
        const request = transaction.objectStore('keystrokeModels').clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
      new Promise((resolve, reject) => {
        const request = transaction.objectStore('voiceModels').clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
      new Promise((resolve, reject) => {
        const request = transaction.objectStore('trainingSamples').clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
    ];
    
    await Promise.all(promises);
    
    // Also clear chrome storage
    return new Promise((resolve, reject) => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  // Statistics and monitoring
  async getStorageStats() {
    await this.initPromise;
    
    const transaction = this.db.transaction(['keystrokeModels', 'voiceModels', 'trainingSamples'], 'readonly');
    
    const counts = await Promise.all([
      new Promise((resolve) => {
        const request = transaction.objectStore('keystrokeModels').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      }),
      new Promise((resolve) => {
        const request = transaction.objectStore('voiceModels').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      }),
      new Promise((resolve) => {
        const request = transaction.objectStore('trainingSamples').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      })
    ]);
    
    return {
      keystrokeModels: counts[0],
      voiceModels: counts[1],
      trainingSamples: counts[2],
      totalRecords: counts.reduce((a, b) => a + b, 0)
    };
  }
}

// Export singleton instance
const storage = new GhostKeyStorage();
export default storage; 