"use client"

import { useState, useRef, useCallback } from "react"
import { processVoiceAudio } from "@/utils/voice-feature-extractor"
import RuntimeAPI from "@/lib/runtime-api"
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics"

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
}

export function useVoiceAuth(): VoiceAuthHook {
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [extractedFeatures, setExtractedFeatures] = useState<any>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const startRecording = useCallback(async () => {
    try {
      await Haptics.selectionStart().catch(() => {})
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      })

      streamRef.current = stream

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      })

      mediaRecorderRef.current = mediaRecorder

      const chunks: BlobPart[] = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm;codecs=opus" })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop())

        // Tear down visualizer
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        if (analyserRef.current) {
          analyserRef.current.disconnect()
          analyserRef.current = null
        }
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {})
          audioContextRef.current = null
        }

        // Extract features immediately
        try {
          setIsProcessing(true)
          setProcessingProgress(20)

          const { features } = await processVoiceAudio(blob)
          setExtractedFeatures(features)
          setProcessingProgress(100)
        } catch (error) {
          console.error("Failed to extract features:", error)
          setExtractedFeatures(null)
        } finally {
          setIsProcessing(false)
          setTimeout(() => setProcessingProgress(0), 1000)
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } catch (error) {
      console.error("Error accessing microphone:", error)
      throw new Error("Microphone access denied")
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isRecording])

  const resetRecording = useCallback(() => {
    setAudioBlob(null)
    setExtractedFeatures(null)
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }
    setRecordingTime(0)
  }, [audioUrl])

  const registerVoice = useCallback(async (username: string, samples: Blob[]): Promise<boolean> => {
    try {
      setIsProcessing(true)
      setProcessingProgress(0)
      const ok = await RuntimeAPI.voiceRegister(username, samples)
      setProcessingProgress(100)
      if (ok) await Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
      return ok
    } catch (error) {
      console.error("Voice registration failed:", error)
      await Haptics.notification({ type: NotificationType.ERROR }).catch(() => {})
      return false
    } finally {
      setIsProcessing(false)
      setProcessingProgress(0)
    }
  }, [])

  const verifyVoice = useCallback(async (username: string, sample: Blob): Promise<boolean> => {
    try {
      setIsProcessing(true)
      setProcessingProgress(30)
      const ok = await RuntimeAPI.voiceVerify(username, sample)
      setProcessingProgress(100)
      if (ok) {
        await Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
      } else {
        await Haptics.notification({ type: NotificationType.ERROR }).catch(() => {})
      }
      return ok
    } catch (error) {
      console.error("Voice verification failed:", error)
      await Haptics.notification({ type: NotificationType.ERROR }).catch(() => {})
      return false
    } finally {
      setIsProcessing(false)
      setProcessingProgress(0)
    }
  }, [])

  const attachWaveform = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas
    if (!canvas || !streamRef.current) return

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(streamRef.current)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyserRef.current = analyser
      source.connect(analyser)

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const draw = () => {
        if (!analyserRef.current || !canvasRef.current) return
        analyserRef.current.getByteTimeDomainData(dataArray)

        const width = canvasRef.current.width
        const height = canvasRef.current.height
        ctx.clearRect(0, 0, width, height)
        ctx.fillStyle = "rgba(15,23,42,0.6)"
        ctx.fillRect(0, 0, width, height)
        ctx.lineWidth = 2
        ctx.strokeStyle = "#22d3ee"
        ctx.beginPath()
        const sliceWidth = (width * 1.0) / bufferLength
        let x = 0
        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0
          const y = (v * height) / 2
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
          x += sliceWidth
        }
        ctx.lineTo(width, height / 2)
        ctx.stroke()
        rafRef.current = requestAnimationFrame(draw)
      }
      draw()
    } catch (e) {
      // ignore visualizer errors
    }
  }, [])

  const detachWaveform = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect()
      analyserRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
  }, [])

  return {
    isRecording,
    audioBlob,
    audioUrl,
    recordingTime,
    isProcessing,
    processingProgress,
    extractedFeatures,
    startRecording,
    stopRecording,
    resetRecording,
    registerVoice,
    verifyVoice,
    attachWaveform,
    detachWaveform,
  }
}
