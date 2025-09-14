"use client"

// Main keystroke authentication component - this is where the magic happens
import type React from "react"

import { useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Shield, Lock, Key, Fingerprint, Cpu, Volume2 } from "lucide-react"
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics"
import { useKeystrokeAnalyzer } from "@/hooks/use-keystroke-analyzer"
import { AnomalyHeatmap } from "./anomaly-heatmap"
import { VoiceRegistration } from "./voice-registration"
import { VoiceAuthModal } from "./voice-auth-modal"

// Constants - probably should move these to a config file eventually
const PASSWORD_LENGTH = 11
const SAMPLES_REQUIRED = 10

export function KeystrokeCapture() {
  // Main component state - keeping track of auth vs registration mode
  const [currentMode, setCurrentMode] = useState<"auth" | "register">("auth")
  const [userIdentifier, setUserIdentifier] = useState("")
  const [userPassphrase, setUserPassphrase] = useState("")

  // Password validation for registration - ensuring consistency across samples
  // by yas: checks if next iterated pass matches with the first pass if yes then next else exp error
  const [firstPassword, setFirstPassword] = useState<string | null>(null)


  // UI feedback and status management
  const [authResult, setAuthResult] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null)
  const [capturedSamples, setCapturedSamples] = useState(0)
  const [enablePrivacyMode, setEnablePrivacyMode] = useState(false)
  const [showAnomalyMap, setShowAnomalyMap] = useState(false)
  const [keystrokeDeviations, setKeystrokeDeviations] = useState<number[]>([])

  // Voice authentication fallback system
  const [authFailureCount, setAuthFailureCount] = useState(0)
  const [showVoiceAuthDialog, setShowVoiceAuthDialog] = useState(false)
  const [showVoiceSetup, setShowVoiceSetup] = useState(false)
  const [hasVoiceProfile, setHasVoiceProfile] = useState(false)

  // DOM refs for focus management
  const passphraseInputRef = useRef<HTMLInputElement>(null)
  const { captureKeystrokes, extractFeatures, trainModel, authenticate, resetCapture, isCapturing, keystrokeData } =
    useKeystrokeAnalyzer()

  // Handle Enter key for form submission + keystroke capture
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (currentMode === "auth") {
        processAuthentication()
      } else {
        processRegistration()
      }
    } else {
      // Capture all other keystrokes for analysis
      captureKeystrokes(e, "keydown")
    }
  }

  const processAuthentication = async () => {
    if (!userIdentifier || !userPassphrase) {
      setAuthResult({ type: "error", message: "Please enter both username and password" })
      return
    }

    try {
      const keystrokeFeatures = extractFeatures(keystrokeData)

      // Authenticate using our custom ML pipeline (runs locally for security)
      const authResponse = await authenticate(userIdentifier, keystrokeFeatures, userPassphrase)
      console.log("Auth result:", authResponse)

      // Process authentication response
      if (authResponse.authenticated) {
        setAuthResult({
          type: "success",
          message: `✅ AUTHENTICATION SUCCESSFUL\nBiometric Error: ${(authResponse.reconstructionError || 0).toFixed(5)}\n🛡️ ACCESS GRANTED`,
        })
        // Haptic feedback for successful auth
        try { await Haptics.impact({ style: ImpactStyle.Heavy }) } catch {}
        setKeystrokeDeviations(authResponse.deviations || [])
        setShowAnomalyMap(true)
        setAuthFailureCount(0) // Reset failure counter

        // Log this successful attempt
        await logAuthenticationAttempt(userIdentifier, true, authResponse.reconstructionError || 0)
      } else {
        const newFailureCount = authFailureCount + 1
        setAuthFailureCount(newFailureCount)

        setAuthResult({
          type: "error",
          message: `❌ AUTHENTICATION FAILED (Attempt ${newFailureCount}/2)\nBiometric Error: ${(authResponse.reconstructionError || 0).toFixed(5)}\n🚫 ACCESS DENIED\nReason: ${authResponse.reason || "Authentication failed"}`,
        })
        // Haptic feedback for failed auth
        try { await Haptics.notification({ type: NotificationType.Error }) } catch {}
        setKeystrokeDeviations(authResponse.deviations || [])
        setShowAnomalyMap(true)

        // Log this failed attempt
        await logAuthenticationAttempt(userIdentifier, false, authResponse.reconstructionError || 0)

        // Trigger voice fallback after 2 consecutive failures
        if (newFailureCount >= 2) {
          setShowVoiceAuthDialog(true)
          setAuthResult({
            type: "error",
            message: `🚨 MULTIPLE AUTHENTICATION FAILURES\n🎤 Voice authentication required for security verification`,
          })
        }
      }
    } catch (error) {
      console.error("Authentication error:", error)
      setAuthResult({ type: "error", message: `🚨 SECURITY BREACH DETECTED: ${error}` })
    }

    clearFormInputs()
  }

  const processRegistration = async () => {
    if (!userIdentifier || !userPassphrase) {
      setAuthResult({ type: "error", message: "Please enter both username and password" })
      return
    }

    // Ensure password consistency across training samples
    if (firstPassword === null) {
      // First sample - store the password for comparison
      setFirstPassword(userPassphrase)
    } else if (userPassphrase !== firstPassword) {
      // Password doesn't match the first one - reject this sample
      setAuthResult({ type: "error", message: "🚫 Password mismatch! Use the same passphrase as the first sample." })
      clearFormInputs()
      return
    }

    try {
      const keystrokeFeatures = extractFeatures(keystrokeData)
      const trainingSuccess = await trainModel(userIdentifier, keystrokeFeatures, capturedSamples, enablePrivacyMode)

      if (trainingSuccess) {
        const newSampleCount = capturedSamples + 1
        setCapturedSamples(newSampleCount)

        if (newSampleCount >= SAMPLES_REQUIRED) {
          setAuthResult({
            type: "success",
            message: `✅ BIOMETRIC PROFILE CREATED\n🤖 Neural Network Trained for ${userIdentifier}\n🔒 Security Clearance: ACTIVE`,
          })
          setCapturedSamples(0)
          setFirstPassword(null) // Reset for next user registration
          setShowVoiceSetup(true) // Move to voice registration
        } else {
          setAuthResult({
            type: "info",
            message: `📊 Biometric Sample ${newSampleCount}/${SAMPLES_REQUIRED} Captured\n⌨️ Continue keystroke pattern analysis`,
          })
        }

        resetCapture() // Clear keystroke buffer
      }
    } catch (error) {
      setAuthResult({ type: "error", message: `🚨 TRAINING ERROR: ${error}` })
    }

    clearFormInputs()
  }
  

  // Handle successful voice authentication (fallback method)
  const handleVoiceAuthenticationSuccess = () => {
    setAuthFailureCount(0)
    setAuthResult({
      type: "success",
      message: `✅ VOICE AUTHENTICATION SUCCESSFUL\n🛡️ ACCESS GRANTED VIA BIOMETRIC FALLBACK`,
    })
  }

  // Handle completion of voice profile setup during registration
  const handleVoiceProfileComplete = () => {
    setHasVoiceProfile(true)
    setShowVoiceSetup(false)
    setCurrentMode("auth")
    setAuthResult({
      type: "success",
      message: `🎉 COMPLETE BIOMETRIC PROFILE CREATED\n⌨️ Keystroke + 🎤 Voice Authentication Ready`,
    })
  }

  // Reset form inputs and focus management
  const clearFormInputs = () => {
    setUserPassphrase("")
    if (passphraseInputRef.current) {
      passphraseInputRef.current.focus()
    }
  }

  // Log authentication attempts for audit trail
  const logAuthenticationAttempt = async (user: string, success: boolean, error: number) => {
    try {
      await fetch("/api/log-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          username: user,
          result: success ? "Pass" : "Fail",
          mse: error,
          ip: "localhost",
          userAgent: navigator.userAgent,
        }),
      })
    } catch (logError) {
      console.error("Failed to log auth attempt:", logError)
    }
  }

  // Show voice registration component if we're in that flow
  if (showVoiceSetup) {
    return <VoiceRegistration username={userIdentifier} onComplete={handleVoiceProfileComplete} />
  }

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800/50 dark:bg-slate-900/50 border-slate-700/50 dark:border-slate-600/50 shadow-2xl backdrop-blur-sm transition-all duration-300 hover:shadow-cyan-500/10">
        <CardHeader
          className="border-b border-slate-700/50 dark:border-slate-600/50"
          style={{
            background: "linear-gradient(to right, rgba(30, 41, 59, 0.8), rgba(51, 65, 85, 0.8))",
          }}
        >
          <CardTitle className="flex items-center justify-between text-slate-100 dark:text-slate-200">
            <span className="flex items-center gap-3">
              {currentMode === "auth" ? (
                <Shield className="w-6 h-6 text-cyan-400" />
              ) : (
                <Fingerprint className="w-6 h-6 text-blue-400" />
              )}
              <span className="text-xl bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                {currentMode === "auth" ? "Multi-Modal Biometric Authentication" : "Biometric Profile Training"}
              </span>
            </span>
            <div className="flex gap-2">
              <Button
                variant={currentMode === "auth" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setCurrentMode("auth")
                  setFirstPassword(null) // clear it when switching mode
                }}
                className={
                  currentMode === "auth"
                    ? "bg-cyan-600/80 hover:bg-cyan-500 text-white border-cyan-500/50"
                    : "border-slate-600 text-slate-300 hover:bg-slate-700/50"
                }
              >
                <Shield className="w-4 h-4 mr-2" />
                Authenticate
              </Button>
              <Button
                variant={currentMode === "register" ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentMode("register")}
                className={
                  currentMode === "register"
                    ? "bg-blue-600/80 hover:bg-blue-500 text-white border-blue-500/50"
                    : "border-slate-600 text-slate-300 hover:bg-slate-700/50"
                }
              >
                <Fingerprint className="w-4 h-4 mr-2" />
                Register
              </Button>
            </div>
          </CardTitle>
          <CardDescription className="text-slate-400 dark:text-slate-500">
            {currentMode === "auth"
              ? "🔐 Secure access through keystroke dynamics with voice fallback authentication"
              : "📝 Create biometric profile with keystroke + voice pattern recognition"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-6 bg-slate-800/30 dark:bg-slate-900/30">
          {/* Security Features Banner */}
          <div className="flex justify-center gap-4 flex-wrap">
            <div className="px-3 py-1 bg-cyan-500/10 text-cyan-300 rounded-full text-xs font-medium border border-cyan-500/30 backdrop-blur-sm flex items-center gap-1">
              <Fingerprint className="w-3 h-3" />
              Keystroke Dynamics
            </div>
            <div className="px-3 py-1 bg-purple-500/10 text-purple-300 rounded-full text-xs font-medium border border-purple-500/30 backdrop-blur-sm flex items-center gap-1">
              <Volume2 className="w-3 h-3" />
              Voice Biometrics
            </div>
            <div className="px-3 py-1 bg-orange-500/10 text-orange-300 rounded-full text-xs font-medium border border-orange-500/30 backdrop-blur-sm">
              🛡️ Multi-Factor Security
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label
                htmlFor="username"
                className="text-slate-300 dark:text-slate-400 font-medium flex items-center gap-2"
              >
                <Key className="w-4 h-4 text-cyan-400" />
                Security Identifier
              </Label>
              <Input
                id="username"
                value={userIdentifier}
                onChange={(e) => setUserIdentifier(e.target.value)}
                placeholder="Enter security ID"
                className="bg-slate-700/50 dark:bg-slate-800/50 border-slate-600/50 dark:border-slate-700/50 text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/50 dark:focus:border-cyan-400/50 transition-all duration-300"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-slate-300 dark:text-slate-400 font-medium flex items-center gap-2"
              >
                <Lock className="w-4 h-4 text-cyan-400" />
                Biometric Passphrase
              </Label>
              <Input
                ref={passphraseInputRef}
                id="password"
                type="password"
                value={userPassphrase}
                onChange={(e) => setUserPassphrase(e.target.value)}
                onKeyDown={handleKeyPress}
                onKeyUp={(e) => captureKeystrokes(e, "keyup")}
                placeholder="Enter passphrase for analysis"
                className="font-mono text-lg bg-slate-700/50 dark:bg-slate-800/50 border-slate-600/50 dark:border-slate-700/50 text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/50 dark:focus:border-cyan-400/50 transition-all duration-300"
              />
              <p className="text-xs text-slate-500 dark:text-slate-600 flex items-center gap-1">
                <Cpu className="w-3 h-3" />
                Press Enter to {currentMode === "auth" ? "authenticate" : "capture biometric sample"}
              </p>
            </div>
          </div>

          {currentMode === "register" && (
            <>
              <div className="flex items-center space-x-3 p-4 bg-slate-700/30 dark:bg-slate-800/30 rounded-lg border border-slate-600/30 dark:border-slate-700/30">
                <Checkbox
                  id="privacy"
                  checked={enablePrivacyMode}
                  onCheckedChange={(checked) => setEnablePrivacyMode(checked as boolean)}
                  className="border-slate-500 dark:border-slate-600"
                />
                <Label htmlFor="privacy" className="text-sm text-slate-400 dark:text-slate-500">
                  🔒 Privacy Mode (Raw keystroke vectors will not be stored)
                </Label>
              </div>

              {capturedSamples > 0 && (
                <div className="space-y-3 p-4 rounded-lg border border-blue-500/30 dark:border-blue-400/30">
                  <div
                    className="p-4 -m-4 rounded-lg"
                    style={{
                      background: "linear-gradient(to right, rgba(59, 130, 246, 0.1), rgba(6, 182, 212, 0.1))",
                    }}
                  >
                    <Label className="text-slate-300 dark:text-slate-400 font-medium flex items-center gap-2">
                      <Cpu className="w-4 h-4" />
                      Keystroke Pattern Training Progress
                    </Label>
                    <Progress
                      value={(capturedSamples / SAMPLES_REQUIRED) * 100}
                      className="h-3 bg-slate-700 dark:bg-slate-800 mt-2"
                    />
                    <p className="text-sm text-slate-400 dark:text-slate-500 flex items-center gap-2 mt-2">
                      <span className="inline-block w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                      {capturedSamples}/{SAMPLES_REQUIRED} keystroke vectors captured
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Security warning for failed authentication attempts */}
          {currentMode === "auth" && authFailureCount > 0 && authFailureCount < 2 && (
            <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/30">
              <div className="flex items-center gap-2 text-orange-300 text-sm">
                <Shield className="w-4 h-4" />
                <span className="font-medium">Security Alert</span>
              </div>
              <p className="text-xs text-orange-400/80 mt-1">
                Authentication failed {authFailureCount}/2 times. Voice authentication will be required after 2 failures.
              </p>
            </div>
          )}

          <Button
            onClick={currentMode === "auth" ? processAuthentication : processRegistration}
            className={`w-full transition-all duration-300 ${
              currentMode === "auth"
                ? "bg-gradient-to-r from-cyan-600/80 to-cyan-700/80 hover:from-cyan-500 hover:to-cyan-600 border border-cyan-500/50"
                : "bg-gradient-to-r from-blue-600/80 to-blue-700/80 hover:from-blue-500 hover:to-blue-600 border border-blue-500/50"
            } text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] font-medium backdrop-blur-sm`}
            disabled={isCapturing}
          >
            {currentMode === "auth" ? (
              <>
                <Shield className="w-5 h-5 mr-2" />
                INITIATE AUTHENTICATION
              </>
            ) : (
              <>
                <Fingerprint className="w-5 h-5 mr-2" />
                CAPTURE BIOMETRIC DATA
              </>
            )}
          </Button>

          {authResult && (
            <Alert
              className={`transition-all duration-300 backdrop-blur-sm ${
                authResult.type === "success"
                  ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300 dark:text-cyan-400"
                  : authResult.type === "error"
                    ? "border-red-500/50 bg-red-500/10 text-red-300 dark:text-red-400"
                    : "border-blue-500/50 bg-blue-500/10 text-blue-300 dark:text-blue-400"
              }`}
            >
              <AlertDescription className="whitespace-pre-line font-medium font-mono text-sm">
                {authResult.message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {showAnomalyMap && keystrokeDeviations.length > 0 && <AnomalyHeatmap data={keystrokeDeviations} />}

      {/* Voice Authentication Modal for fallback authentication */}
      <VoiceAuthModal
        isOpen={showVoiceAuthDialog}
        onClose={() => setShowVoiceAuthDialog(false)}
        username={userIdentifier}
        onSuccess={handleVoiceAuthenticationSuccess}
      />
    </div>
  )
}
