/**
 * Voice Biometrics Library for Ghost Key Universal Extension
 * Ported from Ghost Key project utils/voice-feature-extractor.ts
 * Uses Meyda library for audio feature extraction and biometric analysis
 */

// Import Meyda library - needs to be loaded in the page context
// Note: Meyda will be loaded via CDN in the modal HTML

// Configuration constants
const VOICE_CONFIG = {
  FRAME_SIZE: 1024,
  HOP_SIZE: 512,
  SAMPLE_RATE: 44100,
  SIMILARITY_THRESHOLD: 0.75,
  SAMPLE_DURATION: 3000, // 3 seconds
  FEATURES_COUNT: 13, // MFCC features
  PASSPHRASE: "I'll Always Choose You"
};

// Feature sets to extract
const SPECTRAL_FEATURES = ["mfcc", "spectralCentroid", "spectralFlatness", "spectralRolloff", "spectralFlux"];
const VOICE_QUALITY_FEATURES = ["perceptualSpread", "perceptualSharpness", "spectralKurtosis"];
const TEMPORAL_FEATURES = ["zcr", "rms", "energy"];
const ALL_FEATURES = [...SPECTRAL_FEATURES, ...VOICE_QUALITY_FEATURES, ...TEMPORAL_FEATURES];

/**
 * Voice features structure
 * Ported from Ghost Key project
 */
class VoiceFeatures {
  constructor() {
    this.mfcc = [];
    this.spectralCentroid = 0;
    this.spectralFlatness = 0;
    this.spectralRolloff = 0;
    this.spectralFlux = 0;
    this.perceptualSpread = 0;
    this.perceptualSharpness = 0;
    this.spectralKurtosis = 0;
    this.zcr = 0;
    this.rms = 0;
    this.energy = 0;
    this.pitch = null;
    this.jitter = 0;
    this.shimmer = 0;
    this.speakingRate = 0;
    this.formants = [];
  }
}

/**
 * Aggregated voice features structure
 * Ported from Ghost Key project
 */
class AggregatedVoiceFeatures {
  constructor() {
    this.mfccMean = [];
    this.mfccVariance = [];
    this.spectralCentroidMean = 0;
    this.spectralCentroidVariance = 0;
    this.spectralFlatnessMean = 0;
    this.spectralFlatnessVariance = 0;
    this.spectralRolloffMean = 0;
    this.spectralRolloffVariance = 0;
    this.spectralFluxMean = 0;
    this.spectralFluxVariance = 0;
    this.perceptualSpreadMean = 0;
    this.perceptualSpreadVariance = 0;
    this.perceptualSharpnessMean = 0;
    this.perceptualSharpnessVariance = 0;
    this.spectralKurtosisMean = 0;
    this.spectralKurtosisVariance = 0;
    this.zcrMean = 0;
    this.zcrVariance = 0;
    this.rmsMean = 0;
    this.rmsVariance = 0;
    this.energyMean = 0;
    this.energyVariance = 0;
    this.pitchMean = 0;
    this.pitchVariance = 0;
    this.pitchRange = 0;
    this.jitter = 0;
    this.shimmer = 0;
  }
}

/**
 * Voice recorder and processor class
 */
class VoiceRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.stream = null;
    this.recordingStartTime = 0;
    this.audioContext = null;
  }

  /**
   * Start recording voice sample
   */
  async startRecording() {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      // Create audio context for analysis
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 44100
      });

      // Setup MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.audioChunks = [];
      this.recordingStartTime = Date.now();

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100); // Collect data every 100ms
      this.isRecording = true;

      console.log('Voice recording started');
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw new Error('Microphone access denied or not available');
    }
  }

  /**
   * Stop recording and return audio blob
   */
  async stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isRecording) {
        reject(new Error('No active recording to stop'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.cleanup();
        resolve(audioBlob);
      };

      this.mediaRecorder.onerror = (error) => {
        this.cleanup();
        reject(error);
      };

      this.mediaRecorder.stop();
      this.isRecording = false;
    });
  }

  /**
   * Cleanup recording resources
   */
  cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  /**
   * Get recording duration
   */
  getRecordingDuration() {
    return this.recordingStartTime ? Date.now() - this.recordingStartTime : 0;
  }
}

/**
 * Convert Blob to AudioBuffer for analysis
 * Ported from Ghost Key project
 */
async function blobToAudioBuffer(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    await audioContext.close();
    return audioBuffer;
  } catch (error) {
    await audioContext.close();
    throw new Error('Failed to decode audio data: ' + error.message);
  }
}

/**
 * Extract features from AudioBuffer using Meyda
 * Ported from Ghost Key project
 */
