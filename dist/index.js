"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const contact_1 = __importDefault(require("./routes/contact"));
const bookings_1 = __importDefault(require("./routes/bookings"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
const START_TIME = new Date();
// Enhanced CORS configuration
const allowedOrigins = [
    'https://visiononecarhireservicesfrontend.onrender.com',
    'http://localhost:5173',
    'http://localhost:3000'
];
app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
// Handle preflight requests
app.options('*', (0, cors_1.default)());
// Middleware
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Enhanced request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - IP: ${req.ip}`);
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Status: ${res.statusCode} - ${duration}ms`);
    });
    next();
});
// Enhanced health check endpoint
app.get('/api/health', (req, res) => {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
        memory: {
            rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        },
        service: 'Vision One Car Hire API',
        version: '1.0.0',
        serverStartTime: START_TIME.toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});
// Warm-up endpoint for Render cold starts
app.get('/api/warmup', (req, res) => {
    console.log('Warm-up request received');
    res.json({
        status: 'warmed up',
        timestamp: new Date().toISOString(),
        message: 'Backend is now active and ready to handle requests'
    });
});
// API Routes
app.use('/api/contact', contact_1.default);
app.use('/api/bookings', bookings_1.default);
// Global error handler
app.use((err, req, res, next) => {
    console.error(`[ERROR ${new Date().toISOString()}]`, {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body
    });
    // Don't leak stack traces in production
    const errorResponse = {
        error: 'Internal server error',
        requestId: Date.now().toString(36) + Math.random().toString(36).substr(2)
    };
    if (process.env.NODE_ENV === 'development') {
        errorResponse.details = err.message;
        errorResponse.stack = err.stack;
    }
    res.status(err.status || 500).json(errorResponse);
});
// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        requestedUrl: req.originalUrl,
        availableEndpoints: ['/api/health', '/api/bookings', '/api/contact']
    });
});
// Start server
const server = app.listen(PORT, () => {
    console.log(`
  🚀 Server successfully started
  📍 Port: ${PORT}
  ⏰ Time: ${new Date().toISOString()}
  🌐 Environment: ${process.env.NODE_ENV || 'development'}
  📧 Email Service: ${process.env.EMAIL_HOST ? 'Configured' : 'Test Mode'}
  `);
});
// Graceful shutdown
const shutdown = () => {
    console.log('🛑 Received shutdown signal, closing server gracefully...');
    server.close(() => {
        console.log('✅ Server closed successfully');
        process.exit(0);
    });
    // Force close after 10 seconds
    setTimeout(() => {
        console.error('❌ Could not close connections in time, forcing shutdown');
        process.exit(1);
    }, 10000);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    // Don't exit in production, let the process manager restart it
    if (process.env.NODE_ENV === 'production') {
        // Log and continue
    }
    else {
        process.exit(1);
    }
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});
exports.default = app;
//# sourceMappingURL=index.js.map