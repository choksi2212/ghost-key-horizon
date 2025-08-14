/**
 * SimpleAutoencoder for Ghost Key Universal Extension
 * Ported from Ghost Key project API routes (app/api/train-model/route.ts and app/api/authenticate/route.ts)
 * Implements neural network autoencoder for keystroke dynamics authentication
 */

// Configuration
const AUTH_CONFIG = {
  PASSWORD_LENGTH: 8,
  SAMPLES_REQUIRED: 5,
  NOISE_LEVEL: 0.1,
  AUGMENTATION_FACTOR: 3,
  AUTOENCODER_THRESHOLD: 0.03
};

/**
 * Simple autoencoder implementation
 * Ported exactly from Ghost Key project
 */
class SimpleAutoencoder {
  constructor(inputSize, hiddenSize = 16, bottleneckSize = 8) {
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    this.bottleneckSize = bottleneckSize;

    // Initialize weights and biases randomly
    this.weights1 = this.initializeWeights(inputSize, hiddenSize);
    this.weights2 = this.initializeWeights(hiddenSize, bottleneckSize);
    this.weights3 = this.initializeWeights(bottleneckSize, inputSize);

    this.biases1 = new Array(hiddenSize).fill(0).map(() => Math.random() * 0.1 - 0.05);
    this.biases2 = new Array(bottleneckSize).fill(0).map(() => Math.random() * 0.1 - 0.05);
    this.biases3 = new Array(inputSize).fill(0).map(() => Math.random() * 0.1 - 0.05);
  }

  initializeWeights(inputSize, outputSize) {
    const weights = [];
    const limit = Math.sqrt(6 / (inputSize + outputSize));
    for (let i = 0; i < inputSize; i++) {
      weights[i] = [];
      for (let j = 0; j < outputSize; j++) {
        weights[i][j] = Math.random() * 2 * limit - limit;
      }
    }
    return weights;
  }

  relu(x) {
    return Math.max(0, x);
  }

  forward(input) {
    // Encoder: input -> hidden
    const hidden = new Array(this.hiddenSize);
    for (let j = 0; j < this.hiddenSize; j++) {
      let sum = this.biases1[j];
      for (let i = 0; i < this.inputSize; i++) {
        sum += input[i] * this.weights1[i][j];
      }
      hidden[j] = this.relu(sum);
    }

    // Bottleneck: hidden -> bottleneck
    const bottleneck = new Array(this.bottleneckSize);
    for (let j = 0; j < this.bottleneckSize; j++) {
      let sum = this.biases2[j];
      for (let i = 0; i < this.hiddenSize; i++) {
        sum += hidden[i] * this.weights2[i][j];
      }
      bottleneck[j] = this.relu(sum);
    }

    // Decoder: bottleneck -> output
    const output = new Array(this.inputSize);
    for (let j = 0; j < this.inputSize; j++) {
      let sum = this.biases3[j];
      for (let i = 0; i < this.bottleneckSize; i++) {
        sum += bottleneck[i] * this.weights3[i][j];
      }
      output[j] = sum; // Linear activation for output layer
    }

    return output;
  }

  predict(input) {
    return this.forward(input);
  }

  train(data, epochs = 200, learningRate = 0.01) {
    const losses = [];
    console.log(`Training autoencoder with ${data.length} samples for ${epochs} epochs...`);

    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;

      // Shuffle data
      const shuffled = [...data].sort(() => Math.random() - 0.5);

      for (const sample of shuffled) {
        // Forward pass
        const output = this.forward(sample);

        // Calculate loss (MSE)
        let loss = 0;
        for (let i = 0; i < sample.length; i++) {
          const diff = sample[i] - output[i];
          loss += diff * diff;
        }
        loss /= sample.length;
        totalLoss += loss;

        // Backward pass - simplified gradient descent
        this.backpropagate(sample, output, learningRate);
      }

      const avgLoss = totalLoss / shuffled.length;
      losses.push(avgLoss);

      // Log progress every 50 epochs
      if (epoch % 50 === 0 || epoch === epochs - 1) {
        console.log(`Epoch ${epoch + 1}/${epochs}, Loss: ${avgLoss.toFixed(6)}`);
      }
    }

