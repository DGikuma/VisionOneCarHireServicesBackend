// server/routes/travelEnquiries.ts
import express, { Request, Response, NextFunction } from 'express';
import { createTravelEnquiry } from '../controllers/travelEnquiryController';
import { Traveller } from '../types/travel';

const router = express.Router();

/* -----------------------------
   Validation middleware
--------------------------------*/
const validateTravelEnquiry = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const {
        tripType,
        contactName,
        contactPhone,
        contactEmail,
        departDate,
        returnDate,
        travellers,
        fromCity,
        toCity,
        safariTourId,
    } = req.body;

    const errors: { field: string; message: string }[] = [];

    /* ── Trip type ── */
    if (!tripType || !['flight', 'flight-hotel', 'safari'].includes(tripType)) {
        errors.push({
            field: 'tripType',
            message: 'Trip type must be "flight", "flight-hotel", or "safari"',
        });
    }

    /* ── Contact ── */
    if (!contactName?.trim()) {
        errors.push({ field: 'contactName', message: 'Contact name is required' });
    }
    if (!contactPhone?.trim()) {
        errors.push({
            field: 'contactPhone',
            message: 'Contact phone is required',
        });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!contactEmail || !emailRegex.test(contactEmail)) {
        errors.push({ field: 'contactEmail', message: 'Valid email is required' });
    }

    /* ── Dates ── */
    if (!departDate || isNaN(Date.parse(departDate))) {
        errors.push({
            field: 'departDate',
            message: 'Valid departure date is required',
        });
    }
    if (!returnDate || isNaN(Date.parse(returnDate))) {
        errors.push({
            field: 'returnDate',
            message: 'Valid return date is required',
        });
    }
    if (
        departDate &&
        returnDate &&
        Date.parse(returnDate) < Date.parse(departDate)
    ) {
        errors.push({
            field: 'returnDate',
            message: 'Return date must be after departure date',
        });
    }

    /* ── Trip-specific validation ── */
    if (tripType === 'flight' || tripType === 'flight-hotel') {
        if (!fromCity?.trim())
            errors.push({
                field: 'fromCity',
                message: 'Departure city is required',
            });
        if (!toCity?.trim())
            errors.push({
                field: 'toCity',
                message: 'Destination city is required',
            });
    }

    /* ── Hotel validation (only for `flight-hotel`) ── */
    if (tripType === 'flight-hotel') {
        const hotel = req.body.hotel;
        if (!hotel || typeof hotel !== 'object') {
            errors.push({
                field: 'hotel',
                message: 'Hotel details are required',
            });
        } else {
            if (!hotel.city?.trim())
                errors.push({
                    field: 'hotel.city',
                    message: 'Hotel city is required',
                });
            if (!hotel.checkIn || isNaN(Date.parse(hotel.checkIn)))
                errors.push({
                    field: 'hotel.checkIn',
                    message: 'Valid hotel check-in date is required',
                });
            if (!hotel.checkOut || isNaN(Date.parse(hotel.checkOut)))
                errors.push({
                    field: 'hotel.checkOut',
                    message: 'Valid hotel check-out date is required',
                });
            if (
                hotel.checkIn &&
                hotel.checkOut &&
                Date.parse(hotel.checkOut) <= Date.parse(hotel.checkIn)
            ) {
                errors.push({
                    field: 'hotel.checkOut',
                    message: 'Hotel check-out must be after check-in',
                });
            }
            const rooms = Number(hotel.rooms);
            if (isNaN(rooms) || rooms < 1 || rooms > 10) {
                errors.push({
                    field: 'hotel.rooms',
                    message: 'Rooms must be between 1 and 10',
                });
            }
        }
    }

    /* ── Safari validation ── */
    if (tripType === 'safari') {
        if (!safariTourId?.trim())
            errors.push({
                field: 'safariTourId',
                message: 'Safari tour is required',
            });
    }

    /* ── Travellers ── */
    let parsedTravellers: Traveller[] = [];
    try {
        parsedTravellers =
            typeof travellers === 'string' ? JSON.parse(travellers) : travellers;
    } catch {
        errors.push({
            field: 'travellers',
            message: 'Travellers must be valid JSON',
        });
    }

    if (!Array.isArray(parsedTravellers) || parsedTravellers.length === 0) {
        errors.push({
            field: 'travellers',
            message: 'At least one traveller is required',
        });
    } else {
        parsedTravellers.forEach((t, i) => {
            if (!t.fullName?.trim()) {
                errors.push({
                    field: `travellers[${i}].fullName`,
                    message: 'Traveller name is required',
                });
            }
            const age = Number(t.age);
            if (isNaN(age) || age < 0 || age > 120) {
                errors.push({
                    field: `travellers[${i}].age`,
                    message: 'Traveller age must be 0–120',
                });
            }
        });
    }

    /* ── Early return on validation failure ── */
    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors,
        });
    }

    /* ── Normalize ── */
    req.body.contactName = contactName.trim();
    req.body.contactEmail = contactEmail.trim().toLowerCase();
    req.body.contactPhone = contactPhone.trim();
    req.body.nationality = req.body.nationality?.trim() || '';
    req.body.specialRequests = req.body.specialRequests?.trim() || '';
    req.body.fromCity = fromCity?.trim() || '';
    req.body.toCity = toCity?.trim() || '';
    req.body.safariTourId = safariTourId?.trim() || '';
    req.body.travellers = parsedTravellers.map((t) => ({
        fullName: String(t.fullName).trim(),
        age: Number(t.age),
    }));
    req.body.flexibleBefore =
        req.body.flexibleBefore === true || req.body.flexibleBefore === 'true';
    req.body.flexibleAfter =
        req.body.flexibleAfter === true || req.body.flexibleAfter === 'true';

    /* ── Normalize hotel block ── */
    if (tripType === 'flight-hotel' && req.body.hotel) {
        req.body.hotel = {
            city: String(req.body.hotel.city).trim(),
            checkIn: String(req.body.hotel.checkIn),
            checkOut: String(req.body.hotel.checkOut),
            rooms: Number(req.body.hotel.rooms) || 1,
            starPreference: ['3', '4', '5'].includes(
                req.body.hotel.starPreference
            )
                ? req.body.hotel.starPreference
                : 'any',
            preferredHotel: req.body.hotel.preferredHotel?.trim() || '',
        };
    } else {
        req.body.hotel = undefined;
    }

    next();
};

