# Ghost Key Mobile (Android via Capacitor) – Keystroke + Voice Biometrics

A production-ready Android application wrapping the Ghost Key Next.js biometric platform using Capacitor. It runs keystroke dynamics (autoencoder) and voice biometrics (Meyda MFCC + Web Audio API) fully on-device, with local storage, audit logs, and admin visualizations adapted for mobile.

## 🔒 Overview

Ghost Key Mobile provides **local biometric authentication** using:
- **Keystroke Dynamics**: Analyzes typing patterns and rhythm with the original autoencoder pipeline
- **Voice Biometrics**: Optional voice verification (Meyda MFCC + spectral features)
- **On-Device Processing**: All ML and feature extraction runs locally inside the Android WebView
- **Local Storage**: Models, profiles, and logs stored in app sandbox (IndexedDB via WebView)

## ✨ Features

### 🎯 Mobile-First Delivery
- Distributed as an **Android APK** using Capacitor
- Responsive UI for phones and tablets
- Dark/Light themes with mobile haptics and animations

### 🔐 Biometric Security
- **Keystroke Dynamics**: Dwell, flight, dd/ud timings, speed, error-rate, pressure
- **Voice Authentication**: MFCC, spectral, temporal, robust similarity
- **Autoencoder Training**: Same NN pipeline as the web app (TensorFlow.js-compatible logic)
- **Threshold-based Verification**: Configurable security levels

### 🛡️ Privacy-First Design
- **100% On-Device**: No cloud services
- **Integrity Protection**: HMAC signing for tamper detection
- **Controlled Retention**: Privacy mode to avoid raw vector storage
- **Data Rights**: Clear/export data per GDPR/CCPA flows

### ⚙️ Smart Enrollment
- **Guided Enrollment**: Keystroke and voice onboarding flows
- **Progressive Training**: Requires multiple samples for robust models
- **Data Augmentation**: Noise injection for better generalization
- **Validation**: Feature integrity checks before storage

## 🚀 Android Build & Install

You can build without Android Studio using GitHub Actions or local CLI.

### Method 1: GitHub Actions (no Android Studio)

1. Push the repository to GitHub
2. In GitHub → Actions → “Build Android APK” → Run workflow
3. Download artifact `app-release-apk` → contains `app-release.apk`
4. Install on device:
   - Transfer and open the APK on your phone, or
   - `adb install -r app-release.apk`

### Method 2: Local CLI (Java 17 + Android SDK)

```bash
# From repo root
npm ci
npm run export
npm run cap:sync
cd android
./gradlew assembleRelease

# Install on device (USB debugging enabled)
adb install -r app/build/outputs/apk/release/app-release.apk
```

Permissions required (auto-included):
- `RECORD_AUDIO`, `INTERNET`, `MODIFY_AUDIO_SETTINGS`

## 📖 How It Works (Mobile)

### 1. Keystroke Capture
- Captures keydown/keyup timings from the in-app inputs
- Calculates hold (dwell), dd (down-down), ud (up-down) timings
- Derives typing speed, flight time, error rate, pressure

### 2. Neural Processing
- Autoencoder model trains on-device (TensorFlow.js-compatible logic)
- Threshold selected from training errors (percentile-based)

### 3. Voice Features
- Web Audio API + Meyda for MFCC/spectral/temporal features
- Robust similarity score; threshold configurable

### 4. Voice Verification (Optional)
- 3–5 second passphrase recording
- Displays a live waveform visualizer while recording
- Haptics on success/failure

## 🎮 Usage

### First Time Setup

1. Open the app and go to the authentication screen
2. Register a username and passphrase; type the passphrase multiple times to train
3. Complete voice enrollment (optional) with the guided flow

### Daily Use

1. Enter your username and passphrase in the app
2. The model authenticates keystroke dynamics locally (<200ms typical)
3. Voice verification prompts automatically after multiple failures

### Managing the App

- **Admin Panel**: User list, data controls (delete/export), thresholds
- **Audit Dashboard**: Success/failure logs, anomaly heatmaps, charts
- **Privacy Controls**: Enable privacy mode to avoid raw vector storage

## ⚙️ Configuration

### Default Settings

```javascript
{
  // Keystroke Settings
  PASSWORD_LENGTH: 8,
  SAMPLES_REQUIRED: 5,
  AUTOENCODER_THRESHOLD: 0.03,
  NOISE_LEVEL: 0.1,
  AUGMENTATION_FACTOR: 3,

  // Voice Settings  
  VOICE_SIMILARITY_THRESHOLD: 0.75,
  VOICE_SAMPLE_DURATION: 3000, // 3 seconds
  VOICE_FEATURES_COUNT: 13,

  // Security
  VOICE_MFA_ENABLED: true,
  PRIVACY_MODE: false
}
```

