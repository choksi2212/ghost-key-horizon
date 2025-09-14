/**
 * Runtime API client for keystroke and voice authentication
 * This handles all the communication with our backend ML services
 * Probably should add retry logic and better error handling eventually
 */

// Interface definitions for type safety
interface KeystrokeBiometricFeatures {
  holdTimes: number[]
  ddTimes: number[]
  udTimes: number[]
  typingSpeed: number
  flightTime: number
  errorRate: number
  pressPressure: number
  features: number[]
}

interface AuthenticationResult {
  success: boolean
  authenticated: boolean
  mse: number
  reconstructionError?: number
  deviations?: number[]
  reason?: string
  method?: string
  confidence?: number
}

interface ModelTrainingResult {
  success: boolean
  error?: string
}

interface VoiceRegistrationResult {
  success: boolean
  message?: string
  sampleCount?: number
  featureCount?: number
  error?: string
}

interface VoiceVerificationResult {
  success: boolean
  similarityScore?: number
  threshold?: number
  message?: string
  robustnessMetrics?: any
  detailedMetrics?: any
  confidenceLevel?: string
  error?: string
}

class RuntimeAPI {
  /**
   * Train the keystroke biometric model for a user
   * This sends the extracted features to our autoencoder training pipeline
   */
  static async trainModel(
    username: string,
    keystrokeFeatures: KeystrokeBiometricFeatures,
    sampleCount: number,
    privacyMode: boolean
  ): Promise<boolean> {
    try {
      const response = await fetch('/api/train-model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          features: keystrokeFeatures.features,
          holdTimes: keystrokeFeatures.holdTimes,
          ddTimes: keystrokeFeatures.ddTimes,
          udTimes: keystrokeFeatures.udTimes,
          additionalFeatures: {
            typingSpeed: keystrokeFeatures.typingSpeed,
            flightTime: keystrokeFeatures.flightTime,
            errorRate: keystrokeFeatures.errorRate,
            pressPressure: keystrokeFeatures.pressPressure,
          },
          sampleCount,
          privacyMode,
          rawData: privacyMode ? null : [], // Could store raw data if not in privacy mode
        }),
      })

      if (!response.ok) {
        throw new Error(`Training failed: ${response.statusText}`)
      }

      const result: ModelTrainingResult = await response.json()
      return result.success
    } catch (error) {
      console.error('Training API error:', error)
      throw error
    }
  }

  /**
   * Authenticate a user against their trained biometric model
   * Returns detailed results including reconstruction error and confidence
   */
  static async authenticate(
    username: string,
    keystrokeFeatures: KeystrokeBiometricFeatures,
    password: string
  ): Promise<AuthenticationResult> {
    try {
      const response = await fetch('/api/authenticate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          features: keystrokeFeatures.features,
          holdTimes: keystrokeFeatures.holdTimes,
          ddTimes: keystrokeFeatures.ddTimes,
          udTimes: keystrokeFeatures.udTimes,
          typingSpeed: keystrokeFeatures.typingSpeed,
          flightTime: keystrokeFeatures.flightTime,
          errorRate: keystrokeFeatures.errorRate,
          pressPressure: keystrokeFeatures.pressPressure,
        }),
      })

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`)
      }

      const result: AuthenticationResult = await response.json()
      return result
    } catch (error) {
      console.error('Authentication API error:', error)
      throw error
    }
  }

  /**
   * Register voice biometric samples for a user
   * Takes multiple voice samples and extracts features for training
   */
  static async voiceRegister(username: string, voiceSamples: Blob[]): Promise<boolean> {
    try {
      // Dynamically import voice processing to avoid SSR issues
      const { processVoiceAudio } = await import('@/utils/voice-feature-extractor')
      
      const formData = new FormData()
      formData.append('username', username)
      
      // Extract features from each voice sample
      const extractedFeaturesSets = []
      for (let i = 0; i < voiceSamples.length; i++) {
        const voiceSample = voiceSamples[i]
        formData.append(`sample_${i}`, voiceSample, `voice_sample_${i}.webm`)
        
        try {
          const { features } = await processVoiceAudio(voiceSample)
          extractedFeaturesSets.push(features)
        } catch (error) {
          console.error(`Failed to extract features from sample ${i}:`, error)
          // Continue with other samples even if one fails
        }
      }

      // Add the extracted features to the request
      formData.append('features', JSON.stringify(extractedFeaturesSets))

      const response = await fetch('/api/voice/register', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Voice registration failed: ${response.statusText}`)
      }

      const result: VoiceRegistrationResult = await response.json()
      return result.success
    } catch (error) {
      console.error('Voice registration API error:', error)
      throw error
    }
  }

  /**
   * Verify a voice sample against a user's stored voice profile
   * Used as fallback authentication when keystroke auth fails
   */
  static async voiceVerify(username: string, voiceSample: Blob): Promise<boolean> {
    try {
      // Dynamically import voice processing to avoid SSR issues
      const { processVoiceAudio } = await import('@/utils/voice-feature-extractor')
      
      const formData = new FormData()
      formData.append('username', username)
      formData.append('voice_sample', voiceSample, 'verification_sample.webm')
      
      // Extract features from the verification sample
      try {
        const { features } = await processVoiceAudio(voiceSample)
        formData.append('features', JSON.stringify(features))
      } catch (error) {
        console.error('Failed to extract features from verification sample:', error)
        throw new Error('Failed to extract voice features for verification')
      }

      const response = await fetch('/api/voice/verify', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Voice verification failed: ${response.statusText}`)
      }

      const result: VoiceVerificationResult = await response.json()
      return result.success
    } catch (error) {
      console.error('Voice verification API error:', error)
      throw error
    }
  }
}

export default RuntimeAPI
