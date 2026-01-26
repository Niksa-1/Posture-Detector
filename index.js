// ============================================
// FACE DETECTION APPLICATION
// ============================================

// Configuration
const FPS = 20;
const FRAME_DELAY = 1000 / FPS;

// State
let detector = null;
let isTracking = false;
let isCalibrating = false;
let isCalibrated = false;
let calibrationStage = 0; // 0: not started, 1: upright, 2: relaxed
let timerId = null;
let lastFrameTime = 0;
let canvasScale = 1;
let calibratedShoulderY = null; // Average shoulder Y position during upright calibration
let calibratedShoulderSpan = null; // Distance between shoulders (for scale reference)
let calibratedNoseShoulderOffset = null; // Vertical offset between nose and shoulders when upright
let relaxedNoseShoulderOffset = null; // Vertical offset when relaxed/slouched
let postureThreshold = null; // Calculated threshold from upright-relaxed difference
let badPostureStartTime = null; // Timestamp when bad posture was first detected
const BAD_POSTURE_DURATION_MS = 15000; // 15 seconds in milliseconds
let goodPostureStartTime = null; // Timestamp when good posture was first detected
const GOOD_POSTURE_REQUIRED_MS = 1000; // 1 second of good posture required to reset timer
let isBreakPaused = false; // Pause tracking during break cooldown
let isOnBreak = false;
let breakEndTime = null;
let backgroundTimerId = null;
let isMuted = false;
let thresholdMultiplier = 0.4; // Multiplier applied to offset difference
let notificationPermissionRequested = false;

// DOM Elements Cache
const elements = {
    video: null,
    canvas: null,
    canvasCtx: null,
    startBtn: null,
    confirmCalibrationBtn: null,
    calibrationInstructions: null,
    spinner: null,
    postureAlert: null,
    beepSound: null,
    postureTimer: null,
    timerProgress: null,
    timerCountdown: null,
    thresholdSlider: null,
    thresholdValue: null
};

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize DOM elements on page load
 */
function cacheElements() {
    elements.video = document.getElementById('videoInput');
    elements.canvas = document.getElementById('canvasOutput');
    elements.canvasCtx = elements.canvas?.getContext('2d');
    elements.startBtn = document.getElementById('startBtn');
    elements.confirmCalibrationBtn = document.getElementById('confirmCalibrationBtn');
    elements.calibrationInstructions = document.getElementById('calibrationInstructions');
    elements.spinner = document.getElementById('spinner');
    elements.postureAlert = document.getElementById('postureAlert');
    elements.beepSound = document.getElementById('beepSound');
    elements.postureTimer = document.getElementById('postureTimer');
    elements.timerProgress = document.getElementById('timerProgress');
    elements.timerCountdown = document.getElementById('timerCountdown');
    elements.thresholdSlider = document.getElementById('thresholdSlider');
    elements.thresholdValue = document.getElementById('thresholdValue');
}

function setThresholdMultiplier(value) {
    const numeric = parseFloat(value);
    if (Number.isNaN(numeric)) return;
    thresholdMultiplier = Math.min(0.8, Math.max(0.4, numeric));
    if (elements.thresholdValue) {
        elements.thresholdValue.textContent = `${Math.round(thresholdMultiplier * 100)}%`;
    }
    if (elements.thresholdSlider) {
        elements.thresholdSlider.value = thresholdMultiplier;
    }
    recalculatePostureThreshold();
}

function recalculatePostureThreshold() {
    if (calibratedNoseShoulderOffset === null || relaxedNoseShoulderOffset === null) return;
    const diff = Math.abs(relaxedNoseShoulderOffset - calibratedNoseShoulderOffset);
    postureThreshold = Math.round(diff * thresholdMultiplier);
}

/**
 * Initialize MoveNet pose detector
 */
async function initializePoseDetector() {
    try {
        if (!poseDetection) {
            console.error('Pose detection library not loaded');
            return false;
        }

        const model = poseDetection.SupportedModels.MoveNet;
        const detectorConfig = {
            modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
        };

        detector = await poseDetection.createDetector(model, detectorConfig);
        console.log('✓ Pose detector initialized successfully');
        return true;
    } catch (err) {
        console.error('✗ Failed to initialize pose detector:', err);
        return false;
    }
}

