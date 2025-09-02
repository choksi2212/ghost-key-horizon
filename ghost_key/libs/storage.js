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

  // Chrome storage methods (no-op on Android WebView, preserved for compatibility)
  async setChromeSetting(key, value) {
    try {
      // @ts-ignore
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        return new Promise((resolve, reject) => {
          chrome.storage.local.set({ [key]: value }, () => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve();
          });
        });
      }
    } catch {}
    localStorage.setItem(key, JSON.stringify(value));
  }

  async getChromeSetting(key, defaultValue = null) {
    try {
      // @ts-ignore
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        return new Promise((resolve, reject) => {
          chrome.storage.local.get([key], (result) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(result[key] || defaultValue);
          });
        });
      }
    } catch {}
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  }

  async removeChromeSetting(key) {
    try {
      // @ts-ignore
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        return new Promise((resolve, reject) => {
          chrome.storage.local.remove([key], () => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve();
          });
        });
      }
    } catch {}
    localStorage.removeItem(key);
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
          const isValid = await this.verifyHMAC(result.modelData, result.signature);
          if (isValid) resolve(result.modelData);
          else {
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
          const isValid = await this.verifyHMAC(result.voiceProfile, result.signature);
          if (isValid) resolve(result.voiceProfile);
          else {
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
          if (isValid) validSamples.push(result.sampleData);
        }
        resolve(validSamples);
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// Export singleton instance
const storage = new GhostKeyStorage();
export default storage;


