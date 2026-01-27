import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import bookingRoutes from './routes/booking';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.CLIENT_URL || 'https://visiononecarhireservices.onrender.com',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/bookings', bookingRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Vision One Car Hire API is running' });
});

app.listen(PORT, () => {
    console.log(`🚗 Server running on port ${PORT}`);
});