/* -----------------------------
   Routes
--------------------------------*/

/**
 * @swagger
 * /api/travel-enquiries:
 *   post:
 *     summary: Submit a travel enquiry (flight, flight + hotel, or safari)
 *     tags: [Travel Enquiries]
 *   get:
 *     summary: Get travel enquiries API info
 *     tags: [Travel Enquiries]
 */
router.post('/', validateTravelEnquiry, createTravelEnquiry);

/**
 * @swagger
 * /api/travel-enquiries/health:
 *   get:
 *     summary: Check travel enquiries API health
 *     tags: [Travel Enquiries]
 */
router.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        service: 'Travel Enquiries API',
        timestamp: new Date().toISOString(),
    });
});

/**
 * @swagger
 * /api/travel-enquiries:
 *   get:
 *     summary: Get travel enquiries API information
 *     tags: [Travel Enquiries]
 */
router.get('/', (_req: Request, res: Response) => {
    res.json({
        message: 'Vision Wan Air Travel & Safaris Enquiry API',
        version: '1.0.0',
        endpoints: [
            {
                method: 'POST',
                path: '/api/travel-enquiries',
                description:
                    'Submit a flight, flight + hotel, or safari enquiry',
            },
            {
                method: 'GET',
                path: '/api/travel-enquiries/health',
                description: 'Check API health status',
            },
        ],
        status: 'operational',
        timestamp: new Date().toISOString(),
    });
});

export default router;