    return losses;
  }

  backpropagate(target, output, learningRate) {
    // Simplified backpropagation for demonstration
    // This is a basic implementation - real backprop would be more complex

    // Calculate output gradients
    const outputGrads = [];
    for (let i = 0; i < target.length; i++) {
      outputGrads[i] = 2 * (output[i] - target[i]) / target.length;
    }

    // Update weights3 and biases3 (decoder)
    for (let i = 0; i < this.bottleneckSize; i++) {
      for (let j = 0; j < this.inputSize; j++) {
        // Note: We would need the bottleneck activations here
        // This is a simplified version
        this.weights3[i][j] -= learningRate * outputGrads[j] * 0.1;
      }
    }

    for (let j = 0; j < this.inputSize; j++) {
      this.biases3[j] -= learningRate * outputGrads[j];
    }

    // For simplicity, we'll use a basic weight decay instead of full backprop
    const decay = 0.0001;
    
    // Apply small random updates to weights1 and weights2
    for (let i = 0; i < this.inputSize; i++) {
      for (let j = 0; j < this.hiddenSize; j++) {
        this.weights1[i][j] *= (1 - decay);
        this.weights1[i][j] += (Math.random() - 0.5) * learningRate * 0.01;
      }
    }

    for (let i = 0; i < this.hiddenSize; i++) {
      for (let j = 0; j < this.bottleneckSize; j++) {
        this.weights2[i][j] *= (1 - decay);
        this.weights2[i][j] += (Math.random() - 0.5) * learningRate * 0.01;
      }
    }
  }

  serialize() {
    return {
      inputSize: this.inputSize,
      hiddenSize: this.hiddenSize,
      bottleneckSize: this.bottleneckSize,
      weights1: this.weights1,
      weights2: this.weights2,
      weights3: this.weights3,
      biases1: this.biases1,
      biases2: this.biases2,
      biases3: this.biases3
    };
  }

  static deserialize(data) {
    const autoencoder = new SimpleAutoencoder(data.inputSize, data.hiddenSize, data.bottleneckSize);
    
    autoencoder.weights1 = data.weights1;
    autoencoder.weights2 = data.weights2;
    autoencoder.weights3 = data.weights3;
    autoencoder.biases1 = data.biases1;
    autoencoder.biases2 = data.biases2;
    autoencoder.biases3 = data.biases3;

    return autoencoder;
  }
}

/**
 * Feature normalization functions
 * Ported from Ghost Key project
 */
function normalizeFeatures(features) {
  if (features.length === 0) {
    throw new Error('Cannot normalize empty feature set');
  }

  const featureCount = features[0].length;
  const min = new Array(featureCount).fill(Infinity);
  const max = new Array(featureCount).fill(-Infinity);

  // Find min and max for each feature
  for (const sample of features) {
    for (let i = 0; i < featureCount; i++) {
      if (sample[i] < min[i]) min[i] = sample[i];
      if (sample[i] > max[i]) max[i] = sample[i];
    }
  }

  // Normalize features to [0, 1]
  const normalized = features.map(sample =>
    sample.map((value, i) => {
      const range = max[i] - min[i];
      return range === 0 ? 0 : (value - min[i]) / range;
    })
  );

  return { normalized, min, max };
}

/**
 * Add noise for data augmentation
 * Ported from Ghost Key project
 */
function addNoise(sample, noiseLevel = AUTH_CONFIG.NOISE_LEVEL) {
  return sample.map(value => {
    const noise = (Math.random() - 0.5) * 2 * noiseLevel;
    return Math.max(0, value + noise);
  });
}

/**
 * Training function that handles the complete autoencoder training process
 * Ported from Ghost Key project train-model route
 */
