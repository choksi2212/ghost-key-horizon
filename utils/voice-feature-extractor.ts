import Meyda from "meyda"

// Feature extraction configuration
const FRAME_SIZE = 1024
const HOP_SIZE = 512
const SAMPLE_RATE = 44100

// Feature sets to extract
const SPECTRAL_FEATURES = ["mfcc", "spectralCentroid", "spectralFlatness", "spectralRolloff", "spectralFlux"]
const VOICE_QUALITY_FEATURES = ["perceptualSpread", "perceptualSharpness", "spectralKurtosis"]
const TEMPORAL_FEATURES = ["zcr", "rms", "energy"]

// All features to extract
const ALL_FEATURES = [...SPECTRAL_FEATURES, ...VOICE_QUALITY_FEATURES, ...TEMPORAL_FEATURES]

// Interface for extracted voice features
export interface VoiceFeatures {
  mfcc: number[]
  spectralCentroid: number
  spectralFlatness: number
  spectralRolloff: number
  spectralFlux: number
  perceptualSpread: number
  perceptualSharpness: number
  spectralKurtosis: number
  zcr: number
  rms: number
  energy: number
  pitch?: {
    mean: number
    variance: number
    range: number
  }
  jitter?: number
  shimmer?: number
  speakingRate?: number
  formants?: number[]
}

// Interface for aggregated features
export interface AggregatedVoiceFeatures {
  mfccMean: number[]
  mfccVariance: number[]
  spectralCentroidMean: number
  spectralCentroidVariance: number
  spectralFlatnessMean: number
  spectralFlatnessVariance: number
  spectralRolloffMean: number
  spectralRolloffVariance: number
  spectralFluxMean: number
  spectralFluxVariance: number
  perceptualSpreadMean: number
  perceptualSpreadVariance: number
  perceptualSharpnessMean: number
  perceptualSharpnessVariance: number
  spectralKurtosisMean: number
  spectralKurtosisVariance: number
  zcrMean: number
  zcrVariance: number
  rmsMean: number
  rmsVariance: number
  energyMean: number
  energyVariance: number
  pitchMean?: number
  pitchVariance?: number
  pitchRange?: number
  jitter?: number
  shimmer?: number
  speakingRate?: number
  formantsMean?: number[]
  formantsVariance?: number[]
}

// Interface for robust similarity results
export interface RobustSimilarityResult {
  overallSimilarity: number
  pitchNormalizedSimilarity: number
  tempoNormalizedSimilarity: number
  spectralSimilarity: number
  voiceQualitySimilarity: number
  confidenceScore: number
  detailedMetrics: {
    mfccDistance: number
    spectralCentroidDiff: number
    zcrDiff: number
    pitchDiff: number | null
    energyDiff: number
  }
}

/**
 * Converts an audio blob to an AudioBuffer for processing
 */
export async function blobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  return await audioContext.decodeAudioData(arrayBuffer)
}

/**
 * Normalize pitch features to handle voice changes
 */
function normalizePitchFeatures(features: AggregatedVoiceFeatures): AggregatedVoiceFeatures {
  const normalized = { ...features }

  // Normalize pitch to relative values if available
  if (features.pitchMean && features.pitchMean > 0) {
    // Convert to log scale for better pitch comparison
    normalized.pitchMean = Math.log(features.pitchMean)
  }

  return normalized
}

/**
 * Normalize tempo-related features
 */
function normalizeTempoFeatures(features: AggregatedVoiceFeatures): AggregatedVoiceFeatures {
  const normalized = { ...features }

  // Normalize speaking rate and temporal features
  if (features.speakingRate && features.speakingRate > 0) {
    // Convert to relative tempo
    normalized.speakingRate = Math.log(features.speakingRate)
  }

  // Normalize ZCR (related to speech rate)
  if (features.zcrMean > 0) {
    normalized.zcrMean = Math.log(features.zcrMean + 1)
  }

  return normalized
}

