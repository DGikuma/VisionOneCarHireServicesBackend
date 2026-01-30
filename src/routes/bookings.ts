import express, { Request, Response, NextFunction } from 'express';
import { createBooking, sendBookingConfirmation } from '../controllers/bookingController';

const router = express.Router();

// Custom validation middleware (no external dependency)
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

    // Validate each field
    if (!customerName?.trim()) {
        errors.push({ field: 'customerName', message: 'Name is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        errors.push({ field: 'email', message: 'Valid email is required' });
    }

    if (!phone?.trim()) {
        errors.push({ field: 'phone', message: 'Phone number is required' });
    }

    if (!pickupDate || isNaN(Date.parse(pickupDate))) {
        errors.push({ field: 'pickupDate', message: 'Valid pickup date is required' });
    }

    if (!returnDate || isNaN(Date.parse(returnDate))) {
        errors.push({ field: 'returnDate', message: 'Valid return date is required' });
    }

    if (!carType?.trim()) {
        errors.push({ field: 'carType', message: 'Car type is required' });
    }

    if (!pickupLocation?.trim()) {
        errors.push({ field: 'pickupLocation', message: 'Pickup location is required' });
    }

    if (!dropoffLocation?.trim()) {
        errors.push({ field: 'dropoffLocation', message: 'Dropoff location is required' });
    }

    // Check if return date is after pickup date
    if (pickupDate && returnDate && Date.parse(returnDate) <= Date.parse(pickupDate)) {
        errors.push({
            field: 'returnDate',
            message: 'Return date must be after pickup date'
        });
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors
        });
    }

    // Normalize data before passing to controller
    req.body.customerName = customerName.trim();
    req.body.email = email.trim().toLowerCase();
    req.body.phone = phone.trim();
    req.body.carType = carType.trim();
    req.body.pickupLocation = pickupLocation.trim();
    req.body.dropoffLocation = dropoffLocation.trim();

    next();
};

// Submit booking endpoint
router.post('/', validateBooking, createBooking);

// Endpoint to resend confirmation email
router.post('/send-confirmation', sendBookingConfirmation);

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        service: 'Booking API',
        timestamp: new Date().toISOString()
    });
});

// Get API info
router.get('/', (req: Request, res: Response) => {
    res.json({
        message: 'Vision One Car Hire Booking API',
        version: '1.0.0',
        endpoints: [
            {
                method: 'POST',
                path: '/api/bookings',
                description: 'Submit new booking',
                requiredFields: [
                    'customerName', 'email', 'phone', 'pickupDate',
                    'returnDate', 'carType', 'pickupLocation', 'dropoffLocation'
                ]
            },
            {
                method: 'POST',
                path: '/api/bookings/send-confirmation',
                description: 'Resend confirmation email',
                body: { bookingId: 'string' }
            },
            {
                method: 'GET',
                path: '/api/bookings/health',
                description: 'Check API health status'
            }
        ],
        status: 'operational',
        timestamp: new Date().toISOString()
    });
});

export default router;