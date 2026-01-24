// UI and timer handling for stats and breaks

function updateStatsUI() {
    if (typeof dailyStats === 'undefined' || !dailyStats) return;
    const statsPanel = document.getElementById('statsPanel');
    if (statsPanel) statsPanel.style.display = 'block';

    const classifiedMs = dailyStats.goodMs + dailyStats.badMs;
    const goodPct = classifiedMs > 0 ? ((dailyStats.goodMs / classifiedMs) * 100).toFixed(1) : '0.0';
    const badPct = classifiedMs > 0 ? ((dailyStats.badMs / classifiedMs) * 100).toFixed(1) : '0.0';
    const totalTime = formatTime(dailyStats.totalMs);
    const longestStreak = formatTime(dailyStats.longestGoodStreakMs);

    const statGoodPct = document.getElementById('statGoodPct');
    if (statGoodPct) statGoodPct.textContent = `${goodPct}%`;

    const statBadPct = document.getElementById('statBadPct');
    if (statBadPct) statBadPct.textContent = `${badPct}%`;

    const statTotalTime = document.getElementById('statTotalTime');
    if (statTotalTime) statTotalTime.textContent = totalTime;

    const statLongestStreak = document.getElementById('statLongestStreak');
    if (statLongestStreak) statLongestStreak.textContent = longestStreak;

    const statAlertCount = document.getElementById('statAlertCount');
    if (statAlertCount) statAlertCount.textContent = dailyStats.alertCount;
}

function showBreakModal(durationMin) {
    if (typeof pauseTrackingForBreak === 'function') pauseTrackingForBreak();
    if (typeof setBreakState === 'function') setBreakState(true);

    const modal = document.getElementById('breakModal');
    const title = document.getElementById('breakTitle');
    const countdown = document.getElementById('breakCountdown');
    if (!modal || !title || !countdown) return;

    if (typeof setBreakEndTime === 'function') setBreakEndTime(Date.now() + durationMin * 60 * 1000);
    title.textContent = `Time for a ${durationMin}-minute break!`;

    modal.style.display = 'block';
    updateBreakCountdownDisplay();
}

function closeBreakModal(completed = false) {
    if (typeof setBreakState === 'function') setBreakState(false);
    if (typeof clearBreakEndTime === 'function') clearBreakEndTime();

    const modal = document.getElementById('breakModal');
    if (modal) modal.style.display = 'none';

    if (typeof resumeTrackingAfterBreak === 'function') resumeTrackingAfterBreak();
    console.log(completed ? 'Break completed!' : 'Break dismissed early');
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
    if (typeof isTracking !== 'boolean' || !isTracking) return;

    if (typeof isOnBreak === 'boolean' && !isOnBreak) {
        if (typeof checkBreakCheckpoint === 'function') {
            const breakDuration = checkBreakCheckpoint();
            if (breakDuration > 0) {
                showBreakModal(breakDuration);
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
}

function startBackgroundTimers() {
    if (typeof getBackgroundTimerId === 'function' && getBackgroundTimerId()) return;
    const id = setInterval(backgroundTick, 1000);
    if (typeof setBackgroundTimerId === 'function') setBackgroundTimerId(id);
}
