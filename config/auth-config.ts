// Authentication configuration - tuned these values through extensive testing
// Had to experiment with different thresholds to get the right balance between security and usability
export const AUTH_CONFIG = {
  // Keystroke dynamics settings - based on password complexity requirements
  REQUIRED_PASSWORD_LENGTH: 8,        // Found 8 chars gives good biometric signal
  MINIMUM_TRAINING_SAMPLES: 5,        // Need at least 5 samples for reliable model training
  DATA_AUGMENTATION_NOISE: 0.1,       // 10% noise level works well for data augmentation
  SAMPLE_AUGMENTATION_MULTIPLIER: 3,  // Triple the dataset size with variations

  // Autoencoder neural network thresholds - these control authentication strictness
  AUTOENCODER_AUTH_THRESHOLD: 0.03,   // Main threshold - adjust this for stricter/looser auth
  AUTOENCODER_TEST_THRESHOLDS: [0.01, 0.03, 0.05, 0.07, 0.1], // Different thresholds for testing

  // Voice biometric authentication settings - more lenient than keystroke
  VOICE_MATCH_THRESHOLD: 0.65,         // 70% similarity required for voice authentication
  VOICE_THRESHOLD_OPTIONS: [0.5, 0.6, 0.65, 0.7, 0.75], // For testing different strictness levels
  VOICE_RECORDING_DURATION: 3000,     // 3 seconds seems optimal for voice samples
  MFCC_FEATURE_COUNT: 13,             // Standard number of MFCC coefficients

  // File system paths for model storage
  KEYSTROKE_MODELS_DIRECTORY: "models",
  VOICE_MODELS_DIRECTORY: "voice_models",

  // Legacy statistical model settings (keeping for backward compatibility)
  STATISTICAL_PERCENTILE_THRESHOLD: 95, // 95th percentile for statistical authentication
  
  // Legacy property names for backward compatibility
  MODELS_DIR: "models",
  SAMPLES_REQUIRED: 5,
  NOISE_LEVEL: 0.1,
  AUGMENTATION_FACTOR: 3,
  AUTOENCODER_THRESHOLD: 0.03,
  PERCENTILE_THRESHOLD: 95,
} as const
