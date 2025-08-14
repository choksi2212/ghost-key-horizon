# Ghost Key Universal - Chrome Extension

A powerful biometric authentication extension that brings keystroke dynamics and voice biometrics to any website with login forms. Built as a standalone Chrome extension (Manifest V3) ported from the Ghost Key Next.js project.

## 🔒 Overview

Ghost Key Universal provides **local biometric authentication** for web forms using:
- **Keystroke Dynamics**: Analyzes your typing patterns and rhythm
- **Voice Biometrics**: Optional voice verification as multi-factor authentication  
- **Neural Network Processing**: Uses autoencoder for pattern recognition
- **Local Storage Only**: No data sent to servers - everything stays on your device

## ✨ Features

### 🎯 Universal Compatibility
- Works on **any website** with password fields
- Automatic form detection and monitoring
- Support for dynamic content and SPAs
- Shadow DOM compatibility (where possible)

### 🔐 Biometric Security
- **Keystroke Dynamics**: Measures typing speed, dwell time, flight time, and pressure patterns
- **Voice Authentication**: MFCC feature extraction with similarity scoring
- **Autoencoder Training**: Neural network learns your unique patterns
- **Threshold-based Verification**: Configurable security levels

### 🛡️ Privacy-First Design
- **100% Local Processing**: No cloud services or external servers
- **Encrypted Storage**: HMAC signing for tamper detection
- **No Raw Data Storage**: Only processed biometric templates stored
- **User Control**: Clear all data anytime

### ⚙️ Smart Enrollment
- **Automatic Detection**: Prompts enrollment for new users
- **Progressive Training**: Requires 5 samples for robust models
- **Data Augmentation**: Noise injection for better generalization
- **Validation**: Feature integrity checks before storage

## 🚀 Installation

### Method 1: Load as Unpacked Extension (Developer Mode)

1. **Download/Clone** this repository
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer Mode** (toggle in top-right)
4. **Click "Load unpacked"** and select the extension folder
5. **Pin the extension** to your toolbar for easy access

### Method 2: Build and Install

```bash
# Clone the repository
git clone <repository-url>
cd ghost-key-universal

# The extension is ready to load - no build step required
# Just load the folder as an unpacked extension
```

## 📖 How It Works

### 1. Form Detection
- Automatically scans pages for password fields
- Uses multiple selectors to find login/registration forms
- Monitors for dynamically added forms via MutationObserver

### 2. Keystroke Capture
- Records timing between keydown/keyup events
- Calculates hold times, dwell times, and flight times
- Extracts statistical features (typing speed, rhythm, pressure)

### 3. Biometric Processing
- **Training**: Uses autoencoder neural network to learn patterns
- **Authentication**: Compares new samples against stored model
- **Threshold**: Configurable sensitivity (default: 0.03 reconstruction error)

### 4. Voice Verification (Optional)
- Records 3-5 second voice samples
- Extracts MFCC and spectral features using Meyda library
- Compares against stored voice profile using cosine similarity

## 🎮 Usage

### First Time Setup

1. **Navigate** to any website with a login form
2. **Enter credentials** - Ghost Key will detect the password field
3. **Choose enrollment** when prompted for new users
4. **Type password 5 times** to train your biometric model
5. **Voice enrollment** (optional) for additional security

### Daily Use

1. **Type your password** normally on any enrolled site
2. **Ghost Key analyzes** your keystroke pattern automatically
3. **Authentication happens** before form submission
4. **Voice verification** prompts if keystroke fails (if enabled)

### Managing the Extension

#### Popup Interface
- **Toggle per-site** enabling/disabling
- **View enrolled users** count
- **Quick actions** for enrollment and data clearing
- **Security status** showing active features

#### Settings (Options Page)
- **Global settings**: Thresholds, sample requirements
- **Privacy controls**: Data retention policies
- **Advanced options**: Debug mode, feature toggles

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
ghost-key-universal/
├── manifest.json           # Extension manifest (V3)
├── background.js           # Service worker (authentication logic)
├── content.js             # Content script (form detection)
├── popup.html/js          # Extension popup interface
├── options.html/js        # Settings page
├── libs/
│   ├── storage.js         # IndexedDB + chrome.storage wrapper
│   ├── autoencoder.js     # Neural network implementation
│   ├── keystroke.js       # Keystroke analysis
│   └── voice.js           # Voice biometrics (uses Meyda)
└── styles/
    ├── modal.css          # Modal and notification styles
    └── popup.css          # Popup interface styles
```

### Data Flow

1. **Content Script** detects forms and captures keystrokes
2. **Background Script** processes features and runs authentication
3. **Storage Layer** manages models in IndexedDB with HMAC signing
4. **UI Components** provide user controls and feedback

### Storage Architecture

- **Chrome Storage**: Small settings and preferences
- **IndexedDB**: Large model data and training samples
- **HMAC Verification**: Prevents tampering with stored biometric data
- **Per-Origin Isolation**: Data scoped to website domains

## 🛡️ Security Considerations

### Threat Model Protection
- ✅ **Replay Attacks**: Temporal variance in keystroke patterns
- ✅ **Data Tampering**: HMAC signatures on all stored data  
- ✅ **Privacy Invasion**: No raw passwords or audio stored
- ✅ **Cross-Site Data**: Origin-based data isolation

### Limitations
- ⚠️ **Physical Access**: Extension data accessible to device owner
- ⚠️ **Shared Computers**: Not suitable for public/shared machines
- ⚠️ **Typing Injuries**: May affect authentication accuracy
- ⚠️ **Background Noise**: Can impact voice authentication

## 🎯 Performance

### Resource Usage
- **Memory**: ~2-5MB per active tab with forms
- **CPU**: Minimal impact (training ~1-2s, auth ~100ms)
- **Storage**: ~50KB per user model, ~10KB per voice profile
- **Network**: Zero - completely offline processing

### Compatibility
- **Chrome**: 88+ (Manifest V3 support)
- **Edge**: 88+ (Chromium-based)
- **Websites**: Universal (any site with password fields)
- **Forms**: Standard HTML inputs, most JavaScript frameworks

## 🐛 Troubleshooting

### Common Issues

**Extension Not Working**
- Check if enabled in `chrome://extensions/`
- Verify permissions are granted
- Check browser console for errors

**Authentication Failing**
- Ensure consistent typing patterns
- Check threshold settings in options
- Re-enroll if typing style has changed significantly

**Voice Issues**
- Grant microphone permissions
- Check browser microphone access
- Ensure quiet environment for enrollment

**Form Not Detected**
- Check if password field is visible and enabled
- Try refreshing the page
- Report non-standard form implementations

### Debug Mode
Enable in extension options for detailed console logging:
- Keystroke timing data
- Feature extraction results  
- Authentication decisions
- Storage operations

## 📊 Analytics & Monitoring

The extension tracks (locally only):
- Authentication success/failure rates
- Feature extraction quality metrics
- Storage usage statistics
- Performance timing data

Access via popup → Statistics button.

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
- **Chrome Extensions Team**: Manifest V3 architecture
- **Biometric Research Community**: Keystroke dynamics algorithms

## 📞 Support

For issues, questions, or feature requests:
1. Check existing GitHub issues
2. Review troubleshooting guide above
3. Create new issue with detailed description
4. Include browser version and error logs

---

**⚠️ Important**: This is a security-focused extension. Always review code before installation and use only on trusted devices. Biometric authentication supplements but doesn't replace strong passwords.