/**
 * Called when TensorFlow is ready
 */
async function onTensorFlowReady() {
    console.log('TensorFlow.js is ready.');
    
    const initialized = await initializePoseDetector();
    if (initialized && elements.startBtn) {
        elements.startBtn.disabled = false;
    }
    // Initialize threshold display if slider exists
    if (elements.thresholdSlider) {
        setThresholdMultiplier(elements.thresholdSlider.value || thresholdMultiplier);
    }
}

// Generic notification helper - sends notification if permission granted and tab is hidden
function sendNotification(title, body, requireHidden = true) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    
    // Only send if tab is out of focus (unless requireHidden is false)
    if (requireHidden && !document.hidden) return;

    try {
        new Notification(title, {
            body: body,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%232b2b2b" width="192" height="192"/><text x="96" y="120" font-size="80" text-anchor="middle" fill="%2300FFFF">🪑</text></svg>',
            tag: 'posture-app-' + Date.now(),
            requireInteraction: false
        });
    } catch (err) {
        console.error('Failed to send notification:', err);
    }
}

// Specific notification helpers
function sendPostureNotification() {
    sendNotification('⚠️ Posture Alert!', 'Please correct your posture and sit upright.', true);
}

// Pause/resume helpers for break cooldown
function pauseTrackingForBreak() {
    isBreakPaused = true;
    // Prevent stats from accruing break time
    lastStatsUpdateTime = null;
}

function resumeTrackingAfterBreak() {
    isBreakPaused = false;
    // Reset timers so next frame starts fresh
    lastFrameTime = 0;
    lastStatsUpdateTime = Date.now();
}

function isMobileDevice() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    return /android|iphone|ipad|ipod|iemobile|mobile/i.test(ua);
}

// Break state setters/getters for statsUI
function setBreakState(state) {
    isOnBreak = state;
}

function setBreakEndTime(ts) {
    breakEndTime = ts;
}

function clearBreakEndTime() {
    breakEndTime = null;
}

function getBreakEndTime() {
    return breakEndTime;
}

function setBackgroundTimerId(id) {
    backgroundTimerId = id;
}

function getBackgroundTimerId() {
    return backgroundTimerId;
}

async function ensureNotificationPermission() {
    if (notificationPermissionRequested) return Notification.permission === 'granted';
    notificationPermissionRequested = true;
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
        const result = await Notification.requestPermission();
        return result === 'granted';
    } catch (err) {
        console.warn('Notification permission request failed:', err);
        return false;
    }
}

// Break checkpoint logic
function checkBreakCheckpoint() {
    if (!lastCheckpointTime) return null;
    const now = Date.now();
    const elapsed = now - lastCheckpointTime;

    if (elapsed >= CHECKPOINT_INTERVAL_MS) {
        const alertRate = tenMinAlertCount / CHECKPOINT_INTERVAL_MINUTES; // alerts per minute

        let breakDurationMin = 0;
        let reason = '';

        if (alertRate >= 1.0) {
            breakDurationMin = 10;
            reason = `High alert rate (~${alertRate.toFixed(2)}/min) over last ${CHECKPOINT_INTERVAL_MINUTES}m (${tenMinAlertCount} alerts).`;
        } else if (alertRate >= 0.5) {
            breakDurationMin = 5;
            reason = `Moderate alert rate (~${alertRate.toFixed(2)}/min) over last ${CHECKPOINT_INTERVAL_MINUTES}m (${tenMinAlertCount} alerts).`;
        } else if (alertRate >= 0) {
            breakDurationMin = 2;
            reason = `Low alert rate (~${alertRate.toFixed(2)}/min) over last ${CHECKPOINT_INTERVAL_MINUTES}m (${tenMinAlertCount} alerts).`;
        }

        console.log(`${CHECKPOINT_INTERVAL_MINUTES}-min checkpoint: ${tenMinAlertCount} alerts (${alertRate.toFixed(2)}/min), break=${breakDurationMin}m`);

        // Reset checkpoint
        lastCheckpointTime = now;
        tenMinAlertCount = 0;

        return breakDurationMin > 0 ? { durationMin: breakDurationMin, reason } : null;
    }
    return null;
}