### Adjusting Sensitivity

**More Strict** (Lower False Accept Rate):
- Decrease `AUTOENCODER_THRESHOLD` to 0.01-0.02
- Increase `VOICE_SIMILARITY_THRESHOLD` to 0.8-0.9

**More Lenient** (Lower False Reject Rate):
- Increase `AUTOENCODER_THRESHOLD` to 0.05-0.1  
- Decrease `VOICE_SIMILARITY_THRESHOLD` to 0.6-0.7

## 🔧 Technical Architecture

### File Structure
```
ghost_key/
├── app/                  # Next.js app (UI, admin, dashboards)
├── components/           # UI components (keystroke capture, voice modal, etc.)
├── hooks/                # use-keystroke-analyzer, use-voice-auth
├── lib/                  # runtime-api adapter (local vs /api routing)
├── libs/                 # autoencoder.js and storage.js (IndexedDB)
├── utils/                # voice-feature-extractor (Meyda + Web Audio API)
├── capacitor.config.ts   # Capacitor config (webDir=out)
├── android/              # Generated by `npx cap sync android`
└── .github/workflows/    # android-release.yml (CI APK build)
```

### Data Flow

1. **Keystroke Capture**: in-app inputs → feature extraction
2. **Autoencoder**: on-device NN training and thresholding
3. **Voice Pipeline**: Meyda MFCC/spectral features + robust similarity
4. **Runtime Adapter**: Uses local implementations on Android, `/api/*` on web
5. **Storage Layer**: IndexedDB (HMAC integrity), app sandbox storage

### Storage Architecture

- **IndexedDB (WebView)**: Models, voice profiles, training samples
- **HMAC Verification**: Prevents tampering
- **Privacy Mode**: Avoids raw vector storage when enabled

## 🛡️ Security Considerations

### Threat Model Protection
- ✅ **Replay Attacks**: Temporal variance in keystroke patterns
- ✅ **Data Tampering**: HMAC signatures on stored biometric data
- ✅ **Privacy**: No raw passwords/audio stored; privacy mode available
- ✅ **On-Device**: No network dependency for auth decisions

### Limitations
- ⚠️ **Physical Access**: Device owner can clear app data
- ⚠️ **Typing Injuries**: May affect keystroke patterns
- ⚠️ **Background Noise**: Impacts voice features

## 🎯 Performance

### Resource Usage
- **Latency**: Auth < 200ms typical on mid-range devices
- **Training**: Seconds depending on sample count
- **Storage**: ~50–200KB per user model (keystroke) + voice profile
- **Network**: None for on-device flows

### Compatibility
- **Android**: API 24+ (WebView with getUserMedia)
- **Permissions**: RECORD_AUDIO, INTERNET
- **Dark/Light**: Supported
- **Haptics**: Via Capacitor Haptics

## 🐛 Troubleshooting

### Common Issues

**App Not Installing**
- Enable “Install unknown apps” or use `adb install -r`
- Ensure Android 7.0+ and USB debugging for ADB install

**Authentication Failing**
- Be consistent with the passphrase typing
- Adjust thresholds if overly strict/lenient
- Re-enroll after significant changes

**Voice Issues**
- Grant microphone permission on first launch
- Record in a quiet environment

**Waveform Not Visible**
- Ensure recording is active; the canvas renders only when recording

### Debug Mode
Use browser devtools on the device/emulator to see:
- Keystroke timing data
- Feature extraction results
- Authentication decisions
- Storage operations

## 📊 Analytics & Monitoring

The app tracks (locally only):
- Authentication success/failure rates
- Feature extraction quality metrics
- Storage usage statistics
- Performance timing data

Access via the in-app Admin/Audit dashboards.

## 🤝 Contributing

### Development Setup
1. Clone repository
2. Load as unpacked extension
3. Make changes and reload extension
4. Test on various websites

### Code Style
- ES6+ JavaScript/TypeScript
- Comprehensive error handling
- Privacy-first design principles
- Accessibility compliance

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Ghost Key Project**: Original Next.js implementation
- **Meyda Library**: Audio feature extraction
- **Capacitor**: Android packaging
- **Biometric Research Community**: Keystroke dynamics algorithms

## 📞 Support

For issues, questions, or feature requests:
1. Check existing GitHub issues
2. Review troubleshooting guide above
3. Create new issue with detailed description
4. Include browser version and error logs

---

**⚠️ Important**: This is a security-focused mobile app. Always review code before installation and use only on trusted devices. Biometric authentication supplements but doesn't replace strong passwords.