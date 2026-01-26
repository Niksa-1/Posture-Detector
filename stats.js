// DAILY STATS (LocalStorage)
const API_BASE_URL = 'https://posture-detector-j0j7.onrender.com/api';

const CHECKPOINT_INTERVAL_MINUTES = 10; // How often to check for breaks (in minutes)

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
    
    // 1. Keep saving to LocalStorage (for instant UI updates)
    try {
        localStorage.setItem(STORAGE_PREFIX + dailyKey, JSON.stringify(dailyStats));
    } catch (e) {
        console.warn('Failed to save local stats:', e);
    }

    // 2. Sync to Database every 5 minutes OR when session stops
    // We check if it's been 5 minutes since the last DB sync
    if (!window.lastDbSync || Date.now() - window.lastDbSync > 60000) {
        syncStatsToDatabase();
        window.lastDbSync = Date.now();
    }
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

function initDailyStats() {
    dailyKey = getTodayKey();
    dailyStats = loadDailyStats(dailyKey);
    lastStatsUpdateTime = null;
    lastCheckpointTime = Date.now(); // Start the 10-minute break timer
    tenMinAlertCount = 0;
    
    console.log('✓ Stats initialized for', dailyKey, dailyStats);
}

async function syncStatsToDatabase() {
    const token = typeof UserStorage !== 'undefined' ? UserStorage.getAuthToken() : null;
    if (!token || !dailyStats) return;

    const payload = {
        total_ms: dailyStats.totalMs,
        good_ms: dailyStats.goodMs,
        bad_ms: dailyStats.badMs,
        streak_ms: dailyStats.longestGoodStreakMs,
        alerts: dailyStats.alertCount
    };

    try {
        const response = await fetch(`${API_BASE_URL}/stats/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            console.log('✓ Stats synced to Turso');
        }
    } catch (err) {
        console.error('✗ Stats sync failed:', err);
    }
}