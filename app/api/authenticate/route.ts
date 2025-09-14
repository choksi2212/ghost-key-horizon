import { type NextRequest, NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import { AUTH_CONFIG } from "@/config/auth-config"

// Simple autoencoder implementation for keystroke authentication
// NOTE: This is a basic implementation - in production you'd want something more robust
class SimpleAutoencoder {
  private encoderWeights!: number[][]
  private bottleneckWeights!: number[][]
  private decoderWeights!: number[][]
  private encoderBiases!: number[]
  private bottleneckBiases!: number[]
  private decoderBiases!: number[]
  private inputDimensions: number
  private hiddenLayerSize: number
  private bottleneckDimensions: number

  constructor(inputDimensions: number, hiddenLayerSize = 16, bottleneckDimensions = 8) {
    this.inputDimensions = inputDimensions
    this.hiddenLayerSize = hiddenLayerSize
    this.bottleneckDimensions = bottleneckDimensions
  }

  // ReLU activation function - keeps positive values, zeros out negatives
  private reluActivation(x: number): number {
    return Math.max(0, x)
  }

  // Sigmoid activation function - maps any real number to (0,1)
  private sigmoidActivation(x: number): number {
    // Clamp input to prevent overflow
    return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))))
  }

  // Forward pass through the autoencoder network
  predict(inputFeatures: number[]): number[] {
    // First layer: input to hidden
    const hiddenLayerOutput = new Array(this.hiddenLayerSize)
    for (let i = 0; i < this.hiddenLayerSize; i++) {
      let weightedSum = this.encoderBiases[i]
      for (let j = 0; j < this.inputDimensions; j++) {
        weightedSum += inputFeatures[j] * this.encoderWeights[j][i]
      }
      hiddenLayerOutput[i] = this.reluActivation(weightedSum)
    }

    // Second layer: hidden to bottleneck (compressed representation)
    const bottleneckOutput = new Array(this.bottleneckDimensions)
    for (let i = 0; i < this.bottleneckDimensions; i++) {
      let weightedSum = this.bottleneckBiases[i]
      for (let j = 0; j < this.hiddenLayerSize; j++) {
        weightedSum += hiddenLayerOutput[j] * this.bottleneckWeights[j][i]
      }
      bottleneckOutput[i] = this.reluActivation(weightedSum)
    }

    // Third layer: bottleneck to output (reconstruction)
    const reconstructedOutput = new Array(this.inputDimensions)
    for (let i = 0; i < this.inputDimensions; i++) {
      let weightedSum = this.decoderBiases[i]
      for (let j = 0; j < this.bottleneckDimensions; j++) {
        weightedSum += bottleneckOutput[j] * this.decoderWeights[j][i]
      }
      reconstructedOutput[i] = this.sigmoidActivation(weightedSum)
    }

    return reconstructedOutput
  }

  // Restore autoencoder from saved training data
  static deserialize(savedData: any): SimpleAutoencoder {
    const autoencoder = new SimpleAutoencoder(savedData.inputSize, savedData.hiddenSize, savedData.bottleneckSize)
    autoencoder.encoderWeights = savedData.weights1
    autoencoder.bottleneckWeights = savedData.weights2
    autoencoder.decoderWeights = savedData.weights3
    autoencoder.encoderBiases = savedData.biases1
    autoencoder.bottleneckBiases = savedData.biases2
    autoencoder.decoderBiases = savedData.biases3
    return autoencoder
  }
}