function extractFeaturesFromAudioBuffer(audioBuffer) {
  if (typeof window.Meyda === 'undefined') {
    throw new Error('Meyda library not loaded. Voice analysis unavailable.');
  }

  // Convert AudioBuffer to a format Meyda can process
  const audioData = audioBuffer.getChannelData(0);
  const features = [];

  // Initialize Meyda analyzer
  window.Meyda.bufferSize = VOICE_CONFIG.FRAME_SIZE;

  // Process audio in frames
  for (let i = 0; i < audioData.length - VOICE_CONFIG.FRAME_SIZE; i += VOICE_CONFIG.HOP_SIZE) {
    const frame = audioData.slice(i, i + VOICE_CONFIG.FRAME_SIZE);

    try {
      // Extract features for this frame
      const frameFeatures = new VoiceFeatures();
      
      // Extract MFCC features
      const mfcc = window.Meyda.extract("mfcc", frame);
      if (mfcc && Array.isArray(mfcc) && mfcc.length > 0) {
        frameFeatures.mfcc = mfcc;
      }

      // Extract spectral features
      frameFeatures.spectralCentroid = window.Meyda.extract("spectralCentroid", frame) || 0;
      frameFeatures.spectralFlatness = window.Meyda.extract("spectralFlatness", frame) || 0;
      frameFeatures.spectralRolloff = window.Meyda.extract("spectralRolloff", frame) || 0;
      
      // Extract temporal features
      frameFeatures.zcr = window.Meyda.extract("zcr", frame) || 0;
      frameFeatures.rms = window.Meyda.extract("rms", frame) || 0;
      frameFeatures.energy = window.Meyda.extract("energy", frame) || 0;

      // Validate features before adding
      if (frameFeatures.mfcc.length > 0 && 
          !isNaN(frameFeatures.spectralCentroid) &&
          !isNaN(frameFeatures.rms)) {
        features.push(frameFeatures);
      }
    } catch (error) {
      console.warn('Error extracting features for frame:', error);
      continue;
    }
  }

  return features;
}

/**
 * Calculate basic pitch statistics
 * Simplified implementation for in-browser processing
 */
function calculatePitchStatistics(audioBuffer) {
  const audioData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  
  // Simplified autocorrelation-based pitch detection
  const frameSize = 1024;
  const pitches = [];
  
  for (let i = 0; i < audioData.length - frameSize; i += frameSize / 2) {
    const frame = audioData.slice(i, i + frameSize);
    const pitch = estimatePitch(frame, sampleRate);
    if (pitch > 50 && pitch < 500) { // Valid human voice range
      pitches.push(pitch);
    }
  }
  
  if (pitches.length === 0) {
    return { mean: 0, variance: 0, range: 0 };
  }
  
  const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
  const variance = pitches.reduce((sum, pitch) => sum + Math.pow(pitch - mean, 2), 0) / pitches.length;
  const range = Math.max(...pitches) - Math.min(...pitches);
  
  return { mean, variance, range };
}

/**
 * Simple pitch estimation using autocorrelation
 */
function estimatePitch(audioData, sampleRate) {
  const minPeriod = Math.floor(sampleRate / 500); // 500 Hz max
  const maxPeriod = Math.floor(sampleRate / 50);  // 50 Hz min
  
  let maxCorrelation = 0;
  let bestPeriod = 0;
  
  for (let period = minPeriod; period < maxPeriod && period < audioData.length / 2; period++) {
    let correlation = 0;
    for (let i = 0; i < audioData.length - period; i++) {
      correlation += audioData[i] * audioData[i + period];
    }
    
    if (correlation > maxCorrelation) {
      maxCorrelation = correlation;
      bestPeriod = period;
    }
  }
  
  return bestPeriod > 0 ? sampleRate / bestPeriod : 0;
}

/**
 * Aggregate features across all frames
 * Ported from Ghost Key project
 */
