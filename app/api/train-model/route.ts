import { type NextRequest, NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import { AUTH_CONFIG } from "@/config/auth-config"

// Data augmentation helper - adds realistic noise to training samples
function addVariationNoise(originalData: number[], noiseIntensity: number = AUTH_CONFIG.DATA_AUGMENTATION_NOISE): number[] {
  return originalData.map((value) => {
    // Add proportional noise to simulate natural typing variations
    const randomNoise = (Math.random() - 0.5) * 2 * noiseIntensity * value
    return Math.max(0, value + randomNoise) // Keep values positive
  })
}

// Normalize keystroke features to [0, 1] range for neural network training
function normalizeKeystrokeFeatures(featureSamples: number[][]): { normalized: number[][]; min: number[]; max: number[] } {
  const numberOfFeatures = featureSamples[0].length
  const minValues = new Array(numberOfFeatures).fill(Number.POSITIVE_INFINITY)
  const maxValues = new Array(numberOfFeatures).fill(Number.NEGATIVE_INFINITY)

  // Find minimum and maximum values for each feature across all samples
  featureSamples.forEach((sampleFeatures) => {
    sampleFeatures.forEach((featureValue, featureIndex) => {
      minValues[featureIndex] = Math.min(minValues[featureIndex], featureValue)
      maxValues[featureIndex] = Math.max(maxValues[featureIndex], featureValue)
    })
  })

  // Normalize each feature to [0,1] range
  const normalizedSamples = featureSamples.map((sampleFeatures) =>
    sampleFeatures.map((featureValue, featureIndex) => {
      const featureRange = maxValues[featureIndex] - minValues[featureIndex]
      return featureRange === 0 ? 0 : (featureValue - minValues[featureIndex]) / featureRange
    }),
  )

  return { normalized: normalizedSamples, min: minValues, max: maxValues }
}

// Autoencoder neural network for keystroke biometric learning
class SimpleAutoencoder {
  private encoderWeights: number[][]
  private bottleneckWeights: number[][]
  private decoderWeights: number[][]
  private encoderBiases: number[]
  private bottleneckBiases: number[]
  private decoderBiases: number[]
  private inputDimensions: number
  private hiddenLayerSize: number
  private bottleneckDimensions: number

  constructor(inputDimensions: number, hiddenLayerSize = 16, bottleneckDimensions = 8) {
    this.inputDimensions = inputDimensions
    this.hiddenLayerSize = hiddenLayerSize
    this.bottleneckDimensions = bottleneckDimensions

    // Initialize network weights using Xavier initialization for better training
    this.encoderWeights = this.initializeNetworkWeights(inputDimensions, hiddenLayerSize)
    this.bottleneckWeights = this.initializeNetworkWeights(hiddenLayerSize, bottleneckDimensions)
    this.decoderWeights = this.initializeNetworkWeights(bottleneckDimensions, inputDimensions)

    // Initialize biases with small random values
    this.encoderBiases = new Array(hiddenLayerSize).fill(0).map(() => Math.random() * 0.1 - 0.05)
    this.bottleneckBiases = new Array(bottleneckDimensions).fill(0).map(() => Math.random() * 0.1 - 0.05)
    this.decoderBiases = new Array(inputDimensions).fill(0).map(() => Math.random() * 0.1 - 0.05)
  }

  // Xavier/Glorot weight initialization for better gradient flow
  private initializeNetworkWeights(inputSize: number, outputSize: number): number[][] {
    const weightMatrix: number[][] = []
    const initializationScale = Math.sqrt(2.0 / inputSize) // Xavier initialization
    for (let i = 0; i < inputSize; i++) {
      weightMatrix[i] = []
      for (let j = 0; j < outputSize; j++) {
        weightMatrix[i][j] = (Math.random() * 2 - 1) * initializationScale
      }
    }
    return weightMatrix
  }

  // ReLU activation function - helps with gradient flow
  private reluActivation(x: number): number {
    return Math.max(0, x)
  }

  // Sigmoid activation for output layer - maps to [0,1] range
  private sigmoidActivation(x: number): number {
    // Clamp input to prevent numerical overflow
    return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))))
  }

  // Forward pass through the autoencoder network
  private forwardPass(inputData: number[]): { hiddenOutput: number[]; bottleneckOutput: number[]; finalOutput: number[] } {
    // Layer 1: Input to hidden layer
    const hiddenLayerActivations = new Array(this.hiddenLayerSize)
    for (let i = 0; i < this.hiddenLayerSize; i++) {
      let weightedSum = this.encoderBiases[i]
      for (let j = 0; j < this.inputDimensions; j++) {
        weightedSum += inputData[j] * this.encoderWeights[j][i]
      }
      hiddenLayerActivations[i] = this.reluActivation(weightedSum)
    }

    // Layer 2: Hidden to bottleneck layer (compression)
    const bottleneckActivations = new Array(this.bottleneckDimensions)
    for (let i = 0; i < this.bottleneckDimensions; i++) {
      let weightedSum = this.bottleneckBiases[i]
      for (let j = 0; j < this.hiddenLayerSize; j++) {
        weightedSum += hiddenLayerActivations[j] * this.bottleneckWeights[j][i]
      }
      bottleneckActivations[i] = this.reluActivation(weightedSum)
    }

    // Layer 3: Bottleneck to output layer (reconstruction)
    const outputActivations = new Array(this.inputDimensions)
    for (let i = 0; i < this.inputDimensions; i++) {
      let weightedSum = this.decoderBiases[i]
      for (let j = 0; j < this.bottleneckDimensions; j++) {
        weightedSum += bottleneckActivations[j] * this.decoderWeights[j][i]
      }
      outputActivations[i] = this.sigmoidActivation(weightedSum)
    }

    return { hiddenOutput: hiddenLayerActivations, bottleneckOutput: bottleneckActivations, finalOutput: outputActivations }
  }

  // Prediction method for inference
  predict(inputSample: number[]): number[] {
    return this.forwardPass(inputSample).finalOutput
  }

  // Train the autoencoder using gradient descent
  trainNetwork(trainingData: number[][], epochs = 100, learningRate = 0.01): number[] {
    const trainingLosses = []

    for (let currentEpoch = 0; currentEpoch < epochs; currentEpoch++) {
      let epochTotalLoss = 0

      for (const trainingSample of trainingData) {
        const { hiddenOutput, bottleneckOutput, finalOutput } = this.forwardPass(trainingSample)

        // Calculate reconstruction loss (mean squared error)
        let sampleLoss = 0
        for (let i = 0; i < this.inputDimensions; i++) {
          const reconstructionError = trainingSample[i] - finalOutput[i]
          sampleLoss += reconstructionError * reconstructionError
        }
        sampleLoss /= this.inputDimensions
        epochTotalLoss += sampleLoss

        // Backpropagation - update weights based on gradients
        this.updateNetworkWeights(trainingSample, hiddenOutput, bottleneckOutput, finalOutput, learningRate)
      }

      const averageEpochLoss = epochTotalLoss / trainingData.length
      trainingLosses.push(averageEpochLoss)

      // Log progress every 20 epochs
      if (currentEpoch % 20 === 0) {
        console.log(`Epoch ${currentEpoch}: Average Loss = ${averageEpochLoss.toFixed(6)}`)
      }
    }

    return trainingLosses
  }

  // Backpropagation algorithm to update network weights
  private updateNetworkWeights(
    originalInput: number[],
    hiddenActivations: number[],
    bottleneckActivations: number[],
    networkOutput: number[],
    learningRate: number,
  ): void {
    // Calculate output layer gradients (sigmoid derivative)
    const outputGradients = new Array(this.inputDimensions)
    for (let i = 0; i < this.inputDimensions; i++) {
      outputGradients[i] = (originalInput[i] - networkOutput[i]) * networkOutput[i] * (1 - networkOutput[i])
    }

    // Update decoder weights and biases
    for (let i = 0; i < this.bottleneckDimensions; i++) {
      for (let j = 0; j < this.inputDimensions; j++) {
        this.decoderWeights[i][j] += learningRate * outputGradients[j] * bottleneckActivations[i]
      }
    }
    for (let i = 0; i < this.inputDimensions; i++) {
      this.decoderBiases[i] += learningRate * outputGradients[i]
    }

    // Calculate bottleneck layer gradients (ReLU derivative)
    const bottleneckGradients = new Array(this.bottleneckDimensions)
    for (let i = 0; i < this.bottleneckDimensions; i++) {
      let gradient = 0
      for (let j = 0; j < this.inputDimensions; j++) {
        gradient += outputGradients[j] * this.decoderWeights[i][j]
      }
      bottleneckGradients[i] = gradient * (bottleneckActivations[i] > 0 ? 1 : 0)
    }

    // Update bottleneck weights and biases
    for (let i = 0; i < this.hiddenLayerSize; i++) {
      for (let j = 0; j < this.bottleneckDimensions; j++) {
        this.bottleneckWeights[i][j] += learningRate * bottleneckGradients[j] * hiddenActivations[i]
      }
    }
    for (let i = 0; i < this.bottleneckDimensions; i++) {
      this.bottleneckBiases[i] += learningRate * bottleneckGradients[i]
    }

    // Calculate hidden layer gradients (ReLU derivative)
    const hiddenGradients = new Array(this.hiddenLayerSize)
    for (let i = 0; i < this.hiddenLayerSize; i++) {
      let gradient = 0
      for (let j = 0; j < this.bottleneckDimensions; j++) {
        gradient += bottleneckGradients[j] * this.bottleneckWeights[i][j]
      }
      hiddenGradients[i] = gradient * (hiddenActivations[i] > 0 ? 1 : 0)
    }

    // Update encoder weights and biases
    for (let i = 0; i < this.inputDimensions; i++) {
      for (let j = 0; j < this.hiddenLayerSize; j++) {
        this.encoderWeights[i][j] += learningRate * hiddenGradients[j] * originalInput[i]
      }
    }
    for (let i = 0; i < this.hiddenLayerSize; i++) {
      this.encoderBiases[i] += learningRate * hiddenGradients[i]
    }
  }

  // Serialize the trained model for storage
  serialize(): any {
    return {
      weights1: this.encoderWeights,
      weights2: this.bottleneckWeights,
      weights3: this.decoderWeights,
      biases1: this.encoderBiases,
      biases2: this.bottleneckBiases,
      biases3: this.decoderBiases,
      inputSize: this.inputDimensions,
      hiddenSize: this.hiddenLayerSize,
      bottleneckSize: this.bottleneckDimensions,
    }
  }

  // Restore a trained model from saved data
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