// Main authentication endpoint - this is where the magic happens
export async function POST(request: NextRequest) {
  try {
    // Parse the incoming authentication request
    const requestBody = await request.json()
    console.log("Authentication request received for:", requestBody.username)

    // Extract user credentials from request
    const { username, password } = requestBody

    if (!username) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          mse: 0,
          reconstructionError: 0,
          reason: "Username is required",
        },
        { status: 400 },
      )
    }

    // Load the user's trained biometric model
    const userModelDirectory = path.join(process.cwd(), AUTH_CONFIG.MODELS_DIR, username)
    const userModelFile = path.join(userModelDirectory, "model.json")

    try {
      const savedModelData = JSON.parse(await fs.readFile(userModelFile, "utf-8"))
      console.log("Model loaded for user:", username, "Model type:", savedModelData.modelType || "statistical")

      // Extract biometric features from the request in multiple possible formats
      let keystrokeFeatures = []

      if (requestBody.features && Array.isArray(requestBody.features)) {
        keystrokeFeatures = requestBody.features
      } else if (requestBody.features && requestBody.features.features && Array.isArray(requestBody.features.features)) {
        keystrokeFeatures = requestBody.features.features
      } else if (requestBody.extractedFeatures && Array.isArray(requestBody.extractedFeatures)) {
        keystrokeFeatures = requestBody.extractedFeatures
      } else if (
        requestBody.extractedFeatures &&
        requestBody.extractedFeatures.features &&
        Array.isArray(requestBody.extractedFeatures.features)
      ) {
        keystrokeFeatures = requestBody.extractedFeatures.features
      }

      // If we still don't have features, try to reconstruct them from component parts
      if (keystrokeFeatures.length === 0) {
        const keyHoldTimes = requestBody.holdTimes || []
        const downToDownTimes = requestBody.ddTimes || []
        const upToDownTimes = requestBody.udTimes || []
        const overallTypingSpeed = requestBody.typingSpeed || 0
        const averageFlightTime = requestBody.flightTime || 0
        const errorCount = requestBody.errorRate || 0
        const typingPressure = requestBody.pressPressure || 0

        // Reconstruct feature vector similar to the training pipeline
        const PASSWORD_LENGTH = 11
        keystrokeFeatures = [
          ...keyHoldTimes.slice(0, PASSWORD_LENGTH),
          ...downToDownTimes.slice(0, PASSWORD_LENGTH - 1),
          ...upToDownTimes.slice(0, PASSWORD_LENGTH - 1),
          overallTypingSpeed,
          averageFlightTime,
          errorCount,
          typingPressure,
        ]

        // Pad with zeros if we don't have enough features
        while (keystrokeFeatures.length < PASSWORD_LENGTH * 3 + 1) {
          keystrokeFeatures.push(0)
        }
      }

      console.log("Using features array of length:", keystrokeFeatures.length)

      // Determine which authentication method to use based on model type
      if (savedModelData.modelType === "autoencoder" && savedModelData.autoencoder) {
        console.log("Using advanced autoencoder authentication")

        // Normalize input features using the same parameters from training
        const { min, max } = savedModelData.normalizationParams
        const normalizedInputFeatures = keystrokeFeatures.map((value: number, i: number) => {
          if (i >= min.length || i >= max.length) {
            return 0 // Safety padding if feature array is longer than expected
          }
          const featureRange = max[i] - min[i]
          return featureRange === 0 ? 0 : (value - min[i]) / featureRange
        })

        // Load the trained autoencoder model
        const trainedAutoencoder = SimpleAutoencoder.deserialize(savedModelData.autoencoder)

        // Get the autoencoder's reconstruction of the input
        const reconstructedFeatures = trainedAutoencoder.predict(normalizedInputFeatures)

        // Calculate reconstruction error (mean squared error)
        let reconstructionError = 0
        for (let i = 0; i < normalizedInputFeatures.length; i++) {
          const featureDifference = normalizedInputFeatures[i] - reconstructedFeatures[i]
          reconstructionError += featureDifference * featureDifference
        }
        reconstructionError /= normalizedInputFeatures.length

        // Check if reconstruction error is within acceptable threshold
        const acceptableThreshold = savedModelData.threshold
        const authenticationSuccessful = reconstructionError <= acceptableThreshold

        // Calculate confidence score for this authentication attempt
        const maxExpectedError = savedModelData.trainingStats?.maxError || acceptableThreshold * 2
        const confidenceScore = Math.max(0, Math.min(1, 1 - reconstructionError / (maxExpectedError * 2)))

        // Create deviation map for visualization (limited to first 10 features for heatmap)
        const featureDeviations = normalizedInputFeatures.slice(0, 10).map((val: number) => Math.min(Math.abs(val), 1))

        console.log(`Autoencoder authentication for ${username}:`, {
          reconstructionError: reconstructionError.toFixed(6),
          threshold: acceptableThreshold.toFixed(6),
          authenticated: authenticationSuccessful,
          confidence: confidenceScore.toFixed(3),
        })

        // Log this authentication attempt to our audit trail
        try {
          await fetch(`${request.nextUrl.origin}/api/log-auth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timestamp: new Date().toISOString(),
              username,
              result: authenticationSuccessful ? "Pass" : "Fail",
              mse: reconstructionError,
              ip: request.headers.get("x-forwarded-for") || "localhost",
              userAgent: request.headers.get("user-agent") || "Unknown",
            }),
          })
        } catch (logError) {
          console.error("Failed to log authentication:", logError)
        }

        return NextResponse.json({
          success: authenticationSuccessful,
          authenticated: authenticationSuccessful,
          mse: reconstructionError,
          reconstructionError,
          deviations: featureDeviations,
          confidence: confidenceScore,
          reason: authenticationSuccessful
            ? "Authentication successful"
            : `Reconstruction error too high: ${reconstructionError.toFixed(6)} > ${acceptableThreshold.toFixed(6)}`,
          method: "autoencoder",
        })
      } else {
        console.log("Using legacy statistical authentication")

        // Statistical model authentication (fallback method)
        if (!savedModelData.means || !savedModelData.stds) {
          throw new Error("Statistical model data is incomplete")
        }

        // Calculate mean squared error using the same normalization as training
        let calculatedMSE = 0
        const keystrokeDeviations = []

        for (let i = 0; i < keystrokeFeatures.length && i < savedModelData.means.length; i++) {
          const normalizedFeature = (keystrokeFeatures[i] - savedModelData.means[i]) / (savedModelData.stds[i] || 1)
          const absoluteDeviation = Math.abs(normalizedFeature)
          keystrokeDeviations.push(Math.min(absoluteDeviation, 1)) // Cap at 1 for visualization
          calculatedMSE += normalizedFeature * normalizedFeature
        }

        calculatedMSE = calculatedMSE / keystrokeFeatures.length

        // Use percentile-based threshold for authentication decision
        const percentileThreshold = savedModelData.mseStats?.percentileThreshold || 0.1
        const authenticationSuccessful = calculatedMSE <= percentileThreshold

        let failureReason = ""
        if (!authenticationSuccessful) {
          const percentileUsed = savedModelData.mseStats?.percentileUsed || AUTH_CONFIG.STATISTICAL_PERCENTILE_THRESHOLD
          failureReason = `MSE (${calculatedMSE.toFixed(5)}) exceeds ${percentileUsed}th percentile threshold (${percentileThreshold.toFixed(5)})`
        }

        console.log(`Statistical authentication for ${username}:`, {
          mse: calculatedMSE.toFixed(6),
          threshold: percentileThreshold.toFixed(6),
          authenticated: authenticationSuccessful,
        })

        // Log this authentication attempt
        try {
          await fetch(`${request.nextUrl.origin}/api/log-auth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timestamp: new Date().toISOString(),
              username,
              result: authenticationSuccessful ? "Pass" : "Fail",
              mse: calculatedMSE,
              ip: request.headers.get("x-forwarded-for") || "localhost",
              userAgent: request.headers.get("user-agent") || "Unknown",
            }),
          })
        } catch (logError) {
          console.error("Failed to log authentication:", logError)
        }

        return NextResponse.json({
          success: authenticationSuccessful,
          authenticated: authenticationSuccessful,
          mse: calculatedMSE,
          reconstructionError: calculatedMSE,
          deviations: keystrokeDeviations,
          reason: authenticationSuccessful ? "Authentication successful" : failureReason,
          method: "statistical",
          thresholds: {
            percentileThreshold,
            percentileUsed: savedModelData.mseStats?.percentileUsed || AUTH_CONFIG.PERCENTILE_THRESHOLD,
          },
        })
      }
    } catch (error) {
      console.error("Authentication error:", error)
      return NextResponse.json({
        success: false,
        authenticated: false,
        mse: 0,
        reconstructionError: 0,
        deviations: [],
        reason: `No model found for user ${username}. Please register first.`,
      })
    }
  } catch (error) {
    console.error("Authentication failed:", error)
    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        mse: 0,
        reconstructionError: 0,
        deviations: [],
        reason: "Authentication system error",
      },
      { status: 500 },
    )
  }
}