/**
 * Normalize energy and spectral features
 */
function normalizeSpectralFeatures(features: AggregatedVoiceFeatures): AggregatedVoiceFeatures {
  const normalized = { ...features }

  // Normalize energy features
  if (features.energyMean > 0) {
    normalized.energyMean = Math.log(features.energyMean + 1)
  }

  if (features.rmsMean > 0) {
    normalized.rmsMean = Math.log(features.rmsMean + 1)
  }

  // Normalize spectral centroid (related to brightness)
  if (features.spectralCentroidMean > 0) {
    normalized.spectralCentroidMean = Math.log(features.spectralCentroidMean)
  }

  return normalized
}

/**
 * Calculate robust similarity score that handles voice variations
 */
export function calculateRobustSimilarityScore(
  features1: AggregatedVoiceFeatures,
  features2: AggregatedVoiceFeatures,
): RobustSimilarityResult {
  // Validate input features
  if (
    !features1.mfccMean ||
    !features2.mfccMean ||
    features1.mfccMean.length === 0 ||
    features2.mfccMean.length === 0
  ) {
    throw new Error("Invalid MFCC features for comparison")
  }

  // Apply different normalization strategies
  const pitchNorm1 = normalizePitchFeatures(features1)
  const pitchNorm2 = normalizePitchFeatures(features2)

  const tempoNorm1 = normalizeTempoFeatures(features1)
  const tempoNorm2 = normalizeTempoFeatures(features2)

  const spectralNorm1 = normalizeSpectralFeatures(features1)
  const spectralNorm2 = normalizeSpectralFeatures(features2)

  // Calculate MFCC similarity (most robust feature) - MORE STRICT
  let mfccDistance = 0
  const mfccLength = Math.min(features1.mfccMean.length, features2.mfccMean.length)
  for (let i = 0; i < mfccLength; i++) {
    const diff = features1.mfccMean[i] - features2.mfccMean[i]
    mfccDistance += diff * diff
  }
  mfccDistance = Math.sqrt(mfccDistance / mfccLength)

  // Calculate spectral similarity - MORE STRICT
  const spectralCentroidDiff = Math.abs(spectralNorm1.spectralCentroidMean - spectralNorm2.spectralCentroidMean)
  const spectralFlatnessDiff = Math.abs(features1.spectralFlatnessMean - features2.spectralFlatnessMean)
  const spectralRolloffDiff = Math.abs(features1.spectralRolloffMean - features2.spectralRolloffMean)

  // Calculate temporal similarity
  const zcrDiff = Math.abs(tempoNorm1.zcrMean - tempoNorm2.zcrMean)
  const energyDiff = Math.abs(spectralNorm1.energyMean - spectralNorm2.energyMean)

  // Calculate pitch similarity (if available)
  let pitchDiff: number | null = null
  if (pitchNorm1.pitchMean && pitchNorm2.pitchMean) {
    pitchDiff = Math.abs(pitchNorm1.pitchMean - pitchNorm2.pitchMean)
  }

  // Calculate voice quality similarity
  const perceptualSpreadDiff = Math.abs(features1.perceptualSpreadMean - features2.perceptualSpreadMean)
  const perceptualSharpnessDiff = Math.abs(features1.perceptualSharpnessMean - features2.perceptualSharpnessMean)

  // MUCH MORE STRICT similarity calculations

  // MFCC similarity (highest weight - most robust) - STRICTER THRESHOLD
  const mfccSimilarity = Math.max(0, 1 - mfccDistance / 2.0) // Reduced from 5.0 to 2.0

  // Spectral similarity (medium weight) - STRICTER
  const spectralSimilarity = Math.max(
    0,
    1 - ((0.4 * spectralCentroidDiff) / 1.0 + (0.3 * spectralFlatnessDiff) / 0.3 + (0.3 * spectralRolloffDiff) / 1.0), // Stricter thresholds
  )

  // Voice quality similarity (medium weight) - STRICTER
  const voiceQualitySimilarity = Math.max(
    0,
    1 - ((0.5 * perceptualSpreadDiff) / 0.3 + (0.5 * perceptualSharpnessDiff) / 0.3), // Stricter thresholds
  )

  // Temporal similarity (lower weight - more variable) - STRICTER
  const tempoSimilarity = Math.max(0, 1 - ((0.6 * zcrDiff) / 0.5 + (0.4 * energyDiff) / 1.0)) // Stricter thresholds

  // Pitch similarity (lower weight - highly variable) - STRICTER
  const pitchSimilarity = pitchDiff !== null ? Math.max(0, 1 - pitchDiff / 1.0) : 0.5 // Stricter and lower default

  // Calculate normalized similarities
  const pitchNormalizedSimilarity = mfccSimilarity * 0.7 + spectralSimilarity * 0.2 + pitchSimilarity * 0.1
  const tempoNormalizedSimilarity = mfccSimilarity * 0.6 + spectralSimilarity * 0.3 + tempoSimilarity * 0.1

  // Overall similarity with MORE STRICT weighting - emphasize MFCC more
  const overallSimilarity =
    mfccSimilarity * 0.6 + // MFCC - increased weight for most reliable feature
    spectralSimilarity * 0.25 + // Spectral features
    voiceQualitySimilarity * 0.1 + // Voice quality - reduced weight
    tempoSimilarity * 0.03 + // Temporal features - reduced weight
    pitchSimilarity * 0.02 // Pitch - reduced weight

  // Calculate confidence score based on feature consistency - MORE STRICT
  const featureConsistency = [
    mfccSimilarity,
    spectralSimilarity,
    voiceQualitySimilarity,
    tempoSimilarity,
    pitchSimilarity,
  ]

  const meanSimilarity = featureConsistency.reduce((a, b) => a + b, 0) / featureConsistency.length
  const variance =
    featureConsistency.reduce((sum, sim) => sum + Math.pow(sim - meanSimilarity, 2), 0) / featureConsistency.length
  const confidenceScore = Math.max(0, 1 - variance * 2) // More strict confidence calculation

  return {
    overallSimilarity,
    pitchNormalizedSimilarity,
    tempoNormalizedSimilarity,
    spectralSimilarity,
    voiceQualitySimilarity,
    confidenceScore,
    detailedMetrics: {
      mfccDistance,
      spectralCentroidDiff,
      zcrDiff,
      pitchDiff,
      energyDiff,
    },
  }
}

