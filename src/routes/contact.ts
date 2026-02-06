import express from 'express';
import { contactController } from '../controllers/contactController';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Contact
 *   description: Contact form and inquiries management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ContactInquiry:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - subject
 *         - message
 *         - department
 *       properties:
 *         name:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         phone:
 *           type: string
 *         company:
 *           type: string
 *         subject:
 *           type: string
 *         message:
 *           type: string
 *         department:
 *           type: string
 *           enum: [general, booking, corporate, support]
 */

/**
 * @swagger
 * /api/contact:
 *   post:
 *     summary: Submit a new contact inquiry
 *     tags: [Contact]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContactInquiry'
 *     responses:
 *       201:
 *         description: Inquiry submitted successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/', contactController.createContactInquiry);

/**
 * @swagger
 * /api/contact:
 *   get:
 *     summary: Get all contact inquiries (with optional filters)
 *     tags: [Contact]
 *     parameters:
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *           enum: [general, booking, corporate, support]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [new, in-progress, resolved, archived]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [urgent, high, normal, low]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of inquiries
 */
router.get('/', contactController.getContactInquiries);

/**
 * @swagger
 * /api/contact/stats:
 *   get:
 *     summary: Get contact inquiry statistics
 *     tags: [Contact]
 *     responses:
 *       200:
 *         description: Statistics about inquiries
 */
router.get('/stats', contactController.getInquiryStats);

/**
 * @swagger
 * /api/contact/{id}/status:
 *   patch:
 *     summary: Update status of a contact inquiry
 *     tags: [Contact]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Inquiry ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [new, in-progress, resolved, archived]
 *               notes:
 *                 type: string
 *               assignedTo:
 *                 type: string
 *     responses:
 *       200:
 *         description: Inquiry status updated
 *       404:
 *         description: Inquiry not found
 */
router.patch('/:id/status', contactController.updateInquiryStatus);

export default router;