function incrementTenMinAlertCount() {
    tenMinAlertCount++;
}

// (UI + timers moved to statsUI.js)

// ============================================
// CAMERA & VIDEO SETUP
// ============================================

/**
 * Request camera access and setup video stream
 */
async function setupVideoStream() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 }
        });

        if (!elements.video) return false;

        elements.video.srcObject = stream;
        return true;
    } catch (err) {
        console.error('Camera access denied:', err);
        return false;
    }
}

/**
 * Setup canvas dimensions to match video
 */
function setupCanvas() {
    if (!elements.video || !elements.canvas) return false;

    const maxWidth = 480;
    const videoWidth = elements.video.videoWidth || 640;
    const videoHeight = elements.video.videoHeight || 480;
    
    canvasScale = Math.min(1, maxWidth / videoWidth);
    
    elements.canvas.width = videoWidth * canvasScale;
    elements.canvas.height = videoHeight * canvasScale;
    elements.canvas.style.maxWidth = '100%';
    elements.canvas.style.height = 'auto';
    
    return true;
}

// ============================================
// FACE DETECTION & RENDERING
// ============================================

/**
 * Detect pose in the current video frame
 */
async function detectPose() {
    if (!detector || !elements.video) return [];
    try {
        return await detector.estimatePoses(elements.video);
    } catch (err) {
        console.error('Error detecting pose:', err);
        return [];
    }
}

/**
 * Draw pose skeleton on canvas
 */
function drawSkeleton(poses) {
    if (!elements.canvasCtx) return;

    const ctx = elements.canvasCtx;
    
    poses.forEach(pose => {
        if (!pose.keypoints) return;
        
        // Draw connections for upper body only (no hands/wrists)
        const connections = [
            ['left_shoulder', 'right_shoulder'],
            ['left_shoulder', 'nose'],
            ['right_shoulder', 'nose'],
            ['left_shoulder', 'left_ear'],
            ['right_shoulder', 'right_ear'],
            ['nose', 'left_eye'],
            ['nose', 'right_eye']
        ];
        
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;
        
        connections.forEach(([start, end]) => {
            const kpStart = pose.keypoints.find(kp => kp.name === start);
            const kpEnd = pose.keypoints.find(kp => kp.name === end);
            
            if (kpStart && kpEnd && kpStart.score > 0.3 && kpEnd.score > 0.3) {
                ctx.beginPath();
                ctx.moveTo(kpStart.x * canvasScale, kpStart.y * canvasScale);
                ctx.lineTo(kpEnd.x * canvasScale, kpEnd.y * canvasScale);
                ctx.stroke();
            }
        });
    });
}

/**
 * Draw pose keypoints on canvas
 */
function drawKeypoints(poses) {
    if (!elements.canvasCtx) return;

    const ctx = elements.canvasCtx;
    
    // Exclude hand-related keypoints
    const excludeKeypoints = ['left_wrist', 'right_wrist'];
    
    poses.forEach(pose => {
        if (pose.keypoints) {
            pose.keypoints.forEach(kp => {
                if (kp.score > 0.3 && !excludeKeypoints.includes(kp.name)) {
                    ctx.fillStyle = kp.score > 0.5 ? '#FF0000' : '#FFA500';
                    ctx.beginPath();
                    ctx.arc(kp.x * canvasScale, kp.y * canvasScale, 4, 0, 2 * Math.PI);
                    ctx.fill();
                }
            });
        }
    });
}


/**
 * Get current nose-shoulder offset with validation
 */
function getNoseShoulderOffset(pose) {
    const nose = pose.keypoints.find(kp => kp.name === 'nose');
    const leftShoulder = pose.keypoints.find(kp => kp.name === 'left_shoulder');
    const rightShoulder = pose.keypoints.find(kp => kp.name === 'right_shoulder');

    if (!nose || !leftShoulder || !rightShoulder || 
        nose.score < 0.3 || leftShoulder.score < 0.3 || rightShoulder.score < 0.3) {
        return null;
    }

    const shoulderAvgY = (leftShoulder.y + rightShoulder.y) / 2;
    return nose.y - shoulderAvgY;
}

/**
 * Check posture using nose-shoulder offset
 */