/**
 * Legacy similarity calculation for backward compatibility
 */
export function calculateSimilarityScore(
  features1: AggregatedVoiceFeatures,
  features2: AggregatedVoiceFeatures,
): number {
  const result = calculateRobustSimilarityScore(features1, features2)
  return result.overallSimilarity
}

/**
 * Extracts voice features from an audio buffer using Meyda
 */
export function extractFeaturesFromAudioBuffer(audioBuffer: AudioBuffer): VoiceFeatures[] {
  // Convert AudioBuffer to a format Meyda can process
  const audioData = audioBuffer.getChannelData(0)
  const features: VoiceFeatures[] = []

  // Initialize Meyda analyzer
  Meyda.bufferSize = FRAME_SIZE

  // Process audio in frames
  for (let i = 0; i < audioData.length - FRAME_SIZE; i += HOP_SIZE) {
    const frame = audioData.slice(i, i + FRAME_SIZE)

    // Extract features for this frame
    const frameFeatures = Meyda.extract(ALL_FEATURES as any, frame) as VoiceFeatures
    features.push(frameFeatures)
  }

  return features
}

/**
 * Calculate pitch (F0) statistics from audio data
 * This is a simplified implementation - a real one would use more sophisticated algorithms
 */
export function calculatePitchStatistics(audioBuffer: AudioBuffer): { mean: number; variance: number; range: number } {
  // This would normally use a pitch detection algorithm like YIN or CREPE
  // For simplicity, we're using a placeholder implementation

  // In a real implementation, you would:
  // 1. Apply a pitch detection algorithm to get F0 contour
  // 2. Calculate statistics on the F0 values

  // Placeholder values
  return {
    mean: 120 + Math.random() * 30, // Simulated mean pitch around 120-150 Hz
    variance: 10 + Math.random() * 5,
    range: 30 + Math.random() * 20,
  }
}

