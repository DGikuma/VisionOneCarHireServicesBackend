import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import contactRoutes from './routes/contact';
import bookingRoutes from './routes/bookings';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const START_TIME = new Date();

/* -----------------------------
   CORS configuration
--------------------------------*/
const allowedOrigins = [
    'https://visiononecarhireservicesfrontend.onrender.com',
    'http://localhost:5173',
    'http://localhost:3000'
];

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);

            if (!allowedOrigins.includes(origin)) {
                console.warn('Blocked by CORS:', origin);
                return callback(null, false);
            }

            return callback(null, true);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    })
);

// Handle preflight requests (safe for newer Express)
app.options(/.*/, cors());

/* -----------------------------
   Body parsers
--------------------------------*/
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* -----------------------------
   Request logging
--------------------------------*/
app.use((req, res, next) => {
    const start = Date.now();

    console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.url} - IP: ${req.ip}`
    );

    res.on('finish', () => {
        const duration = Date.now() - start;

        console.log(
            `[${new Date().toISOString()}] ${req.method} ${req.url} - Status: ${res.statusCode} - ${duration}ms`
        );
    });

    next();
});

/* -----------------------------
   Health check
--------------------------------*/
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
            heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
        },
        service: 'Vision One Car Hire API',
        version: '1.0.0',
        serverStartTime: START_TIME.toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

/* -----------------------------
   Warm-up endpoint
--------------------------------*/
app.get('/api/warmup', (req, res) => {
    console.log('Warm-up request received');

    res.json({
        status: 'warmed up',
        timestamp: new Date().toISOString(),
        message: 'Backend is now active and ready to handle requests'
    });
});

/* -----------------------------
   Debug: list registered routes
   (use only for testing)
--------------------------------*/
app.get('/api/debug/routes', (req, res) => {
    const routes: any[] = [];

    const stack = (app as any)._router?.stack || [];

    stack.forEach((layer: any) => {
        if (layer.route && layer.route.path) {
            routes.push({
                path: layer.route.path,
                methods: layer.route.methods
            });
        }
    });

    res.json(routes);
});

/* -----------------------------
   Load API routes
--------------------------------*/
console.log('📦 Loading routes...');

app.use('/api/contact', contactRoutes);
console.log('✅ Contact routes loaded at /api/contact');

app.use('/api/bookings', bookingRoutes);
console.log('✅ Booking routes loaded at /api/bookings');

/* -----------------------------
   Global error handler
--------------------------------*/
app.use(
    (
        err: any,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
    ) => {
        console.error(`[ERROR ${new Date().toISOString()}]`, {
            message: err.message,
            stack: err.stack,
            url: req.url,
            method: req.method,
            body: req.body
        });

        const errorResponse: any = {
            error: 'Internal server error',
            requestId:
                Date.now().toString(36) +
                Math.random().toString(36).substr(2)
        };

        if (process.env.NODE_ENV === 'development') {
            errorResponse.details = err.message;
            errorResponse.stack = err.stack;
        }

        res.status(err.status || 500).json(errorResponse);
    }
);

/* -----------------------------
   404 handler (safe catch-all)
--------------------------------*/
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        requestedUrl: req.originalUrl,
        availableEndpoints: ['/api/health', '/api/bookings', '/api/contact']
    });
});

/* -----------------------------
   Start server
--------------------------------*/
const server = app.listen(PORT, () => {
    console.log(`
  🚀 Server successfully started
  📍 Port: ${PORT}
  ⏰ Time: ${new Date().toISOString()}
  🌐 Environment: ${process.env.NODE_ENV || 'development'}
  📧 Email Service: ${process.env.EMAIL_HOST ? 'Configured' : 'Test Mode'}
  `);
});

/* -----------------------------
   Graceful shutdown
--------------------------------*/
const shutdown = () => {
    console.log('🛑 Received shutdown signal, closing server gracefully...');

    server.close(() => {
        console.log('✅ Server closed successfully');
        process.exit(0);
    });

    setTimeout(() => {
        console.error('❌ Could not close connections in time, forcing shutdown');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/* -----------------------------
   Process safety
--------------------------------*/
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);

    if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;
