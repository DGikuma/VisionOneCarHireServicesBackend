import express, { Request, Response, NextFunction } from 'express';
import { createBooking, sendBookingConfirmation } from '../controllers/bookingController';

const router = express.Router();

/* -----------------------------
   Custom validation middleware
--------------------------------*/
const validateBooking = (req: Request, res: Response, next: NextFunction) => {
    const {
        customerName,
        email,
        phone,
        pickupDate,
        returnDate,
        carType,
        pickupLocation,
        dropoffLocation
    } = req.body;

    const errors: { field: string; message: string }[] = [];

    if (!customerName?.trim()) errors.push({ field: 'customerName', message: 'Name is required' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) errors.push({ field: 'email', message: 'Valid email is required' });

    if (!phone?.trim()) errors.push({ field: 'phone', message: 'Phone number is required' });
    if (!pickupDate || isNaN(Date.parse(pickupDate))) errors.push({ field: 'pickupDate', message: 'Valid pickup date is required' });
    if (!returnDate || isNaN(Date.parse(returnDate))) errors.push({ field: 'returnDate', message: 'Valid return date is required' });
    if (!carType?.trim()) errors.push({ field: 'carType', message: 'Car type is required' });
    if (!pickupLocation?.trim()) errors.push({ field: 'pickupLocation', message: 'Pickup location is required' });
    if (!dropoffLocation?.trim()) errors.push({ field: 'dropoffLocation', message: 'Dropoff location is required' });

    if (pickupDate && returnDate && Date.parse(returnDate) <= Date.parse(pickupDate)) {
        errors.push({ field: 'returnDate', message: 'Return date must be after pickup date' });
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors
        });
    }

    // Normalize data
    req.body.customerName = customerName.trim();
    req.body.email = email.trim().toLowerCase();
    req.body.phone = phone.trim();
    req.body.carType = carType.trim();
    req.body.pickupLocation = pickupLocation.trim();
    req.body.dropoffLocation = dropoffLocation.trim();

    next();
};

/* -----------------------------
   Swagger tags and schemas
--------------------------------*/
/**
 * @swagger
 * tags:
 *   name: Bookings
 *   description: Booking management endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Booking:
 *       type: object
 *       required:
 *         - customerName
 *         - email
 *         - phone
 *         - pickupDate
 *         - returnDate
 *         - carType
 *         - pickupLocation
 *         - dropoffLocation
 *       properties:
 *         customerName:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         phone:
 *           type: string
 *         pickupDate:
 *           type: string
 *           format: date
 *         returnDate:
 *           type: string
 *           format: date
 *         carType:
 *           type: string
 *         pickupLocation:
 *           type: string
 *         dropoffLocation:
 *           type: string
 */

/* -----------------------------
   Routes
--------------------------------*/
/**
 * @swagger
 * /api/bookings:
 *   post:
 *     summary: Submit a new booking
 *     tags: [Bookings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Booking'
 *     responses:
 *       201:
 *         description: Booking created successfully
 *       400:
 *         description: Validation failed
 */
router.post('/', validateBooking, createBooking);

/**
 * @swagger
 * /api/bookings/send-confirmation:
 *   post:
 *     summary: Resend confirmation email for a booking
 *     tags: [Bookings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bookingId:
 *                 type: string
 *                 description: ID of the booking to resend confirmation
 *     responses:
 *       200:
 *         description: Confirmation email sent successfully
 *       400:
 *         description: Invalid booking ID
 */
router.post('/send-confirmation', sendBookingConfirmation);

/**
 * @swagger
 * /api/bookings/health:
 *   get:
 *     summary: Check Booking API health
 *     tags: [Bookings]
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 service:
 *                   type: string
 *                 timestamp:
 *                   type: string
 */
router.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy', service: 'Booking API', timestamp: new Date().toISOString() });
});

/**
 * @swagger
 * /api/bookings:
 *   get:
 *     summary: Get Booking API info
 *     tags: [Bookings]
 *     responses:
 *       200:
 *         description: API metadata
 */
router.get('/', (req: Request, res: Response) => {
    res.json({
        message: 'Vision One Car Hire Booking API',
        version: '1.0.0',
        endpoints: [
            { method: 'POST', path: '/api/bookings', description: 'Submit new booking' },
            { method: 'POST', path: '/api/bookings/send-confirmation', description: 'Resend confirmation email' },
            { method: 'GET', path: '/api/bookings/health', description: 'Check API health status' }
        ],
        status: 'operational',
        timestamp: new Date().toISOString()
    });
});

export default router;