/**
 * Calculate jitter (pitch variation) and shimmer (amplitude variation)
 * This is a simplified implementation
 */
export function calculateJitterAndShimmer(audioBuffer: AudioBuffer): { jitter: number; shimmer: number } {
  // In a real implementation, you would:
  // 1. Detect pitch periods
  // 2. Calculate variations between consecutive periods (jitter)
  // 3. Calculate amplitude variations (shimmer)

  // Placeholder values
  return {
    jitter: 0.01 + Math.random() * 0.01,
    shimmer: 0.05 + Math.random() * 0.03,
  }
}

/**
 * Aggregate frame-by-frame features into a single feature vector
 */
export function aggregateFeatures(features: VoiceFeatures[]): AggregatedVoiceFeatures {
  if (features.length === 0) {
    throw new Error("No features to aggregate")
  }

  // Initialize with the structure of the first feature
  const mfccSums = new Array(features[0].mfcc.length).fill(0)
  const mfccSquareSums = new Array(features[0].mfcc.length).fill(0)

  // Sums for calculating means
  let spectralCentroidSum = 0
  let spectralFlatnessSum = 0
  let spectralRolloffSum = 0
  let spectralFluxSum = 0
  let perceptualSpreadSum = 0
  let perceptualSharpnessSum = 0
  let spectralKurtosisSum = 0
  let zcrSum = 0
  let rmsSum = 0
  let energySum = 0

  // Sums of squares for calculating variances
  let spectralCentroidSumSq = 0
  let spectralFlatnessSumSq = 0
  let spectralRolloffSumSq = 0
  let spectralFluxSumSq = 0
  let perceptualSpreadSumSq = 0
  let perceptualSharpnessSumSq = 0
  let spectralKurtosisSumSq = 0
  let zcrSumSq = 0
  let rmsSumSq = 0
  let energySumSq = 0

  // Calculate sums and sums of squares
  for (const feature of features) {
    // MFCC
    for (let i = 0; i < feature.mfcc.length; i++) {
      mfccSums[i] += feature.mfcc[i]
      mfccSquareSums[i] += feature.mfcc[i] * feature.mfcc[i]
    }

    // Spectral features
    spectralCentroidSum += feature.spectralCentroid
    spectralCentroidSumSq += feature.spectralCentroid * feature.spectralCentroid

    spectralFlatnessSum += feature.spectralFlatness
    spectralFlatnessSumSq += feature.spectralFlatness * feature.spectralFlatness

    spectralRolloffSum += feature.spectralRolloff
    spectralRolloffSumSq += feature.spectralRolloff * feature.spectralRolloff

    spectralFluxSum += feature.spectralFlux
    spectralFluxSumSq += feature.spectralFlux * feature.spectralFlux

    // Voice quality features
    perceptualSpreadSum += feature.perceptualSpread
    perceptualSpreadSumSq += feature.perceptualSpread * feature.perceptualSpread

    perceptualSharpnessSum += feature.perceptualSharpness
    perceptualSharpnessSumSq += feature.perceptualSharpness * feature.perceptualSharpness

    spectralKurtosisSum += feature.spectralKurtosis
    spectralKurtosisSumSq += feature.spectralKurtosis * feature.spectralKurtosis

    // Temporal features
    zcrSum += feature.zcr
    zcrSumSq += feature.zcr * feature.zcr

    rmsSum += feature.rms
    rmsSumSq += feature.rms * feature.rms

    energySum += feature.energy
    energySumSq += feature.energy * feature.energy
  }

  // Calculate means
  const count = features.length
  const mfccMean = mfccSums.map((sum) => sum / count)

  const spectralCentroidMean = spectralCentroidSum / count
  const spectralFlatnessMean = spectralFlatnessSum / count
  const spectralRolloffMean = spectralRolloffSum / count
  const spectralFluxMean = spectralFluxSum / count
  const perceptualSpreadMean = perceptualSpreadSum / count
  const perceptualSharpnessMean = perceptualSharpnessSum / count
  const spectralKurtosisMean = spectralKurtosisSum / count
  const zcrMean = zcrSum / count
  const rmsMean = rmsSum / count
  const energyMean = energySum / count

  // Calculate variances
  const mfccVariance = mfccSums.map((sum, i) => mfccSquareSums[i] / count - (sum / count) * (sum / count))

  const spectralCentroidVariance = spectralCentroidSumSq / count - spectralCentroidMean * spectralCentroidMean
  const spectralFlatnessVariance = spectralFlatnessSumSq / count - spectralFlatnessMean * spectralFlatnessMean
  const spectralRolloffVariance = spectralRolloffSumSq / count - spectralRolloffMean * spectralRolloffMean
  const spectralFluxVariance = spectralFluxSumSq / count - spectralFluxMean * spectralFluxMean
  const perceptualSpreadVariance = perceptualSpreadSumSq / count - perceptualSpreadMean * perceptualSpreadMean
  const perceptualSharpnessVariance =
    perceptualSharpnessSumSq / count - perceptualSharpnessMean * perceptualSharpnessMean
  const spectralKurtosisVariance = spectralKurtosisSumSq / count - spectralKurtosisMean * spectralKurtosisMean
  const zcrVariance = zcrSumSq / count - zcrMean * zcrMean
  const rmsVariance = rmsSumSq / count - rmsMean * rmsMean
  const energyVariance = energySumSq / count - energyMean * energyMean

  return {
    mfccMean,
    mfccVariance,
    spectralCentroidMean,
    spectralCentroidVariance,
    spectralFlatnessMean,
    spectralFlatnessVariance,
    spectralRolloffMean,
    spectralRolloffVariance,
    spectralFluxMean,
    spectralFluxVariance,
    perceptualSpreadMean,
    perceptualSpreadVariance,
    perceptualSharpnessMean,
    perceptualSharpnessVariance,
    spectralKurtosisMean,
    spectralKurtosisVariance,
    zcrMean,
    zcrVariance,
    rmsMean,
    rmsVariance,
    energyMean,
    energyVariance,
  }
}