function checkPosture(poses) {
    if (!elements.postureAlert || !elements.beepSound || !calibratedNoseShoulderOffset || !postureThreshold) return;

    let badPostureDetected = false;
    let validPose = false;
    const now = Date.now();

    // If on break, skip posture processing but keep loop alive
    if (isOnBreak) {
        return;
    }

    // Increment time-based stats since last update
    if (dailyStats) {
        if (lastStatsUpdateTime === null) {
            lastStatsUpdateTime = now;
        } else {
            const delta = now - lastStatsUpdateTime;
            dailyStats.totalMs += delta; // Always increment overall tracking time when calibrated
            if (currentState === 'good') {
                dailyStats.goodMs += delta;
                // Update longest good streak live
                if (goodStreakStartTime) {
                    const currentGoodStreak = now - goodStreakStartTime;
                    if (currentGoodStreak > dailyStats.longestGoodStreakMs) {
                        dailyStats.longestGoodStreakMs = currentGoodStreak;
                    }
                }
            } else if (currentState === 'bad') {
                dailyStats.badMs += delta;
            }
            lastStatsUpdateTime = now;
            saveDailyStats();
            
            updateStatsUI();
            const breakInfo = checkBreakCheckpoint(); // Check for checkpoint break
            if (breakInfo) {
                showBreakModal(breakInfo);
            }
        }
    }

    if (poses.length > 0) {
        const pose = poses[0];
        const currentOffset = getNoseShoulderOffset(pose);
        
        if (currentOffset !== null) {
            validPose = true;
            // Normalize measurements by distance to make threshold consistent
            let normalizedOffset = currentOffset;
            let normalizedCalibratedOffset = calibratedNoseShoulderOffset;
            
            const leftShoulder = pose.keypoints.find(kp => kp.name === 'left_shoulder');
            const rightShoulder = pose.keypoints.find(kp => kp.name === 'right_shoulder');
            if (leftShoulder && rightShoulder && calibratedShoulderSpan) {
                const currentSpan = Math.abs(leftShoulder.x - rightShoulder.x);
                const distanceScale = currentSpan / calibratedShoulderSpan;
                // Normalize current offset to calibration distance
                normalizedOffset = currentOffset / distanceScale;
            }
            
            // Check if head dropped significantly relative to calibrated upright position
            const offsetChange = normalizedOffset - normalizedCalibratedOffset;
            if (offsetChange > postureThreshold) {
                badPostureDetected = true;
            }
        }
    } else {
        console.log('No poses detected in frame');
    }

    // Require 15 seconds of continuous bad posture before alerting
    // Handle posture state transitions for stats
    const newState = validPose ? (badPostureDetected ? 'bad' : 'good') : 'unknown';
    if (newState !== currentState) {
        // Leaving good state: finalize streak duration
        if (currentState === 'good' && goodStreakStartTime) {
            const streak = now - goodStreakStartTime;
            if (streak > dailyStats.longestGoodStreakMs) {
                dailyStats.longestGoodStreakMs = streak;
                saveDailyStats();
                updateStatsUI();
            }
            goodStreakStartTime = null;
        }
        // Entering good state: start streak
        if (newState === 'good') {
            goodStreakStartTime = now;
        }
        // Reset alert episode flag when leaving bad state
        if (currentState === 'bad' && newState !== 'bad') {
            alertIssuedForCurrentEpisode = false;
        }
        currentState = newState;
    }

    if (badPostureDetected) {
        // Reset good posture timer when bad posture is detected
        goodPostureStartTime = null;
        console.log('Bad posture detected');
        
        if (badPostureStartTime === null) {
            badPostureStartTime = Date.now();
            console.log('Bad posture detected, starting timer');
        }
        
        const elapsed = Date.now() - badPostureStartTime;
        const progress = (elapsed / BAD_POSTURE_DURATION_MS) * 100;
        const remainingSeconds = Math.ceil((BAD_POSTURE_DURATION_MS - elapsed) / 1000);
 
        // Show and update progress bar
        if (elements.postureTimer) {
            // Use flex to honor the card layout styling when visible
            elements.postureTimer.style.display = 'flex';
        }
        if (elements.timerProgress) {
            elements.timerProgress.style.width = progress + '%';
            elements.timerProgress.setAttribute('aria-valuenow', progress);
        }
        if (elements.timerCountdown) {
            elements.timerCountdown.textContent = remainingSeconds > 0 ? remainingSeconds : 0;
        }
        
        if (elapsed >= BAD_POSTURE_DURATION_MS) {
            elements.postureAlert.style.display = 'block';
            elements.postureAlert.classList.add('show');
            if (!isMuted) {
                elements.beepSound.play().catch(err => console.log('Audio play failed:', err));
            }
            
            
            // Count alert only once per bad posture episode
            if (dailyStats && !alertIssuedForCurrentEpisode) {
                alertIssuedForCurrentEpisode = true;
                dailyStats.alertCount += 1;
                incrementTenMinAlertCount(); // Increment checkpoint counter
                saveDailyStats();
                updateStatsUI();
                
                // Send notification only once per episode, if tab is out of focus
                sendPostureNotification();
            }
        }
    } else {
        // Good posture detected - require 1 second of continuous good posture
        if (badPostureStartTime !== null) {
            // Start tracking good posture duration
            if (goodPostureStartTime === null) {
                goodPostureStartTime = Date.now();
            } else {
                const goodPostureElapsed = Date.now() - goodPostureStartTime;
                if (goodPostureElapsed >= GOOD_POSTURE_REQUIRED_MS) {
                    // Sustained good posture for 1 second - reset bad posture timer
                    badPostureStartTime = null;
                    goodPostureStartTime = null;
                    if (elements.postureTimer) {
                        elements.postureTimer.style.display = 'none';
                    }
                    elements.postureAlert.style.display = 'none';
                    elements.postureAlert.classList.remove('show');
                    // Reset alert episode flag when posture is no longer bad
                    alertIssuedForCurrentEpisode = false;
                }
            }
        } else {
            // No bad posture timer active, reset good posture timer
            goodPostureStartTime = null;
        }
    }
}

