"use client"

// Custom hook for voice biometric authentication - handles recording, processing, and verification
import { useState, useRef, useCallback } from "react"
import { processVoiceAudio } from "@/utils/voice-feature-extractor"
import RuntimeAPI from "@/lib/runtime-api"
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics"

// TypeScript interface for the voice authentication hook
interface VoiceAuthHook {
  isRecording: boolean
  audioBlob: Blob | null
  audioUrl: string | null
  recordingTime: number
  isProcessing: boolean
  processingProgress: number
  extractedFeatures: any
  startRecording: () => Promise<void>
  stopRecording: () => void
  resetRecording: () => void
  registerVoice: (username: string, samples: Blob[]) => Promise<boolean>
  verifyVoice: (username: string, sample: Blob) => Promise<boolean>
  attachWaveform: (canvas: HTMLCanvasElement) => void
  detachWaveform: () => void
}

export function useVoiceAuth(): VoiceAuthHook {
  // Core recording state management
  const [isCurrentlyRecording, setIsCurrentlyRecording] = useState(false)
  const [capturedAudioBlob, setCapturedAudioBlob] = useState<Blob | null>(null)
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  
  // Audio processing state
  const [isProcessingAudio, setIsProcessingAudio] = useState(false)
  const [currentProcessingProgress, setCurrentProcessingProgress] = useState(0)
  const [voiceFeatures, setVoiceFeatures] = useState<any>(null)

  // Refs for managing recording infrastructure
  const mediaRecorderInstance = useRef<MediaRecorder | null>(null)
  const microphoneStream = useRef<MediaStream | null>(null)
  const recordingTimer = useRef<NodeJS.Timeout | null>(null)
  
  // Audio visualization refs
  const audioContextInstance = useRef<AudioContext | null>(null)
  const audioAnalyser = useRef<AnalyserNode | null>(null)
  const animationFrame = useRef<number | null>(null)
  const visualizationCanvas = useRef<HTMLCanvasElement | null>(null)

  // Start voice recording with high-quality audio settings
  const beginRecording = useCallback(async () => {
    try {
      // Haptic feedback to indicate recording start
      await Haptics.selectionStart().catch(() => {})
      
      // Request microphone access with optimal settings for voice recognition
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true, // Remove echo for cleaner voice samples
          noiseSuppression: true, // Reduce background noise
          sampleRate: 44100, // High quality audio sampling
        },
      })

      microphoneStream.current = micStream

      // Set up MediaRecorder with WebM format for better compression
      const recorder = new MediaRecorder(micStream, {
        mimeType: "audio/webm;codecs=opus",
      })

      mediaRecorderInstance.current = recorder

      const audioChunks: BlobPart[] = []

      // Handle audio data collection during recording
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }

      // Process the recorded audio when recording stops
      recorder.onstop = async () => {
        const finalAudioBlob = new Blob(audioChunks, { type: "audio/webm;codecs=opus" })
        setCapturedAudioBlob(finalAudioBlob)
        setGeneratedAudioUrl(URL.createObjectURL(finalAudioBlob))

        // Clean up microphone stream
        micStream.getTracks().forEach((track) => track.stop())

        // Clean up visualization components
        if (animationFrame.current) {
          cancelAnimationFrame(animationFrame.current)
          animationFrame.current = null
        }
        if (audioAnalyser.current) {
          audioAnalyser.current.disconnect()
          audioAnalyser.current = null
        }
        if (audioContextInstance.current) {
          audioContextInstance.current.close().catch(() => {})
          audioContextInstance.current = null
        }

        // Extract voice features for biometric analysis
        try {
          setIsProcessingAudio(true)
          setCurrentProcessingProgress(20)

          const { features } = await processVoiceAudio(finalAudioBlob)
          setVoiceFeatures(features)
          setCurrentProcessingProgress(100)
        } catch (error) {
          console.error("Failed to extract voice features:", error)
          setVoiceFeatures(null)
        } finally {
          setIsProcessingAudio(false)
          setTimeout(() => setCurrentProcessingProgress(0), 1000)
        }
      }

      // Start the actual recording
      recorder.start()
      setIsCurrentlyRecording(true)
      setRecordingDuration(0)

      // Start timing the recording duration
      recordingTimer.current = setInterval(() => {
        setRecordingDuration((prevTime) => prevTime + 1)
      }, 1000)
    } catch (error) {
      console.error("Error accessing microphone:", error)
      throw new Error("Microphone access denied")
    }
  }, [])

  // Stop the current recording session
  const endRecording = useCallback(() => {
    if (mediaRecorderInstance.current && isCurrentlyRecording) {
      mediaRecorderInstance.current.stop()
      setIsCurrentlyRecording(false)

      if (recordingTimer.current) {
        clearInterval(recordingTimer.current)
        recordingTimer.current = null
      }
    }
  }, [isCurrentlyRecording])

  // Reset recording state for new session
  const clearRecording = useCallback(() => {
    setCapturedAudioBlob(null)
    setVoiceFeatures(null)
    if (generatedAudioUrl) {
      URL.revokeObjectURL(generatedAudioUrl)
      setGeneratedAudioUrl(null)
    }
    setRecordingDuration(0)
  }, [generatedAudioUrl])

  // Register voice biometric profile for a user
  const enrollVoiceProfile = useCallback(async (username: string, voiceSamples: Blob[]): Promise<boolean> => {
    try {
      setIsProcessingAudio(true)
      setCurrentProcessingProgress(0)
      const registrationSuccessful = await RuntimeAPI.voiceRegister(username, voiceSamples)
      setCurrentProcessingProgress(100)
      if (registrationSuccessful) await Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
      return registrationSuccessful
    } catch (error) {
      console.error("Voice registration failed:", error)
      await Haptics.notification({ type: NotificationType.Error }).catch(() => {})
      return false
    } finally {
      setIsProcessingAudio(false)
      setCurrentProcessingProgress(0)
    }
  }, [])

  // Verify voice against stored biometric profile
  const authenticateVoice = useCallback(async (username: string, voiceSample: Blob): Promise<boolean> => {
    try {
      setIsProcessingAudio(true)
      setCurrentProcessingProgress(30)
      const verificationSuccessful = await RuntimeAPI.voiceVerify(username, voiceSample)
      setCurrentProcessingProgress(100)
      if (verificationSuccessful) {
        await Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
      } else {
        await Haptics.notification({ type: NotificationType.Error }).catch(() => {})
      }
      return verificationSuccessful
    } catch (error) {
      console.error("Voice verification failed:", error)
      await Haptics.notification({ type: NotificationType.Error }).catch(() => {})
      return false
    } finally {
      setIsProcessingAudio(false)
      setCurrentProcessingProgress(0)
    }
  }, [])

  // Set up real-time waveform visualization during recording
  const setupWaveformVisualization = useCallback((canvas: HTMLCanvasElement | null) => {
    visualizationCanvas.current = canvas
    if (!canvas || !microphoneStream.current) return

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioContextInstance.current = audioContext
      const audioSource = audioContext.createMediaStreamSource(microphoneStream.current)
      const frequencyAnalyser = audioContext.createAnalyser()
      frequencyAnalyser.fftSize = 2048
      audioAnalyser.current = frequencyAnalyser
      audioSource.connect(frequencyAnalyser)

      const bufferLength = frequencyAnalyser.frequencyBinCount
      const audioDataArray = new Uint8Array(bufferLength)
      const canvasContext = canvas.getContext("2d")
      if (!canvasContext) return

      // Animation loop for real-time waveform visualization
      const drawWaveform = () => {
        if (!audioAnalyser.current || !visualizationCanvas.current) return
        audioAnalyser.current.getByteTimeDomainData(audioDataArray)

        const canvasWidth = visualizationCanvas.current.width
        const canvasHeight = visualizationCanvas.current.height
        canvasContext.clearRect(0, 0, canvasWidth, canvasHeight)
        canvasContext.fillStyle = "rgba(15,23,42,0.6)" // Dark background
        canvasContext.fillRect(0, 0, canvasWidth, canvasHeight)
        canvasContext.lineWidth = 2
        canvasContext.strokeStyle = "#22d3ee" // Cyan waveform
        canvasContext.beginPath()
        const sliceWidth = (canvasWidth * 1.0) / bufferLength
        let x = 0
        for (let i = 0; i < bufferLength; i++) {
          const v = audioDataArray[i] / 128.0
          const y = (v * canvasHeight) / 2
          if (i === 0) canvasContext.moveTo(x, y)
          else canvasContext.lineTo(x, y)
          x += sliceWidth
        }
        canvasContext.lineTo(canvasWidth, canvasHeight / 2)
        canvasContext.stroke()
        animationFrame.current = requestAnimationFrame(drawWaveform)
      }
      drawWaveform()
    } catch (e) {
      // Ignore visualization errors - they're not critical for functionality
    }
  }, [])

  // Clean up waveform visualization
  const cleanupWaveformVisualization = useCallback(() => {
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current)
      animationFrame.current = null
    }
    if (audioAnalyser.current) {
      audioAnalyser.current.disconnect()
      audioAnalyser.current = null
    }
    if (audioContextInstance.current) {
      audioContextInstance.current.close().catch(() => {})
      audioContextInstance.current = null
    }
  }, [])

  return {
    isRecording: isCurrentlyRecording,
    audioBlob: capturedAudioBlob,
    audioUrl: generatedAudioUrl,
    recordingTime: recordingDuration,
    isProcessing: isProcessingAudio,
    processingProgress: currentProcessingProgress,
    extractedFeatures: voiceFeatures,
    startRecording: beginRecording,
    stopRecording: endRecording,
    resetRecording: clearRecording,
    registerVoice: enrollVoiceProfile,
    verifyVoice: authenticateVoice,
    attachWaveform: setupWaveformVisualization,
    detachWaveform: cleanupWaveformVisualization,
  }
}