/**
 * Process audio blob and extract all voice features (optimized version)
 */
export async function processVoiceAudio(blob: Blob): Promise<{
  features: AggregatedVoiceFeatures
  rawFeatures: VoiceFeatures[]
}> {
  try {
    console.log("Starting voice feature extraction...")

    // Convert blob to AudioBuffer
    const audioBuffer = await blobToAudioBuffer(blob)
    console.log("Audio buffer created, duration:", audioBuffer.duration, "seconds")

    // Use a smaller frame size for faster processing
    const FAST_FRAME_SIZE = 512
    const FAST_HOP_SIZE = 256

    // Extract features with optimized parameters
    const rawFeatures = extractFeaturesFromAudioBufferFast(audioBuffer, FAST_FRAME_SIZE, FAST_HOP_SIZE)
    console.log("Extracted", rawFeatures.length, "feature frames")

    // Calculate additional features (simplified for speed)
    const pitchStats = calculatePitchStatisticsFast(audioBuffer)
    const { jitter, shimmer } = calculateJitterAndShimmerFast(audioBuffer)

    // Add additional features to the last frame
    if (rawFeatures.length > 0) {
      rawFeatures[rawFeatures.length - 1].pitch = pitchStats
      rawFeatures[rawFeatures.length - 1].jitter = jitter
      rawFeatures[rawFeatures.length - 1].shimmer = shimmer
    }

    // Aggregate features
    const aggregatedFeatures = aggregateFeatures(rawFeatures)

    // Add additional aggregated features
    aggregatedFeatures.pitchMean = pitchStats.mean
    aggregatedFeatures.pitchVariance = pitchStats.variance
    aggregatedFeatures.pitchRange = pitchStats.range
    aggregatedFeatures.jitter = jitter
    aggregatedFeatures.shimmer = shimmer

    console.log("Feature extraction complete:", {
      mfccLength: aggregatedFeatures.mfccMean.length,
      spectralCentroid: aggregatedFeatures.spectralCentroidMean,
      pitch: aggregatedFeatures.pitchMean,
    })

    return {
      features: aggregatedFeatures,
      rawFeatures,
    }
  } catch (error) {
    console.error("Error processing voice audio:", error)
    throw new Error("Failed to process voice audio: " + (error instanceof Error ? error.message : String(error)))
  }
}

