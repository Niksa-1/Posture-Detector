// ============================================
// DAILY STATS (LocalStorage)
// ============================================

const STORAGE_PREFIX = 'postureStats:';
let dailyStats = null;
let dailyKey = null;
let currentState = 'unknown'; // 'good' | 'bad' | 'unknown'
let goodStreakStartTime = null;
let alertIssuedForCurrentEpisode = false;
let lastStatsUpdateTime = null; // timestamp of last stats increment

function getTodayKey() {
    const d = new Date();
    // YYYY-MM-DD
    return d.toISOString().slice(0, 10);
}

function loadDailyStats(key) {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                totalMs: parsed.totalMs || 0,
                goodMs: parsed.goodMs || 0,
                badMs: parsed.badMs || 0,
                longestGoodStreakMs: parsed.longestGoodStreakMs || 0,
                alertCount: parsed.alertCount || 0
            };
        }
    } catch (e) {
        console.warn('Failed to parse stored stats, resetting.', e);
    }
    return { totalMs: 0, goodMs: 0, badMs: 0, longestGoodStreakMs: 0, alertCount: 0 };
}

function saveDailyStats() {
    if (!dailyKey || !dailyStats) return;
    try {
        localStorage.setItem(STORAGE_PREFIX + dailyKey, JSON.stringify(dailyStats));
    } catch (e) {
        console.warn('Failed to save stats:', e);
    }
}

function initDailyStats() {
    dailyKey = getTodayKey();
    dailyStats = loadDailyStats(dailyKey);
    lastStatsUpdateTime = null;
    console.log('Stats initialized for', dailyKey, dailyStats);
}

function logStatsDebug() {
    if (!dailyStats) return;
    const classifiedMs = dailyStats.goodMs + dailyStats.badMs;
    const goodPct = classifiedMs > 0 ? ((dailyStats.goodMs / classifiedMs) * 100).toFixed(1) : '0.0';
    const badPct = classifiedMs > 0 ? ((dailyStats.badMs / classifiedMs) * 100).toFixed(1) : '0.0';
    console.log(
        `Stats [${dailyKey}] => total=${Math.round(dailyStats.totalMs/1000)}s, good=${goodPct}%, bad=${badPct}%, longestGoodStreak=${Math.round(dailyStats.longestGoodStreakMs/1000)}s, alerts=${dailyStats.alertCount}`
    );
}

function formatTime(ms) {
    if (ms < 1000) return '0s';
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
}

function updateStatsUI() {
    if (!dailyStats) return;
    
    // Show stats panel when tracking starts
    const statsPanel = document.getElementById('statsPanel');
    if (statsPanel) {
        statsPanel.style.display = 'block';
    }

    const classifiedMs = dailyStats.goodMs + dailyStats.badMs;
    const goodPct = classifiedMs > 0 ? ((dailyStats.goodMs / classifiedMs) * 100).toFixed(1) : '0.0';
    const badPct = classifiedMs > 0 ? ((dailyStats.badMs / classifiedMs) * 100).toFixed(1) : '0.0';
    const totalTime = formatTime(dailyStats.totalMs);
    const longestStreak = formatTime(dailyStats.longestGoodStreakMs);

    // Update DOM elements
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