function aggregateFeatures(features) {
  if (features.length === 0) {
    return new AggregatedVoiceFeatures();
  }

  const aggregated = new AggregatedVoiceFeatures();
  
  // Helper function to calculate mean and variance
  const calculateStats = (values) => {
    if (values.length === 0) return { mean: 0, variance: 0 };
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return { mean, variance };
  };

  // Aggregate MFCC features
  const mfccLength = features[0].mfcc.length;
  aggregated.mfccMean = new Array(mfccLength).fill(0);
  aggregated.mfccVariance = new Array(mfccLength).fill(0);
  
  for (let i = 0; i < mfccLength; i++) {
    const mfccValues = features.map(f => f.mfcc[i] || 0);
    const stats = calculateStats(mfccValues);
    aggregated.mfccMean[i] = stats.mean;
    aggregated.mfccVariance[i] = stats.variance;
  }

  // Aggregate spectral features
  const spectralCentroidValues = features.map(f => f.spectralCentroid);
  const spectralCentroidStats = calculateStats(spectralCentroidValues);
  aggregated.spectralCentroidMean = spectralCentroidStats.mean;
  aggregated.spectralCentroidVariance = spectralCentroidStats.variance;

  const spectralFlatnessValues = features.map(f => f.spectralFlatness);
  const spectralFlatnessStats = calculateStats(spectralFlatnessValues);
  aggregated.spectralFlatnessMean = spectralFlatnessStats.mean;
  aggregated.spectralFlatnessVariance = spectralFlatnessStats.variance;

  const spectralRolloffValues = features.map(f => f.spectralRolloff);
  const spectralRolloffStats = calculateStats(spectralRolloffValues);
  aggregated.spectralRolloffMean = spectralRolloffStats.mean;
  aggregated.spectralRolloffVariance = spectralRolloffStats.variance;

  // Aggregate temporal features
  const zcrValues = features.map(f => f.zcr);
  const zcrStats = calculateStats(zcrValues);
  aggregated.zcrMean = zcrStats.mean;
  aggregated.zcrVariance = zcrStats.variance;

  const rmsValues = features.map(f => f.rms);
  const rmsStats = calculateStats(rmsValues);
  aggregated.rmsMean = rmsStats.mean;
  aggregated.rmsVariance = rmsStats.variance;

  const energyValues = features.map(f => f.energy);
  const energyStats = calculateStats(energyValues);
  aggregated.energyMean = energyStats.mean;
  aggregated.energyVariance = energyStats.variance;

  return aggregated;
}

/**
 * Calculate similarity between two voice feature sets
 * Ported from Ghost Key project calculateRobustSimilarityScore
 */
function calculateSimilarityScore(features1, features2) {
  if (!features1 || !features2) {
    return {
      overallSimilarity: 0,
      spectralSimilarity: 0,
      voiceQualitySimilarity: 0,
      confidenceScore: 0,
      detailedMetrics: {}
    };
  }

  // Calculate MFCC similarity (cosine similarity)
  let mfccSimilarity = 0;
  if (features1.mfccMean.length > 0 && features2.mfccMean.length > 0) {
    const minLength = Math.min(features1.mfccMean.length, features2.mfccMean.length);
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < minLength; i++) {
      dotProduct += features1.mfccMean[i] * features2.mfccMean[i];
      norm1 += features1.mfccMean[i] * features1.mfccMean[i];
      norm2 += features2.mfccMean[i] * features2.mfccMean[i];
    }
    
    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    mfccSimilarity = magnitude > 0 ? dotProduct / magnitude : 0;
  }

  // Calculate spectral similarity
  const spectralCentroidDiff = Math.abs(features1.spectralCentroidMean - features2.spectralCentroidMean);
  const spectralFlatnessDiff = Math.abs(features1.spectralFlatnessMean - features2.spectralFlatnessMean);
  const spectralRolloffDiff = Math.abs(features1.spectralRolloffMean - features2.spectralRolloffMean);
  
  const spectralSimilarity = 1 - (spectralCentroidDiff + spectralFlatnessDiff + spectralRolloffDiff) / 3;

  // Calculate temporal similarity
  const zcrDiff = Math.abs(features1.zcrMean - features2.zcrMean);
  const rmsDiff = Math.abs(features1.rmsMean - features2.rmsMean);
  const energyDiff = Math.abs(features1.energyMean - features2.energyMean);
  
  const temporalSimilarity = 1 - (zcrDiff + rmsDiff + energyDiff) / 3;

  // Combine similarities with weights
  const overallSimilarity = (
    mfccSimilarity * 0.5 +           // MFCC is most important
    spectralSimilarity * 0.3 +       // Spectral features
    temporalSimilarity * 0.2         // Temporal features
  );

  const confidenceScore = Math.min(1, Math.max(0, overallSimilarity));

  return {
    overallSimilarity: Math.max(0, Math.min(1, overallSimilarity)),
    spectralSimilarity: Math.max(0, Math.min(1, spectralSimilarity)),
    voiceQualitySimilarity: Math.max(0, Math.min(1, temporalSimilarity)),
    confidenceScore,
    detailedMetrics: {
      mfccSimilarity,
      spectralCentroidDiff,
      spectralFlatnessDiff,
      spectralRolloffDiff,
      zcrDiff,
      rmsDiff,
      energyDiff
    }
  };
}

