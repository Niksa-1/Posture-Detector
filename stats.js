// ============================================
// DAILY STATS (LocalStorage)
// ============================================

// CONFIGURATION: Adjust these values as needed
const CHECKPOINT_INTERVAL_MINUTES = 1; // How often to check for breaks (in minutes)

const STORAGE_PREFIX = 'postureStats:';
let dailyStats = null;
let dailyKey = null;
let currentState = 'unknown'; // 'good' | 'bad' | 'unknown'
let goodStreakStartTime = null;
let alertIssuedForCurrentEpisode = false;
let lastStatsUpdateTime = null; // timestamp of last stats increment

// Break system counters (logic only; UI handled elsewhere)
let tenMinAlertCount = 0; // Alerts in current checkpoint window
let lastCheckpointTime = null; // Last checkpoint
const CHECKPOINT_INTERVAL_MS = CHECKPOINT_INTERVAL_MINUTES * 60 * 1000;

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
    lastCheckpointTime = Date.now(); // Start checkpoint timer
    tenMinAlertCount = 0;
    console.log('Stats initialized for', dailyKey, dailyStats);
}

function formatTime(ms) {
    if (ms < 1000) return '0s';
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
}

function formatTimeHMS(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