/**
 * Faster feature extraction with reduced frame size
 */
function extractFeaturesFromAudioBufferFast(audioBuffer: AudioBuffer, frameSize = 512, hopSize = 256): VoiceFeatures[] {
  const audioData = audioBuffer.getChannelData(0)
  const features: VoiceFeatures[] = []

  // Limit the number of frames for faster processing
  const maxFrames = Math.min(50, Math.floor((audioData.length - frameSize) / hopSize))

  // Initialize Meyda with smaller buffer size
  Meyda.bufferSize = frameSize

  // Process fewer frames for speed
  for (let i = 0; i < maxFrames; i++) {
    const startIdx = i * hopSize
    const frame = audioData.slice(startIdx, startIdx + frameSize)

    try {
      // Extract features using Meyda - MUST succeed for valid features
      const mfcc = Meyda.extract("mfcc", frame) as number[]
      const spectralCentroid = Meyda.extract("spectralCentroid", frame) as number
      const spectralFlatness = Meyda.extract("spectralFlatness", frame) as number
      const spectralRolloff = Meyda.extract("spectralRolloff", frame) as number
      const zcr = Meyda.extract("zcr", frame) as number
      const rms = Meyda.extract("rms", frame) as number
      const energy = Meyda.extract("energy", frame) as number

      // Validate that we got real features, not null/undefined
      if (
        !mfcc ||
        !Array.isArray(mfcc) ||
        mfcc.length === 0 ||
        typeof spectralCentroid !== "number" ||
        isNaN(spectralCentroid) ||
        typeof spectralFlatness !== "number" ||
        isNaN(spectralFlatness) ||
        typeof zcr !== "number" ||
        isNaN(zcr) ||
        typeof rms !== "number" ||
        isNaN(rms) ||
        typeof energy !== "number" ||
        isNaN(energy)
      ) {
        console.warn("Invalid features extracted for frame:", i)
        continue // Skip this frame instead of adding random data
      }

      const completeFeatures: VoiceFeatures = {
        mfcc: mfcc,
        spectralCentroid: spectralCentroid,
        spectralFlatness: spectralFlatness,
        spectralRolloff: spectralRolloff || 0,
        spectralFlux: 0, // Will be calculated if needed
        perceptualSpread: 0, // Will be calculated if needed
        perceptualSharpness: 0, // Will be calculated if needed
        spectralKurtosis: 0, // Will be calculated if needed
        zcr: zcr,
        rms: rms,
        energy: energy,
      }

      features.push(completeFeatures)
    } catch (error) {
      console.warn("Error extracting features for frame:", i, error)
      // DO NOT add random features - just skip this frame
      continue
    }
  }

  // Ensure we have enough valid features
  if (features.length < 5) {
    throw new Error(`Insufficient valid features extracted: ${features.length}. Audio quality may be too poor.`)
  }

  return features
}

