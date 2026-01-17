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
let uprightPosition = null;
let relaxedPosition = null;
let timerId = null;
let lastFrameTime = 0;
let canvasScale = 1;

// DOM Elements Cache
const elements = {
    video: null,
    canvas: null,
    canvasCtx: null,
    startBtn: null,
    confirmCalibrationBtn: null,
    calibrationInstructions: null,
    spinner: null,
    thresholdSlider: null,
    thresholdValue: null,
    postureAlert: null,
    beepSound: null
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
    elements.thresholdSlider = document.getElementById('thresholdSlider');
    elements.thresholdValue = document.getElementById('thresholdValue');
    elements.postureAlert = document.getElementById('postureAlert');
    elements.beepSound = document.getElementById('beepSound');
}

/**
 * Initialize TensorFlow face detector
 */
async function initializeFaceDetector() {
    try {
        if (!faceDetection) {
            console.error('Face detection library not loaded');
            return false;
        }

        const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
        const detectorConfig = {
            runtime: 'mediapipe',
            solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection'
        };

        detector = await faceDetection.createDetector(model, detectorConfig);
        console.log('✓ Face detector initialized successfully');
        return true;
    } catch (err) {
        console.error('✗ Failed to initialize face detector:', err);
        return false;
    }
}

/**
 * Called when TensorFlow is ready
 */
async function onTensorFlowReady() {
    console.log('TensorFlow.js is ready.');
    
    const initialized = await initializeFaceDetector();
    if (initialized && elements.startBtn) {
        elements.startBtn.disabled = false;
    }
}

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
 * Detect faces in the current video frame
 */
async function detectFaces() {
    if (!detector || !elements.video) return [];
    try {
        return await detector.estimateFaces(elements.video, false);
    } catch (err) {
        console.error('Error detecting faces:', err);
        return [];
    }
}

/**
 * Draw face bounding boxes on canvas
 */
function drawFaceBoxes(faces) {
    if (!elements.canvasCtx) return;

    const ctx = elements.canvasCtx;
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';

    faces.forEach(face => {
        const { xMin, yMin, width, height } = face.box;
        ctx.strokeRect(xMin * canvasScale, yMin * canvasScale, width * canvasScale, height * canvasScale);
        ctx.fillRect(xMin * canvasScale, yMin * canvasScale, width * canvasScale, height * canvasScale);
    });
}

/**
 * Draw facial keypoints on canvas
 */
function drawKeypoints(faces) {
    if (!elements.canvasCtx) return;

    const ctx = elements.canvasCtx;
    ctx.fillStyle = '#FF0000';

    faces.forEach(face => {
        if (face.keypoints) {
            face.keypoints.forEach(kp => {
                ctx.beginPath();
                ctx.arc(kp.x * canvasScale, kp.y * canvasScale, 3, 0, 2 * Math.PI);
                ctx.fill();
            });
        }
    });
}

/**
 * Draw threshold line on canvas
 */
function drawThresholdLine() {
    if (!elements.canvasCtx || !elements.canvas || !elements.thresholdSlider) return;

    const ctx = elements.canvasCtx;
    const threshold = parseInt(elements.thresholdSlider.value) * canvasScale;

    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, threshold);
    ctx.lineTo(elements.canvas.width, threshold);
    ctx.stroke();
}

/**
 * Check posture and trigger alerts if needed
 */
function checkPosture(faces) {
    if (!elements.thresholdSlider || !elements.postureAlert || !elements.beepSound) return;

    const threshold = parseInt(elements.thresholdSlider.value);
    let badPostureDetected = false;

    faces.forEach(face => {
        const faceTop = face.box.yMin;
        if (faceTop > threshold) {
            badPostureDetected = true;
        }
    });

    if (badPostureDetected) {
        elements.postureAlert.style.display = 'block';
        elements.postureAlert.classList.add('show');
        elements.beepSound.play().catch(err => console.log('Audio play failed:', err));
    } else {
        elements.postureAlert.style.display = 'none';
        elements.postureAlert.classList.remove('show');
    }
}

/**
 * Process a single video frame
 */
async function processFrame() {
    if ((!isTracking && !isCalibrating) || !elements.video || !elements.canvas || !elements.canvasCtx) {
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
            // Tracking mode: show face detection and threshold
            const faces = await detectFaces();
            
            // Check posture
            checkPosture(faces);

            // Render detections
            drawThresholdLine();
            drawFaceBoxes(faces);
            drawKeypoints(faces);

            console.log(`Detected ${faces.length} face(s)`);
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

    // If not calibrated, start calibration mode first
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
 * Confirm calibration and set threshold
 */
async function confirmCalibration() {
    if (!isCalibrating) return;

    // Detect current face position
    const faces = await detectFaces();
    
    if (faces.length === 0) {
        alert('No face detected. Please ensure your face is visible and try again.');
        return;
    }

    const faceTop = faces[0].box.yMin;
    
    if (calibrationStage === 1) {
        // Store upright position
        uprightPosition = faceTop;
        calibrationStage = 2;
        
        // Update UI for stage 2
        if (elements.calibrationInstructions) {
            elements.calibrationInstructions.innerHTML = '<strong>📐 Calibration - Step 2/2</strong><br>Now sit in your typical relaxed posture and click "Confirm Relaxed Position".';
        }
        if (elements.confirmCalibrationBtn) {
            elements.confirmCalibrationBtn.textContent = 'Confirm Relaxed Position';
        }
        
        console.log(`✓ Upright position recorded: ${Math.round(uprightPosition)}px`);
    } else if (calibrationStage === 2) {
        // Store relaxed position
        relaxedPosition = faceTop;
        
        // Calculate threshold: midpoint between upright and relaxed, slightly favoring upright
        // Formula: upright + (relaxed - upright) * 0.4
        const thresholdValue = Math.round(uprightPosition + (relaxedPosition - uprightPosition) * 0.4);
        
        // Update slider
        if (elements.thresholdSlider) {
            elements.thresholdSlider.value = thresholdValue;
        }
        if (elements.thresholdValue) {
            elements.thresholdValue.textContent = thresholdValue;
        }
        
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

        console.log(`✓ Relaxed position recorded: ${Math.round(relaxedPosition)}px`);
        console.log(`✓ Calibration complete. Threshold set to ${thresholdValue}px`);
        
        // Automatically start tracking after calibration
        await startTracking();
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    if (elements.startBtn) {
        elements.startBtn.addEventListener('click', startTracking);
    }
    if (elements.confirmCalibrationBtn) {
        elements.confirmCalibrationBtn.addEventListener('click', confirmCalibration);
    }
    if (elements.thresholdSlider && elements.thresholdValue) {
        elements.thresholdSlider.addEventListener('input', (e) => {
            elements.thresholdValue.textContent = e.target.value;
        });
    }
});

window.addEventListener('load', onTensorFlowReady);

// ============================================
// SERVICE WORKER (PWA)
// ============================================

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('✓ Service worker registered', reg))
        .catch(err => console.log('✗ Service worker registration failed:', err));
}
