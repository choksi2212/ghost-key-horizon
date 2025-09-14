"use client"

// Custom hook for keystroke dynamics analysis - this is where the biometric magic happens
import type React from "react"
import { useState, useCallback } from "react"
import RuntimeAPI from "@/lib/runtime-api"

// Structure for capturing individual keystroke events
interface KeystrokeEvent {
  key: string
  type: "keydown" | "keyup"
  timestamp: number // High-precision timestamp from performance.now()
}

// Extracted biometric features from keystroke patterns
interface ExtractedFeatures {
  holdTimes: number[] // How long each key is held down
  ddTimes: number[] // Down-to-down timing between consecutive keys
  udTimes: number[] // Up-to-down timing (flight time)
  typingSpeed: number // Overall typing velocity
  flightTime: number // Average time between key releases and next presses
  errorRate: number // Number of backspace/correction events
  pressPressure: number // Variance in key press timing (pressure simulation)
  features: number[] // Final feature vector for ML processing
}

export function useKeystrokeAnalyzer() {
  // State for capturing and managing keystroke data
  const [keystrokeBuffer, setKeystrokeBuffer] = useState<KeystrokeEvent[]>([])
  const [isCurrentlyCapturing, setIsCurrentlyCapturing] = useState(false)

  // Capture keystroke events with high-precision timing
  const captureKeystrokeEvent = useCallback((event: React.KeyboardEvent, type: "keydown" | "keyup") => {
    const keystrokeEntry: KeystrokeEvent = {
      key: event.key,
      type,
      timestamp: performance.now(), // High-precision timing for accurate biometrics
    }

    setKeystrokeBuffer((previousData) => [...previousData, keystrokeEntry])
  }, [])

  // Extract biometric features from raw keystroke data
  const extractBiometricFeatures = useCallback((rawData: KeystrokeEvent[]): ExtractedFeatures => {
    // Separate keydown and keyup events for timing analysis
    const keyDownEvents = rawData.filter((k) => k.type === "keydown")
    const keyUpEvents = rawData.filter((k) => k.type === "keyup")

    // Create timeline of key presses with timestamps
    const keyPressTimeline = keyDownEvents.map((k) => [k.key, k.timestamp] as [string, number])

    const keyHoldDurations: number[] = []
    const downToDownIntervals: number[] = []
    const upToDownIntervals: number[] = []

    // Calculate key hold times (how long each key is pressed)
    keyPressTimeline.forEach(([keyChar, downTimestamp]) => {
      const correspondingUpEvent = keyUpEvents.find((u) => u.key === keyChar && u.timestamp > downTimestamp)
      if (correspondingUpEvent) {
        keyHoldDurations.push(correspondingUpEvent.timestamp - downTimestamp)
      }
    })

    // Calculate dwell times (interval between consecutive key presses)
    for (let i = 0; i < keyPressTimeline.length - 1; i++) {
      const currentKeyPress = keyPressTimeline[i][1]
      const nextKeyPress = keyPressTimeline[i + 1][1]
      downToDownIntervals.push(nextKeyPress - currentKeyPress)
    }

    // Calculate flight times (time from key release to next key press)
    for (let i = 0; i < keyPressTimeline.length - 1; i++) {
      const currentKeyChar = keyPressTimeline[i][0]
      const currentKeyDown = keyPressTimeline[i][1]
      const nextKeyDown = keyPressTimeline[i + 1][1]

      const currentKeyUp = keyUpEvents.find((u) => u.key === currentKeyChar && u.timestamp > currentKeyDown)
      if (currentKeyUp) {
        upToDownIntervals.push(nextKeyDown - currentKeyUp.timestamp)
      } else {
        // Fallback if key up event is missing (shouldn't happen but safety first)
        upToDownIntervals.push(nextKeyDown - currentKeyDown)
      }
    }

    // Calculate derived biometric metrics
    const totalTypingTime =
      Math.max(
        keyHoldDurations.reduce((sum, t) => sum + t, 0),
        downToDownIntervals.reduce((sum, t) => sum + t, 0),
        upToDownIntervals.reduce((sum, t) => sum + t, 0),
      ) || 0.001 // Avoid division by zero

    const overallTypingSpeed = keyPressTimeline.length / (totalTypingTime / 1000)
    const averageFlightTime = upToDownIntervals.length > 0 ? upToDownIntervals.reduce((a, b) => a + b, 0) / upToDownIntervals.length : 0
    const typoCount = rawData.filter((k) => k.key === "Backspace").length

    // Calculate typing pressure variance (consistency indicator)
    const meanHoldDuration = keyHoldDurations.length > 0 ? keyHoldDurations.reduce((a, b) => a + b, 0) / keyHoldDurations.length : 0
    const typingPressureVariance =
      keyHoldDurations.length > 0
        ? Math.sqrt(keyHoldDurations.reduce((sum, t) => sum + Math.pow(t - meanHoldDuration, 2), 0) / keyHoldDurations.length)
        : 0

    // Create feature vector for machine learning (matches our Python training pipeline)
    const PASSWORD_LENGTH = 11 // Expected password length for normalization
    const mlFeatureVector = [
      ...keyHoldDurations.slice(0, PASSWORD_LENGTH),
      ...downToDownIntervals.slice(0, PASSWORD_LENGTH - 1),
      ...upToDownIntervals.slice(0, PASSWORD_LENGTH - 1),
      overallTypingSpeed,
      averageFlightTime,
      typoCount,
      typingPressureVariance,
    ]

    // Pad feature vector with zeros if we have fewer keystrokes than expected
    while (mlFeatureVector.length < PASSWORD_LENGTH * 3 + 1) {
      mlFeatureVector.push(0)
    }

    return {
      holdTimes: keyHoldDurations,
      ddTimes: downToDownIntervals,
      udTimes: upToDownIntervals,
      typingSpeed: overallTypingSpeed,
      flightTime: averageFlightTime,
      errorRate: typoCount,
      pressPressure: typingPressureVariance,
      features: mlFeatureVector,
    }
  }, [])

  // Train the ML model with new biometric data
  const trainBiometricModel = useCallback(
    async (username: string, features: ExtractedFeatures, sampleCount: number, privacyMode: boolean) => {
      try {
        return await RuntimeAPI.trainModel(username, features as any, sampleCount, privacyMode)
      } catch (error) {
        console.error("Model training failed:", error)
        return false
      }
    },
    [],
  )

  // Authenticate user against their trained biometric model
  const authenticateUser = useCallback(async (username: string, features: ExtractedFeatures, password: string) => {
    try {
      return await RuntimeAPI.authenticate(username, features as any, password)
    } catch (error) {
      console.error("Authentication failed:", error)
      return { success: false, authenticated: false, mse: 0, deviations: [] }
    }
  }, [])

  // Clear the keystroke buffer for next capture session
  const resetKeystrokeCapture = useCallback(() => {
    setKeystrokeBuffer([])
  }, [])

  return {
    captureKeystrokes: captureKeystrokeEvent,
    extractFeatures: extractBiometricFeatures,
    trainModel: trainBiometricModel,
    authenticate: authenticateUser,
    resetCapture: resetKeystrokeCapture,
    isCapturing: isCurrentlyCapturing,
    keystrokeData: keystrokeBuffer,
  }
}