/**
 * Process a single video frame
 */
async function processFrame() {
    if ((!isTracking && !isCalibrating) || !elements.video || !elements.canvas || !elements.canvasCtx) {
        return;
    }

    // Pause all processing during break cooldowns
    if (isBreakPaused) {
        timerId = setTimeout(processFrame, FRAME_DELAY);
        return;
    }

    const now = performance.now();
    if (now - lastFrameTime < FRAME_DELAY) {
        timerId = setTimeout(processFrame, FRAME_DELAY - (now - lastFrameTime));
        return;
    }
    lastFrameTime = now;

    try {
        // Draw video to canvas
        elements.canvasCtx.drawImage(
            elements.video,
            0,
            0,
            elements.canvas.width,
            elements.canvas.height
        );

        // During calibration, only show plain video
        if (isCalibrating) {
            // Just show video, no face detection overlays
        } else {
            // Tracking mode: show pose detection and check posture
            const poses = await detectPose();
            
            // Check posture if calibrated
            if (isCalibrated) {
                checkPosture(poses);
            }
            
            // Render pose skeleton and keypoints
            drawSkeleton(poses);
            drawKeypoints(poses);
        }
    } catch (err) {
        console.error('Frame processing error:', err);
    }

    // Continue animation loop
    timerId = setTimeout(processFrame, FRAME_DELAY);
}

// ============================================
// START/STOP TRACKING
// ============================================

/**
 * Start face tracking (with calibration if needed)
 */
async function startTracking() {
    if (isTracking) {
        stopTracking();
        return;
    }

    // Ask for notification permission on user gesture
    ensureNotificationPermission();

    // Start calibration if not calibrated
    if (!isCalibrated) {
        startCalibration();
        return;
    }

    // Setup UI
    if (elements.startBtn) {
        elements.startBtn.disabled = true;
        elements.startBtn.textContent = 'Stop Face Tracking';
        elements.startBtn.classList.remove('btn-success');
        elements.startBtn.classList.add('btn-danger');
    }
    if (elements.spinner) elements.spinner.style.display = 'inline-block';

    // Setup camera and canvas
    const cameraReady = await setupVideoStream();
    if (!cameraReady) {
        console.error('Failed to access camera');
        resetUI();
        return;
    }

    // Wait for video to be ready
    elements.video.onloadedmetadata = async () => {
        await elements.video.play();
        setupCanvas();
        isTracking = true;
        if (elements.spinner) elements.spinner.style.display = 'none';
        if (elements.startBtn) elements.startBtn.disabled = false;
        processFrame();
    };
}

