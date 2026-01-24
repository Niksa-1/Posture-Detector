# Posture Optimization App for Sitting Position - Nikša Kuzmanić, Marin Boban
**Project:** Posture Optimization App for Sitting Position
**Team:** Nikša Kuzmanić, Marin Boban
**Status:** MVP + Breaks/Stats PWA

## 🎯 Project Overview

Using MoveNet pose detection via TensorFlow.js, the app tracks a user's sitting posture in real-time and provides visual and auditory alerts when slouching is detected. The system uses intelligent calibration based on the user's own posture range.

## 👥 Team Information

- **Nikša Kuzmanić** - GitHub: [@Niksa-1](https://github.com/Niksa-1)
- **Marin Boban** - GitHub: [@ma31n](https://github.com/ma31n)
- **Team Name**: BobanKuzmanic

## ✨ Key Features

- **MoveNet Pose Detection**: Real-time upper-body keypoint tracking (nose, shoulders, elbows, eyes, ears)
- **Adaptive Calibration**: Two-step calibration capturing upright and relaxed posture positions
- **Dynamic Thresholds**: Automatically calculates posture threshold from user's own posture range (40% of difference)
- **Distance Normalization**: Maintains consistent sensitivity regardless of distance from camera
- **Visual Timer**: Animated progress bar showing time until alert (15 seconds of continuous slouching)
- **Break System**: Auto-break suggestions every 10 minutes based on alert rate; app pauses tracking during breaks and shows reason/duration
- **Session Stats**: Local (per-day) tracking of posture time, streaks, alerts, and next-break countdown
- **Zero Privacy Risk**: All processing happens locally in the browser - no cloud uploads

## 🛠 Technologies Used

- **JavaScript (ES6+)** - Core application logic
- **HTML5 / CSS3** - UI and styling with Bootstrap 5
- **TensorFlow.js** - ML framework for pose detection
- **MoveNet SinglePose Lightning** - Lightweight pose estimation model
- **localStorage** - Daily posture stats
- **Web APIs**: getUserMedia for webcam access, Canvas for rendering
- **Service Worker** - Progressive Web App support

## 🚀 Getting Started

1. Open `index.html` in a modern web browser
2. Grant camera permissions when prompted
3. Click "Start Face Tracking"
4. **Calibration Step 1**: Sit in your best upright posture and click "Confirm Upright Position"
5. **Calibration Step 2**: Slouch into your typical relaxed posture and click "Confirm Relaxed Position"
6. The system will automatically calculate your personalized threshold
7. Maintain good posture - after 15 continuous seconds of slouching, you'll receive an alert
8. Feel free to minimize window; background timers keep stats and break reminders running (PWA-enabled with auto-updates)

## 📊 How It Works

### Pose Detection
- MoveNet tracks 17 body keypoints in real-time
- System focuses on nose and shoulders for posture analysis
- Confidence scores filter out unreliable detections

### Calibration
- **Upright**: Records your best posture (nose-to-shoulder offset)
- **Relaxed**: Records your typical slouched posture (nose-to-shoulder offset)
- **Threshold**: Automatically set to 40% of the difference between these positions

### Distance Compensation
- Shoulder span used as proxy for user distance from camera
- All measurements normalized to calibration distance
- Ensures alerts trigger at the same slouching angle regardless of camera distance

### Alert Timing & Breaks
- Timer only starts when bad posture is continuously detected
- If user sits up straight, timer resets to zero
- Alert triggers after 15 consecutive seconds of slouching
- Visual progress bar provides real-time feedback
- Break checkpoint every 10 minutes; break length scales with recent alert rate (reason shown in modal)
- Tracking is paused during breaks; next-break countdown is always visible

## 📈 Project Progress

- ✅ Core pose detection with MoveNet
- ✅ Two-step smart calibration
- ✅ Distance-aware threshold normalization
- ✅ Visual timer with progress bar
- ✅ Audio alerts
- ✅ Break system with auto-pause and reasoned duration
- ✅ Daily posture stats (localStorage) with next-break countdown
- ✅ Responsive UI
- ⏳ Session history/analytics (future)
- ⏳ User profiles and login (partial - see login.html)

## 🐛 Known Limitations

- Single pose detection (one user at a time)
- Requires adequate lighting for pose estimation
- Wrist/hand positions excluded from visualization for clarity
- Desktop/laptop only (mobile camera angles not optimal for posture detection)

## 📝 Architecture

```
index.html          - Main UI
index.js            - Pose detection, posture logic, break checkpoints
stats.js            - Stats storage (localStorage) and checkpoint window
statsUI.js          - Stats UI, break modal, timers
styles.css          - Application styling
sw.js               - Service worker (cache + auto-update on version bump)
login.html/js       - Authentication UI (future integration)
```

## 🔄 Development Workflow

The application uses a frame-based processing loop (20 FPS) that:
1. Captures video frames
2. Runs pose detection
3. Analyzes nose-shoulder offset
4. Updates visual feedback
5. Triggers alerts when threshold exceeded

## 📄 License & Credits

Project created as part of university coursework.
Uses TensorFlow.js and MoveNet under Apache 2.0 license.
