const axios = require('axios');
require('dotenv').config();

const BACKEND_URL = process.env.BACKEND_URL || 'https://visiononecarhireservicesbackend-1.onrender.com';
const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes

async function pingBackend() {
    try {
        console.log(`[${new Date().toISOString()}] Pinging backend...`);

        const response = await axios.get(`${BACKEND_URL}/api/health`, {
            timeout: 30000
        });

        console.log(`✅ Backend is alive:`, response.data.status);
        console.log(`   Uptime: ${response.data.uptime || 'N/A'}`);
        console.log(`   Memory: ${response.data.memory?.rss || 'N/A'}`);

    } catch (error) {
        console.error(`❌ Ping failed:`, error.message);

        // Try warmup endpoint if health check fails
        try {
            await axios.get(`${BACKEND_URL}/api/warmup`, { timeout: 45000 });
            console.log('🔥 Backend warmed up successfully');
        } catch (warmupError) {
            console.error('🔥 Warmup also failed:', warmupError.message);
        }
    }
}

// Initial ping
console.log('🔔 Starting keep-alive service for Vision One Backend');
console.log(`🌐 Backend URL: ${BACKEND_URL}`);
console.log(`⏰ Ping interval: ${PING_INTERVAL / 60000} minutes`);
console.log('---');

pingBackend();

// Schedule regular pings
setInterval(pingBackend, PING_INTERVAL);

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Stopping keep-alive service...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Stopping keep-alive service...');
    process.exit(0);
});