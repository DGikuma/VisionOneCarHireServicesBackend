const axios = require('axios');
require('dotenv').config();

const BACKEND_URL =
    process.env.BACKEND_URL ||
    'https://visiononecarhireservicesbackend-1.onrender.com';

const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes

// -----------------------------
// Safe date helpers
// -----------------------------
function safeDateTime(value) {
    if (!value) return 'N/A';

    const d = new Date(value);
    return isNaN(d.getTime()) ? 'N/A' : d.toISOString();
}

// -----------------------------
// Ping logic
// -----------------------------
async function pingBackend() {
    const now = safeDateTime(new Date());

    try {
        console.log(`[${now}] 🔔 Pinging backend...`);

        const response = await axios.get(`${BACKEND_URL}/api/health`, {
            timeout: 30000
        });

        const data = response.data || {};

        console.log(`[${safeDateTime(new Date())}] ✅ Backend is alive`);
        console.log(`   Status   : ${data.status || 'N/A'}`);
        console.log(`   Service  : ${data.service || 'N/A'}`);
        console.log(`   Version  : ${data.version || 'N/A'}`);
        console.log(`   Uptime   : ${data.uptime || 'N/A'}`);
        console.log(`   Timestamp: ${safeDateTime(data.timestamp)}`);

    } catch (error) {

        console.error(
            `[${safeDateTime(new Date())}] ❌ Ping failed:`,
            error?.message || error
        );

        // Try warmup endpoint if health check fails
        try {
            await axios.get(`${BACKEND_URL}/api/warmup`, { timeout: 45000 });
            console.log(
                `[${safeDateTime(new Date())}] 🔥 Backend warmed up successfully`
            );
        } catch (warmupError) {
            console.error(
                `[${safeDateTime(new Date())}] 🔥 Warmup also failed:`,
                warmupError?.message || warmupError
            );
        }
    }
}

// -----------------------------
// Startup
// -----------------------------
console.log('🔔 Starting keep-alive service for Vision One Backend');
console.log(`🌐 Backend URL  : ${BACKEND_URL}`);
console.log(`⏰ Ping interval: ${PING_INTERVAL / 60000} minutes`);
console.log('---');

pingBackend();

setInterval(pingBackend, PING_INTERVAL);

// -----------------------------
// Graceful shutdown
// -----------------------------
process.on('SIGINT', () => {
    console.log(`[${safeDateTime(new Date())}] 🛑 Stopping keep-alive service...`);
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log(`[${safeDateTime(new Date())}] 🛑 Stopping keep-alive service...`);
    process.exit(0);
});
