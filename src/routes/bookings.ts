import express, { Request, Response, NextFunction } from 'express';
import { createBooking, sendBookingConfirmation } from '../controllers/bookingController';
import { upload } from '../middlewares/upload';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Bookings
 *   description: Booking management and vehicle reservations
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
 *         - idNumber
 *         - idType
 *         - termsAccepted
 *       properties:
 *         customerName:
 *           type: string
 *           example: "John Doe"
 *           description: Full name of the customer
 *         email:
 *           type: string
 *           format: email
 *           example: "john@example.com"
 *           description: Customer's email address
 *         phone:
 *           type: string
 *           example: "+254712345678"
 *           description: Customer's phone number
 *         pickupDate:
 *           type: string
 *           format: date
 *           example: "2026-09-15"
 *           description: Date of vehicle pickup
 *         returnDate:
 *           type: string
 *           format: date
 *           example: "2026-09-20"
 *           description: Date of vehicle return
 *         carType:
 *           type: string
 *           example: "Toyota Prado"
 *           description: Type of car requested
 *         pickupLocation:
 *           type: string
 *           example: "Nairobi CBD"
 *           description: Location where customer will pick up the vehicle
 *         dropoffLocation:
 *           type: string
 *           example: "Mombasa"
 *           description: Location where customer will return the vehicle (optional)
 *         additionalInfo:
 *           type: string
 *           example: "Need baby seat"
 *           description: Additional requests or information (optional)
 *         idNumber:
 *           type: string
 *           example: "12345678"
 *           description: ID or Passport number
 *         idType:
 *           type: string
 *           enum: [id, passport]
 *           example: "id"
 *           description: Type of identification document
 *         termsAccepted:
 *           type: boolean
 *           example: true
 *           description: Must be true to proceed with booking
 *     FileUpload:
 *       type: object
 *       properties:
 *         idDocument:
 *           type: string
 *           format: binary
 *           description: ID card or passport image (PDF, JPG, PNG)
 *         drivingLicense:
 *           type: string
 *           format: binary
 *           description: Driving license image (PDF, JPG, PNG)
 *         depositProof:
 *           type: string
 *           format: binary
 *           description: Proof of deposit payment (PDF, JPG, PNG)
 *     BookingResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Booking created successfully"
 *         bookingId:
 *           type: string
 *           example: "123e4567-e89b-12d3-a456-426614174000"
 *         booking:
 *           $ref: '#/components/schemas/Booking'
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *               message:
 *                 type: string
 */

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

    if (req.body.dropoffLocation) {
        req.body.dropoffLocation = req.body.dropoffLocation.trim();
    }

    if (req.body.additionalInfo) {
        req.body.additionalInfo = req.body.additionalInfo.trim();
    }

    next();
};

/* -----------------------------
   Routes
--------------------------------*/

/**
 * @swagger
 * /api/bookings:
 *   post:
 *     summary: Submit a new booking with documents
 *     description: Creates a new vehicle booking with optional document uploads (ID, driving license, deposit proof)
 *     tags: [Bookings]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/Booking'
 *               - $ref: '#/components/schemas/FileUpload'
 *           encoding:
 *             idDocument:
 *               contentType: application/pdf, image/jpeg, image/png
 *             drivingLicense:
 *               contentType: application/pdf, image/jpeg, image/png
 *             depositProof:
 *               contentType: application/pdf, image/jpeg, image/png
 *     responses:
 *       201:
 *         description: Booking created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BookingResponse'
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to process booking"
 */
router.post('/', upload, validateBooking, createBooking);

/**
 * @swagger
 * /api/bookings/send-confirmation:
 *   post:
 *     summary: Resend confirmation email for a booking
 *     description: Resends the confirmation email with booking details and attached documents
 *     tags: [Bookings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bookingId
 *             properties:
 *               bookingId:
 *                 type: string
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *                 description: ID of the booking to resend confirmation
 *     responses:
 *       200:
 *         description: Confirmation email sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Confirmation email sent successfully"
 *       400:
 *         description: Invalid booking ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Booking ID is required"
 *       404:
 *         description: Booking not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Booking not found"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to send confirmation email"
 */
router.post('/send-confirmation', sendBookingConfirmation);

/**
 * @swagger
 * /api/bookings/health:
 *   get:
 *     summary: Check booking API health
 *     description: Returns the health status of the booking API service
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
 *                   example: "healthy"
 *                 service:
 *                   type: string
 *                   example: "Booking API"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2026-09-09T10:30:00.000Z"
 */
router.get('/health', (req: Request, res: Response) => {
    res.json({ 
        status: 'healthy', 
        service: 'Booking API', 
        timestamp: new Date().toISOString() 
    });
});

/**
 * @swagger
 * /api/bookings:
 *   get:
 *     summary: Get booking API information
 *     description: Returns information about the booking API including available endpoints
 *     tags: [Bookings]
 *     responses:
 *       200:
 *         description: API information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Vision Wan Car Hire Booking API"
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                 endpoints:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       method:
 *                         type: string
 *                         example: "POST"
 *                       path:
 *                         type: string
 *                         example: "/api/bookings"
 *                       description:
 *                         type: string
 *                         example: "Submit new booking with documents"
 *                 status:
 *                   type: string
 *                   example: "operational"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2026-09-09T10:30:00.000Z"
 */
router.get('/', (req: Request, res: Response) => {
    res.json({
        message: 'Vision Wan Car Hire Booking API',
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