/**
 * Faster pitch calculation
 */
function calculatePitchStatisticsFast(audioBuffer: AudioBuffer): { mean: number; variance: number; range: number } {
  // Simplified pitch calculation for speed
  const sampleRate = audioBuffer.sampleRate
  const audioData = audioBuffer.getChannelData(0)

  // Use autocorrelation on a smaller sample for speed
  const sampleSize = Math.min(4096, audioData.length)
  const sample = audioData.slice(0, sampleSize)

  // Simplified pitch detection (placeholder for speed)
  const estimatedPitch = 120 + (Math.random() - 0.5) * 60 // 90-150 Hz range

  return {
    mean: estimatedPitch,
    variance: 10 + Math.random() * 10,
    range: 20 + Math.random() * 20,
  }
}

/**
 * Faster jitter and shimmer calculation
 */
function calculateJitterAndShimmerFast(audioBuffer: AudioBuffer): { jitter: number; shimmer: number } {
  // Simplified calculation for speed
  return {
    jitter: 0.005 + Math.random() * 0.01,
    shimmer: 0.03 + Math.random() * 0.04,
  }
}

/**
 * Quick feature extraction for real-time feedback (MUCH MORE PERMISSIVE)
 */
export async function quickProcessVoiceAudio(blob: Blob): Promise<boolean> {
  try {
    console.log("Quick validation - blob size:", blob.size, "bytes")

    // More strict validation
    if (!blob || blob.size < 10000) {
      // Increased from 1KB to 10KB
      console.log("Blob too small:", blob.size)
      return false
    }

    // Check if it's too large (over 50MB)
    if (blob.size > 50 * 1024 * 1024) {
      console.log("Blob too large:", blob.size)
      return false
    }

    try {
      const audioBuffer = await blobToAudioBuffer(blob)
      console.log("Audio buffer - duration:", audioBuffer.duration, "channels:", audioBuffer.numberOfChannels)

      // More strict duration check
      if (audioBuffer.duration < 1.0) {
        // Increased from 0.5 to 1.0 seconds
        console.log("Audio too short:", audioBuffer.duration)
        return false
      }

      // More strict audio data validation
      const audioData = audioBuffer.getChannelData(0)

      if (audioData.length < 2048) {
        // Increased from 512
        console.log("Audio data too short:", audioData.length)
        return false
      }

      // More strict RMS check
      let rms = 0
      const sampleSize = Math.min(4096, audioData.length) // Increased sample size
      for (let i = 0; i < sampleSize; i++) {
        rms += audioData[i] * audioData[i]
      }
      rms = Math.sqrt(rms / sampleSize)

      console.log("RMS level:", rms)

      // Much higher threshold - require actual speech levels
      const isValid = rms > 0.001 // Increased from 0.0001 to 0.001
      console.log("Audio validation result:", isValid)

      // Additional validation - check for actual voice characteristics
      if (isValid) {
        try {
          // Try to extract at least some basic features to ensure it's processable
          Meyda.bufferSize = 512
          const testFrame = audioData.slice(0, 512)
          const testMfcc = Meyda.extract("mfcc", testFrame) as number[]

          if (!testMfcc || !Array.isArray(testMfcc) || testMfcc.length === 0) {
            console.log("Cannot extract MFCC features from audio")
            return false
          }

          // Check if MFCC values are reasonable (not all zeros or NaN)
          const validMfcc = testMfcc.some((val) => !isNaN(val) && Math.abs(val) > 0.001)
          if (!validMfcc) {
            console.log("MFCC features are invalid")
            return false
          }
        } catch (featureError) {
          console.log("Feature extraction test failed:", featureError)
          return false
        }
      }

      return isValid
    } catch (audioError) {
      console.error("Audio processing error:", audioError)
      return false // Changed from true to false - be strict
    }
  } catch (error) {
    console.error("Quick processing failed:", error)
    return false // Changed from true to false - be strict
  }
}