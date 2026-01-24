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
let isBreakPaused = false; // Pause tracking during break cooldown
let isOnBreak = false;
let breakEndTime = null;
let backgroundTimerId = null;

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
    timerCountdown: null
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
    
    console.log('Timer elements loaded:', {
        postureTimer: !!elements.postureTimer,
        timerProgress: !!elements.timerProgress,
        timerCountdown: !!elements.timerCountdown
    });
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
}

// Pause/resume helpers for break cooldown
function pauseTrackingForBreak() {
    isBreakPaused = true;
    // Prevent stats from accruing break time
    lastStatsUpdateTime = null;
    console.log('Tracking paused for break');
}

function resumeTrackingAfterBreak() {
    isBreakPaused = false;
    // Reset timers so next frame starts fresh
    lastFrameTime = 0;
    lastStatsUpdateTime = Date.now();
    console.log('Tracking resumed after break');
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

// Break checkpoint logic
function checkBreakCheckpoint() {
    if (!lastCheckpointTime) return 0;
    const now = Date.now();
    const elapsed = now - lastCheckpointTime;

    if (elapsed >= CHECKPOINT_INTERVAL_MS) {
        console.log(`${CHECKPOINT_INTERVAL_MINUTES}-min checkpoint: ${tenMinAlertCount} alerts in last ${CHECKPOINT_INTERVAL_MINUTES} minutes`);

        let breakDurationMin = 0;
        const alertRate = tenMinAlertCount / CHECKPOINT_INTERVAL_MINUTES; // alerts per minute

        if (alertRate >= 1.0) {
            breakDurationMin = 10;
        } else if (alertRate >= 0.5) {
            breakDurationMin = 5;
        } else if (alertRate >= 0) {
            breakDurationMin = 2;
        }

        // Reset checkpoint
        lastCheckpointTime = now;
        tenMinAlertCount = 0;

        return breakDurationMin;
    }
    return 0;
}

function incrementTenMinAlertCount() {
    tenMinAlertCount++;
    console.log(`${CHECKPOINT_INTERVAL_MINUTES}-min alert count: ${tenMinAlertCount}`);
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
            ['nose', 'right_eye'],
            ['left_shoulder', 'left_elbow'],
            ['right_shoulder', 'right_elbow']
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
 * Draw threshold line on canvas
 */
function drawThresholdLine(thresholdPx) {
    if (!elements.canvasCtx || !elements.canvas) return;

    const ctx = elements.canvasCtx;
    const threshold = thresholdPx * canvasScale;

    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, threshold);
    ctx.lineTo(elements.canvas.width, threshold);
    ctx.stroke();
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
            logStatsDebug();
            updateStatsUI();
            const breakDuration = checkBreakCheckpoint(); // Check for checkpoint break
            if (breakDuration > 0) {
                showBreakModal(breakDuration);
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
        if (badPostureStartTime === null) {
            badPostureStartTime = Date.now();
            console.log('Bad posture detected, starting timer');
        }
        
        const elapsed = Date.now() - badPostureStartTime;
        const progress = (elapsed / BAD_POSTURE_DURATION_MS) * 100;
        const remainingSeconds = Math.ceil((BAD_POSTURE_DURATION_MS - elapsed) / 1000);
        
        console.log(`Timer progress: ${progress.toFixed(1)}%, ${remainingSeconds}s remaining`);
        
        // Show and update progress bar
        if (elements.postureTimer) {
            elements.postureTimer.style.display = 'block';
        }
        if (elements.timerProgress) {
            elements.timerProgress.style.width = progress + '%';
            elements.timerProgress.setAttribute('aria-valuenow', progress);
        }
        if (elements.timerCountdown) {
            elements.timerCountdown.textContent = remainingSeconds > 0 ? remainingSeconds : 0;
        }
        
        if (elapsed >= BAD_POSTURE_DURATION_MS) {
            console.log('15 seconds elapsed, triggering alert');
            elements.postureAlert.style.display = 'block';
            elements.postureAlert.classList.add('show');
            elements.beepSound.play().catch(err => console.log('Audio play failed:', err));
            
            // Count alert only once per bad posture episode
            if (dailyStats && !alertIssuedForCurrentEpisode) {
                alertIssuedForCurrentEpisode = true;
                dailyStats.alertCount += 1;
                incrementTenMinAlertCount(); // Increment checkpoint counter
                saveDailyStats();
                logStatsDebug();
                updateStatsUI();
            }
            // Native notifications disabled per user request.
            // Previously, a Notification was created here when permission was granted.
        }
    } else {
        if (badPostureStartTime !== null) {
            console.log('Good posture restored, resetting timer');
        }
        badPostureStartTime = null;
        if (elements.postureTimer) {
            elements.postureTimer.style.display = 'none';
        }
        elements.postureAlert.style.display = 'none';
        elements.postureAlert.classList.remove('show');
        // Reset alert episode flag when posture is no longer bad
        alertIssuedForCurrentEpisode = false;
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

            console.log(`Detected ${poses.length} pose(s)`);
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
        
        console.log(`✓ Upright position recorded. Offset: ${Math.round(offset)}px`);
    } else if (calibrationStage === 2) {
        // Store relaxed position
        relaxedNoseShoulderOffset = offset;
        
        // Calculate threshold: 40% of the difference between relaxed and upright
        const offsetDifference = Math.abs(relaxedNoseShoulderOffset - calibratedNoseShoulderOffset);
        postureThreshold = Math.round(offsetDifference * 0.4);
        
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

        console.log(`✓ Relaxed position recorded. Offset: ${Math.round(offset)}px`);
        console.log(`✓ Calibration complete. Threshold set to ${postureThreshold}px (40% of ${Math.round(offsetDifference)}px difference)`);
        
        // Automatically start tracking after calibration
        await startTracking();
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    initDailyStats();
    startBackgroundTimers();
    if (elements.startBtn) {
        elements.startBtn.addEventListener('click', startTracking);
    }
    if (elements.confirmCalibrationBtn) {
        elements.confirmCalibrationBtn.addEventListener('click', confirmCalibration);
    }
});

window.addEventListener('load', () => {
    onTensorFlowReady();
    registerServiceWorker();
});

// ============================================
// SERVICE WORKER (PWA)
// ============================================

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
            console.log('✓ Service worker registered', reg);

            // If there's an already waiting worker, tell it to take over immediately
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
        // Reload so the new service worker version controls the page immediately
        window.location.reload();
    });
}
