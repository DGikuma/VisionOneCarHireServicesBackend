import express, { Request, Response, NextFunction } from 'express';
import { upload } from '../middlewares/upload';
import type { BookingData } from '../types/booking';
import {
    findBookingInExcel,
    updateBookingInExcel,
    getExcelPath,
} from '../utils/excelStore';
import {
    createBooking,
    sendBookingConfirmation,
    createDocumentsZip,
    sendCustomerConfirmation,
    sendAdminNotification,
} from '../controllers/bookingController';
import fs from 'fs';

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
    if (req.body.nationality && typeof req.body.nationality !== 'string') {
        errors.push({ field: 'nationality', message: 'Nationality must be a string' });
    }

    // ✅ NEW: Ensure proof-of-payment file was uploaded
    const files = req.files as any[];
    const depositProofPresent =
        Array.isArray(files) &&
        files.some(f => f.fieldname === 'depositProof');

    if (!depositProofPresent) {
        errors.push({
            field: 'depositProof',
            message: 'Proof of payment is required'
        });
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
    req.body.nationality = req.body.nationality?.trim() || '';

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

/**
 * @swagger
 * /api/bookings/lookup:
 *   post:
 *     summary: Look up a booking by ID or email
 *     tags: [Bookings]
 */
router.post('/lookup', async (req: Request, res: Response) => {
    try {
        const { bookingId, email } = req.body;

        const normalizedBookingId =
            typeof bookingId === 'string' && bookingId.trim()
                ? bookingId.trim()
                : undefined;
        const normalizedEmail =
            typeof email === 'string' && email.trim()
                ? email.trim().toLowerCase()
                : undefined;

        if (!normalizedBookingId && !normalizedEmail) {
            return res.status(400).json({
                success: false,
                error: 'Provide either bookingId or email',
            });
        }

        const result = await findBookingInExcel({
            bookingId: normalizedBookingId,
            email: normalizedEmail,
        });

        if (!result) {
            return res
                .status(404)
                .json({ success: false, error: 'Booking not found' });
        }

        // ✅ Normalize to the exact shape the frontend expects
        const raw: any = result.data || {};
        const booking = {
            id: raw.id ?? raw.bookingId ?? raw.booking_id ?? '',
            customerName: raw.customerName ?? raw.customer_name ?? '',
            email: raw.email ?? '',
            phone: raw.phone ?? '',
            nationality: raw.nationality ?? '',
            idNumber: raw.idNumber ?? raw.id_number ?? '',
            idType: raw.idType ?? raw.id_type ?? 'id',
            carType: raw.carType ?? raw.car_type ?? '',
            pickupDate: raw.pickupDate ?? raw.pickup_date ?? '',
            returnDate: raw.returnDate ?? raw.return_date ?? '',
            pickupLocation: raw.pickupLocation ?? raw.pickup_location ?? '',
            dropoffLocation: raw.dropoffLocation ?? raw.dropoff_location ?? '',
            additionalInfo: raw.additionalInfo ?? raw.additional_info ?? '',
            periodCategory: raw.periodCategory ?? raw.period_category ?? '',
            dailyRate: raw.dailyRate ?? raw.daily_rate ?? undefined,
            estimatedTotal: raw.estimatedTotal ?? raw.estimated_total ?? undefined,
            rentalDays: raw.rentalDays ?? raw.rental_days ?? undefined,
        };

        res.json({ success: true, booking });
    } catch (error) {
        console.error('Lookup error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to look up booking',
        });
    }
});

/**
 * @swagger
 * /api/bookings/amend:
 *   post:
 *     summary: Amend an existing booking
 *     tags: [Bookings]
 */
router.post('/amend', upload, validateBooking, async (req: Request, res: Response) => {
    try {
        const { originalBookingId, originalEmail, ...newData } = req.body;

        const normalizedBookingId =
            typeof originalBookingId === 'string' && originalBookingId.trim()
                ? originalBookingId.trim()
                : undefined;

        const normalizedEmail =
            typeof originalEmail === 'string' && originalEmail.trim()
                ? originalEmail.trim().toLowerCase()
                : undefined;

        if (!normalizedBookingId && !normalizedEmail) {
            return res.status(400).json({
                success: false,
                error: 'originalBookingId or originalEmail is required to amend a booking',
            });
        }

        const files = req.files as any[];
        const findFile = (fieldNames: string[]) => {
            if (!Array.isArray(files)) return undefined;
            for (const name of fieldNames) {
                const f = files.find(x => x.fieldname === name);
                if (f) return f;
            }
            return undefined;
        };

        const idDocFile = findFile(['idDocument', 'idDoc']);
        const drivingLicenseFile = findFile(['drivingLicense', 'drivingLicence']);
        const depositProofFile = findFile(['depositProof']);

        const bookingId = `V1-${Date.now().toString().slice(-8)}`;

        const bookingWithId: BookingData = {
            customerName: newData.customerName,
            email: newData.email,
            phone: newData.phone,
            pickupDate: newData.pickupDate,
            returnDate: newData.returnDate,
            carType: newData.carType,
            pickupLocation: newData.pickupLocation,
            dropoffLocation: newData.dropoffLocation,
            additionalInfo: newData.additionalInfo,
            nationality: newData.nationality,
            idNumber: newData.idNumber,
            idType: newData.idType,
            termsAccepted:
                newData.termsAccepted === 'true' || newData.termsAccepted === true,
            periodCategory: newData.periodCategory,
            dailyRate: newData.dailyRate ? Number(newData.dailyRate) : undefined,
            estimatedTotal: newData.estimatedTotal
                ? Number(newData.estimatedTotal)
                : undefined,
            rentalDays: newData.rentalDays ? Number(newData.rentalDays) : undefined,
            id: bookingId,
            bookingDate: new Date().toISOString(),
            status: 'confirmed',
            idDocumentPath: idDocFile?.path,
            drivingLicensePath: drivingLicenseFile?.path,
            depositProofPath: depositProofFile?.path,
        };

        await updateBookingInExcel(
            { bookingId: normalizedBookingId, email: normalizedEmail },
            bookingWithId
        );

        const zipPath = await createDocumentsZip(bookingWithId);
        await sendCustomerConfirmation(bookingWithId, zipPath);

        // ✅ Also notify admin (recommended)
        try {
            await sendAdminNotification(bookingWithId, zipPath);
        } catch (adminErr) {
            console.error('Admin amend notification failed:', adminErr);
        }

        res.json({
            success: true,
            message: 'Booking amended successfully',
            booking: { id: bookingId, ...newData },
        });
    } catch (error) {
        console.error('Amend error:', error);
        res.status(500).json({ success: false, error: 'Failed to amend booking' });
    }
});

/**
 * @swagger
 * /api/bookings/download-excel:
 *   get:
 *     summary: Download the bookings Excel file
 *     tags: [Bookings]
 */
router.get('/download-excel', async (req: Request, res: Response) => {
    try {
        const excelPath = getExcelPath();
        if (!fs.existsSync(excelPath)) {
            return res.status(404).json({ success: false, error: 'Excel file not found' });
        }
        res.download(excelPath, 'bookings.xlsx');
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to download Excel file' });
    }
});

export default router;