// Main training endpoint - handles keystroke model training
export async function POST(request: NextRequest) {
  try {
    const {
      username,
      features,
      holdTimes,
      ddTimes,
      udTimes,
      additionalFeatures,
      sampleCount,
      privacyMode,
      rawData
    } = await request.json()

    // Set up user-specific directory structure for model storage
    const userModelDirectory = path.join(process.cwd(), AUTH_CONFIG.KEYSTROKE_MODELS_DIRECTORY, username)
    const sampleStorageDirectory = path.join(userModelDirectory, "samples")
    const rawKeystrokeDirectory = path.join(userModelDirectory, "raw_data")

    // Create necessary directories
    await fs.mkdir(sampleStorageDirectory, { recursive: true })
    if (!privacyMode) {
      await fs.mkdir(rawKeystrokeDirectory, { recursive: true })
    }

    // Store the current training sample with comprehensive metadata
    const currentSampleData = {
      sampleId: sampleCount,
      timestamp: new Date().toISOString(),
      features,
      detailedFeatures: {
        holdTimes,
        ddTimes,
        udTimes,
        ...additionalFeatures,
      },
      privacyMode,
    }

    const sampleFilePath = path.join(sampleStorageDirectory, `sample_${sampleCount}.json`)
    await fs.writeFile(sampleFilePath, JSON.stringify(currentSampleData, null, 2))

    // Store raw keystroke data if privacy mode is disabled
    if (!privacyMode && rawData) {
      const rawDataFilePath = path.join(rawKeystrokeDirectory, `raw_${sampleCount}.json`)
      await fs.writeFile(
        rawDataFilePath,
        JSON.stringify(
          {
            sampleId: sampleCount,
            timestamp: new Date().toISOString(),
            rawKeystrokes: rawData,
          },
          null,
          2,
        ),
      )
    }

    // Check if we have enough samples to train the autoencoder model
    if (sampleCount >= AUTH_CONFIG.SAMPLES_REQUIRED - 1) {
      const collectedSamples = []

      // Load all previously stored samples for training
      for (let i = 0; i <= sampleCount; i++) {
        try {
          const samplePath = path.join(sampleStorageDirectory, `sample_${i}.json`)
          const loadedSampleData = JSON.parse(await fs.readFile(samplePath, "utf-8"))
          collectedSamples.push(loadedSampleData.features)
        } catch (error) {
          console.error(`Failed to load sample ${i}:`, error)
        }
      }

      if (collectedSamples.length >= AUTH_CONFIG.MINIMUM_TRAINING_SAMPLES) {
        console.log(`Training autoencoder for ${username} with ${collectedSamples.length} samples...`)

        // Data augmentation - create additional training samples by adding realistic noise
        const augmentedTrainingSet: number[][] = []
        collectedSamples.forEach((originalSample) => {
          augmentedTrainingSet.push(originalSample) // Include original sample

          // Generate augmented samples with noise to improve model robustness
          for (let i = 0; i < AUTH_CONFIG.SAMPLE_AUGMENTATION_MULTIPLIER; i++) {
            augmentedTrainingSet.push(addVariationNoise(originalSample))
          }
        })

        // Normalize all features to [0,1] range for optimal neural network training
        const { normalized, min, max } = normalizeKeystrokeFeatures(augmentedTrainingSet)

        // Create and configure the autoencoder architecture
        const inputFeatureDimensions = normalized[0].length
        const autoencoderModel = new SimpleAutoencoder(inputFeatureDimensions, 16, 8)

        console.log("Training autoencoder neural network...")
        const trainingLossHistory = autoencoderModel.trainNetwork(normalized, 200, 0.01)

        // Evaluate model performance on original samples (without noise)
        const originalNormalizedSamples = collectedSamples.map((sample) =>
          sample.map((value: number, i: number) => {
            const range = max[i] - min[i]
            return range === 0 ? 0 : (value - min[i]) / range
          }),
        )

        const reconstructionErrorsOnOriginalSamples = []
        for (const normalizedSample of originalNormalizedSamples) {
          const reconstructedSample = autoencoderModel.predict(normalizedSample)
          let meanSquaredError = 0
          for (let i = 0; i < normalizedSample.length; i++) {
            const difference = normalizedSample[i] - reconstructedSample[i]
            meanSquaredError += difference * difference
          }
          meanSquaredError /= normalizedSample.length
          reconstructionErrorsOnOriginalSamples.push(meanSquaredError)
        }

        // Calculate authentication threshold using 95th percentile of training errors
        const sortedReconstructionErrors = [...reconstructionErrorsOnOriginalSamples].sort((a, b) => a - b)
        const percentile95Index = Math.floor(0.95 * sortedReconstructionErrors.length)
        const calculatedThreshold = sortedReconstructionErrors[percentile95Index] || AUTH_CONFIG.AUTOENCODER_AUTH_THRESHOLD

        // Use the higher of configured threshold or calculated threshold (with safety margin)
        // Add additional safety checks to prevent NaN values
        const safeCalculatedThreshold = isNaN(calculatedThreshold) || calculatedThreshold <= 0 
          ? AUTH_CONFIG.AUTOENCODER_AUTH_THRESHOLD 
          : calculatedThreshold
        const finalAuthenticationThreshold = Math.max(
          AUTH_CONFIG.AUTOENCODER_AUTH_THRESHOLD, 
          safeCalculatedThreshold * 1.2
        )

        // Calculate mean reconstruction error properly
        const meanReconstructionError = reconstructionErrorsOnOriginalSamples.length > 0 
          ? reconstructionErrorsOnOriginalSamples.reduce((a, b) => a + b, 0) / reconstructionErrorsOnOriginalSamples.length
          : 0

        // Create comprehensive model data for storage
        const trainedModelData = {
          username,
          modelType: "autoencoder",
          inputDim: inputFeatureDimensions,
          normalizationParams: { min, max },
          threshold: finalAuthenticationThreshold,
          autoencoder: autoencoderModel.serialize(),
          trainingStats: {
            samples: collectedSamples.length,
            augmentedSamples: augmentedTrainingSet.length,
            reconstructionErrors: reconstructionErrorsOnOriginalSamples,
            meanError: meanReconstructionError,
            maxError: Math.max(...reconstructionErrorsOnOriginalSamples),
            minError: Math.min(...reconstructionErrorsOnOriginalSamples),
            calculatedThreshold: safeCalculatedThreshold,
            finalThreshold: finalAuthenticationThreshold,
            finalLoss: trainingLossHistory[trainingLossHistory.length - 1],
          },
          createdAt: new Date().toISOString(),
        }

        // Save the trained model to disk (this overwrites any existing model)
        const modelFilePath = path.join(userModelDirectory, "model.json")
        await fs.writeFile(modelFilePath, JSON.stringify(trainedModelData, null, 2))

        console.log(`Autoencoder trained successfully for ${username}:`, {
          samples: collectedSamples.length,
          augmented: augmentedTrainingSet.length,
          threshold: finalAuthenticationThreshold,
          meanReconstructionError: meanReconstructionError,
          finalLoss: trainingLossHistory[trainingLossHistory.length - 1],
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Autoencoder training failed:", error)
    return NextResponse.json({ error: "Training failed" }, { status: 500 })
  }
}
