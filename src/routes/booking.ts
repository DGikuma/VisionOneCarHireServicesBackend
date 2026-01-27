import express from 'express';
import { createBooking, sendBookingConfirmation } from '../controllers/bookingController';

const router = express.Router();

router.post('/', createBooking);
router.post('/send-confirmation', sendBookingConfirmation);

export default router;