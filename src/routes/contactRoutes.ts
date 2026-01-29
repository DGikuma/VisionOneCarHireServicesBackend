import express from 'express';
import { contactController } from '../controllers/contactController';

const router = express.Router();

// Submit a new contact inquiry
router.post('/contact', contactController.createContactInquiry);

// Get all contact inquiries (with optional filters)
router.get('/contact/inquiries', contactController.getContactInquiries);

// Get inquiry statistics
router.get('/contact/stats', contactController.getInquiryStats);

// Update inquiry status
router.patch('/contact/inquiries/:id/status', contactController.updateInquiryStatus);

export default router;