async function trainKeystrokeModel(samples) {
  if (samples.length < AUTH_CONFIG.SAMPLES_REQUIRED) {
    throw new Error(`Need at least ${AUTH_CONFIG.SAMPLES_REQUIRED} samples for training`);
  }

  console.log(`Training autoencoder with ${samples.length} samples...`);

  // Data augmentation - add noise to create more training samples
  const augmentedSamples = [];
  samples.forEach((sample) => {
    augmentedSamples.push(sample); // Original sample

    // Add augmented samples with noise
    for (let i = 0; i < AUTH_CONFIG.AUGMENTATION_FACTOR; i++) {
      augmentedSamples.push(addNoise(sample));
    }
  });

  // Normalize features
  const { normalized, min, max } = normalizeFeatures(augmentedSamples);

  // Create and train autoencoder
  const inputDim = normalized[0].length;
  const autoencoder = new SimpleAutoencoder(inputDim, 16, 8);

  console.log("Training autoencoder...");
  const losses = autoencoder.train(normalized, 200, 0.01);

  // Calculate reconstruction errors for original samples
  const originalNormalized = samples.map((sample) =>
    sample.map((value, i) => {
      const range = max[i] - min[i];
      return range === 0 ? 0 : (value - min[i]) / range;
    })
  );

  const reconstructionErrors = [];
  for (const sample of originalNormalized) {
    const reconstructed = autoencoder.predict(sample);
    let error = 0;
    for (let i = 0; i < sample.length; i++) {
      const diff = sample[i] - reconstructed[i];
      error += diff * diff;
    }
    error /= sample.length;
    reconstructionErrors.push(error);
  }

  // Calculate threshold (95th percentile of training errors)
  const sortedErrors = [...reconstructionErrors].sort((a, b) => a - b);
  const percentileIndex = Math.floor(sortedErrors.length * 0.95);
  const threshold = Math.max(
    sortedErrors[percentileIndex] || AUTH_CONFIG.AUTOENCODER_THRESHOLD,
    AUTH_CONFIG.AUTOENCODER_THRESHOLD
  );

  const meanError = reconstructionErrors.reduce((a, b) => a + b, 0) / reconstructionErrors.length;
  const maxError = Math.max(...reconstructionErrors);

  console.log(`Training complete. Threshold: ${threshold.toFixed(6)}, Mean Error: ${meanError.toFixed(6)}`);

  return {
    modelType: "autoencoder",
    autoencoder: autoencoder.serialize(),
    normalizationParams: { min, max },
    threshold,
    trainingStats: {
      sampleCount: samples.length,
      augmentedSampleCount: augmentedSamples.length,
      meanError,
      maxError,
      losses: losses.slice(-10), // Keep last 10 loss values
    },
    createdAt: new Date().toISOString(),
    version: "1.0"
  };
}

/**
 * Authentication function that compares new features against trained model
 * Ported from Ghost Key project authenticate route
 */
function authenticateWithModel(features, modelData) {
  if (modelData.modelType !== "autoencoder" || !modelData.autoencoder) {
    throw new Error("Invalid model data for autoencoder authentication");
  }

  console.log("Using autoencoder authentication");

  // Normalize the input features using saved parameters
  const { min, max } = modelData.normalizationParams;
  const normalizedFeatures = features.map((value, i) => {
    if (i >= min.length || i >= max.length) {
      return 0; // Pad with zeros if features array is longer than training data
    }
    const range = max[i] - min[i];
    return range === 0 ? 0 : (value - min[i]) / range;
  });

  // Load the autoencoder
  const autoencoder = SimpleAutoencoder.deserialize(modelData.autoencoder);

  // Get reconstruction
  const reconstructed = autoencoder.predict(normalizedFeatures);

  // Calculate reconstruction error (MSE)
  let reconstructionError = 0;
  for (let i = 0; i < normalizedFeatures.length; i++) {
    const diff = normalizedFeatures[i] - reconstructed[i];
    reconstructionError += diff * diff;
  }
  reconstructionError /= normalizedFeatures.length;

  // Check against threshold
  const threshold = modelData.threshold;
  const success = reconstructionError <= threshold;

  // Calculate confidence score
  const maxError = modelData.trainingStats?.maxError || threshold * 2;
  const confidence = Math.max(0, Math.min(1, 1 - reconstructionError / (maxError * 2)));

  // Create deviations for heatmap (use normalized features)
  const deviations = normalizedFeatures.slice(0, 10).map((val) => Math.min(Math.abs(val), 1));

  console.log(`Autoencoder authentication result:`, {
    reconstructionError: reconstructionError.toFixed(6),
    threshold: threshold.toFixed(6),
    authenticated: success,
    confidence: confidence.toFixed(3),
  });

  return {
    success,
    authenticated: success,
    reconstructionError,
    threshold,
    confidence,
    deviations,
    modelType: "autoencoder"
  };
}

// Export functions and classes
export {
  SimpleAutoencoder,
  normalizeFeatures,
  addNoise,
  trainKeystrokeModel,
  authenticateWithModel,
  AUTH_CONFIG
}; 