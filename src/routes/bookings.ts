import express, { Request, Response, NextFunction } from 'express';
import { createBooking, sendBookingConfirmation } from '../controllers/bookingController';
import { upload } from '../middlewares/upload';

const router = express.Router();

/* -----------------------------
   Custom validation middleware (Updated)
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
        idNumber,
        idType,
        termsAccepted
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
    if (!idNumber?.trim()) errors.push({ field: 'idNumber', message: 'ID/Passport number is required' });
    if (!idType || !['id', 'passport'].includes(idType)) errors.push({ field: 'idType', message: 'Valid ID type is required (id or passport)' });
    if (!termsAccepted || termsAccepted === 'false') errors.push({ field: 'termsAccepted', message: 'Terms and conditions must be accepted' });

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
    req.body.idNumber = idNumber.trim();
    req.body.termsAccepted = termsAccepted === 'true' || termsAccepted === true;

    // Handle dropoffLocation if provided
    if (req.body.dropoffLocation) {
        req.body.dropoffLocation = req.body.dropoffLocation.trim();
    }

    // Handle additionalInfo if provided
    if (req.body.additionalInfo) {
        req.body.additionalInfo = req.body.additionalInfo.trim();
    }

    next();
};

/* -----------------------------
   Swagger update for new fields
--------------------------------*/
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
 *         - idNumber
 *         - idType
 *         - termsAccepted
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
 *         additionalInfo:
 *           type: string
 *         idNumber:
 *           type: string
 *           description: ID or Passport number
 *         idType:
 *           type: string
 *           enum: [id, passport]
 *           description: Type of identification
 *         termsAccepted:
 *           type: boolean
 *           description: Must be true to proceed
 *     FileUpload:
 *       type: object
 *       properties:
 *         idDocument:
 *           type: string
 *           format: binary
 *           description: ID card or passport image
 *         drivingLicense:
 *           type: string
 *           format: binary
 *           description: Driving license image
 *         depositProof:
 *           type: string
 *           format: binary
 *           description: Proof of deposit payment
 */

/* -----------------------------
   Routes (Updated with file upload)
--------------------------------*/
/**
 * @swagger
 * /api/bookings:
 *   post:
 *     summary: Submit a new booking with documents
 *     tags: [Bookings]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/Booking'
 *               - $ref: '#/components/schemas/FileUpload'
 *     responses:
 *       201:
 *         description: Booking created successfully
 *       400:
 *         description: Validation failed
 */
router.post('/', upload, validateBooking, createBooking);

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

// Keep existing health and info routes unchanged
router.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy', service: 'Booking API', timestamp: new Date().toISOString() });
});

router.get('/', (req: Request, res: Response) => {
    res.json({
        message: 'Vision One Car Hire Booking API',
        version: '1.0.0',
        endpoints: [
            { method: 'POST', path: '/api/bookings', description: 'Submit new booking with documents' },
            { method: 'POST', path: '/api/bookings/send-confirmation', description: 'Resend confirmation email' },
            { method: 'GET', path: '/api/bookings/health', description: 'Check API health status' }
        ],
        status: 'operational',
        timestamp: new Date().toISOString()
    });
});

export default router;