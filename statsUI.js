// UI and timer handling for stats and breaks

function updateStatsUI() {
    // 1. Data Validation
    if (typeof dailyStats === 'undefined' || !dailyStats) return;

    // Update Session Time in control panel (always visible)
    const sessionTimeEl = document.getElementById('statTotalTime');
    if (sessionTimeEl) sessionTimeEl.textContent = formatTimeHMS(dailyStats.totalMs);

    // 2. Show analytics only if logged in
    const analyticsSection = document.getElementById('analyticsSection');
    analyticsSection.style.display = 'block';

    // 3. Calculations
    const classifiedMs = dailyStats.goodMs + dailyStats.badMs;
    const goodPct = classifiedMs > 0 ? (dailyStats.goodMs / classifiedMs) * 100 : 0;
    
    // 4. Update Card 1: Quality Score
    const scoreEl = document.getElementById('qualityScoreValue');
    const barEl = document.getElementById('qualityScoreBar');
    if (scoreEl) scoreEl.textContent = `${goodPct.toFixed(0)}%`;
    if (barEl) barEl.style.width = `${goodPct}%`;

    // 5. Update Card 2: Total Tracking
    const totalEl = document.getElementById('totalTimeValue');
    const goodEl = document.getElementById('goodTimeValue');
    const badEl = document.getElementById('badTimeValue');
    
    if (totalEl) totalEl.textContent = formatTimeHMS(dailyStats.totalMs);
    if (goodEl) goodEl.textContent = formatTime(dailyStats.goodMs);
    if (badEl) badEl.textContent = formatTime(dailyStats.badMs);

    // 6. Update Card 3: Discipline
    const streakEl = document.getElementById('streakValue');
    const alertEl = document.getElementById('alertCountValue');
    const feedbackEl = document.getElementById('disciplineFeedback');
    
    if (streakEl) streakEl.textContent = formatTime(dailyStats.longestGoodStreakMs);
    if (alertEl) alertEl.textContent = dailyStats.alertCount;

    // Dynamic feedback based on alerts
    if (feedbackEl) {
        if (dailyStats.alertCount === 0) feedbackEl.textContent = "Perfect discipline so far!";
        else if (dailyStats.alertCount < 5) feedbackEl.textContent = "Minor adjustments needed.";
        else feedbackEl.textContent = "Take more frequent breaks.";
    }
}

function showBreakModal(breakInfo) {
    if (typeof pauseTrackingForBreak === 'function') pauseTrackingForBreak();
    if (typeof setBreakState === 'function') setBreakState(true);

    const modal = document.getElementById('breakModal');
    const title = document.getElementById('breakTitle');
    const countdown = document.getElementById('breakCountdown');
    const reasonEl = document.getElementById('breakReason');
    if (!modal || !title || !countdown) return;

    const durationMin = typeof breakInfo === 'object' && breakInfo !== null ? breakInfo.durationMin : breakInfo;
    const reasonText = typeof breakInfo === 'object' && breakInfo !== null ? breakInfo.reason : '';

    if (typeof setBreakEndTime === 'function') setBreakEndTime(Date.now() + durationMin * 60 * 1000);
    title.textContent = `Time for a ${durationMin}-minute break!`;
    if (reasonEl) {
        reasonEl.textContent = reasonText || 'Stand up, stretch, and rest your eyes';
    }

    modal.style.display = 'flex';
    updateBreakCountdownDisplay();
    
    // Send break start notification
    if (typeof sendNotification === 'function') {
        sendNotification(
            `⏰ Break Time: ${durationMin} minute${durationMin > 1 ? 's' : ''}`,
            reasonText || 'Stand up, stretch, and rest your eyes',
            false // Send even if tab is visible
        );
    }
}

function closeBreakModal(completed = false) {
    if (typeof setBreakState === 'function') setBreakState(false);
    if (typeof clearBreakEndTime === 'function') clearBreakEndTime();

    // Reset checkpoint window so a new break doesn't fire immediately after finishing
    if (typeof lastCheckpointTime !== 'undefined') {
        lastCheckpointTime = Date.now();
    }
    if (typeof tenMinAlertCount !== 'undefined') {
        tenMinAlertCount = 0;
    }

    const modal = document.getElementById('breakModal');
    if (modal) modal.style.display = 'none';

    if (typeof resumeTrackingAfterBreak === 'function') resumeTrackingAfterBreak();
    
    // Send break end notification
    if (typeof sendNotification === 'function') {
        if (completed) {
            sendNotification(
                '✅ Break Complete!',
                'Time to resume tracking. Sit with good posture!',
                false // Send even if tab is visible
            );
        }
    }
}

function updateBreakCountdownDisplay() {
    if (typeof getBreakEndTime !== 'function') return;
    const endTime = getBreakEndTime();
    if (!endTime) return;

    const countdown = document.getElementById('breakCountdown');
    if (!countdown) return;

    const remainingMs = endTime - Date.now();
    const mins = Math.max(0, Math.floor(remainingMs / 1000 / 60));
    const secs = Math.max(0, Math.floor((remainingMs / 1000) % 60));
    countdown.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

function backgroundTick() {
    // Only run break timer if face tracking is active
    if (typeof isTracking !== 'boolean' || !isTracking) {
        updateNextBreakTimer();
        return;
    }

    if (typeof isOnBreak === 'boolean' && !isOnBreak) {
        if (typeof checkBreakCheckpoint === 'function') {
            const breakInfo = checkBreakCheckpoint();
            if (breakInfo) {
                showBreakModal(breakInfo);
            }
        }
    }

    if (typeof isOnBreak === 'boolean' && isOnBreak) {
        const endTime = typeof getBreakEndTime === 'function' ? getBreakEndTime() : null;
        if (endTime) {
            const remainingMs = endTime - Date.now();
            if (remainingMs <= 0) {
                closeBreakModal(true);
            } else {
                updateBreakCountdownDisplay();
            }
        }
    }

    updateNextBreakTimer();
}

function startBackgroundTimers() {
    if (typeof getBackgroundTimerId === 'function' && getBackgroundTimerId()) return;
    const id = setInterval(backgroundTick, 1000);
    if (typeof setBackgroundTimerId === 'function') setBackgroundTimerId(id);
}

function updateNextBreakTimer() {
    const timerEl = document.getElementById('nextBreakTimer');
    if (!timerEl) return;

    if (typeof isTracking !== 'boolean' || !isTracking) {
        timerEl.textContent = 'Waiting for tracking';
        return;
    }

    if (typeof isOnBreak === 'boolean' && isOnBreak) {
        timerEl.textContent = 'Break in progress';
        return;
    }

    if (typeof lastCheckpointTime === 'undefined' || !lastCheckpointTime) {
        timerEl.textContent = '--';
        return;
    }

    const now = Date.now();
    const remainingMs = Math.max(0, CHECKPOINT_INTERVAL_MS - (now - lastCheckpointTime));
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs / 1000) % 60);
    timerEl.textContent = remainingMs <= 0 ? 'Checking…' : `${mins}:${secs.toString().padStart(2, '0')}`;
}