/**
 * Stop face tracking
 */
function stopTracking() {
    isTracking = false;

    if (timerId) {
        clearTimeout(timerId);
    }

    if (elements.video?.srcObject) {
        elements.video.srcObject.getTracks().forEach(track => track.stop());
    }

    resetUI();
}

/**
 * Reset UI to initial state
 */
function resetUI() {
    if (elements.startBtn) {
        elements.startBtn.textContent = 'Start Face Tracking';
        elements.startBtn.classList.remove('btn-danger');
        elements.startBtn.classList.add('btn-success');
        elements.startBtn.disabled = false;
    }
    if (elements.spinner) elements.spinner.style.display = 'none';
}

// ============================================
// CALIBRATION
// ============================================

/**
 * Start calibration mode
 */
async function startCalibration() {
    // Setup UI
    if (elements.startBtn) {
        elements.startBtn.disabled = true;
    }
    if (elements.spinner) elements.spinner.style.display = 'inline-block';

    // Setup camera and canvas
    const cameraReady = await setupVideoStream();
    if (!cameraReady) {
        console.error('Failed to access camera');
        if (elements.spinner) elements.spinner.style.display = 'none';
        if (elements.startBtn) elements.startBtn.disabled = false;
        return;
    }

    // Wait for video to be ready
    elements.video.onloadedmetadata = async () => {
        await elements.video.play();
        setupCanvas();
        isCalibrating = true;
        calibrationStage = 1; // Start with upright position
        
        if (elements.spinner) elements.spinner.style.display = 'none';
        if (elements.calibrationInstructions) {
            elements.calibrationInstructions.innerHTML = '<strong>📐 Calibration - Step 1/2</strong><br>Sit in your best upright posture and click "Confirm Upright Position" when ready.';
            elements.calibrationInstructions.style.display = 'block';
        }
        if (elements.confirmCalibrationBtn) {
            elements.confirmCalibrationBtn.textContent = 'Confirm Upright Position';
            elements.confirmCalibrationBtn.style.display = 'inline-block';
        }
        if (elements.startBtn) {
            elements.startBtn.style.display = 'none';
        }
        
        processFrame();
    };
}

/**
 * Confirm calibration and capture nose-shoulder offset
 */
async function confirmCalibration() {
    if (!isCalibrating) return;

    // Detect current pose
    const poses = await detectPose();
    
    if (poses.length === 0) {
        alert('No pose detected. Please ensure your upper body is visible and try again.');
        return;
    }

    const pose = poses[0];
    const offset = getNoseShoulderOffset(pose);
    
    if (offset === null) {
        alert('Could not detect key points (nose and shoulders). Please adjust your position and try again.');
        return;
    }

    const leftShoulder = pose.keypoints.find(kp => kp.name === 'left_shoulder');
    const rightShoulder = pose.keypoints.find(kp => kp.name === 'right_shoulder');
    const shoulderSpan = Math.abs(leftShoulder.x - rightShoulder.x);
    
    if (calibrationStage === 1) {
        // Store upright position
        calibratedNoseShoulderOffset = offset;
        calibratedShoulderSpan = shoulderSpan;
        calibratedShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
        calibrationStage = 2;
        
        // Update UI for stage 2
        if (elements.calibrationInstructions) {
            elements.calibrationInstructions.innerHTML = '<strong>📐 Calibration - Step 2/2</strong><br>Now sit in your typical relaxed/slouched posture and click "Confirm Relaxed Position".';
        }
        if (elements.confirmCalibrationBtn) {
            elements.confirmCalibrationBtn.textContent = 'Confirm Relaxed Position';
        }
    } else if (calibrationStage === 2) {
        // Store relaxed position
        relaxedNoseShoulderOffset = offset;
        
        // Calculate threshold using configurable multiplier (40-80% of relaxed-upright difference)
        const offsetDifference = Math.abs(relaxedNoseShoulderOffset - calibratedNoseShoulderOffset);
        postureThreshold = Math.round(offsetDifference * thresholdMultiplier);
        
        // Complete calibration
        isCalibrating = false;
        isCalibrated = true;
        calibrationStage = 0;
        
        // Update UI
        if (elements.calibrationInstructions) {
            elements.calibrationInstructions.style.display = 'none';
        }
        if (elements.confirmCalibrationBtn) {
            elements.confirmCalibrationBtn.style.display = 'none';
        }
        if (elements.startBtn) {
            elements.startBtn.style.display = 'inline-block';
        }
        
        // Automatically start tracking after calibration
        await startTracking();
    }
}

