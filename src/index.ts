import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bookingRoutes from './routes/bookings';
import contactRoutes from './routes/contact';
import nodemailer from 'nodemailer';

const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/* -----------------------------
   CORS Configuration
--------------------------------*/
const allowedOrigins = [
    process.env.CLIENT_URL_LOCAL || 'http://localhost:3000',
    process.env.CLIENT_URL_PROD || 'https://visiononecarhireservicesfrontend.onrender.com',
    `http://localhost:${PORT}`, // allow Swagger testing
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); // allow non-browser requests like Postman
        if (allowedOrigins.includes(origin)) return callback(null, true);
        console.warn('Blocked by CORS:', origin);
        return callback(new Error('CORS not allowed'));
    },
    credentials: true,
}));

/* -----------------------------
   Body parsers
--------------------------------*/
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* -----------------------------
   Swagger setup
--------------------------------*/
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Vision One Car Hire API',
            version: '1.0.0',
            description: 'Backend API for Vision One Car Hire Services',
        },
        servers: [{ url: `http://localhost:${PORT}` }],
    },
    apis: ['./src/routes/*.ts'], // make sure your routes are here
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/', (req, res) => res.redirect('/api/docs'));

/* -----------------------------
   Email transporter (Nodemailer)
--------------------------------*/
export const emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // Gmail App Password
    },
});

/* -----------------------------
   API Routes
--------------------------------*/
app.use('/api/bookings', bookingRoutes);
app.use('/api/contact', contactRoutes);

/* -----------------------------
   Health check
--------------------------------*/
const safeDateTime = (value?: string | number | Date | null) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    return isNaN(d.getTime()) ? 'N/A' : d.toISOString();
};

const formatUptime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return 'N/A';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return `${mins}m ${secs}s`;
};

app.get('/api/health', (req: Request, res: Response) => {
    const uptimeSeconds = process.uptime();

    res.json({
        status: 'ok',
        timestamp: safeDateTime(new Date()),
        uptime: formatUptime(uptimeSeconds),
        service: 'Vision One Car Hire API',
        version: '1.0.0'
    });
});

/* -----------------------------
   Global Error Handler
--------------------------------*/
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('💥 ERROR:', err.message, err.stack);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
});

/* -----------------------------
   404 Handler
--------------------------------*/
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        requestedUrl: req.originalUrl,
        availableEndpoints: ['/api/bookings', '/api/contact', '/api/docs', '/api/health'],
    });
});

/* -----------------------------
   Start Server
--------------------------------*/
app.listen(PORT, () => {
    console.log(`
🚀 Server running on port ${PORT}
Swagger UI: http://localhost:${PORT}/api/docs
CORS allowed origins: ${allowedOrigins.join(', ')}
`);
});
