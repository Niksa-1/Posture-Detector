# 📄 PROJECT SPECIFICATIONS

## 1. Project Overview

**Project Name & Working Title:**  
Posture Optimization App for Sitting Position  

**Version / Date:**  
v1.0.0 MVP – 2025-01-18  

**High-Level Goal:**  
The app tracks a user's sitting posture using MoveNet pose detection and provides real-time alerts when posture deviates from the user's calibrated baseline. It is designed for office workers, students, and remote employees who spend long hours sitting.  

**Core Value Proposition:**  
By providing instant feedback on posture, the app helps prevent discomfort, back pain, and long-term musculoskeletal problems. Users can adjust their sitting position immediately. The system adapts to each user's unique body and posture habits through intelligent calibration.

---

## 2. Scope & Requirements

### 2.1 Goals (In-Scope)  
- ✅ Real-time posture detection via MoveNet pose estimation  
- ✅ Adaptive calibration based on user's own posture range (upright + relaxed)
- ✅ Intelligent threshold calculation (40% of user's posture range)
- ✅ Distance-aware threshold normalization for camera distance changes
- ✅ Visual and auditory alerts after 15 seconds of continuous slouching
- ✅ Animated progress bar showing time until alert
- ✅ Responsive web UI
- ✅ Local-only processing for complete privacy
- ⏳ User profiles with saved calibrations (partial - login UI ready)
- ⏳ Session history and analytics

### 2.2 Non-Goals (Out-of-Scope)   
- Real-time multi-person tracking (single user focus)
- Mobile app native versions
- Cloud-based data storage
- Advanced ML coaching beyond slouching detection
- External integrations in MVP

### 2.3 User Personas / Scenarios  
**Persona:** Remote office worker, 28 years old, spends ~8 hours/day at a desk.  
**Scenario:** 
1. Alice opens the app and grants camera permission
2. System performs two-step calibration (upright + relaxed positions)
3. App learns Alice's personal posture range and calculates her threshold
4. Throughout the day, if Alice slouches for more than 15 seconds continuously, a visual timer and beep alert her
5. Alice adjusts posture, timer resets
6. App tracks her compliance

---

## 3. Technical Architecture

### 3.1 Tech Stack & Rationale  
- **Language/Runtime:** JavaScript (Browser-based, ES6+)
- **Frameworks / Libraries:** 
  - TensorFlow.js v4.x - ML runtime
  - MoveNet SinglePose Lightning - Pose detection model
  - Bootstrap 5 - UI framework
- **Storage:** IndexedDB (session data), localStorage (settings)
- **APIs:** getUserMedia (webcam), Canvas 2D (rendering)
- **Rationale:**  
  - JavaScript for cross-platform accessibility without installation
  - TensorFlow.js enables on-device ML without server dependencies
  - MoveNet provides fast, accurate upper-body tracking (~100ms per frame)
  - Local processing ensures complete privacy - no data leaves the user's device
  - Browser-based PWA for offline capability

### 3.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User's Web Browser                        │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Webcam Input (getUserMedia API)                     │   │
│  └───────────────────┬──────────────────────────────────┘   │
│                      │ (20 FPS)                               │
│  ┌───────────────────▼──────────────────────────────────┐   │
│  │  MoveNet Pose Detection (TensorFlow.js)             │   │
│  │  - Detects 17 body keypoints                        │   │
│  │  - Returns: x, y, confidence for each keypoint      │   │
│  └───────────────────┬──────────────────────────────────┘   │
│                      │                                        │
│  ┌───────────────────▼──────────────────────────────────┐   │
│  │  Posture Analysis Engine                             │   │
│  │  - Extract nose & shoulder positions                 │   │
│  │  - Calculate nose-shoulder vertical offset           │   │
│  │  - Normalize by distance (shoulder span ratio)       │   │
│  │  - Compare to calibration baseline                   │   │
│  └───────────────────┬──────────────────────────────────┘   │
│                      │                                        │
│  ┌────────┬──────────▼──────────────┬─────────────────┐   │
│  │        │                         │                 │    │
│  │ ┌──────▼────┐  ┌────────────────▼──┐   ┌─────────▼──┐│  │
│  │ │ Calibration│  │ Alert Logic       │   │ Canvas UI  ││  │
│  │ │ System     │  │ (15-sec timer)    │   │ Rendering  ││  │
│  │ │ - Upright  │  │ - Bad posture     │   │ - Skeleton ││  │
│  │ │ - Relaxed  │  │   detection       │   │ - Keypts   ││  │
│  │ │ - Threshold│  │ - Progress bar    │   │ - Status   ││  │
│  │ │   calc     │  │ - Audio alert     │   │            ││  │
│  │ └────────────┘  └───────────────────┘   └────────────┘│  │
│  │                                                         │  │
│  │  LocalStorage: Calibration data, Settings              │  │
│  │  IndexedDB: Session history (future)                   │  │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Key Components

#### Pose Detection Module
- Uses TensorFlow.js to load and run MoveNet model
- Processes 640x480 video frames
- Returns keypoints: `{name, x, y, score}` for 17 joints
- Scores > 0.3 considered reliable

#### Calibration System
**Two-Step Process:**
1. **Upright Position** (Step 1)
   - User sits in best posture
   - System records: nose Y, shoulder Y, shoulder span
   - Calculates: `calibratedOffset = shoulderY - noseY`

2. **Relaxed Position** (Step 2)
   - User sits in typical slouched position
   - System records: `relaxedOffset = shoulderY - noseY`
   - Calculates: `threshold = 0.4 × (relaxedOffset - calibratedOffset)`

#### Distance Normalization
- **Problem**: Same slouch angle looks different at different distances
- **Solution**: Use shoulder span as distance proxy
  ```javascript
  distanceScale = currentShoulderSpan / calibratedShoulderSpan
  normalizedOffset = currentOffset / distanceScale
  ```
- Ensures threshold applies consistently regardless of camera distance

#### Posture Detection Logic
```javascript
// Frame processing
currentOffset = shoulderY - noseY
normalizedOffset = currentOffset / distanceScale

// Check if slouching
offsetChange = normalizedOffset - calibratedOffset
if (offsetChange > postureThreshold) {
  badPostureDetected = true
}

// Alert timing
if (badPostureDetected) {
  if (badPostureStartTime === null) {
    badPostureStartTime = Date.now()
  }
  elapsed = Date.now() - badPostureStartTime
  if (elapsed >= 15000) {
    triggerAlert()
  }
} else {
  badPostureStartTime = null  // Reset timer
}
```

#### Alert System
- **Visual**: Bootstrap alert with emoji, progress bar with percentage
- **Auditory**: warning.mp3 plays on trigger
- **Timing**: Minimum 15 continuous seconds of slouching
- **Reset**: Immediate upon good posture restoration

### 3.4 Project Directory Structure

```
Posture-Detector/
├── index.html              # Main application UI
├── index.js                # Core posture detection logic
├── styles.css              # Application styling
├── login.html              # Authentication UI (future)
├── login.js                # Login logic (future)
├── login-styles.css        # Login styling
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── warning.mp3             # Alert sound
├── README.md               # Project documentation
├── SPECIFICATION.md        # This file
└── openCV/                 # Icons for PWA
    └── icons/
        └── icon-192.svg
```

---

## 4. Data Design

### Core State Variables

```javascript
// Calibration Data
calibratedNoseShoulderOffset  // Best posture (upright) baseline
relaxedNoseShoulderOffset     // Slouched posture for range calculation
calibratedShoulderSpan        // Distance reference (shoulder width)
postureThreshold              // Calculated from posture range

// Runtime Tracking
badPostureStartTime           // When slouching started (ms timestamp)
isCalibrated                  // Boolean flag
isTracking                    // Boolean flag
calibrationStage              // 0=none, 1=upright, 2=relaxed
```

### Pose Data Structure (from MoveNet)

```javascript
pose = {
  keypoints: [
    {name: 'nose', x: 320, y: 240, score: 0.95},
    {name: 'left_eye', x: 305, y: 230, score: 0.92},
    {name: 'right_eye', x: 335, y: 230, score: 0.93},
    {name: 'left_ear', x: 280, y: 220, score: 0.89},
    {name: 'right_ear', x: 360, y: 220, score: 0.88},
    {name: 'left_shoulder', x: 200, y: 400, score: 0.98},
    {name: 'right_shoulder', x: 440, y: 400, score: 0.97},
    // ... 10 more keypoints (elbows, wrists, hips, knees, ankles)
  ]
}
```

---

## 5. Processing Flow

### Frame Processing Loop (20 FPS target)

```
START
  ├─ Capture video frame
  ├─ Run MoveNet pose detection
  ├─ Extract keypoints (nose, shoulders)
  ├─ Filter by confidence score (> 0.3)
  │
  ├─ IF calibrating:
  │  └─ Wait for user confirmation, store calibration data
  │
  ├─ ELSE IF calibrated:
  │  ├─ Calculate nose-shoulder offset
  │  ├─ Normalize by distance (shoulder span ratio)
  │  ├─ Compare to threshold
  │  │
  │  ├─ IF bad posture detected:
  │  │  ├─ Start/increment timer
  │  │  ├─ Update progress bar
  │  │  └─ IF 15 seconds elapsed: trigger alert
  │  │
  │  └─ ELSE: reset timer
  │
  ├─ Render canvas visualization
  ├─ Draw skeleton and keypoints
  ├─ Schedule next frame (in 50ms)
  └─ REPEAT
```

---

## 6. Testing Strategy

### Unit Tests (Future)
- Offset calculation accuracy
- Distance normalization
- Threshold computation
- Timer logic

### Integration Tests (Future)
- Calibration workflow
- Alert triggering
- UI responsiveness

### Manual Testing (Current)
- ✅ Calibration with different body types
- ✅ Distance sensitivity (calibrate at 1m, test at 0.5m and 1.5m)
- ✅ Alert timing (verify 15-second threshold)
- ✅ Timer reset on good posture
- ✅ Lighting conditions (bright, dim, varied)

---

## 7. Deployment & Rollout

### Current Status: MVP Ready
- ✅ Core detection working
- ✅ Calibration system functional
- ✅ Distance compensation implemented
- ✅ Visual feedback complete

### Deployment Options
1. **Static hosting** (GitHub Pages, Netlify, Vercel)
2. **PWA support** for offline use (via sw.js)
3. **No server required** - all processing client-side

### Browser Support
- Chrome/Chromium 83+
- Firefox 77+
- Safari 14.1+
- Edge 83+
- Requires: WebGL, Canvas 2D, getUserMedia API

---

## 8. Performance Metrics

- **Pose Detection**: ~50-100ms per frame (MoveNet Lightning)
- **Processing**: ~10-20ms (offset calculation, threshold check)
- **Total Frame Time**: ~60-120ms (target 50ms @ 20 FPS)
- **Memory**: ~100-150MB (model + buffers)
- **Input Resolution**: 640×480 (optimized for speed)

---

## 9. Security & Privacy

- ✅ No data collection - all processing client-side
- ✅ No network requests for pose detection
- ✅ Webcam access only with explicit user permission
- ✅ No authentication server (login UI only for future enhancement)
- ⚠️ Users should position camera privately (not visible to others)

---

## 10. Future Enhancements

### Phase 2
- [ ] User authentication and cloud sync of calibrations
- [ ] Session analytics dashboard
- [ ] Daily/weekly posture reports
- [ ] Adjustable alert duration
- [ ] Multiple alert levels (warning → critical)
- [ ] Posture breakdown detection (forward lean, sideways tilt)

### Phase 3
- [ ] Multi-user support
- [ ] Mobile app (React Native)
- [ ] Wearable integration
- [ ] AI-powered posture coaching
- [ ] Integration with calendar (alert frequency based on meeting type)

### Phase 4
- [ ] Workplace deployment dashboard
- [ ] Team analytics
- [ ] Integration with health apps
- [ ] AR visualization of ideal posture

---

## 11. Known Issues & Limitations

- **Lighting**: Poor lighting reduces keypoint confidence
- **Clothing**: Tight/dark clothing may reduce shoulder detection
- **Angles**: Side-on camera angles not optimal
- **Multiple Users**: Only designed for single user
- **Occlusion**: If user hides shoulders (desk, blanket), detection fails

---

## 12. References

- [TensorFlow.js Documentation](https://js.tensorflow.org/)
- [MoveNet Paper](https://arxiv.org/abs/2102.08008)
- [Web APIs: getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Canvas 2D Context](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D)

---

**Last Updated:** 2025-01-18  
**Authors:** Nikša Kuzmanić, Marin Boban