// ============================================
// AUTHENTICATION & UI STATE
// ============================================

function updateAuthUI() {
    const authToken = UserStorage.getAuthToken();
    const currentUser = UserStorage.getCurrentUser();
    const loginBtn = document.querySelector('.btn-login');
    const nameLabel = document.querySelector('.user-name-label');

    if (!loginBtn) return;

    if (authToken && currentUser) {
        // User is logged in: Change "Login" to "Logout"
        loginBtn.textContent = 'Logout';
        loginBtn.href = '#';
        loginBtn.onclick = (e) => {
            e.preventDefault();
            handleLogout();
        };
        if (nameLabel) {
            nameLabel.textContent = currentUser.name || 'User';
            nameLabel.style.display = 'inline-flex';
        }
    } else {
        // User is logged out: Ensure button says "Login"
        loginBtn.textContent = 'Login';
        loginBtn.href = './login.html';
        loginBtn.onclick = null;
        if (nameLabel) {
            nameLabel.textContent = '';
            nameLabel.style.display = 'none';
        }
    }
    if (typeof updateStatsUI === 'function') {
        updateStatsUI();
    }
}

function handleLogout() {
    UserStorage.logout();
    updateAuthUI();
    // Refresh to clear any active tracking session data
    window.location.reload();
}

// ============================================
// EVENT LISTENERS
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    initDailyStats();
    startBackgroundTimers();

    updateAuthUI();
    

    if (isMobileDevice()) {
        if (elements.startBtn) {
            const unsupportedMsg = document.createElement('h3');
            unsupportedMsg.textContent = 'This site is not supported on mobile devices.';
            unsupportedMsg.style.textAlign = 'center';
            unsupportedMsg.style.margin = '1rem 0';
            elements.startBtn.replaceWith(unsupportedMsg);
        }
        if (elements.confirmCalibrationBtn) {
            elements.confirmCalibrationBtn.style.display = 'none';
        }
        return;
    }

    if (elements.startBtn) {
        elements.startBtn.addEventListener('click', startTracking);
    }
    if (elements.confirmCalibrationBtn) {
        elements.confirmCalibrationBtn.addEventListener('click', confirmCalibration);
    }

    // Audio toggle
    const audioToggleCard = document.getElementById('audioToggleCard');
    if (audioToggleCard) {
        audioToggleCard.addEventListener('click', toggleAudioMute);
    }

    // Threshold slider
    if (elements.thresholdSlider) {
        elements.thresholdSlider.addEventListener('input', (e) => setThresholdMultiplier(e.target.value));
        setThresholdMultiplier(elements.thresholdSlider.value || thresholdMultiplier);
    }
});

function toggleAudioMute() {
    isMuted = !isMuted;
    const icon = document.getElementById('audioToggleIcon');
    const status = document.getElementById('audioToggleStatus');
    const iconSpan = icon?.querySelector('.material-symbols-outlined');
    
    if (isMuted) {
        if (iconSpan) iconSpan.textContent = 'volume_off';
        if (status) status.textContent = 'Off';
        if (icon) icon.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
        if (icon) icon.style.color = '#ef4444';
    } else {
        if (iconSpan) iconSpan.textContent = 'volume_up';
        if (status) status.textContent = 'On';
        if (icon) icon.style.backgroundColor = 'rgba(121, 201, 197, 0.2)';
        if (icon) icon.style.color = 'var(--soft-mint)';
    }
}

window.addEventListener('load', () => {
    onTensorFlowReady();
    registerServiceWorker();
});

// ============================================
// SERVICE WORKER (PWA)
// ============================================

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
            console.log('✓ Service worker registered', reg);
            if (reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                    }
                });
            });
        })
        .catch((err) => console.log('✗ Service worker registration failed:', err));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
    });
}