/**
 * Process voice audio and extract all voice features
 * Main function ported from Ghost Key project
 */
async function processVoiceAudio(blob) {
  try {
    console.log("Starting voice feature extraction...");

    // Convert blob to AudioBuffer
    const audioBuffer = await blobToAudioBuffer(blob);
    console.log("Audio buffer created, duration:", audioBuffer.duration, "seconds");

    // Extract features with optimized parameters
    const rawFeatures = extractFeaturesFromAudioBuffer(audioBuffer);
    console.log("Extracted", rawFeatures.length, "feature frames");

    if (rawFeatures.length === 0) {
      throw new Error("No valid voice features could be extracted from the audio sample");
    }

    // Calculate additional features
    const pitchStats = calculatePitchStatistics(audioBuffer);

    // Add pitch information to features
    if (rawFeatures.length > 0) {
      rawFeatures[rawFeatures.length - 1].pitch = pitchStats;
    }

    // Aggregate features
    const aggregatedFeatures = aggregateFeatures(rawFeatures);

    // Add additional aggregated features
    aggregatedFeatures.pitchMean = pitchStats.mean;
    aggregatedFeatures.pitchVariance = pitchStats.variance;
    aggregatedFeatures.pitchRange = pitchStats.range;

    console.log("Feature extraction complete:", {
      mfccLength: aggregatedFeatures.mfccMean.length,
      spectralCentroid: aggregatedFeatures.spectralCentroidMean,
      pitch: aggregatedFeatures.pitchMean,
    });

    return {
      features: aggregatedFeatures,
      rawFeatures,
    };
  } catch (error) {
    console.error("Error processing voice audio:", error);
    throw new Error("Failed to process voice audio: " + error.message);
  }
}

/**
 * Verify voice sample against stored profile
 */
function verifyVoiceProfile(sampleFeatures, storedProfile, threshold = VOICE_CONFIG.SIMILARITY_THRESHOLD) {
  if (!storedProfile || !storedProfile.referenceModel) {
    throw new Error("No voice profile found for verification");
  }

  const similarity = calculateSimilarityScore(sampleFeatures, storedProfile.referenceModel);
  const success = similarity.overallSimilarity >= threshold;

  return {
    success,
    similarity: similarity.overallSimilarity,
    threshold,
    confidence: similarity.confidenceScore,
    detailedMetrics: similarity.detailedMetrics
  };
}

/**
 * Create voice profile from multiple samples
 */
function createVoiceProfile(username, sampleFeatures) {
  if (!Array.isArray(sampleFeatures) || sampleFeatures.length === 0) {
    throw new Error("No voice samples provided for profile creation");
  }

  // Calculate average features across all samples
  const referenceModel = calculateAverageFeatures(sampleFeatures);

  return {
    username,
    sampleCount: sampleFeatures.length,
    passphrase: VOICE_CONFIG.PASSPHRASE,
    createdAt: new Date().toISOString(),
    modelType: "voice_biometric",
    version: "1.0",
    features: sampleFeatures,
    referenceModel
  };
}

/**
 * Calculate average features across multiple samples
 * Helper function ported from Ghost Key project
 */
function calculateAverageFeatures(features) {
  if (features.length === 0) {
    throw new Error("No features to average");
  }

  const result = new AggregatedVoiceFeatures();
  const firstFeature = features[0];

  // For each property in the first feature
  for (const key in firstFeature) {
    if (Array.isArray(firstFeature[key])) {
      // Handle arrays (like MFCC)
      const arrayLength = firstFeature[key].length;
      result[key] = new Array(arrayLength).fill(0);

      // Sum all values
      for (const feature of features) {
        for (let i = 0; i < arrayLength; i++) {
          result[key][i] += feature[key][i];
        }
      }

      // Calculate average
      for (let i = 0; i < arrayLength; i++) {
        result[key][i] /= features.length;
      }
    } else if (typeof firstFeature[key] === "number") {
      // Handle numeric values
      result[key] = 0;

      // Sum all values
      for (const feature of features) {
        result[key] += feature[key];
      }

      // Calculate average
      result[key] /= features.length;
    } else {
      // Copy other values as is
      result[key] = firstFeature[key];
    }
  }

  return result;
}

// Export classes and functions
export {
  VoiceRecorder,
  VoiceFeatures,
  AggregatedVoiceFeatures,
  processVoiceAudio,
  calculateSimilarityScore,
  verifyVoiceProfile,
  createVoiceProfile,
  blobToAudioBuffer,
  VOICE_CONFIG
}; 